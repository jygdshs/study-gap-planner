"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import type { PlanItem, StudyRecord, Subject } from "@/types/study";
import { addDaysISO, dayOfWeekMonFirst, DAY_LABELS_FULL, todayISO } from "@/lib/scoring";
import { buildWeeklyReport, type UnitChange, type WeekStats } from "@/lib/analysis";
import { buildSubjectColorMap, colorOf, scoreColor } from "@/lib/palette";
import { ArrowRightIcon } from "@/components/Icons";
import { ConfigNotice, ErrorNotice, LoadingSplit, PageFrame, PageHeader, SubjectChip } from "@/components/ui";

// 9차시: 주간 성장 리포트 — 이번 주(오늘 포함 최근 7일)를 지난주(그 앞 7일)와 비교한다.

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

type Row = { label: string; last: number | null; now: number | null; unit: string; better: "up" | "down" };

function delta(row: Row) {
  if (row.last === null || row.now === null) return null;
  return round1(row.now - row.last);
}

export default function ReportPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = todayISO();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [subjectsRes, recordsRes, planRes] = await Promise.all([
        supabase.from("subjects").select("*"),
        supabase.from("study_records").select("*"),
        supabase.from("plan_items").select("*").gte("plan_date", addDaysISO(today, -13)),
      ]);
      const firstError = subjectsRes.error ?? recordsRes.error;
      if (firstError) {
        setError(describeLoadError(firstError.message));
        setLoading(false);
        return;
      }
      setSubjects((subjectsRes.data as Subject[]) ?? []);
      setRecords((recordsRes.data as StudyRecord[]) ?? []);
      setPlanItems(planRes.error ? [] : ((planRes.data as PlanItem[]) ?? []));
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = useMemo(() => buildWeeklyReport(records, planItems, today), [records, planItems, today]);
  const colors = buildSubjectColorMap(subjects);
  const nameById = new Map(subjects.map((s) => [s.id, s.name]));
  const { thisWeek, lastWeek } = report;

  const rows: Row[] = [
    { label: "학습 기록", last: lastWeek.records, now: thisWeek.records, unit: "개", better: "up" },
    { label: "공부한 날", last: lastWeek.studyDays, now: thisWeek.studyDays, unit: "일", better: "up" },
    { label: "평균 기본 점수", last: lastWeek.avgScore, now: thisWeek.avgScore, unit: "점", better: "up" },
    { label: "계획 이행률", last: lastWeek.adherenceRate, now: thisWeek.adherenceRate, unit: "%", better: "up" },
  ];

  const summary = buildSummary(thisWeek, lastWeek, report.improved[0], nameById);
  const maxDay = Math.max(1, ...report.dayCounts.map((d) => d.count));

  return (
    <PageFrame>
      <PageHeader
        title="주간 리포트"
        description={`${shortDate(thisWeek.from)} – ${shortDate(thisWeek.to)} 이번 주를 지난주(${shortDate(lastWeek.from)} – ${shortDate(lastWeek.to)})와 비교해요.`}
      />
      <ConfigNotice />
      {error && <ErrorNotice>데이터를 불러오지 못했어요. {error}</ErrorNotice>}

      {loading ? (
        <LoadingSplit label="리포트를 만드는 중…" />
      ) : error ? null : thisWeek.records === 0 && lastWeek.records === 0 ? (
        <div className="sheet flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] text-ink-soft">
            최근 2주 동안 학습 기록이 없어요. 결과를 입력하면 한 주 동안 얼마나 성장했는지 보여드려요.
          </p>
          <Link href="/input" className="btn-primary">
            학습 결과 입력하기 <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="rise-stagger grid items-start gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          {/* 한 주 성적표 */}
          <section className="sheet" aria-labelledby="week-title">
            <div className="sheet-head">
              <h2 id="week-title" className="sheet-title">
                이번 주 성적표
              </h2>
              <span className="text-xs text-ink-muted">지난주 → 이번 주</span>
            </div>
            <p className="border-b border-rule px-5 py-4 text-[15px] leading-relaxed">{summary}</p>

            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="text-xs text-ink-muted">
                  <th scope="col" className="px-5 py-2 text-left font-semibold">항목</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">지난주</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">이번 주</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">변화</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = delta(row);
                  const good = d !== null && d !== 0 && (row.better === "up" ? d > 0 : d < 0);
                  return (
                    <tr key={row.label} className="border-t border-rule">
                      <th scope="row" className="px-5 py-3 text-left font-semibold">
                        {row.label}
                      </th>
                      <td className="px-3 py-3 text-right text-ink-soft">
                        {row.last === null ? "—" : `${row.last}${row.unit}`}
                      </td>
                      <td className="px-3 py-3 text-right text-[17px] font-extrabold">
                        {row.now === null ? "—" : `${row.now}${row.unit}`}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-bold ${
                          d === null || d === 0 ? "text-ink-muted" : good ? "text-ok" : "text-danger"
                        }`}
                      >
                        {d === null ? "—" : d === 0 ? "그대로" : `${d > 0 ? "+" : "−"}${Math.abs(d)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 이번 주 날짜별 기록 수 */}
            <div className="border-t border-rule px-5 py-4">
              <h3 className="mb-2 text-[13px] font-bold">이번 주 공부한 날</h3>
              <div className="grid grid-cols-7 gap-px border border-rule bg-rule">
                {report.dayCounts.map((d, i) => (
                  <div
                    key={d.date}
                    className="cell-pop flex flex-col items-center gap-1 bg-sheet py-2"
                    style={{ animationDelay: `${300 + i * 50}ms` }}
                  >
                    <span className={`text-[12px] font-bold ${d.date === today ? "text-ink" : "text-ink-muted"}`}>
                      {DAY_LABELS_FULL[dayOfWeekMonFirst(d.date)]}
                    </span>
                    <span
                      className="flex h-8 w-8 items-center justify-center text-[13px] font-extrabold"
                      style={
                        d.count > 0
                          ? {
                              backgroundColor: `rgb(var(--c-mark) / ${0.25 + (0.75 * d.count) / maxDay})`,
                              color: "rgb(var(--c-on-mark))",
                            }
                          : { boxShadow: "inset 0 0 0 1px rgb(var(--c-rule-strong))", color: "rgb(var(--c-ink-muted))" }
                      }
                      title={`${shortDate(d.date)} 기록 ${d.count}개`}
                    >
                      {d.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-6">
            {/* 단원 변화 */}
            <section className="sheet" aria-labelledby="units-change-title">
              <div className="sheet-head">
                <h2 id="units-change-title" className="sheet-title">
                  단원별 변화
                </h2>
                <span className="text-xs text-ink-muted">이번 주 전 마지막 기록 → 이번 주 마지막 기록</span>
              </div>
              {report.improved.length + report.declined.length + report.newUnits.length === 0 ? (
                <p className="px-5 py-4 text-[14px] text-ink-muted">이번 주에 기록한 단원이 없어요.</p>
              ) : (
                <ul>
                  {[...report.improved, ...report.declined].map((c, i) => (
                    <ChangeRow
                      key={`${c.subjectId}::${c.unit}`}
                      change={c}
                      name={nameById.get(c.subjectId) ?? "?"}
                      color={colorOf(colors, c.subjectId)}
                      delay={320 + i * 70}
                    />
                  ))}
                  {report.newUnits.map((u) => (
                    <li
                      key={`${u.subjectId}::${u.unit}`}
                      className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3 first:border-t-0"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <SubjectChip color={colorOf(colors, u.subjectId)} />
                        <span className="truncate text-[14px]">
                          <span className="text-ink-soft">{nameById.get(u.subjectId)}</span>{" "}
                          <strong>{u.unit}</strong>
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] text-ink-muted">
                        새로 시작 · <strong className="text-ink">{u.score}점</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 이번 주 틀린 이유 */}
            <section className="sheet" aria-labelledby="week-reasons-title">
              <div className="sheet-head">
                <h2 id="week-reasons-title" className="sheet-title">
                  이번 주 틀린 이유
                </h2>
                <Link href="/scores" className="text-[13px] font-semibold text-accent hover:underline">
                  전체 분석 보기
                </Link>
              </div>
              {report.topReasons.length === 0 ? (
                <p className="px-5 py-4 text-[14px] text-ink-muted">이번 주에 기록된 틀린 이유가 없어요.</p>
              ) : (
                <ol>
                  {report.topReasons.map((r, i) => (
                    <li
                      key={r.reason}
                      className="flex items-center gap-3 border-t border-rule px-5 py-2.5 first:border-t-0"
                    >
                      <span className="w-5 text-[15px] font-extrabold text-ink-muted">{i + 1}</span>
                      <span className="flex-1 text-[14px] font-semibold">{r.reason}</span>
                      <span className="text-[14px] font-extrabold">{r.count}회</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </PageFrame>
  );
}

function ChangeRow({
  change,
  name,
  color,
  delay,
}: {
  change: UnitChange;
  name: string;
  color: string;
  delay: number;
}) {
  const up = change.delta > 0;
  return (
    <li className="flex flex-col gap-2 border-t border-rule px-5 py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <SubjectChip color={color} />
          <span className="truncate text-[14px]">
            <span className="text-ink-soft">{name}</span> <strong>{change.unit}</strong>
          </span>
        </span>
        <span className={`shrink-0 text-[15px] font-extrabold ${up ? "text-ok" : "text-danger"}`}>
          {up ? "+" : "−"}{Math.abs(change.delta)}
        </span>
      </div>
      {/* 0~100 축 위에 이전 점수 → 지금 점수 */}
      <div className="relative h-2 bg-ground" aria-label={`${change.before}점에서 ${change.after}점으로`} role="img">
        <span
          className="bar-grow absolute inset-y-0"
          style={{
            left: `${Math.min(change.before, change.after)}%`,
            width: `${Math.abs(change.after - change.before)}%`,
            backgroundColor: scoreColor(change.after),
            animationDelay: `${delay}ms`,
          }}
        />
        <span className="absolute -top-1 h-4 w-0.5 bg-ink-muted" style={{ left: `${change.before}%` }} />
      </div>
      <span className="text-xs text-ink-muted">
        {change.before}점 → <strong className="text-ink">{change.after}점</strong>
      </span>
    </li>
  );
}

function buildSummary(
  thisWeek: WeekStats,
  lastWeek: WeekStats,
  best: UnitChange | undefined,
  nameById: Map<string, string>
): string {
  const parts: string[] = [];
  const recDiff = thisWeek.records - lastWeek.records;
  parts.push(
    `이번 주는 ${thisWeek.studyDays}일 동안 기록 ${thisWeek.records}개를 남겼어요` +
      (recDiff === 0 ? "(지난주와 같아요)" : `(지난주보다 ${Math.abs(recDiff)}개 ${recDiff > 0 ? "많아요" : "적어요"})`) +
      "."
  );
  if (thisWeek.avgScore !== null && lastWeek.avgScore !== null) {
    const d = round1(thisWeek.avgScore - lastWeek.avgScore);
    parts.push(d === 0 ? "평균 점수는 그대로예요." : `평균 점수는 ${Math.abs(d)}점 ${d > 0 ? "올랐어요" : "내려갔어요"}.`);
  }
  if (best) parts.push(`가장 많이 오른 단원은 ${nameById.get(best.subjectId) ?? ""} ${best.unit}(+${best.delta}점)이에요.`);
  if (thisWeek.adherenceRate !== null) parts.push(`계획은 ${thisWeek.planned}칸 중 ${thisWeek.completed}칸 지켰어요.`);
  return parts.join(" ");
}
