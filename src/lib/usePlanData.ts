"use client";

// 학습 계획 화면(/plan)과 처음 화면(/)이 같이 쓰는 데이터 불러오기 + 계획 저장/체크 동작.
// 계산 자체는 scoring.ts / planTracking.ts가 하고, 여기서는 불러오고 저장하는 일만 한다.

import { useEffect, useState } from "react";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import type { PlanItem, StudyRecord, Subject, WeeklyAvailability } from "@/types/study";
import {
  addDaysISO,
  buildStudyPlan,
  buildSubjectPriorities,
  buildUnitStatuses,
  planHorizon,
  todayISO,
  type PlanDay,
} from "@/lib/scoring";
import { diffPlanForSave, findPendingResultInputs, summarizeAdherence } from "@/lib/planTracking";
import { buildSubjectColorMap } from "@/lib/palette";

// 이행률을 계산할 기간: 오늘 포함 최근 7일
export const ADHERENCE_DAYS = 7;

export function usePlanData() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [availability, setAvailability] = useState<WeeklyAvailability[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
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
  const planDays: PlanDay[] = buildStudyPlan(subjects, records, availability, today, horizon.days);
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
      const { error } = await supabase
        .from("plan_items")
        .upsert(upserts, { onConflict: "plan_date,slot" });
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

  return {
    today,
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
