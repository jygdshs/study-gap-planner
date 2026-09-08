"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Subject } from "@/types/study";

interface Props {
  subjectId: string;
  onSubjectChange: (subjectId: string) => void;
}

/**
 * 스케치의 "과목 입력" 칸.
 * - 기존에 등록한 과목 중에서 고르거나
 * - 새 과목 이름 + 시험 날짜를 입력해 새로 만들 수 있다.
 */
export default function SubjectPicker({ subjectId, onSubjectChange }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newExamDate, setNewExamDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSubjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setSubjects(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateSubject = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);

    const { data, error } = await supabase
      .from("subjects")
      .insert({ name, exam_date: newExamDate || null })
      .select()
      .single();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSubjects((prev) =>
      [...prev, data as Subject].sort((a, b) => a.name.localeCompare(b.name))
    );
    onSubjectChange((data as Subject).id);
    setNewName("");
    setNewExamDate("");
    setShowNewForm(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {loading ? (
        <p className="text-sm text-slate-400">과목 목록을 불러오는 중...</p>
      ) : (
        <select
          value={subjectId}
          onChange={(e) => onSubjectChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
        >
          <option value="">과목을 선택하세요</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.exam_date ? ` (시험: ${s.exam_date})` : ""}
            </option>
          ))}
        </select>
      )}

      {!showNewForm ? (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="self-start text-xs font-medium text-brand-navy underline underline-offset-2"
        >
          + 새 과목 추가
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand-navy/40 p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="새 과목명 (예: 응용수학)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
          />
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            시험 날짜 (선택)
            <input
              type="date"
              value={newExamDate}
              onChange={(e) => setNewExamDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreateSubject}
              disabled={saving || !newName.trim()}
              className="rounded-lg bg-brand-navy px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {saving ? "저장 중..." : "과목 추가"}
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
