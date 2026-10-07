"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/scoring";
import { keywordScore } from "@/lib/keywords";
import KeywordMatches from "@/components/KeywordMatches";
import WrongReasonsInput from "@/components/WrongReasonsInput";
import SubjectPicker from "@/components/SubjectPicker";
import { ArrowRightIcon } from "@/components/Icons";
import { ConfigNotice, PageFrame, PageHeader, ScoreBar } from "@/components/ui";
import type { RecordType } from "@/types/study";

// toISOString()은 UTC 기준이라 한국 시간 오전 9시 전에는 '어제' 날짜가 나온다.
// 그래서 로컬 날짜를 쓰는 scoring.ts의 todayISO를 사용한다.

const TYPE_OPTIONS: { value: RecordType; label: string; hint: string }[] = [
  { value: "problem", label: "문제 풀이", hint: "정답률로 채점" },
  { value: "concept", label: "개념 의미", hint: "기준 의미의 핵심어로 채점" },
];

export default function InputPage() {
  const [subjectId, setSubjectId] = useState("");
  const [unit, setUnit] = useState("");
  const [recordType, setRecordType] = useState<RecordType>("problem");
  const [studyDate, setStudyDate] = useState(todayISO());

  // 문제 풀이 유형
  const [problemsTotal, setProblemsTotal] = useState("");
  const [problemsCorrect, setProblemsCorrect] = useState("");
  const [problemsWrong, setProblemsWrong] = useState("");

  // 개념 의미 유형
  const [conceptReference, setConceptReference] = useState("");
  const [conceptAnswer, setConceptAnswer] = useState("");

  const [wrongReasons, setWrongReasons] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // 7차시: 학습 계획 화면의 "결과 입력" 링크로 들어오면 과목·단원을 미리 채워 둔다
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subject = params.get("subject");
    const presetUnit = params.get("unit");
    if (subject) setSubjectId(subject);
    if (presetUnit) setUnit(presetUnit);
  }, []);

  const resetTypeFields = (type: RecordType) => {
    setRecordType(type);
    setMessage(null);
  };

  const validate = (): string | null => {
    if (!subjectId) return "과목을 선택하거나 새로 추가해 주세요.";
    if (!unit.trim()) return "단원을 입력해 주세요.";

    if (recordType === "problem") {
      if (problemsTotal === "" || problemsCorrect === "" || problemsWrong === "") {
        return "문제 풀이 수 / 맞은 문제 수 / 틀린 문제 수를 모두 입력해 주세요.";
      }
      const total = Number(problemsTotal);
      const correct = Number(problemsCorrect);
      const wrong = Number(problemsWrong);
      if (correct + wrong !== total) {
        return "맞은 문제 수 + 틀린 문제 수는 문제 풀이 수와 같아야 해요.";
      }
    } else {
      if (!conceptReference.trim() || !conceptAnswer.trim()) {
        return "기준 의미와 채점할 의미를 모두 입력해 주세요.";
      }
    }

    if (wrongReasons.length === 0) {
      return "대표적인 틀린 이유를 최소 1개 이상 입력해 주세요.";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const payload = {
      subject_id: subjectId,
      unit: unit.trim(),
      record_type: recordType,
      study_date: studyDate,
      wrong_reasons: wrongReasons,
      problems_total: recordType === "problem" ? Number(problemsTotal) : null,
      problems_correct: recordType === "problem" ? Number(problemsCorrect) : null,
      problems_wrong: recordType === "problem" ? Number(problemsWrong) : null,
      concept_reference: recordType === "concept" ? conceptReference.trim() : null,
      concept_answer: recordType === "concept" ? conceptAnswer.trim() : null,
    };

    const { error } = await supabase.from("study_records").insert(payload);

    setSubmitting(false);

    if (error) {
      setMessage({ type: "error", text: `저장 실패: ${error.message}` });
      return;
    }

    setMessage({ type: "ok", text: "학습 기록이 저장되었습니다!" });
    setUnit("");
    setProblemsTotal("");
    setProblemsCorrect("");
    setProblemsWrong("");
    setConceptReference("");
    setConceptAnswer("");
    setWrongReasons([]);
  };

  // 저장 전 미리보기: 이 기록 하나의 기본 점수(감점 전). scoring.ts와 같은 계산.
  const total = Number(problemsTotal);
  const correct = Number(problemsCorrect);
  // 9차시: 개념 의미는 핵심어 일치도로 채점 — 맞춘/빠진 핵심어도 함께 보여준다
  const conceptPreview =
    recordType === "concept" && conceptReference.trim() && conceptAnswer.trim()
      ? keywordScore(conceptReference, conceptAnswer)
      : null;
  const preview: { label: string; value: number } | null =
    recordType === "problem"
      ? problemsTotal !== "" && problemsCorrect !== "" && total > 0 && correct <= total
        ? { label: "정답률", value: Math.round((correct / total) * 1000) / 10 }
        : null
      : conceptPreview
        ? { label: "핵심어 일치도", value: conceptPreview.score }
        : null;

  const countFields = [
    { label: "문제 풀이 수", value: problemsTotal, set: setProblemsTotal },
    { label: "맞은 문제 수", value: problemsCorrect, set: setProblemsCorrect },
    { label: "틀린 문제 수", value: problemsWrong, set: setProblemsWrong },
  ];

  return (
    <PageFrame>
      <PageHeader
        title="학습 결과 입력"
        description="공부를 마친 단원의 결과를 남기면 학습 점수와 계획이 다시 계산됩니다."
      />
      <ConfigNotice />

      <form
        onSubmit={handleSubmit}
        className="rise-stagger grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        noValidate
      >
        {/* 무엇을 공부했나 */}
        <section className="sheet" aria-labelledby="what-title">
          <div className="sheet-head">
            <h2 id="what-title" className="sheet-title">
              무엇을 공부했나요
            </h2>
          </div>
          <div className="flex flex-col gap-6 p-5">
            <div className="flex flex-col gap-2">
              <span className="field-label" id="subject-label">
                과목
              </span>
              <SubjectPicker subjectId={subjectId} onSubjectChange={setSubjectId} />
            </div>

            <label className="flex flex-col gap-2">
              <span className="field-label">단원</span>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="예: 미분"
                className="field"
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="field-label">유형</span>
              <div role="radiogroup" aria-label="유형" className="grid grid-cols-2 border border-rule-strong">
                {TYPE_OPTIONS.map((opt, i) => {
                  const active = recordType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => resetTypeFields(opt.value)}
                      className={`flex flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors ${
                        i === 1 ? "border-l border-rule-strong" : ""
                      } ${active ? "bg-mark text-on-mark" : "bg-sheet text-ink hover:bg-ground"}`}
                    >
                      <span className="text-sm font-bold">{opt.label}</span>
                      <span className={`text-[11px] ${active ? "text-on-mark/75" : "text-ink-muted"}`}>
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="field-label">학습 날짜</span>
              <input
                type="date"
                value={studyDate}
                onChange={(e) => setStudyDate(e.target.value)}
                className="field sm:max-w-[220px]"
              />
            </label>
          </div>
        </section>

        {/* 결과 */}
        <section className="sheet" aria-labelledby="result-title">
          <div className="sheet-head">
            <h2 id="result-title" className="sheet-title">
              {recordType === "problem" ? "문제 풀이 결과" : "개념 의미"}
            </h2>
          </div>
          <div className="flex flex-col gap-6 p-5">
            {recordType === "problem" ? (
              <div className="grid grid-cols-3 gap-3">
                {countFields.map((f) => (
                  <label key={f.label} className="flex flex-col gap-2">
                    <span className="field-label">{f.label}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      className="field text-[20px] font-bold"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <>
                <label className="flex flex-col gap-2">
                  <span className="field-label">기준 의미</span>
                  <span className="field-hint">교과서나 인터넷에 있는 정확한 의미</span>
                  <textarea
                    value={conceptReference}
                    onChange={(e) => setConceptReference(e.target.value)}
                    rows={3}
                    placeholder="예: 미분이란 순간 변화율을 구하는 것이다."
                    className="field resize-y leading-relaxed"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="field-label">채점할 의미</span>
                  <span className="field-hint">보지 않고 내가 이해한 대로 직접 작성</span>
                  <textarea
                    value={conceptAnswer}
                    onChange={(e) => setConceptAnswer(e.target.value)}
                    rows={3}
                    placeholder="내가 이해한 개념의 의미를 적어 보세요."
                    className="field resize-y leading-relaxed"
                  />
                </label>
              </>
            )}

            <div className="flex flex-col gap-2">
              <span className="field-label">
                틀린 이유 <span className="font-normal text-ink-muted">대표적인 이유 3~4개</span>
              </span>
              <WrongReasonsInput value={wrongReasons} onChange={setWrongReasons} />
            </div>

            <div className="flex flex-col gap-2 border-t border-rule pt-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-ink-soft">
                  이 기록의 기본 점수 <span className="font-normal text-ink-muted">(감점 전)</span>
                </span>
                <span className="text-[22px] font-extrabold tracking-tight">
                  {preview ? (
                    <>
                      {preview.value}
                      <span className="ml-1 text-xs font-semibold text-ink-muted">
                        {preview.label}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </span>
              </div>
              <ScoreBar score={preview?.value ?? 0} />
              {conceptPreview && <KeywordMatches matches={conceptPreview.matches} />}
            </div>

            {message && (
              <div
                role={message.type === "error" ? "alert" : "status"}
                className={`flex flex-wrap items-center justify-between gap-2 ${
                  message.type === "ok" ? "notice-ok" : "notice-error"
                }`}
              >
                <span>{message.text}</span>
                {message.type === "ok" && (
                  <Link href="/plan" className="flex items-center gap-1 font-semibold underline">
                    바뀐 계획 보기 <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary py-3.5 text-[15px]">
              {submitting ? "저장 중…" : "학습 결과 저장하기"}
            </button>
          </div>
        </section>
      </form>
    </PageFrame>
  );
}
