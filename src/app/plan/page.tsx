"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured, describeLoadError } from "@/lib/supabaseClient";
import type { PlanItem, StudyRecord, Subject, WeeklyAvailability } from "@/types/study";
import {
  addDaysISO,
  buildStudyPlan,
  buildSubjectPriorities,
  buildUnitStatuses,
  dayOfWeekMonFirst,
  DAY_LABELS_FULL,
  todayISO,
  type SubjectPriority,
  type PlanDay,
} from "@/lib/scoring";
import { diffPlanForSave, findPendingResultInputs, summarizeAdherence } from "@/lib/planTracking";

// 이행률을 계산할 기간: 오늘 포함 최근 7일
const ADHERENCE_DAYS = 7;

export default function PlanPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [availability, setAvailability] = useState<WeeklyAvailability[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const unitStatuses = buildUnitStatuses(subjects, records);
  const subjectPriorities: SubjectPriority[] = buildSubjectPriorities(subjects, unitStatuses);
  const planDays: PlanDay[] = buildStudyPlan(subjectPriorities, availability);

  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
  const itemsByDate = new Map<string, PlanItem[]>();
  for (const it of planItems) {
    if (!itemsByDate.has(it.plan_date)) itemsByDate.set(it.plan_date, []);
    itemsByDate.get(it.plan_date)!.push(it);
  }
  const savedAt = (date: string, slot: number) =>
    itemsByDate.get(date)?.find((it) => it.slot === slot);

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

  const adherence = summarizeAdherence(planItems, addDaysISO(today, -(ADHERENCE_DAYS - 1)), today);
  const pendingInputs = findPendingResultInputs(planItems, records);

  const pastDates = Array.from({ length: ADHERENCE_DAYS }, (_, i) =>
    addDaysISO(today, i - ADHERENCE_DAYS)
  ).filter((d) => itemsByDate.has(d));

  const handleSavePlan = async () => {
    setSaving(true);
    setMessage(null);

    if (deleteIds.length > 0) {
      const { error } = await supabase.from("plan_items").delete().in("id", deleteIds);
      if (error) {
        setSaving(false);
        setMessage(`계획 저장 실패: ${error.message}`);
        return;
      }
    }
    if (upserts.length > 0) {
      const { error } = await supabase
        .from("plan_items")
        .upsert(upserts, { onConflict: "plan_date,slot" });
      if (error) {
        setSaving(false);
        setMessage(`계획 저장 실패: ${error.message}`);
        return;
      }
    }

    await loadPlanItems();
    setSaving(false);
    setMessage(hasSavedPlan ? "새 학습 점수를 반영해 계획을 갱신했어요." : "학습 계획을 저장했어요.");
  };

  const handleToggle = async (item: PlanItem) => {
    const completed = !item.completed;
    const completed_at = completed ? new Date().toISOString() : null;

    // 체크박스가 바로 반응하도록 화면부터 바꾸고, 실패하면 되돌린다
    setPlanItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, completed, completed_at } : it))
    );
    const { error } = await supabase
      .from("plan_items")
      .update({ completed, completed_at })
      .eq("id", item.id);

    if (error) {
      setPlanItems((prev) => prev.map((it) => (it.id === item.id ? item : it)));
      setMessage(`체크 저장 실패: ${error.message}`);
    }
  };

  const renderSavedCell = (item: PlanItem) => {
    const checkable = item.plan_date <= today;
    return (
      <label
        className={`flex items-start justify-center gap-1 ${
          checkable ? "cursor-pointer" : "cursor-default"
        }`}
        title={checkable ? "계획을 지켰으면 체크하세요" : "그날이 되면 체크할 수 있어요"}
      >
        <input
          type="checkbox"
          checked={item.completed}
          disabled={!checkable}
          onChange={() => handleToggle(item)}
          className="mt-0.5 accent-brand-navy"
        />
        <span className={item.completed ? "text-slate-400 line-through" : ""}>
          {subjectNameById.get(item.subject_id) ?? "?"} {item.unit}
        </span>
      </label>
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="rounded-xl bg-brand-orange px-6 py-5 text-center shadow-sm">
        <h1 className="text-lg font-bold text-brand-navy sm:text-xl">
          과목 입력 · 학습 공백 분석 및 개인별 학습 계획 추천 시스템
        </h1>
      </header>

      <Link href="/" className="text-sm text-brand-navy underline underline-offset-2">
        ← 처음으로
      </Link>

      {!isSupabaseConfigured && (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Supabase 연결이 아직 설정되지 않았어요. README.md 1~2번을 참고해 `.env.local`을
          설정해 주세요.
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-600">
          데이터를 불러오지 못했어요: {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">학습 계획을 계산하는 중...</p>
      ) : error ? null : subjects.length === 0 ? (
        <p className="rounded-xl bg-white p-5 text-sm text-slate-500 shadow-sm">
          아직 등록된 과목이 없어요.{" "}
          <Link href="/input" className="text-brand-navy underline underline-offset-2">
            학습 결과 입력
          </Link>
          에서 과목과 학습 기록을 먼저 추가해 주세요.
        </p>
      ) : (
        <>
          {/* 과목별 우선순위 (처리 결과) */}
          <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-brand-navy">과목별 학습 점수 · 우선순위</h2>
            <p className="text-xs text-slate-400">
              점수가 낮을수록 학습 공백이 크다는 뜻이라 먼저 공부해야 할 과목입니다.
            </p>
            <ol className="flex flex-col gap-2">
              {subjectPriorities.map((sp, idx) => (
                <li
                  key={sp.subject.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-brand-navy">{sp.subject.name}</span>
                    {sp.subject.exam_date && (
                      <span className="text-xs text-slate-400">시험: {sp.subject.exam_date}</span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="font-semibold text-brand-navy">{sp.score}점</span>
                    {!sp.hasRecords && (
                      <span className="ml-2 text-xs text-slate-400">(기록 없음)</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* 계획 이행 체크 요약 (7차시) */}
          {!planError && (
            <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-brand-navy">계획 이행 체크</h2>
              <div className="flex items-end gap-3">
                <span className="text-3xl font-bold text-brand-navy">
                  {adherence.rate === null ? "--" : `${adherence.rate}%`}
                </span>
                <span className="pb-1 text-xs text-slate-500">
                  최근 {ADHERENCE_DAYS}일 이행률 ({adherence.completed}/{adherence.total}칸 완료)
                </span>
              </div>
              {adherence.total > 0 && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-navy"
                    style={{ width: `${adherence.rate ?? 0}%` }}
                  />
                </div>
              )}

              {pendingInputs.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-800">
                    계획을 지켰지만 아직 새 학습 결과를 입력하지 않은 단원이에요. 결과를
                    입력하면 학습 점수와 계획이 새로 계산됩니다.
                  </p>
                  <ul className="flex flex-col gap-1">
                    {pendingInputs.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-center justify-between text-xs text-slate-700"
                      >
                        <span>
                          {it.plan_date.slice(5)} · {subjectNameById.get(it.subject_id) ?? "?"}{" "}
                          {it.unit}
                        </span>
                        <Link
                          href={`/input?subject=${it.subject_id}&unit=${encodeURIComponent(
                            it.unit
                          )}`}
                          className="font-medium text-brand-navy underline underline-offset-2"
                        >
                          결과 입력 →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  계획 칸을 체크하면 이행률이 계산되고, 새 결과를 입력해야 할 단원이 여기에
                  표시돼요.
                </p>
              )}
            </section>
          )}

          {/* 요일별 학습 계획 (출력) */}
          <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-brand-navy">요일별 개인 학습 계획</h2>
              {!planError && (
                <button
                  type="button"
                  onClick={handleSavePlan}
                  disabled={saving || (hasSavedPlan && !planOutdated)}
                  className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {saving
                    ? "저장 중..."
                    : !hasSavedPlan
                      ? "이 계획 저장하기"
                      : planOutdated
                        ? "새 학습 점수로 계획 갱신"
                        : "최신 계획 저장됨"}
                </button>
              )}
            </div>

            {planError ? (
              <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800">
                계획 저장용 <code>plan_items</code> 테이블을 불러오지 못했어요 ({planError}).
                Supabase SQL Editor에서 <code>supabase/schema.sql</code>의 4번 블록을 실행하면
                계획 저장·이행 체크를 쓸 수 있어요. 아래는 저장되지 않은 추천 계획입니다.
              </p>
            ) : !hasSavedPlan ? (
              <p className="text-xs text-slate-400">
                아래는 추천 계획이에요. 저장해야 날마다 지켰는지 체크할 수 있어요.
              </p>
            ) : planOutdated ? (
              <p className="text-xs text-amber-700">
                새 학습 결과가 반영된 추천이 있어요. 갱신해도 이미 완료 체크한 칸은 그대로
                남습니다.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                오늘까지의 칸은 계획을 지켰으면 체크하세요.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed border-collapse text-xs">
                <thead>
                  <tr>
                    {planDays.map((day) => (
                      <th
                        key={day.date}
                        className={`border border-slate-200 px-2 py-1 text-center font-medium text-brand-navy ${
                          day.date === today ? "bg-brand-orange/60" : "bg-brand-blue/40"
                        }`}
                      >
                        {day.date.slice(5)} ({day.dayLabel})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1].map((row) => (
                    <tr key={row}>
                      {planDays.map((day) => {
                        const saved = planError ? undefined : savedAt(day.date, row);
                        const rec = day.items[row];
                        return (
                          <td
                            key={day.date}
                            className="border border-slate-200 px-2 py-2 text-center align-top text-slate-600"
                          >
                            {saved ? (
                              renderSavedCell(saved)
                            ) : rec ? (
                              <span className={hasSavedPlan ? "text-slate-400" : ""}>
                                {rec.subjectName} {rec.unit}
                              </span>
                            ) : (
                              "--"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    {planDays.map((day) => (
                      <td
                        key={day.date}
                        className="border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[10px] text-slate-400"
                      >
                        공부 가능 {day.availableHours}시간
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {message && <p className="text-xs text-brand-navy">{message}</p>}
          </section>

          {/* 지난 계획 (이전 날짜도 늦게라도 체크할 수 있게) */}
          {!planError && pastDates.length > 0 && (
            <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-brand-navy">지난 {ADHERENCE_DAYS}일 계획</h2>
              <ul className="flex flex-col gap-2">
                {pastDates.map((date) => (
                  <li
                    key={date}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    <span className="w-16 font-medium text-brand-navy">
                      {date.slice(5)} ({DAY_LABELS_FULL[dayOfWeekMonFirst(date)]})
                    </span>
                    {itemsByDate.get(date)!.map((it) => (
                      <span key={it.id}>{renderSavedCell(it)}</span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/input"
              className="rounded-xl bg-brand-orange px-4 py-3 text-center text-sm font-semibold text-brand-navy shadow-sm"
            >
              새 학습 결과 입력하기
            </Link>
            <Link
              href="/scores"
              className="rounded-xl bg-brand-navy px-4 py-3 text-center text-sm font-semibold text-white shadow-sm"
            >
              학습 점수 보러 가기
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
