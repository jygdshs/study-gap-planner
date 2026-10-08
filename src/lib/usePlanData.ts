"use client";

// 학습 계획 화면(/plan)과 처음 화면(/)이 같이 쓰는 데이터 불러오기 + 계획 저장/체크 동작.
// 계산 자체는 scoring.ts / planTracking.ts가 하고, 여기서는 불러오고 저장하는 일만 한다.

import { useEffect, useState } from "react";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import type { DaySchedule, PlanItem, ProblemResult, StudyRecord, Subject, WeeklyAvailability } from "@/types/study";
import { weakestTypeByUnit } from "@/lib/problemAnalysis";
import {
  addDaysISO,
  buildStudyPlan,
  buildSubjectPriorities,
  buildUnitStatuses,
  planHorizon,
  todayISO,
  type PlanDay,
} from "@/lib/scoring";
import {
  carryOverMissed,
  diffPlanForSave,
  findMissedItems,
  findPendingResultInputs,
  summarizeAdherence,
} from "@/lib/planTracking";
import { buildSubjectColorMap } from "@/lib/palette";
import { allocateMinutes } from "@/lib/allocation";
import { useAuth } from "@/lib/auth";

// 이행률을 계산할 기간: 오늘 포함 최근 7일
export const ADHERENCE_DAYS = 7;

