"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { scoreOfRecord } from "@/lib/scoring";
import { gradeConcept } from "@/lib/conceptAi";
import { showToast } from "@/components/ToastHost";
import WrongReasonsInput from "@/components/WrongReasonsInput";
import UnitInput from "@/components/UnitInput";
import type { StudyRecord } from "@/types/study";

// 9차시: 학습 기록 한 줄 — 보기 / 수정 / 삭제.
// 저장·삭제가 끝나면 onChanged()로 화면이 데이터를 다시 불러와 점수와 계획이 다시 계산된다.

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export default function RecordRow({
  record,
  onChanged,
}: {
  record: StudyRecord;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 수정 폼 값
  const [unit, setUnit] = useState(record.unit);
  const [studyDate, setStudyDate] = useState(record.study_date);
  const [total, setTotal] = useState(String(record.problems_total ?? ""));
  const [correct, setCorrect] = useState(String(record.problems_correct ?? ""));
  const [wrong, setWrong] = useState(String(record.problems_wrong ?? ""));
  const [reference, setReference] = useState(record.concept_reference ?? "");
  const [answer, setAnswer] = useState(record.concept_answer ?? "");
  const [reasons, setReasons] = useState<string[]>(record.wrong_reasons ?? []);

  const isProblem = record.record_type === "problem";
  const { metricLabel, metricValue } = scoreOfRecord(record);

  const startEdit = () => {
    setUnit(record.unit);
    setStudyDate(record.study_date);
    setTotal(String(record.problems_total ?? ""));
    setCorrect(String(record.problems_correct ?? ""));
    setWrong(String(record.problems_wrong ?? ""));
    setReference(record.concept_reference ?? "");
    setAnswer(record.concept_answer ?? "");
    setReasons(record.wrong_reasons ?? []);
    setError(null);
    setMode("edit");
  };

  const validate = (): string | null => {
    if (!unit.trim()) return "단원을 입력해 주세요.";
    if (!studyDate) return "학습 날짜를 입력해 주세요.";
    if (isProblem) {
      if (total === "" || correct === "" || wrong === "") return "문제 수를 모두 입력해 주세요.";
      if (Number(correct) + Number(wrong) !== Number(total))
        return "맞은 문제 수 + 틀린 문제 수는 문제 풀이 수와 같아야 해요.";
    } else if (!reference.trim() || !answer.trim()) {
      return "기준 의미와 채점할 의미를 모두 입력해 주세요.";
    }
    if (reasons.length === 0) return "틀린 이유를 최소 1개 입력해 주세요.";
    return null;
  };

  const save = async () => {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    // AI가 채점한 개념 기록의 기준 의미·설명을 고쳤으면 AI로 다시 채점한다.
    // AI가 안 되면 점수를 비워 핵심어 일치도로 채점되게 한다 (고치기 전 점수가 남지 않도록)
    let aiPatch: { concept_score: number | null; concept_feedback: string | null } | Record<string, never> = {};
    const conceptChanged =
      !isProblem &&
      (reference.trim() !== (record.concept_reference ?? "").trim() || answer.trim() !== (record.concept_answer ?? "").trim());
    if (conceptChanged && record.concept_score != null) {
      try {
        const g = await gradeConcept("", unit.trim(), record.concept_name ?? "", reference.trim(), answer.trim());
        aiPatch = { concept_score: g.score, concept_feedback: g.feedback };
      } catch {
        aiPatch = { concept_score: null, concept_feedback: null };
      }
    }
    const { error } = await supabase
      .from("study_records")
      .update({
        unit: unit.trim(),
        study_date: studyDate,
        wrong_reasons: reasons,
        ...(isProblem
          ? { problems_total: Number(total), problems_correct: Number(correct), problems_wrong: Number(wrong) }
          : { concept_reference: reference.trim(), concept_answer: answer.trim(), ...aiPatch }),
      })
      .eq("id", record.id);
    setBusy(false);
    if (error) {
      setError(`저장 실패: ${error.message}`);
      return;
    }
    setMode("view");
    await onChanged();
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    // 삭제 되돌리기: 지우기 전에 기록과 거기 달린 문항 결과(PDF 분석)를 복사해 둔다
    const problems = await supabase.from("problem_results").select("*").eq("record_id", record.id);
    const savedProblems = problems.error ? [] : ((problems.data as Record<string, unknown>[]) ?? []);
    const { error } = await supabase.from("study_records").delete().eq("id", record.id);
    setBusy(false);
    if (error) {
      setError(`삭제 실패: ${error.message}`);
      return;
    }
    await onChanged();
    showToast({
      text: `${shortDate(record.study_date)} ${record.unit} 기록을 지웠어요.`,
      actionLabel: "되돌리기",
      duration: 10000,
      onAction: async () => {
        // 같은 id로 다시 넣어 점수·계획이 지우기 전과 똑같아지게 한다
        const restored = await supabase.from("study_records").insert(record);
        if (restored.error) {
          showToast({ text: `되돌리지 못했어요: ${restored.error.message}` });
          return;
        }
        if (savedProblems.length > 0) await supabase.from("problem_results").insert(savedProblems);
        await onChanged();
        showToast({ text: "기록을 되돌렸어요." });
      },
    });
  };

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 border-t border-rule bg-sheet-alt px-4 py-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="field-label">단원</span>
            <UnitInput
              subjectId={record.subject_id}
              value={unit}
              onChange={setUnit}
              className="field py-2 text-[14px]"
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="field-label">학습 날짜</span>
            <input
              type="date"
              value={studyDate}
              onChange={(e) => setStudyDate(e.target.value)}
              className="field py-2 text-[14px]"
            />
          </label>
        </div>

        {isProblem ? (
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["푼 문제", total, setTotal],
                ["맞은 문제", correct, setCorrect],
                ["틀린 문제", wrong, setWrong],
              ] as const
            ).map(([label, value, set]) => (
              <label key={label} className="flex flex-col gap-1">
                <span className="field-label">{label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="field py-2 text-[15px] font-bold"
                />
              </label>
            ))}
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="field-label">기준 의미</span>
              <textarea
                rows={2}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="field resize-y py-2 text-[14px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="field-label">채점할 의미</span>
              <textarea
                rows={2}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="field resize-y py-2 text-[14px]"
              />
            </label>
          </>
        )}

        <div className="flex flex-col gap-1">
          <span className="field-label">틀린 이유</span>
          <WrongReasonsInput value={reasons} onChange={setReasons} />
        </div>

        {error && (
          <p role="alert" className="notice-error py-2">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={busy} className="btn-primary py-2">
            {busy ? "저장 중…" : "수정 저장"}
          </button>
          <button type="button" onClick={() => setMode("view")} disabled={busy} className="btn-quiet py-2">
            취소
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 border-t border-rule px-4 py-2.5">
      <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3">
        <span className="pt-0.5 text-[13px] font-semibold text-ink-soft">{shortDate(record.study_date)}</span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] text-ink-soft">
            {isProblem
              ? `${record.problems_total}문제 중 ${record.problems_correct}개 맞음`
              : "개념 의미"}{" "}
            · {metricLabel} <strong className="text-ink">{metricValue}</strong>
          </span>
          <span className="flex flex-wrap gap-1">
            {(record.wrong_reasons ?? []).map((r) => (
              <span key={r} className="border border-rule-strong px-1.5 py-px text-[12px]">
                {r}
              </span>
            ))}
          </span>
        </span>
        {mode === "view" && (
          <span className="flex gap-1">
            <button
              type="button"
              onClick={startEdit}
              className="border border-rule-strong px-2 py-1 text-[12px] font-semibold hover:border-ink hover:bg-ground"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => setMode("confirm-delete")}
              className="border border-rule-strong px-2 py-1 text-[12px] font-semibold text-danger hover:border-danger"
            >
              삭제
            </button>
          </span>
        )}
      </div>

      {mode === "confirm-delete" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-danger/40 px-3 py-2 text-[13px]">
          <span>이 기록을 지울까요? 학습 점수와 계획이 다시 계산돼요.</span>
          <span className="flex gap-1">
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="bg-danger px-2.5 py-1 text-[12px] font-bold text-sheet disabled:opacity-60"
            >
              {busy ? "삭제 중…" : "삭제"}
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              disabled={busy}
              className="border border-rule-strong px-2.5 py-1 text-[12px] font-semibold"
            >
              취소
            </button>
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[12px] font-semibold text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
