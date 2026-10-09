"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/scoring";
import { CAUSES, type Cause } from "@/lib/problemAnalysis";
import { buildSubjectColorMap, colorOf } from "@/lib/palette";
import { getPdf } from "@/lib/pdfStore";
import { renderPage } from "@/lib/pdfTools";
import { ArrowRightIcon } from "@/components/Icons";
import { ConfigNotice, ErrorNotice, LoadingSplit, PageFrame, PageHeader, SubjectChip } from "@/components/ui";
import type { ProblemResult, StudyRecord, Subject } from "@/types/study";

// 틀린 문제 다시 풀기: PDF로 분석해 저장한 '틀린 문항' 중에서 무작위로 골라 다시 풀어 본다.
//  - 다시 풀어서 맞힌 문항은 다음부터 나오지 않는다 (또 틀리면 계속 나온다)
//  - 결과를 저장하면 단원마다 학습 기록(문제 풀이) 한 건이 생겨 학습 점수·계획에 반영된다
//  - 그 PDF를 이 브라우저가 기억하고 있으면 문항이 있는 쪽을 바로 보여준다

const COUNT_OPTIONS = [3, 5, 10] as const;
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

interface RetryPick {
  original: ProblemResult;
  record: StudyRecord;
  attempts: number; // 지금까지 다시 푼 횟수 (모두 틀림)
  answer: "correct" | "wrong" | null;
  cause: Cause | null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function RetryPage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [results, setResults] = useState<ProblemResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [count, setCount] = useState<(typeof COUNT_OPTIONS)[number]>(5);
  const [picks, setPicks] = useState<RetryPick[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, r, p] = await Promise.all([
      supabase.from("subjects").select("*"),
      supabase.from("study_records").select("*"),
      supabase.from("problem_results").select("*"),
    ]);
    const err = s.error ?? r.error;
    if (err) setError(describeLoadError(err.message));
    setSubjects((s.data as Subject[]) ?? []);
    setRecords((r.data as StudyRecord[]) ?? []);
    setResults(p.error ? [] : ((p.data as ProblemResult[]) ?? []));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const colors = useMemo(() => buildSubjectColorMap(subjects), [subjects]);
  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  // 다시 풀 후보: 처음 틀린 문항(retry_of 없음) 중 아직 다시 풀어 맞히지 못한 것
  const pool = useMemo(() => {
    const retries = results.filter((r) => r.retry_of);
    return results
      .filter((r) => !r.correct && !r.retry_of)
      .filter((r) => !retries.some((x) => x.retry_of === r.id && x.correct))
      .map((r) => ({
        original: r,
        record: recordById.get(r.record_id),
        attempts: retries.filter((x) => x.retry_of === r.id).length,
      }))
      .filter((x): x is { original: ProblemResult; record: StudyRecord; attempts: number } => Boolean(x.record));
  }, [results, recordById]);
  const filtered = subjectFilter === "all" ? pool : pool.filter((x) => x.record.subject_id === subjectFilter);
  const subjectNameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? "?";

  const start = () => {
    setSavedSummary(null);
    setSaveError(null);
    setPicks(shuffle(filtered).slice(0, count).map((x) => ({ ...x, answer: null, cause: null })));
  };

  const update = (i: number, patch: Partial<RetryPick>) =>
    setPicks((prev) => prev?.map((p, k) => (k === i ? { ...p, ...patch } : p)) ?? null);

  const allAnswered = picks?.every((p) => p.answer === "correct" || (p.answer === "wrong" && p.cause)) ?? false;