export function usePlanData() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [availability, setAvailability] = useState<WeeklyAvailability[]>([]);
  // 특정 날 일정 (005 마이그레이션 전이면 빈 목록)
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>([]);
  // AI 문제 유형 분석 결과 (006 마이그레이션 전이면 빈 목록)
  const [problemResults, setProblemResults] = useState<ProblemResult[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  // 004 마이그레이션(planned_minutes, actual_minutes 열)을 실행했는지
  const [hasTimeColumns, setHasTimeColumns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const today = todayISO();
  const pastFrom = addDaysISO(today, -ADHERENCE_DAYS);

  const loadPlanItems = async () => {
    const { data, error } = await supabase
      .from("plan_items")
      .select("*")
      .gte("plan_date", pastFrom)
      .order("plan_date", { ascending: true })
      .order("slot", { ascending: true });

    if (error) {
      // plan_items 테이블이 아직 없어도 계획 추천 화면 자체는 볼 수 있도록 따로 처리한다
      setPlanError(error.message);
      return;
    }
    setPlanError(null);
    setPlanItems((data as PlanItem[]) ?? []);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const [subjectsRes, recordsRes, availabilityRes] = await Promise.all([
        supabase.from("subjects").select("*"),
        supabase.from("study_records").select("*"),
        supabase.from("weekly_availability").select("*"),
        loadPlanItems(),
        supabase
          .from("plan_items")
          .select("planned_minutes, actual_minutes")
          .limit(1)
          .then(({ error }) => setHasTimeColumns(!error)),
        supabase
          .from("day_schedules")
          .select("*")
          .gte("date", today)
          .then(({ data, error }) => setDaySchedules(error ? [] : ((data as DaySchedule[]) ?? []))),
        supabase
          .from("problem_results")
          .select("*")
          .then(({ data, error }) => setProblemResults(error ? [] : ((data as ProblemResult[]) ?? []))),
      ]);

      const firstError = subjectsRes.error ?? recordsRes.error ?? availabilityRes.error;
      if (firstError) {
        setError(describeLoadError(firstError.message));
        setLoading(false);
        return;
      }

      setSubjects((subjectsRes.data as Subject[]) ?? []);
      setRecords((recordsRes.data as StudyRecord[]) ?? []);
      setAvailability((availabilityRes.data as WeeklyAvailability[]) ?? []);
      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // 우선순위는 아직 시험을 보지 않은 과목만 (오늘이 시험일인 과목은 D-DAY로 남김)
  const activeSubjects = subjects.filter((s) => !s.exam_date || s.exam_date >= today);
  const unitStatuses = buildUnitStatuses(activeSubjects, records);
  const subjectPriorities = buildSubjectPriorities(activeSubjects, unitStatuses);
  const horizon = planHorizon(subjects, today);
  const basePlanDays: PlanDay[] = buildStudyPlan(
    subjects,
    records,
    availability,
    today,
    horizon.days,
    daySchedules
  );
  const noStudyHours = availability.every((w) => !w.available_hours);
  const colors = buildSubjectColorMap(subjects);
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const itemsByDate = new Map<string, PlanItem[]>();
  for (const it of planItems) {
    if (!itemsByDate.has(it.plan_date)) itemsByDate.set(it.plan_date, []);
    itemsByDate.get(it.plan_date)!.push(it);
  }
  const savedAt = (date: string, slot: number) =>
    planError ? undefined : itemsByDate.get(date)?.find((it) => it.slot === slot);

  const todayScoreByUnit = new Map(unitStatuses.map((u) => [`${u.subjectId}::${u.unit}`, u.finalScore]));

  // 계획 자동 재조정: 지난 날짜에 못 한 칸(아직 결과도 없는 단원)을 앞으로의 가장 가까운 날 1교시로 옮긴다
  const missedItems = planError ? [] : findMissedItems(planItems, records, today);
  const { days: planDays, carried } = carryOverMissed(
    basePlanDays,
    missedItems,
    subjects,
    (subjectId, unit) => todayScoreByUnit.get(`${subjectId}::${unit}`) ?? 50
  );

  // 9차시: 점수에 따른 시간 배분 — 그날 칸들(저장된 칸 우선, 없으면 추천 칸)의 학습 점수로 하루 시간을 나눈다
  /** 그날 [1교시, 2교시] 배정 시간(분). 칸이 없으면 null */
  //  preferRec: 저장할 때 쓰는 값 — 완료한 칸만 저장된 것을 쓰고 나머지는 새 추천 기준으로 나눈다
  const minutesFor = (day: PlanDay, preferRec = false): (number | null)[] => {
    const cells = [0, 1].map((slot) => {
      const stored = savedAt(day.date, slot);
      const saved = preferRec && !stored?.completed ? undefined : stored;
      const subjectId = saved?.subject_id ?? day.items[slot]?.subjectId;
      const unit = saved?.unit ?? day.items[slot]?.unit;
      if (!subjectId || !unit) return null;
      // 그날 기준 점수(추천에 있으면 그 값) → 없으면 오늘 기준 점수 → 그래도 없으면 중간값
      const rec = day.items.find((it) => it.subjectId === subjectId && it.unit === unit);
      return rec?.score ?? todayScoreByUnit.get(`${subjectId}::${unit}`) ?? 50;
    });
    const present = cells.filter((s): s is number => s !== null);
    const minutes = allocateMinutes(day.availableHours, present);
    let k = 0;
    return cells.map((s) => (s === null ? null : minutes[k++]));
  };

  const futureSaved = planItems.filter((it) => it.plan_date >= today);
  const { upserts, deleteIds } = diffPlanForSave(planDays, futureSaved);
  const hasSavedPlan = futureSaved.length > 0;
  // 저장된 계획과 지금 추천이 다르면(새 학습 결과가 들어왔다는 뜻) 갱신을 권한다
  const planOutdated =
    hasSavedPlan &&
    (deleteIds.length > 0 ||
      upserts.some((u) => {
        const saved = savedAt(u.plan_date, u.slot);
        return !saved || saved.subject_id !== u.subject_id || saved.unit !== u.unit;
      }));

  const adherenceFrom = addDaysISO(today, -(ADHERENCE_DAYS - 1));
  const adherence = summarizeAdherence(planItems, adherenceFrom, today);
  const adherenceSlots = planItems.filter(
    (it) => it.plan_date >= adherenceFrom && it.plan_date <= today
  );
  const pendingInputs = findPendingResultInputs(planItems, records);
  const pastDates = Array.from({ length: ADHERENCE_DAYS }, (_, i) =>
    addDaysISO(today, i - ADHERENCE_DAYS)
  ).filter((d) => itemsByDate.has(d));

  // 단원별 가장 약한 문제 유형 (최근 30일, 사진 분석으로 저장한 문항) → 하루 시간표에 "무엇 위주로" 표시
  const weakTypes = weakestTypeByUnit(problemResults, records, addDaysISO(today, -30));
  const weakTypeOf = (subjectId: string, unit: string) => weakTypes.get(`${subjectId}::${unit}`) ?? null;

  /** 그날이 쉬는 날(공부 가능 0시간이고 저장·추천 칸이 하나도 없음)인지 */
  const isRestDay = (day: PlanDay) =>
    day.availableHours === 0 && day.items.length === 0 && !savedAt(day.date, 0) && !savedAt(day.date, 1);

  const savePlan = async () => {
    setSaving(true);
    setMessage(null);

    if (deleteIds.length > 0) {
      const { error } = await supabase.from("plan_items").delete().in("id", deleteIds);
      if (error) {
        setSaving(false);
        setMessage({ type: "error", text: `계획 저장 실패: ${error.message}` });
        return;
      }
    }
    if (upserts.length > 0) {
      const dayByDate = new Map(planDays.map((d) => [d.date, d]));
      const { error } = await supabase
        .from("plan_items")
        .upsert(
          upserts.map((u) => {
            const row = { ...u, user_id: user?.id };
            if (!hasTimeColumns) return row;
            const day = dayByDate.get(u.plan_date);
            return { ...row, planned_minutes: day ? minutesFor(day, true)[u.slot] : null };
          }),
          { onConflict: "user_id,plan_date,slot" }
        );
      if (error) {
        setSaving(false);
        setMessage({ type: "error", text: `계획 저장 실패: ${error.message}` });
        return;
      }
    }

    await loadPlanItems();
    setSaving(false);
    setMessage({
      type: "ok",
      text: hasSavedPlan ? "새 학습 점수를 반영해 계획을 갱신했어요." : "학습 계획을 저장했어요.",
    });
  };

  const toggleItem = async (item: PlanItem) => {
    const completed = !item.completed;
    const completed_at = completed ? new Date().toISOString() : null;

    // 체크가 바로 반응하도록 화면부터 바꾸고, 실패하면 되돌린다
    setPlanItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, completed, completed_at } : it))
    );
    const { error } = await supabase
      .from("plan_items")
      .update({ completed, completed_at })
      .eq("id", item.id);

    if (error) {
      setPlanItems((prev) => prev.map((it) => (it.id === item.id ? item : it)));
      setMessage({ type: "error", text: `체크 저장 실패: ${error.message}` });
    }
  };

  /** 그 칸의 계획 시간(분): 저장할 때 기록한 값 → 계획 기간 안이면 지금 배분 → 없으면 null */
  const plannedMinutesOf = (item: PlanItem): number | null => {
    if (item.planned_minutes != null) return item.planned_minutes;
    const day = planDays.find((d) => d.date === item.plan_date);
    return day ? minutesFor(day)[item.slot] : null;
  };

  /** 실제 공부 시간(분) 저장. null이면 지운다 */
  const setActualMinutes = async (item: PlanItem, minutes: number | null) => {
    setPlanItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, actual_minutes: minutes } : it)));
    const { error } = await supabase.from("plan_items").update({ actual_minutes: minutes }).eq("id", item.id);
    if (error) {
      setPlanItems((prev) => prev.map((it) => (it.id === item.id ? item : it)));
      setMessage({ type: "error", text: `공부 시간 저장 실패: ${error.message}` });
      return false;
    }
    return true;
  };

  return {
    today,
    weakTypeOf,
    carried,
    hasTimeColumns,
    plannedMinutesOf,
    setActualMinutes,
    subjects,
    horizon,
    noStudyHours,
    loading,
    error,
    planError,
    saving,
    message,
    subjectPriorities,
    planDays,
    colors,
    subjectNameById,
    itemsByDate,
    savedAt,
    minutesFor,
    hasSavedPlan,
    planOutdated,
    adherence,
    adherenceSlots,
    pendingInputs,
    pastDates,
    isRestDay,
    savePlan,
    toggleItem,
  };
}

export type PlanData = ReturnType<typeof usePlanData>;
