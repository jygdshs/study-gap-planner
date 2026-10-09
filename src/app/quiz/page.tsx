"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import type { StudyRecord, Subject } from "@/types/study";
import { todayISO } from "@/lib/scoring";
import { keywordScore, type KeywordScore } from "@/lib/keywords";
import { buildQuizQueue, type QuizItem } from "@/lib/review";
import { buildSubjectColorMap, colorOf } from "@/lib/palette";
import KeywordMatches from "@/components/KeywordMatches";
import ConceptGradeView from "@/components/ConceptGradeView";
import { gradeConcept, type GradeResult } from "@/lib/conceptAi";
import WrongReasonsInput from "@/components/WrongReasonsInput";
import { ArrowRightIcon, CheckIcon } from "@/components/Icons";
import { ConfigNotice, ErrorNotice, LoadingSplit, PageFrame, PageHeader, ScoreBar, SubjectChip } from "@/components/ui";

// 개념 복습 퀴즈: 전에 입력한 개념 의미의 기준 의미를 가린 채 다시 설명하게 하고,
// AI가 뜻이 맞는지 채점한 뒤 기준 의미를 공개한다 (AI가 안 되면 핵심어로 채점).
// 저장하면 새 학습 기록이 되어 점수·계획에 반영된다.

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

type Done = { key: string; score: number; before: number; saved: boolean };
type QuizResult =
  | { by: "ai"; score: number; grade: GradeResult }
  | { by: "keyword"; score: number; keyword: KeywordScore };

