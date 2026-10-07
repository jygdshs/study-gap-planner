"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import type { ExamResult, StudyRecord, Subject } from "@/types/study";
import { todayISO } from "@/lib/scoring";
import { compareExamResults, describeCorrelation, type ComparisonRow } from "@/lib/review";
import { buildSubjectColorMap, colorOf, subjectInk } from "@/lib/palette";
import { ConfigNotice, ErrorNotice, LoadingSplit, PageFrame, PageHeader, SubjectChip } from "@/components/ui";

// 실제 시험 성적 입력 → 시험 전날 학습 점수(예측)와 비교.
// "점수가 낮을수록 공백이 크다"는 이 앱의 계산 방식이 실제 성적을 얼마나 잘 설명하는지 확인한다.

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export default function ResultsPage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState<string | null>(null);

  // 입력 폼
  const [subjectId, setSubjectId] = useState("");
  const [examDate, setExamDate] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const today = todayISO();

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [subjectsRes, recordsRes, resultsRes] = await Promise.all([
      supabase.from("subjects").select("*").order("created_at"),
      supabase.from("study_records").select("*"),
      supabase.from("exam_results").select("*"),
    ]);
    const firstError = subjectsRes.error ?? recordsRes.error;
    if (firstError) {
      setError(describeLoadError(firstError.message));
      setLoading(false);
      return;
    }
    setSubjects((subjectsRes.data as Subject[]) ?? []);
    setRecords((recordsRes.data as StudyRecord[]) ?? []);
    // exam_results 테이블이 아직 없으면(SQL 미실행) 비교만 못 할 뿐 화면은 보여준다
    setTableMissing(resultsRes.error ? resultsRes.error.message : null);
    setResults(resultsRes.error ? [] : ((resultsRes.data as ExamResult[]) ?? []));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colors = buildSubjectColorMap(subjects);
  const summary = useMemo(() => compareExamResults(results, subjects, records), [results, subjects, records]);

  // 과목을 고르면 그 과목의 시험 날짜를 기본값으로
  const pickSubject = (id: string) => {
    setSubjectId(id);
    const s = subjects.find((x) => x.id === id);
    setExamDate(s?.exam_date && s.exam_date <= today ? s.exam_date : today);
    setMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const sc = Number(score);
    const mx = Number(maxScore);
    if (!subjectId) return setMessage({ type: "error", text: "과목을 골라 주세요." });
    if (!examDate) return setMessage({ type: "error", text: "시험 날짜를 입력해 주세요." });
    if (score === "" || !(mx > 0) || sc < 0 || sc > mx)
      return setMessage({ type: "error", text: "점수는 0점 이상, 만점 이하로 입력해 주세요." });

    setSaving(true);
    const { error } = await supabase
      .from("exam_results")
      .upsert(
        { user_id: user?.id, subject_id: subjectId, exam_date: examDate, score: sc, max_score: mx },
        { onConflict: "user_id,subject_id,exam_date" }
      );
    setSaving(false);
    if (error) return setMessage({ type: "error", text: `저장 실패: ${error.message}` });
    setScore("");
    await load(true);
    setMessage({ type: "ok", text: "시험 결과를 저장했어요. 오른쪽에서 학습 점수와 비교해 보세요." });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("exam_results").delete().eq("id", id);
    if (error) return setMessage({ type: "error", text: `삭제 실패: ${error.message}` });
    await load(true);
  };

  return (
    <PageFrame>
      <PageHeader
        title="시험 결과 비교"
        description="시험이 끝나면 실제 점수를 입력하세요. 시험 전날 학습 점수와 비교해, 이 앱의 점수 계산이 실제 성적을 얼마나 잘 예측했는지 보여줘요."
      />
      <ConfigNotice />
      {error && <ErrorNotice>데이터를 불러오지 못했어요. {error}</ErrorNotice>}
      {tableMissing && (
        <p className="notice-warn mb-6">
          시험 결과를 저장할 <code>exam_results</code> 테이블이 아직 없어요. Supabase SQL Editor에서{" "}
          <code>supabase/migrations/003_exam_results.sql</code>을 실행해 주세요. ({tableMissing})
        </p>
      )}

      {loading ? (
        <LoadingSplit label="시험 결과를 불러오는 중…" />
      ) : error ? null : (
        <div className="rise-stagger grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* 입력 + 목록 */}
          <section className="sheet" aria-labelledby="result-input-title">
            <div className="sheet-head">
              <h2 id="result-input-title" className="sheet-title">
                실제 점수 입력
              </h2>
              <span className="text-xs text-ink-muted">같은 과목·날짜는 덮어써요</span>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-4 p-5" noValidate>
              <div className="flex flex-col gap-2">
                <span className="field-label">과목</span>
                <div role="radiogroup" aria-label="과목" className="flex flex-wrap gap-2">
                  {subjects.map((s) => {
                    const c = colorOf(colors, s.id);
                    const selected = s.id === subjectId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => pickSubject(s.id)}
                        className="flex min-h-[40px] flex-col items-start justify-center border-2 px-3 py-1 text-left"
                        style={
                          selected
                            ? { backgroundColor: c, borderColor: c, color: "#fff" }
                            : { borderColor: subjectInk(c), color: subjectInk(c) }
                        }
                      >
                        <span className="text-[14px] font-bold leading-tight">{s.name}</span>
                        {s.exam_date && (
                          <span className={`text-[11px] ${selected ? "text-white/85" : "text-ink-muted"}`}>
                            시험 {shortDate(s.exam_date)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="field-label">시험 날짜</span>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="field py-2 text-[14px]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="field-label">받은 점수</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="field py-2 text-[16px] font-bold"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="field-label">만점</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    className="field py-2 text-[16px] font-bold"
                  />
                </label>
              </div>
              {message && (
                <p
                  role={message.type === "error" ? "alert" : "status"}
                  className={message.type === "ok" ? "notice-ok" : "notice-error"}
                >
                  {message.text}
                </p>
              )}
              <button type="submit" disabled={saving || !!tableMissing} className="btn-primary">
                {saving ? "저장 중…" : "시험 결과 저장"}
              </button>
            </form>

            {summary.rows.length > 0 && (
              <ul className="border-t border-rule">
                {summary.rows.map((row) => (
                  <li
                    key={row.result.id}
                    className="flex items-center justify-between gap-3 border-b border-rule px-5 py-2.5 last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-[14px]">
                      <SubjectChip color={colorOf(colors, row.result.subject_id)} />
                      <strong className="truncate">{row.subjectName}</strong>
                      <span className="text-ink-muted">{shortDate(row.result.exam_date)}</span>
                    </span>
                    <span className="flex items-center gap-3 text-[13px]">
                      <span>
                        {row.result.score}/{row.result.max_score}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.result.id)}
                        className="font-semibold text-danger hover:underline"
                      >
                        삭제
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 비교 */}
          <section className="sheet" aria-labelledby="compare-title">
            <div className="sheet-head">
              <h2 id="compare-title" className="sheet-title">
                학습 점수 vs 실제 성적
              </h2>
              <span className="text-xs text-ink-muted">학습 점수 = 시험 전날, 시험 임박 감점 제외</span>
            </div>

            {summary.rows.length === 0 ? (
              <p className="px-5 py-5 text-[14px] leading-relaxed text-ink-soft">
                아직 입력한 시험 결과가 없어요. 시험이 끝난 과목의 점수를 입력하면, 그 과목의 시험 전날 학습
                점수와 비교해 보여드려요. 과목이 3개 이상 쌓이면 상관계수도 계산해요.
              </p>
            ) : (
              <>
                <div className="grid gap-px border-b border-rule bg-rule sm:grid-cols-3">
                  <Stat
                    label="평균 차이"
                    value={summary.meanAbsDiff === null ? "—" : `${summary.meanAbsDiff}점`}
                    note="|실제 − 학습 점수|"
                  />
                  <Stat
                    label="실제가 더 높게"
                    value={
                      summary.meanDiff === null
                        ? "—"
                        : `${summary.meanDiff > 0 ? "+" : summary.meanDiff < 0 ? "−" : ""}${Math.abs(summary.meanDiff)}점`
                    }
                    note="평균 (실제 − 학습 점수)"
                  />
                  <Stat
                    label="상관계수 r"
                    value={summary.r === null ? "—" : String(summary.r)}
                    note={summary.r === null ? `결과 3개 이상부터 (지금 ${summary.paired}개)` : "−1 ~ 1"}
                  />
                </div>
                <p className="border-b border-rule px-5 py-3 text-[14px] leading-relaxed">
                  {summary.r !== null
                    ? describeCorrelation(summary.r)
                    : summary.paired > 0
                      ? `지금은 결과가 ${summary.paired}개라 관계를 판단하기 일러요. 과목별 차이를 먼저 확인해 보세요.`
                      : "비교할 학습 기록이 시험 날짜 전에 없어요."}
                </p>
                <div className="p-5">
                  <Scatter rows={summary.rows} colors={colors} />
                </div>
                <table className="w-full border-collapse text-[14px]">
                  <thead>
                    <tr className="border-t border-rule text-xs text-ink-muted">
                      <th scope="col" className="px-5 py-2 text-left font-semibold">과목</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">학습 점수</th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">실제</th>
                      <th scope="col" className="px-5 py-2 text-right font-semibold">차이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row) => (
                      <tr key={row.result.id} className="border-t border-rule">
                        <th scope="row" className="px-5 py-2.5 text-left font-semibold">
                          {row.subjectName}{" "}
                          <span className="font-normal text-ink-muted">{shortDate(row.result.exam_date)}</span>
                        </th>
                        <td className="px-2 py-2.5 text-right">
                          {row.predicted ?? <span className="text-ink-muted">기록 없음</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right font-bold">{row.actual}</td>
                        <td
                          className={`px-5 py-2.5 text-right font-bold ${
                            row.diff === null ? "text-ink-muted" : Math.abs(row.diff) <= 10 ? "text-ok" : "text-warn"
                          }`}
                        >
                          {row.diff === null ? "—" : `${row.diff > 0 ? "+" : row.diff < 0 ? "−" : ""}${Math.abs(row.diff)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className="border-t border-rule px-5 py-3 text-xs leading-relaxed text-ink-muted">
              차이가 10점 이내면 초록색이에요. 차이가 큰 과목은 기록한 단원이 적거나, 시험 범위와 기록한 단원이
              달랐을 수 있어요. <Link href="/scores" className="font-semibold text-accent hover:underline">학습 점수 보기</Link>
            </p>
          </section>
        </div>
      )}
    </PageFrame>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 bg-sheet px-5 py-4">
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <span className="text-[26px] font-extrabold leading-none tracking-tight">{value}</span>
      <span className="text-xs text-ink-muted">{note}</span>
    </div>
  );
}

/** 산점도: 가로 = 시험 전날 학습 점수, 세로 = 실제 성적. 점선 대각선에 가까울수록 예측이 정확 */
function Scatter({ rows, colors }: { rows: ComparisonRow[]; colors: Map<string, string> }) {
  const pts = rows.filter((r) => r.predicted !== null);
  const W = 420;
  const H = 300;
  const pad = { l: 40, r: 16, t: 12, b: 34 };
  const x = (v: number) => pad.l + (v / 100) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / 100) * (H - pad.t - pad.b);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto w-full max-w-[520px]"
      role="img"
      aria-label={`학습 점수와 실제 성적 산점도: ${pts.map((p) => `${p.subjectName} ${p.predicted}→${p.actual}`).join(", ")}`}
    >
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={x(0)} x2={x(100)} y1={y(g)} y2={y(g)} style={{ stroke: "rgb(var(--c-rule))" }} />
          <line x1={x(g)} x2={x(g)} y1={y(0)} y2={y(100)} style={{ stroke: "rgb(var(--c-rule))" }} />
          <text x={pad.l - 6} y={y(g) + 4} fontSize={11} textAnchor="end" style={{ fill: "rgb(var(--c-ink-muted))" }}>
            {g}
          </text>
          <text x={x(g)} y={H - pad.b + 16} fontSize={11} textAnchor="middle" style={{ fill: "rgb(var(--c-ink-muted))" }}>
            {g}
          </text>
        </g>
      ))}
      {/* 예측 = 실제 인 대각선 */}
      <line
        x1={x(0)}
        y1={y(0)}
        x2={x(100)}
        y2={y(100)}
        strokeDasharray="5 5"
        style={{ stroke: "rgb(var(--c-ink-muted))" }}
      />
      <text x={W / 2} y={H - 2} fontSize={11} textAnchor="middle" style={{ fill: "rgb(var(--c-ink-soft))" }}>
        학습 점수 (시험 전날)
      </text>
      <text
        x={12}
        y={H / 2}
        fontSize={11}
        textAnchor="middle"
        transform={`rotate(-90 12 ${H / 2})`}
        style={{ fill: "rgb(var(--c-ink-soft))" }}
      >
        실제 성적
      </text>
      {pts.map((p, i) => {
        const c = colorOf(colors, p.result.subject_id);
        return (
          <g key={p.result.id} className="cell-pop" style={{ animationDelay: `${300 + i * 80}ms` }}>
            <rect x={x(p.predicted!) - 6} y={y(p.actual) - 6} width={12} height={12} fill={c} />
            <text
              x={x(p.predicted!) + 10}
              y={y(p.actual) + 4}
              fontSize={12}
              fontWeight={700}
              style={{ fill: subjectInk(c) }}
            >
              {p.subjectName}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