  const save = async () => {
    if (!picks || !allAnswered) return;
    setSaving(true);
    setSaveError(null);
    const today = todayISO();
    // 단원마다 학습 기록 한 건 (같은 단원 문항을 묶어 정답률로)
    const groups = new Map<string, RetryPick[]>();
    for (const p of picks) {
      const key = `${p.record.subject_id}::${p.record.unit}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    const lines: string[] = [];
    for (const group of groups.values()) {
      const { subject_id, unit } = group[0].record;
      const correct = group.filter((p) => p.answer === "correct").length;
      const reasons = [
        ...new Set(group.filter((p) => p.answer === "wrong").map((p) => `${p.original.problem_type} · ${p.cause}`)),
      ].slice(0, 6);
      const { data: rec, error: recErr } = await supabase
        .from("study_records")
        .insert({
          subject_id,
          unit,
          record_type: "problem",
          study_date: today,
          problems_total: group.length,
          problems_correct: correct,
          problems_wrong: group.length - correct,
          wrong_reasons: reasons,
        })
        .select("id")
        .single();
      if (recErr || !rec) {
        setSaving(false);
        setSaveError(`저장 실패: ${recErr?.message ?? "알 수 없는 오류"}`);
        return;
      }
      const recordId = (rec as { id: string }).id;
      const { error: prErr } = await supabase.from("problem_results").insert(
        group.map((p) => ({
          user_id: user?.id,
          record_id: recordId,
          problem_no: p.original.problem_no,
          correct: p.answer === "correct",
          problem_type: p.original.problem_type,
          cause: p.answer === "wrong" ? p.cause : null,
          summary: p.original.summary ?? null,
          concept: p.original.concept ?? null,
          source_name: p.original.source_name ?? null,
          source_page: p.original.source_page ?? null,
          retry_of: p.original.id,
        }))
      );
      if (prErr) {
        await supabase.from("study_records").delete().eq("id", recordId);
        setSaving(false);
        setSaveError(
          /retry_of|source_(name|page)/.test(prErr.message)
            ? "다시 풀기 결과를 저장할 칸이 없어요. Supabase SQL Editor에서 supabase/migrations/008_retry_keepalive.sql을 실행해 주세요."
            : `저장 실패: ${prErr.message}`
        );
        return;
      }
      lines.push(`${subjectNameOf(subject_id)} ${unit} ${group.length}문항 중 ${correct}문항 맞음`);
    }
    setSaving(false);
    setSavedSummary(lines.join(" · "));
    setPicks(null);
    await load();
  };

  return (
    <PageFrame>
      <PageHeader
        title="틀린 문제 다시 풀기"
        description="PDF로 분석해 둔 틀린 문항을 무작위로 골라 다시 풀어 봐요. 결과를 저장하면 그 단원의 학습 점수와 계획에 반영돼요. 다시 풀어 맞힌 문항은 다음부터 나오지 않아요."
      />
      <ConfigNotice />
      {error && <ErrorNotice>데이터를 불러오지 못했어요. {error}</ErrorNotice>}

      {loading ? (
        <LoadingSplit label="틀린 문항을 모으는 중…" />
      ) : pool.length === 0 && !savedSummary ? (
        <div className="sheet flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] text-ink-soft">
            다시 풀 틀린 문항이 없어요. PDF로 틀린 문제를 분석해 저장하면 여기서 다시 풀 수 있어요.
          </p>
          <Link href="/analyze" className="btn-primary">
            PDF로 틀린 문제 분석 <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="rise-stagger flex flex-col gap-6">
          {savedSummary && (
            <div className="notice-ok flex flex-wrap items-center justify-between gap-3">
              <span>저장했어요. {savedSummary}</span>
              <Link href="/scores" className="flex items-center gap-1 font-semibold underline">
                학습 점수 보기 <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {!picks ? (
            <section className="sheet" aria-labelledby="retry-setup-title">
              <div className="sheet-head">
                <h2 id="retry-setup-title" className="sheet-title">
                  몇 문제 풀까요
                </h2>
                <span className="text-xs text-ink-muted">다시 풀 문항 {pool.length}개</span>
              </div>
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="과목">
                  {[{ id: "all", name: "전체" }, ...subjects.filter((s) => pool.some((x) => x.record.subject_id === s.id))].map((s) => {
                    const n = s.id === "all" ? pool.length : pool.filter((x) => x.record.subject_id === s.id).length;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={subjectFilter === s.id}
                        onClick={() => setSubjectFilter(s.id)}
                        className={`flex items-center gap-1.5 border px-2.5 py-1 text-[13px] font-semibold ${
                          subjectFilter === s.id ? "border-mark bg-mark text-on-mark" : "border-rule-strong text-ink-soft hover:text-ink"
                        }`}
                      >
                        {s.id !== "all" && <SubjectChip color={colorOf(colors, s.id)} className="h-2.5 w-2.5" />}
                        {s.name} <span className="font-normal opacity-75">{n}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex border border-rule-strong" role="radiogroup" aria-label="문항 수">
                    {COUNT_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={count === c}
                        onClick={() => setCount(c)}
                        className={`px-3 py-1.5 text-[13px] font-semibold ${count === c ? "bg-mark text-on-mark" : "text-ink-soft hover:text-ink"}`}
                      >
                        {c}문제
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={start} disabled={filtered.length === 0} className="btn-primary">
                    무작위로 {Math.min(count, filtered.length)}문제 뽑기
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="sheet" aria-labelledby="retry-list-title">
              <div className="sheet-head">
                <h2 id="retry-list-title" className="sheet-title">
                  다시 풀어 보세요
                </h2>
                <button type="button" onClick={start} className="text-[13px] font-semibold text-accent hover:underline">
                  다시 뽑기
                </button>
              </div>
              <ol>
                {picks.map((p, i) => (
                  <RetryCard key={p.original.id} pick={p} index={i} color={colorOf(colors, p.record.subject_id)} subjectName={subjectNameOf(p.record.subject_id)} onChange={(patch) => update(i, patch)} />
                ))}
              </ol>
              <div className="flex flex-col items-end gap-1 p-5">
                <button type="button" onClick={save} disabled={!allAnswered || saving} className="btn-primary">
                  {saving ? "저장 중…" : "결과 저장하고 학습 점수에 반영"}
                </button>
                {!allAnswered && <span className="text-xs text-ink-muted">모든 문항에 맞음/틀림(틀리면 원인까지)을 골라 주세요</span>}
                {saveError && <p className="notice-error mt-2 self-stretch">{saveError}</p>}
              </div>
            </section>
          )}
        </div>
      )}
    </PageFrame>
  );
}

function RetryCard({
  pick,
  index,
  color,
  subjectName,
  onChange,
}: {
  pick: RetryPick;
  index: number;
  color: string;
  subjectName: string;
  onChange: (patch: Partial<RetryPick>) => void;
}) {
  const { original, record } = pick;
  const [showPage, setShowPage] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 문제 보기: 이 브라우저가 기억하는 PDF에서 그 쪽을 그린다
  useEffect(() => {
    if (!showPage || !original.source_name || !original.source_page) return;
    let cancelled = false;
    (async () => {
      const bytes = await getPdf(original.source_name!);
      if (cancelled) return;
      if (!bytes) {
        setPageError("이 브라우저에 그 PDF가 없어요. PDF 분석 화면에서 한 번 올리면 기억해 둬요.");
        return;
      }
      try {
        await renderPage(bytes, original.source_page!, canvasRef.current!, Math.min(760, wrapRef.current?.clientWidth ?? 600));
      } catch {
        if (!cancelled) setPageError("PDF 쪽을 그리지 못했어요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPage, original.source_name, original.source_page]);

  return (
    <li className="flex flex-col gap-3 border-b border-rule px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] font-extrabold text-ink-muted">{index + 1}</span>
        <span className="flex items-center gap-1.5 text-[13px] text-ink-soft">
          <SubjectChip color={color} className="h-2.5 w-2.5" />
          {subjectName} · {record.unit}
        </span>
        <strong className="text-[16px]">{original.problem_no}번</strong>
        <span className="text-[12px] text-ink-muted">
          {original.source_name ? `${original.source_name}${original.source_page ? ` ${original.source_page}쪽` : ""} · ` : ""}
          {shortDate(record.study_date)}에 틀림{pick.attempts > 0 ? ` · 다시 풀어서도 ${pick.attempts}번 틀림` : ""}
        </span>
      </div>
      <p className="text-[14px] leading-relaxed">
        {original.summary || "문제 요약이 없어요. 문제집에서 이 번호를 찾아 풀어 보세요."}
        <span className="ml-2 text-[12px] text-ink-muted">
          {original.problem_type}
          {original.concept ? ` · 개념: ${original.concept}` : ""}
        </span>
      </p>
      {original.source_name && original.source_page && (
        <div ref={wrapRef} className="flex flex-col gap-2">
          <button type="button" onClick={() => setShowPage((v) => !v)} className="self-start text-[13px] font-semibold text-accent hover:underline">
            {showPage ? "문제 쪽 접기" : `${original.source_page}쪽 문제 보기`}
          </button>
          {showPage && (pageError ? <p className="text-[13px] text-warn">{pageError}</p> : <canvas ref={canvasRef} className="max-w-full border border-rule bg-white" />)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-rule-strong" role="radiogroup" aria-label={`${original.problem_no}번 결과`}>
          {(
            [
              { v: "correct", label: "맞혔어요", on: "bg-ok/15 text-ok shadow-[inset_0_0_0_2px_currentColor]" },
              { v: "wrong", label: "또 틀렸어요", on: "bg-danger/15 text-danger shadow-[inset_0_0_0_2px_currentColor]" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={pick.answer === o.v}
              onClick={() => onChange({ answer: o.v, cause: o.v === "correct" ? null : pick.cause })}
              className={`px-3 py-1.5 text-[13px] font-semibold ${pick.answer === o.v ? o.on : "text-ink-soft hover:text-ink"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {pick.answer === "wrong" && (
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="틀린 원인">
            {CAUSES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={pick.cause === c}
                onClick={() => onChange({ cause: c })}
                className={`border px-2 py-0.5 text-[13px] font-semibold ${
                  pick.cause === c ? "border-mark bg-mark text-on-mark" : "border-dashed border-warn text-ink-soft hover:text-ink"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