export default function QuizPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<QuizItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<QuizResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<Done[]>([]);

  const today = todayISO();

  useEffect(() => {
    const load = async () => {
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
      const s = (subjectsRes.data as Subject[]) ?? [];
      const r = (recordsRes.data as StudyRecord[]) ?? [];
      setSubjects(s);
      setRecords(r);
      // 문제 순서는 시작할 때 한 번 정한다 (푸는 도중 저장해도 순서가 바뀌지 않게)
      setQueue(buildQuizQueue(s, r, today));
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colors = useMemo(() => buildSubjectColorMap(subjects), [subjects]);
  const current = queue[index];
  const finished = queue.length > 0 && index >= queue.length;
  const keyOf = (q: QuizItem) => `${q.subjectId}::${q.unit}`;

  const subjectNameOf = (id: string) => subjects.find((s) => s.id === id)?.name ?? "";

  const grade = async () => {
    if (!current || !answer.trim()) return;
    setGrading(true);
    setAiError(null);
    setMessage(null);
    try {
      const g = await gradeConcept(subjectNameOf(current.subjectId), current.unit, current.term, current.reference, answer);
      setResult({ by: "ai", score: g.score, grade: g });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI가 채점하지 못했어요.");
    }
    setGrading(false);
  };

  // AI가 안 될 때: 핵심어 일치도로 채점
  const gradeByKeywords = () => {
    if (!current || !answer.trim()) return;
    const k = keywordScore(current.reference, answer);
    setResult({ by: "keyword", score: k.score, keyword: k });
    setAiError(null);
  };

  const next = () => {
    setIndex((i) => i + 1);
    setAnswer("");
    setResult(null);
    setAiError(null);
    setReasons([]);
    setMessage(null);
  };

  const skip = () => {
    if (!current) return;
    next();
  };

  const saveAndNext = async () => {
    if (!current || !result) return;
    if (result.score < 100 && reasons.length === 0) {
      setMessage("빠진 점을 보고 틀린 이유를 1개 이상 적어 주세요.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("study_records").insert({
      subject_id: current.subjectId,
      unit: current.unit,
      record_type: "concept",
      study_date: today,
      concept_reference: current.reference,
      concept_answer: answer.trim(),
      wrong_reasons: reasons,
      // 007: 개념 이름과 AI 채점 결과 (핵심어 채점이면 점수는 비워 둔다)
      concept_name: current.term,
      concept_score: result.by === "ai" ? result.score : null,
      concept_feedback: result.by === "ai" ? result.grade.feedback : null,
    });
    setSaving(false);
    if (error) {
      setMessage(
        /concept_(name|score|feedback)/.test(error.message)
          ? "AI 채점 결과를 저장할 칸이 없어요. Supabase SQL Editor에서 supabase/migrations/007_concept_ai_grading.sql을 실행해 주세요."
          : `저장 실패: ${error.message}`
      );
      return;
    }
    setDone((d) => [...d, { key: keyOf(current), score: result.score, before: current.lastScore, saved: true }]);
    next();
  };

  const nextWithoutSaving = () => {
    if (current && result)
      setDone((d) => [...d, { key: keyOf(current), score: result.score, before: current.lastScore, saved: false }]);
    next();
  };

  const restart = () => {
    setQueue(buildQuizQueue(subjects, records, today));
    setIndex(0);
    setDone([]);
    setAnswer("");
    setResult(null);
    setReasons([]);
  };

  const doneByKey = new Map(done.map((d) => [d.key, d]));

  return (
    <PageFrame>
      <PageHeader
        title="개념 복습 퀴즈"
        description="전에 정리한 개념을 기준 의미를 가린 채 다시 설명해 보세요. 점수가 낮고 오래 안 본 개념부터 나와요."
      />
      <ConfigNotice />
      {error && <ErrorNotice>데이터를 불러오지 못했어요. {error}</ErrorNotice>}

      {loading ? (
        <LoadingSplit label="복습할 개념을 고르는 중…" />
      ) : error ? null : queue.length === 0 ? (
        <div className="sheet flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] text-ink-soft">
            아직 복습할 개념이 없어요. 결과 입력에서 ‘개념 의미’ 유형으로 기준 의미를 한 번 정리하면, 여기서
            다시 꺼내 복습할 수 있어요.
          </p>
          <Link href="/input" className="btn-primary">
            개념 의미 입력하기 <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="rise-stagger grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          {/* 문제 */}
          <section className="sheet" aria-labelledby="quiz-title" aria-live="polite">
            {finished ? (
              <Summary done={done} onRestart={restart} />
            ) : current ? (
              <>
                <div className="sheet-head">
                  <h2 id="quiz-title" className="sheet-title flex items-center gap-2">
                    <SubjectChip color={colorOf(colors, current.subjectId)} className="h-3.5 w-3.5" />
                    {current.subjectName} · {current.unit}
                  </h2>
                  <span className="text-xs text-ink-muted">
                    {index + 1} / {queue.length}
                  </span>
                </div>
                <div className="flex flex-col gap-5 p-5">
                  <p className="text-[13px] text-ink-muted">
                    지난 기록 {shortDate(current.lastDate)} · 지난 점수{" "}
                    <strong className="text-ink">{current.lastScore}</strong> · 지금까지 {current.attempts}번 기록
                  </p>
                  <label className="flex flex-col gap-2">
                    <span className="text-[18px] font-bold leading-snug">
                      ‘{current.term}’의 뜻을 설명해 보세요.
                    </span>
                    <span className="field-hint">
                      {result ? "채점이 끝나 고칠 수 없어요." : "기준 의미는 채점한 뒤에 보여요."}
                    </span>
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      readOnly={!!result || grading}
                      rows={4}
                      autoFocus
                      placeholder="내가 이해한 대로 써 보세요."
                      className={`field resize-y leading-relaxed ${result ? "bg-sheet-alt" : ""}`}
                    />
                  </label>

                  {!result ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={grade} disabled={!answer.trim() || grading} className="btn-primary">
                          {grading ? "AI가 채점하는 중…" : "AI로 채점하기"}
                        </button>
                        <button type="button" onClick={skip} disabled={grading} className="btn-quiet">
                          건너뛰기
                        </button>
                      </div>
                      {aiError && (
                        <div className="notice-error flex flex-col items-start gap-2">
                          <span>{aiError}</span>
                          <button type="button" onClick={gradeByKeywords} className="font-semibold underline">
                            AI 없이 핵심어로 채점하기
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2">
                        <span className="field-label">기준 의미</span>
                        <p className="border border-rule bg-sheet-alt px-3 py-2.5 text-[15px] leading-relaxed">
                          {current.reference}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 border-y border-rule py-5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[13px] font-semibold text-ink-soft">
                            {result.by === "ai" ? "AI 채점" : "핵심어 일치도"}
                          </span>
                          <span className="text-[26px] font-extrabold tracking-tight">
                            {result.score}
                            <Delta now={result.score} before={current.lastScore} />
                          </span>
                        </div>
                        <ScoreBar score={result.score} thick />
                        {result.by === "ai" ? (
                          <div className="pt-2">
                            <ConceptGradeView grade={result.grade} />
                          </div>
                        ) : (
                          <KeywordMatches matches={result.keyword.matches} />
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="field-label">
                          틀린 이유{" "}
                          <span className="font-normal text-ink-muted">
                            {result.score === 100 ? "다 맞췄다면 비워도 돼요" : "빠진 점·잘못 안 점을 왜 놓쳤는지"}
                          </span>
                        </span>
                        <WrongReasonsInput value={reasons} onChange={setReasons} />
                      </div>

                      {message && (
                        <p role="alert" className="notice-error">
                          {message}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={saveAndNext} disabled={saving} className="btn-primary">
                          {saving ? "저장 중…" : "기록 저장하고 다음 문제"}
                          {!saving && <ArrowRightIcon className="h-4 w-4" />}
                        </button>
                        <button type="button" onClick={nextWithoutSaving} disabled={saving} className="btn-quiet">
                          저장하지 않고 다음
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : null}
          </section>

          {/* 복습 순서 */}
          <section className="sheet" aria-labelledby="queue-title">
            <div className="sheet-head">
              <h2 id="queue-title" className="sheet-title">
                복습 순서
              </h2>
              <span className="text-xs text-ink-muted">점수 낮고 오래된 순</span>
            </div>
            <ol>
              {queue.map((q, i) => {
                const d = doneByKey.get(keyOf(q));
                const isCurrent = i === index && !finished;
                return (
                  <li
                    key={keyOf(q)}
                    className={`grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-rule px-5 py-2.5 last:border-b-0 ${
                      isCurrent ? "bg-today outline outline-2 -outline-offset-2 outline-mark" : ""
                    }`}
                  >
                    <span className="text-[13px] font-extrabold text-ink-muted">
                      {d ? <CheckIcon className="h-4 w-4 text-ok" /> : i + 1}
                    </span>
                    <span className="flex min-w-0 items-center gap-2 text-[14px]">
                      <SubjectChip color={colorOf(colors, q.subjectId)} />
                      <span className="truncate">
                        <span className="text-ink-soft">{q.subjectName}</span> <strong>{q.unit}</strong>
                      </span>
                    </span>
                    <span className="text-right text-[13px] font-bold">
                      {d ? (
                        <>
                          {d.score}
                          <Delta now={d.score} before={d.before} />
                        </>
                      ) : (
                        q.lastScore
                      )}
                    </span>
                    <span />
                    <ScoreBar score={d ? d.score : q.lastScore} className="col-span-2 w-full" delay={260 + i * 60} />
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
    </PageFrame>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span className="ml-2 text-[13px] font-semibold text-ink-muted">그대로</span>;
  return (
    <span className={`ml-2 text-[13px] font-semibold ${d > 0 ? "text-ok" : "text-danger"}`}>
      {d > 0 ? "+" : "−"}
      {Math.abs(d)}
    </span>
  );
}

function Summary({ done, onRestart }: { done: Done[]; onRestart: () => void }) {
  const answered = done.length;
  const avg = answered ? Math.round((done.reduce((s, d) => s + d.score, 0) / answered) * 10) / 10 : null;
  const improved = done.filter((d) => d.score > d.before).length;
  const saved = done.filter((d) => d.saved).length;
  return (
    <>
      <div className="sheet-head">
        <h2 id="quiz-title" className="sheet-title">
          복습 끝
        </h2>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <p className="text-[15px] leading-relaxed">
          {answered === 0
            ? "이번에는 푼 문제가 없어요."
            : `${answered}개 개념을 복습했어요. 평균 핵심어 일치도는 ${avg}점이고, ${improved}개가 지난번보다 올랐어요. ${saved}개를 기록으로 저장해 학습 점수와 계획에 반영했어요.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRestart} className="btn-quiet">
            처음부터 다시
          </button>
          <Link href="/plan" className="btn-primary">
            바뀐 계획 보기 <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
