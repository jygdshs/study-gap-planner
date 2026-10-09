"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/scoring";
import { keywordScore } from "@/lib/keywords";
import KeywordMatches from "@/components/KeywordMatches";
import ConceptGradeView from "@/components/ConceptGradeView";
import { fetchDefinition, gradeConcept, suggestConcepts, type GradeResult } from "@/lib/conceptAi";
import WrongReasonsInput from "@/components/WrongReasonsInput";
import SubjectPicker from "@/components/SubjectPicker";
import UnitInput from "@/components/UnitInput";
import { ArrowRightIcon } from "@/components/Icons";
import { ConfigNotice, PageFrame, PageHeader, ScoreBar } from "@/components/ui";
import type { RecordType } from "@/types/study";

// toISOString()은 UTC 기준이라 한국 시간 오전 9시 전에는 '어제' 날짜가 나온다.
// 그래서 로컬 날짜를 쓰는 scoring.ts의 todayISO를 사용한다.

type CountKey = "total" | "correct" | "wrong";

const TYPE_OPTIONS: { value: RecordType; label: string; hint: string }[] = [
  { value: "problem", label: "문제 풀이", hint: "정답률로 채점" },
  { value: "concept", label: "개념 의미", hint: "AI가 뜻이 맞는지 채점" },
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
  // 세 칸 중 두 칸을 적으면 나머지 한 칸은 자동으로 (문제 풀이 수 = 맞은 수 + 틀린 수)
  //  recentCounts: 사용자가 마지막으로 직접 적은 두 칸, autoCount: 자동으로 채운 칸
  const [recentCounts, setRecentCounts] = useState<CountKey[]>([]);
  const [autoCount, setAutoCount] = useState<CountKey | null>(null);

  // 개념 의미 유형
  const [conceptReference, setConceptReference] = useState("");
  const [conceptAnswer, setConceptAnswer] = useState("");
  // 컨닝 방지: ① 기준 의미 쓰기(또는 AI가 가져옴) → (가림) ② 내 설명 쓰기 → ③ 채점 후에야 기준 의미·점수·틀린 이유 공개
  const [conceptStep, setConceptStep] = useState<"reference" | "answer" | "graded">("reference");
  // 기준 의미: 직접 입력 / AI가 개념 이름으로 정의를 가져옴 (AI 정의는 내 설명을 쓰기 전까지 한 번도 보여주지 않는다)
  const [referenceSource, setReferenceSource] = useState<"user" | "ai">("ai");
  const [conceptName, setConceptName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [aiBusy, setAiBusy] = useState<"define" | "grade" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [defineNote, setDefineNote] = useState<string | null>(null);
  // 채점: AI 채점 결과. AI가 안 되면 핵심어 일치도로 채점할 수 있다(gradedBy = "keyword")
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [gradedBy, setGradedBy] = useState<"ai" | "keyword" | null>(null);
  // 개념 이름 고르기: 이 단원에서 전에 공부한 개념 + AI가 추천한 핵심 개념
  const [pastConcepts, setPastConcepts] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

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

  // 이 과목·단원에서 전에 공부한 개념 이름 (많이 본 순) — 다시 공부할 때 고르기만 하면 되게
  useEffect(() => {
    setSuggested(null);
    const u = unit.trim();
    if (!subjectId || !u || recordType !== "concept") return setPastConcepts([]);
    let cancelled = false;
    const t = setTimeout(() => {
      supabase
        .from("study_records")
        .select("concept_name")
        .eq("subject_id", subjectId)
        .eq("unit", u)
        .not("concept_name", "is", null)
        .then(({ data, error }) => {
          if (cancelled || error) return;
          const count = new Map<string, number>();
          for (const r of (data as { concept_name: string }[] | null) ?? []) {
            const name = r.concept_name.trim();
            if (name) count.set(name, (count.get(name) ?? 0) + 1);
          }
          setPastConcepts([...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n));
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [subjectId, unit, recordType]);

  const loadSuggestions = async () => {
    setSuggesting(true);
    setAiError(null);
    try {
      setSuggested(await suggestConcepts(subjectName, unit.trim()));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI가 개념을 추천하지 못했어요.");
    }
    setSuggesting(false);
  };

  // AI에게 과목 이름을 알려 주려고 불러 둔다
  useEffect(() => {
    if (!subjectId) return setSubjectName("");
    supabase
      .from("subjects")
      .select("name")
      .eq("id", subjectId)
      .maybeSingle()
      .then(({ data }) => setSubjectName((data as { name: string } | null)?.name ?? ""));
  }, [subjectId]);

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
      if (conceptStep !== "graded" || !gradedBy) {
        return "내 설명을 쓰고 ‘채점하기’를 먼저 눌러 주세요.";
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
      // 007: AI 채점이면 점수·근거를 저장 (핵심어 채점이면 비워 두고 저장할 때마다 다시 계산)
      ...(recordType === "concept"
        ? {
            concept_name: conceptName.trim() || null,
            reference_source: referenceSource,
            concept_score: gradedBy === "ai" && grade ? grade.score : null,
            concept_feedback: gradedBy === "ai" && grade ? grade.feedback : null,
          }
        : {}),
    };

    const { error } = await supabase.from("study_records").insert(payload);

    setSubmitting(false);

    if (error) {
      const missingColumn = /concept_(name|score|feedback)|reference_source/.test(error.message);
      setMessage({
        type: "error",
        text: missingColumn
          ? "AI 채점 결과를 저장할 칸이 없어요. Supabase SQL Editor에서 supabase/migrations/007_concept_ai_grading.sql을 실행해 주세요."
          : `저장 실패: ${error.message}`,
      });
      return;
    }

    // 저장 후 이어서 입력: 과목·단원·날짜는 그대로 두고 결과 칸만 비운다
    setMessage({ type: "ok", text: `${unit.trim()} 기록을 저장했어요. 같은 단원으로 이어서 입력할 수 있어요.` });
    if (recordType === "concept" && conceptName.trim()) {
      setPastConcepts((p) => (p.includes(conceptName.trim()) ? p : [conceptName.trim(), ...p]));
    }
    setProblemsTotal("");
    setProblemsCorrect("");
    setProblemsWrong("");
    setRecentCounts([]);
    setAutoCount(null);
    setConceptReference("");
    setConceptAnswer("");
    setConceptName("");
    setConceptStep("reference");
    setGrade(null);
    setGradedBy(null);
    setDefineNote(null);
    setAiError(null);
    setWrongReasons([]);
  };

  // 개념 의미 단계 이동
  const clearGrade = () => {
    setGrade(null);
    setGradedBy(null);
    setAiError(null);
  };
  const confirmReference = () => {
    setConceptAnswer("");
    clearGrade();
    setConceptStep("answer");
    setMessage(null);
  };
  // AI가 개념 이름으로 정의를 가져온다. 정의는 화면에 띄우지 않고 바로 '내 설명 쓰기'로 넘어간다
  const fetchReference = async () => {
    if (!conceptName.trim()) return;
    setAiBusy("define");
    setAiError(null);
    setDefineNote(null);
    try {
      const r = await fetchDefinition(subjectName, unit.trim(), conceptName.trim());
      if (!r.found || !r.definition.trim()) {
        setDefineNote(r.note || "이 이름으로는 정의를 찾지 못했어요. 이름을 조금 더 정확하게 적어 보세요.");
      } else {
        setConceptReference(r.definition.trim());
        confirmReference();
        setDefineNote(r.note || null); // 뜻이 여러 개일 때 안내 (정의 내용은 들어 있지 않음)
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI가 정의를 가져오지 못했어요.");
    }
    setAiBusy(null);
  };
  // 기준 의미를 다시 보면 내 설명은 지운다 (보고 쓰지 못하게)
  const editReference = () => {
    setConceptAnswer("");
    clearGrade();
    setConceptStep("reference");
    setMessage(null);
  };
  // AI가 가져온 정의는 보여주지 않은 채로 버리고 개념 이름부터 다시
  const changeConcept = () => {
    setConceptReference("");
    setConceptAnswer("");
    clearGrade();
    setDefineNote(null);
    setConceptStep("reference");
    setMessage(null);
  };
  const gradeAnswer = async () => {
    setAiBusy("grade");
    setAiError(null);
    setMessage(null);
    try {
      const g = await gradeConcept(subjectName, unit.trim(), conceptName.trim(), conceptReference, conceptAnswer);
      setGrade(g);
      setGradedBy("ai");
      setConceptStep("graded");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI가 채점하지 못했어요.");
    }
    setAiBusy(null);
  };
  // AI가 안 될 때: 예전 방식(기준 의미의 핵심어가 내 설명에 얼마나 있는지)으로 채점
  const gradeByKeywords = () => {
    setGrade(null);
    setGradedBy("keyword");
    setAiError(null);
    setConceptStep("graded");
  };
  // 채점 뒤 다시 쓰기: 내 설명을 지우고 기준 의미를 다시 가린다
  const rewriteAnswer = () => {
    setConceptAnswer("");
    clearGrade();
    setConceptStep("answer");
    setMessage(null);
  };

  // 저장 전 미리보기: 이 기록 하나의 기본 점수(감점 전). scoring.ts와 같은 계산.
  const total = Number(problemsTotal);
  const correct = Number(problemsCorrect);
  // 9차시: 개념 의미는 핵심어 일치도로 채점 — 맞춘/빠진 핵심어도 함께 보여준다
  //         단, 채점하기를 누르기 전에는 점수도 계산해서 보여주지 않는다 (힌트가 되지 않게)
  const conceptPreview =
    recordType === "concept" && conceptStep === "graded" && gradedBy === "keyword" && conceptReference.trim() && conceptAnswer.trim()
      ? keywordScore(conceptReference, conceptAnswer)
      : null;
  // 개념 의미는 채점 전까지 점수·틀린 이유 칸을 숨긴다
  const showResult = recordType === "problem" || conceptStep === "graded";
  const preview: { label: string; value: number } | null =
    recordType === "problem"
      ? problemsTotal !== "" && problemsCorrect !== "" && total > 0 && correct <= total
        ? { label: "정답률", value: Math.round((correct / total) * 1000) / 10 }
        : null
      : gradedBy === "ai" && grade
        ? { label: "AI 채점", value: grade.score }
        : conceptPreview
          ? { label: "핵심어 일치도", value: conceptPreview.score }
          : null;

  const scoreBlock = (
    <div
      className={`flex flex-col gap-2 ${
        recordType === "concept" ? "border-y border-rule py-5" : "border-t border-rule pt-5"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink-soft">
          이 기록의 기본 점수 <span className="font-normal text-ink-muted">(감점 전)</span>
        </span>
        <span className="text-[22px] font-extrabold tracking-tight">
          {preview ? (
            <>
              {preview.value}
              <span className="ml-1 text-xs font-semibold text-ink-muted">{preview.label}</span>
            </>
          ) : (
            <span className="text-ink-muted">—</span>
          )}
        </span>
      </div>
      <ScoreBar score={preview?.value ?? 0} />
      {gradedBy === "ai" && grade && (
        <div className="pt-2">
          <ConceptGradeView grade={grade} />
        </div>
      )}
      {conceptPreview && <KeywordMatches matches={conceptPreview.matches} />}
    </div>
  );

  const reasonsBlock = (
    <div className="flex flex-col gap-2">
      <span className="field-label">
        틀린 이유{" "}
        <span className="font-normal text-ink-muted">
          {recordType === "concept" ? "빠진 점·잘못 안 점을 보고 왜 그랬는지 3~4개" : "대표적인 이유 3~4개"}
        </span>
      </span>
      <WrongReasonsInput value={wrongReasons} onChange={setWrongReasons} />
    </div>
  );

  const countValues: Record<CountKey, string> = { total: problemsTotal, correct: problemsCorrect, wrong: problemsWrong };
  const countSetters: Record<CountKey, (v: string) => void> = {
    total: setProblemsTotal,
    correct: setProblemsCorrect,
    wrong: setProblemsWrong,
  };
  const countFields: { key: CountKey; label: string }[] = [
    { key: "total", label: "문제 풀이 수" },
    { key: "correct", label: "맞은 문제 수" },
    { key: "wrong", label: "틀린 문제 수" },
  ];

  /** 한 칸을 고치면, 마지막으로 직접 적은 두 칸으로 나머지 한 칸을 계산해 채운다 */
  const changeCount = (key: CountKey, value: string) => {
    const next = { ...countValues, [key]: value };
    countSetters[key](value);
    setMessage(null);

    // 지운 칸은 '직접 적은 칸'에서 빼고, 그 칸으로 계산했던 자동 칸도 비운다
    if (value === "") {
      setRecentCounts((r) => r.filter((k) => k !== key));
      if (autoCount && autoCount !== key) {
        countSetters[autoCount]("");
        setAutoCount(null);
      }
      if (autoCount === key) setAutoCount(null);
      return;
    }

    const recent = [key, ...recentCounts.filter((k) => k !== key)].slice(0, 2);
    setRecentCounts(recent);
    if (recent.length < 2) {
      if (autoCount === key) setAutoCount(null);
      return;
    }
    // 가장 오래전에 적은(또는 아직 안 적은) 칸을 나머지 두 칸으로 다시 계산한다
    const target = (["total", "correct", "wrong"] as const).find((k) => !recent.includes(k))!;

    const n = (k: CountKey) => Number(next[k]);
    const computed = target === "total" ? n("correct") + n("wrong") : target === "correct" ? n("total") - n("wrong") : n("total") - n("correct");
    if (!Number.isFinite(computed) || computed < 0) {
      // 맞은 수가 풀이 수보다 큰 경우 등: 자동 칸을 비워 두고 저장할 때 안내한다
      countSetters[target]("");
      setAutoCount(target);
      return;
    }
    countSetters[target](String(computed));
    setAutoCount(target);
  };

  return (
    <PageFrame>
      <PageHeader
        title="학습 결과 입력"
        description="공부를 마친 단원의 결과를 남기면 학습 점수와 계획이 다시 계산됩니다."
        action={
          <Link href="/analyze" className="btn-light">
            PDF로 틀린 문제 분석 (AI) <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
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

            <div className="flex flex-col gap-2">
              <span className="field-label">단원</span>
              <UnitInput subjectId={subjectId} value={unit} onChange={setUnit} />
            </div>

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
              <>
              <div className="grid grid-cols-3 gap-3">
                {countFields.map((f) => {
                  const auto = autoCount === f.key && countValues[f.key] !== "";
                  return (
                    <label key={f.key} className="flex flex-col gap-2">
                      <span className="field-label flex items-center gap-1.5">
                        {f.label}
                        {auto && (
                          <span className="border border-accent px-1 text-[10px] font-bold leading-tight text-accent">
                            자동
                          </span>
                        )}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={countValues[f.key]}
                        onChange={(e) => changeCount(f.key, e.target.value)}
                        className={`field text-[20px] font-bold ${auto ? "border-dashed text-ink-soft" : ""}`}
                      />
                    </label>
                  );
                })}
              </div>
              <p className="-mt-3 text-xs text-ink-muted">두 칸을 적으면 나머지 한 칸은 자동으로 채워져요.</p>
              </>
            ) : (
              <>
                {/* ① 기준 의미: 직접 쓰거나 AI가 가져온다. 확정하면 가려지고 채점한 뒤에 다시 보인다 */}
                {conceptStep === "reference" ? (
                  <div className="flex flex-col gap-3">
                    <span className="field-label">① 기준 의미</span>
                    <div role="radiogroup" aria-label="기준 의미 가져오기" className="grid grid-cols-2 border border-rule-strong">
                      {(
                        [
                          { value: "ai", label: "AI가 정의 가져오기", hint: "개념 이름만 적으면 돼요" },
                          { value: "user", label: "직접 입력", hint: "교과서·노트의 정의" },
                        ] as const
                      ).map((opt, i) => {
                        const active = referenceSource === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                              setReferenceSource(opt.value);
                              setAiError(null);
                              setDefineNote(null);
                            }}
                            className={`flex flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                              i === 1 ? "border-l border-rule-strong" : ""
                            } ${active ? "bg-mark text-on-mark" : "bg-sheet text-ink hover:bg-ground"}`}
                          >
                            <span className="text-[13px] font-bold">{opt.label}</span>
                            <span className={`text-[11px] ${active ? "text-on-mark/75" : "text-ink-muted"}`}>{opt.hint}</span>
                          </button>
                        );
                      })}
                    </div>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-semibold">
                        개념 이름{" "}
                        <span className="font-normal text-ink-muted">{referenceSource === "ai" ? "" : "(선택)"}</span>
                      </span>
                      <input
                        value={conceptName}
                        onChange={(e) => setConceptName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && referenceSource === "ai") {
                            e.preventDefault();
                            fetchReference();
                          }
                        }}
                        maxLength={60}
                        placeholder="예: 미분계수, 1계 선형 미분방정식"
                        className="field"
                      />
                    </label>

                    {/* 개념 이름 고르기: 전에 공부한 개념 + AI 추천 핵심 개념 */}
                    {(() => {
                      const chips = [...pastConcepts, ...(suggested ?? []).filter((c) => !pastConcepts.includes(c))];
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {chips.length > 0 && (
                            <span className="text-xs text-ink-muted">{pastConcepts.length > 0 ? "전에 공부한·추천 개념" : "추천 개념"}</span>
                          )}
                          {chips.map((c) => {
                            const past = pastConcepts.includes(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setConceptName(c)}
                                title={past ? "전에 공부한 개념" : "AI가 추천한 핵심 개념"}
                                className={`border px-2 py-0.5 text-[13px] transition-colors hover:border-ink hover:text-ink ${
                                  conceptName.trim() === c
                                    ? "border-mark bg-mark text-on-mark"
                                    : past
                                      ? "border-rule-strong text-ink-soft"
                                      : "border-dashed border-rule-strong text-ink-soft"
                                }`}
                              >
                                {c}
                              </button>
                            );
                          })}
                          {suggested === null && (
                            <button
                              type="button"
                              onClick={loadSuggestions}
                              disabled={!unit.trim() || suggesting}
                              title={unit.trim() ? "" : "단원을 먼저 적어 주세요"}
                              className="text-[13px] font-semibold text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
                            >
                              {suggesting ? "추천받는 중…" : `${unit.trim() || "이 단원"} 핵심 개념 추천받기 (AI)`}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {referenceSource === "ai" ? (
                      <>
                        <span className="field-hint">
                          AI가 가져온 정의는 내 설명을 다 쓰고 채점할 때까지 보여주지 않아요.
                        </span>
                        <button
                          type="button"
                          onClick={fetchReference}
                          disabled={!conceptName.trim() || aiBusy !== null}
                          className="btn-primary self-start"
                        >
                          {aiBusy === "define" ? "정의를 가져오는 중…" : "AI 정의 가져오고 내 설명 쓰기"}
                          {aiBusy !== "define" && <ArrowRightIcon className="h-4 w-4" />}
                        </button>
                        {defineNote && <p className="notice-warn">{defineNote}</p>}
                      </>
                    ) : (
                      <>
                        <label className="flex flex-col gap-2">
                          <span className="field-hint">
                            교과서나 노트에 있는 정확한 의미. 확정하면 가려지고 채점한 뒤에 다시 보여요.
                          </span>
                          <textarea
                            value={conceptReference}
                            onChange={(e) => setConceptReference(e.target.value)}
                            rows={3}
                            placeholder="예: 미분이란 순간 변화율을 구하는 것이다."
                            className="field resize-y leading-relaxed"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={confirmReference}
                          disabled={!conceptReference.trim()}
                          className="btn-primary self-start"
                        >
                          기준 의미 확정하고 내 설명 쓰기 <ArrowRightIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="field-label">
                      ① 기준 의미{" "}
                      <span className="font-normal text-ink-muted">
                        {referenceSource === "ai" ? "AI가 가져온 정의" : "직접 입력"}
                        {conceptName.trim() && ` · ${conceptName.trim()}`}
                      </span>
                    </span>
                    {conceptStep === "graded" ? (
                      <p className="border border-rule bg-sheet-alt px-3 py-2.5 text-[15px] leading-relaxed">
                        {conceptReference}
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 border border-dashed border-rule-strong px-3 py-3 text-[13px] text-ink-muted">
                        <span>가려 두었어요 · 채점하면 보여요 ({conceptReference.trim().length}자)</span>
                        {referenceSource === "ai" ? (
                          <button
                            type="button"
                            onClick={changeConcept}
                            title="가져온 정의는 보여주지 않고 버려요"
                            className="font-semibold text-accent hover:underline"
                          >
                            다른 개념으로 바꾸기
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={editReference}
                            title="기준 의미를 다시 보면 지금 쓴 내 설명은 지워져요"
                            className="font-semibold text-accent hover:underline"
                          >
                            기준 의미 고치기
                          </button>
                        )}
                      </div>
                    )}
                    {defineNote && conceptStep !== "graded" && <p className="text-[12px] text-ink-muted">{defineNote}</p>}
                  </div>
                )}

                {/* ② 채점할 의미: 기준 의미를 보지 않고 쓴다. 채점 뒤에는 고칠 수 없다 */}
                {conceptStep !== "reference" && (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-2">
                      <span className="field-label">② 채점할 의미</span>
                      <span className="field-hint">
                        {conceptStep === "graded"
                          ? "채점이 끝나 고칠 수 없어요. 다시 쓰려면 아래 ‘다시 쓰기’를 누르세요."
                          : "기준 의미를 보지 않고 내가 이해한 대로 직접 써 보세요. AI가 뜻이 맞는지 채점해요."}
                      </span>
                      <textarea
                        value={conceptAnswer}
                        onChange={(e) => setConceptAnswer(e.target.value)}
                        readOnly={conceptStep === "graded" || aiBusy === "grade"}
                        rows={3}
                        placeholder="내가 이해한 개념의 의미를 적어 보세요."
                        autoFocus={conceptStep === "answer"}
                        className={`field resize-y leading-relaxed ${conceptStep === "graded" ? "bg-sheet-alt" : ""}`}
                      />
                    </label>
                    {conceptStep === "answer" ? (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={gradeAnswer}
                          disabled={!conceptAnswer.trim() || aiBusy !== null}
                          className="btn-primary self-start"
                        >
                          {aiBusy === "grade" ? "AI가 채점하는 중…" : "AI로 채점하기"}
                        </button>
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
                      <button type="button" onClick={rewriteAnswer} className="btn-quiet self-start">
                        다시 쓰기 <span className="font-normal text-ink-muted">기준 의미가 다시 가려져요</span>
                      </button>
                    )}
                  </div>
                )}
                {conceptStep === "reference" && aiError && <p className="notice-error">{aiError}</p>}
              </>
            )}

            {!showResult && (
              <p className="border border-dashed border-rule-strong px-3 py-3 text-[13px] leading-relaxed text-ink-muted">
                채점한 뒤에 기준 의미와 점수, 맞은 점·빠진 점이 보이고 틀린 이유를 쓸 수 있어요.
              </p>
            )}

            {/* 개념 의미: 채점 결과(점수·핵심어)를 먼저 보고 틀린 이유를 쓴다 / 문제 풀이: 지금처럼 이유 → 점수 */}
            {showResult && recordType === "concept" && scoreBlock}
            {showResult && reasonsBlock}
            {showResult && recordType === "problem" && scoreBlock}

            {message && (
              <div
                role={message.type === "error" ? "alert" : "status"}
                className={`flex flex-wrap items-center justify-between gap-2 ${
                  message.type === "ok" ? "notice-ok" : "notice-error"
                }`}
              >
                <span>{message.text}</span>
                {message.type === "ok" && (
                  <span className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setUnit("");
                        setMessage(null);
                      }}
                      className="font-semibold underline"
                    >
                      다른 단원 입력
                    </button>
                    <Link href="/plan" className="flex items-center gap-1 font-semibold underline">
                      바뀐 계획 보기 <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </span>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !showResult}
              className="btn-primary py-3.5 text-[15px]"
            >
              {submitting ? "저장 중…" : showResult ? "학습 결과 저장하기" : "채점한 뒤에 저장할 수 있어요"}
            </button>
          </div>
        </section>
      </form>
    </PageFrame>
  );
}
