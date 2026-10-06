"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import type { StudyRecord, Subject } from "@/types/study";
import { buildUnitStatuses, scoreOfRecord, type UnitStatus } from "@/lib/scoring";
import { buildSubjectColorMap, colorOf, scoreColor, scoreTextColor } from "@/lib/palette";
import ScoreLineChart from "@/components/ScoreLineChart";
import { ArrowRightIcon } from "@/components/Icons";
import {
  ConfigNotice,
  ErrorNotice,
  LoadingSplit,
  PageFrame,
  PageHeader,
  ScoreBar,
  ScoreLegend,
  SubjectChip,
} from "@/components/ui";

const keyOf = (u: { subjectId: string; unit: string }) => `${u.subjectId}::${u.unit}`;
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export default function ScoresPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const [subjectsRes, recordsRes] = await Promise.all([
        supabase.from("subjects").select("*"),
        supabase.from("study_records").select("*"),
      ]);

      const firstError = subjectsRes.error ?? recordsRes.error;
      if (firstError) {
        setError(describeLoadError(firstError.message));
        setLoading(false);
        return;
      }

      setSubjects((subjectsRes.data as Subject[]) ?? []);
      setRecords((recordsRes.data as StudyRecord[]) ?? []);
      setLoading(false);
    };

    load();
  }, []);

  const unitStatuses = useMemo(() => buildUnitStatuses(subjects, records), [subjects, records]);
  const colors = useMemo(() => buildSubjectColorMap(subjects), [subjects]);

  const columns = useMemo(
    () =>
      [...unitStatuses].sort((a, b) =>
        a.subjectName === b.subjectName
          ? a.unit.localeCompare(b.unit)
          : a.subjectName.localeCompare(b.subjectName)
      ),
    [unitStatuses]
  );

  const allDates = useMemo(
    () => Array.from(new Set(records.map((r) => r.study_date))).sort(),
    [records]
  );

  const cellScore = (date: string, unit: UnitStatus): number | null => {
    const onDate = records.filter(
      (r) => r.subject_id === unit.subjectId && r.unit === unit.unit && r.study_date === date
    );
    if (onDate.length === 0) return null;
    const latest = onDate.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).pop()!;
    return scoreOfRecord(latest).metricValue;
  };

  // 아무것도 고르지 않았으면 가장 공백이 큰(점수가 가장 낮은) 단원을 보여준다
  const selectedUnit =
    columns.find((c) => keyOf(c) === selectedKey) ?? unitStatuses[0] ?? null;

  return (
    <PageFrame>
      <PageHeader
        title="학습 점수"
        description="단원별 최종 학습 점수와 그 근거, 기록할 때마다 점수가 어떻게 바뀌었는지 봅니다."
        action={<ScoreLegend />}
      />
      <ConfigNotice />
      {error && <ErrorNotice>데이터를 불러오지 못했어요. {error}</ErrorNotice>}

      {loading ? (
        <LoadingSplit label="학습 점수를 불러오는 중…" />
      ) : error ? null : columns.length === 0 ? (
        <div className="sheet flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] text-ink-soft">
            아직 학습 기록이 없어요. 결과를 입력하면 단원별 점수와 변화 그래프가 생깁니다.
          </p>
          <Link href="/input" className="btn-primary">
            학습 결과 입력하기 <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            {/* 단원 목록: 점수 낮은 순 */}
            <section className="sheet" aria-labelledby="units-title">
              <div className="sheet-head">
                <h2 id="units-title" className="sheet-title">
                  단원
                </h2>
                <span className="text-xs text-ink-muted">낮은 점수부터</span>
              </div>
              <ul role="listbox" aria-label="단원 선택">
                {unitStatuses.map((u) => {
                  const selected = selectedUnit !== null && keyOf(u) === keyOf(selectedUnit);
                  return (
                    <li key={keyOf(u)} className="border-b border-rule last:border-b-0">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => setSelectedKey(keyOf(u))}
                        className={`grid w-full grid-cols-[minmax(0,1fr)_40px] items-center gap-x-3 gap-y-2 px-5 py-3 text-left transition-colors ${
                          selected ? "bg-[#F1F3F7] outline outline-2 -outline-offset-2 outline-shell" : "hover:bg-[#F7F8F8]"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <SubjectChip color={colorOf(colors, u.subjectId)} />
                          <span className="truncate text-[13px] text-ink-soft">{u.subjectName}</span>
                          <span className="truncate text-[15px] font-bold">{u.unit}</span>
                        </span>
                        <span className="text-right text-[17px] font-extrabold">{u.finalScore}</span>
                        <ScoreBar score={u.finalScore} className="col-span-2 w-full" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {selectedUnit && (
              <SelectedUnitPanel unit={selectedUnit} color={colorOf(colors, selectedUnit.subjectId)} />
            )}
          </div>

          {/* 기록 일지: 날짜 × 단원 */}
          <section className="sheet" aria-labelledby="log-title">
            <div className="sheet-head">
              <h2 id="log-title" className="sheet-title">
                기록 일지
              </h2>
              <span className="text-xs text-ink-muted">
                칸 = 그날 기록의 기본 점수 (정답률 또는 의미 유사도)
              </span>
            </div>
            <div className="overflow-x-auto p-5">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="w-20 border-b border-rule-strong pb-2 pr-3 text-left text-xs font-semibold text-ink-muted"
                    >
                      날짜
                    </th>
                    {columns.map((c) => {
                      const selected = selectedUnit !== null && keyOf(c) === keyOf(selectedUnit);
                      return (
                        <th key={keyOf(c)} scope="col" className="border-b border-rule-strong px-1 pb-2">
                          <button
                            type="button"
                            onClick={() => setSelectedKey(keyOf(c))}
                            aria-pressed={selected}
                            className={`flex w-full flex-col items-center gap-0.5 px-1 py-1 transition-colors ${
                              selected ? "bg-shell text-white" : "hover:bg-ground"
                            }`}
                          >
                            <span className="flex items-center gap-1 text-[11px] font-semibold">
                              <SubjectChip color={colorOf(colors, c.subjectId)} className="h-2 w-2" />
                              <span className={selected ? "text-shell-text" : "text-ink-muted"}>
                                {c.subjectName}
                              </span>
                            </span>
                            <span className="text-[13px] font-bold">{c.unit}</span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {allDates.map((date) => (
                    <tr key={date}>
                      <th
                        scope="row"
                        className="border-b border-rule py-1 pr-3 text-left text-[13px] font-semibold text-ink-soft"
                      >
                        {shortDate(date)}
                      </th>
                      {columns.map((c) => {
                        const score = cellScore(date, c);
                        return (
                          <td key={keyOf(c)} className="border-b border-rule p-1">
                            {score !== null && (
                              <span
                                className="flex h-9 items-center justify-center text-[14px] font-bold"
                                style={{ backgroundColor: scoreColor(score), color: scoreTextColor(score) }}
                              >
                                {score}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </PageFrame>
  );
}

/** 선택한 단원: 점수 근거(감점 내역) + 변화 그래프 + 틀린 이유 변화 */
function SelectedUnitPanel({ unit, color }: { unit: UnitStatus; color: string }) {
  const steps = [
    { label: unit.metricLabel, value: unit.metricValue, kind: "base" as const },
    {
      label: "최근 학습 감점",
      value: -unit.recencyPenalty,
      kind: "minus" as const,
      note: unit.tiedWithOthers ? "다른 단원과 점수가 비슷해 적용" : "점수가 비슷한 단원이 없어 미적용",
    },
    {
      label: "문제 풀이량 감점",
      value: -unit.volumePenalty,
      kind: "minus" as const,
      note:
        unit.recordType !== "problem"
          ? "개념 의미 유형은 해당 없음"
          : unit.tiedWithOthers
            ? "많이 풀었는데도 점수가 비슷하면 감점"
            : "점수가 비슷한 단원이 없어 미적용",
    },
    {
      label: "시험 임박 감점",
      value: -unit.examPenalty,
      kind: "minus" as const,
      note: unit.examPenalty > 0 ? "시험 30일 이내" : "시험이 30일 넘게 남았거나 날짜 없음",
    },
  ];

  return (
    <section className="sheet" aria-labelledby="detail-title">
      <div className="sheet-head">
        <h2 id="detail-title" className="sheet-title flex items-center gap-2">
          <SubjectChip color={color} className="h-3.5 w-3.5" />
          {unit.subjectName} · {unit.unit}
        </h2>
        <span className="text-xs text-ink-muted">
          {unit.recordType === "problem" ? "문제 풀이" : "개념 의미"} · 최근 기록{" "}
          {unit.latestRecord.study_date}
        </span>
      </div>

      <div className="grid gap-px bg-rule xl:grid-cols-2">
        {/* 점수 근거 */}
        <div className="flex flex-col gap-4 bg-sheet p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-bold">점수 근거</h3>
            <span className="text-[34px] font-extrabold leading-none tracking-[-0.03em]">
              {unit.finalScore}
              <span className="ml-1 text-sm font-semibold text-ink-muted">점</span>
            </span>
          </div>
          <ScoreBar score={unit.finalScore} thick />
          <dl className="flex flex-col">
            {steps.map((s) => (
              <div
                key={s.label}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-rule py-2.5"
              >
                <dt className="text-[13px] font-semibold">{s.label}</dt>
                <dd
                  className={`text-right text-[15px] font-bold ${
                    s.kind === "minus" && s.value < 0 ? "text-gap-2" : ""
                  }`}
                >
                  {s.kind === "base" ? s.value : s.value === 0 ? "0" : s.value}
                </dd>
                {"note" in s && <dd className="col-span-2 text-xs text-ink-muted">{s.note}</dd>}
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] border-t-2 border-ink pt-2.5">
              <dt className="text-[13px] font-bold">학습 점수</dt>
              <dd className="text-right text-[15px] font-extrabold">{unit.finalScore}</dd>
            </div>
          </dl>
        </div>

        {/* 변화 그래프 + 틀린 이유 */}
        <div className="flex flex-col gap-5 bg-sheet p-5">
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold">
              {unit.metricLabel} 변화{" "}
              <span className="font-normal text-ink-muted">기록 {unit.history.length}회</span>
            </h3>
            <ScoreLineChart points={unit.history} color={color} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] font-bold">틀린 이유 변화</h3>
            <ol className="flex flex-col">
              {[...unit.wrongReasonsHistory].reverse().map((h, idx) => (
                <li
                  key={`${h.date}-${idx}`}
                  className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-3 border-t border-rule py-2"
                >
                  <span className="pt-0.5 text-[13px] font-semibold text-ink-soft">
                    {shortDate(h.date)}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {h.reasons.length > 0 ? (
                      h.reasons.map((r) => (
                        <span key={r} className="border border-rule-strong px-2 py-0.5 text-[13px]">
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-[13px] text-ink-muted">기록 없음</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
