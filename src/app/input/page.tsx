"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/scoring";
import WrongReasonsInput from "@/components/WrongReasonsInput";
import SubjectPicker from "@/components/SubjectPicker";
import type { RecordType } from "@/types/study";

// toISOString()은 UTC 기준이라 한국 시간 오전 9시 전에는 '어제' 날짜가 나온다.
// 그래서 로컬 날짜를 쓰는 scoring.ts의 todayISO를 사용한다.

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

  // 7차시: 학습 계획 화면의 "결과 입력 →" 링크로 들어오면 과목·단원을 미리 채워 둔다
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

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
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
          Supabase 연결이 아직 설정되지 않았어요. 프로젝트 루트에 <code>.env.local</code> 을
          만들고 <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          값을 넣은 뒤 다시 실행해 주세요. (README.md 1~2번 참고)
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* 공통 입력: 과목 / 단원 / 유형 */}
        <section className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-brand-navy">과목 입력</label>
            <SubjectPicker subjectId={subjectId} onSubjectChange={setSubjectId} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-brand-navy">단원 입력</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="예: 응용수학 단원 1"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-brand-navy">유형 입력</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => resetTypeFields("problem")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  recordType === "problem"
                    ? "border-brand-navy bg-brand-navy text-white"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                문제 풀이
              </button>
              <button
                type="button"
                onClick={() => resetTypeFields("concept")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  recordType === "concept"
                    ? "border-brand-navy bg-brand-navy text-white"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                개념 의미
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-brand-navy">학습 날짜</label>
            <input
              type="date"
              value={studyDate}
              onChange={(e) => setStudyDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
            />
          </div>
        </section>

        {/* 유형별 입력 */}
        {recordType === "problem" ? (
          <section className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-brand-navy">과목/단원 문제 풀이</h2>

            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                문제 풀이 수
                <input
                  type="number"
                  min={0}
                  value={problemsTotal}
                  onChange={(e) => setProblemsTotal(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                맞은 문제 수
                <input
                  type="number"
                  min={0}
                  value={problemsCorrect}
                  onChange={(e) => setProblemsCorrect(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                틀린 문제 수
                <input
                  type="number"
                  min={0}
                  value={problemsWrong}
                  onChange={(e) => setProblemsWrong(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-brand-navy">
                틀린 이유 (대표적인 이유 3~4개)
              </label>
              <WrongReasonsInput value={wrongReasons} onChange={setWrongReasons} />
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-brand-navy">과목/단원 개념 의미</h2>

            <label className="flex flex-col gap-1 text-xs text-slate-500">
              기준 의미 입력 (없으면 인터넷에 있는 의미를 참고)
              <textarea
                value={conceptReference}
                onChange={(e) => setConceptReference(e.target.value)}
                rows={3}
                placeholder="예: 미분이란 순간 변화율을 구하는 것이다."
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-slate-500">
              채점할 의미 입력 (내가 이해한 대로 직접 작성)
              <textarea
                value={conceptAnswer}
                onChange={(e) => setConceptAnswer(e.target.value)}
                rows={3}
                placeholder="내가 이해한 개념의 의미를 적어 보세요."
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
              />
            </label>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-brand-navy">
                틀린 이유 (대표적인 이유 3~4개)
              </label>
              <WrongReasonsInput value={wrongReasons} onChange={setWrongReasons} />
            </div>
          </section>
        )}

        {message && (
          <p
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === "ok"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-600"
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {submitting ? "저장 중..." : "학습 결과 저장하기"}
        </button>
      </form>
    </main>
  );
}
