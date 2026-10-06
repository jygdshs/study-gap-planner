"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buildSubjectColorMap, colorOf } from "@/lib/palette";
import { PlusIcon } from "@/components/Icons";
import type { Subject } from "@/types/study";

interface Props {
  subjectId: string;
  onSubjectChange: (subjectId: string) => void;
}

/**
 * 스케치의 "과목 입력" 칸.
 * - 기존에 등록한 과목을 과목 색 버튼으로 고르거나
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

  const colors = buildSubjectColorMap(subjects);

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="flex gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-11 w-24 animate-pulse bg-ground" />
          ))}
        </div>
      ) : (
        <div role="radiogroup" aria-label="과목" className="flex flex-wrap gap-2">
          {subjects.map((s) => {
            const color = colorOf(colors, s.id);
            const selected = s.id === subjectId;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSubjectChange(s.id)}
                className="flex min-h-[44px] flex-col items-start justify-center border-2 px-3 py-1.5 text-left transition-colors"
                style={
                  selected
                    ? { backgroundColor: color, borderColor: color, color: "#fff" }
                    : { borderColor: color, color }
                }
              >
                <span className="text-[14px] font-bold leading-tight">{s.name}</span>
                {s.exam_date && (
                  <span
                    className={`text-[11px] leading-tight ${selected ? "text-white/85" : "text-ink-muted"}`}
                  >
                    시험 {s.exam_date.slice(5).replace("-", ".")}
                  </span>
                )}
              </button>
            );
          })}

          {!showNewForm && (
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="flex min-h-[44px] items-center gap-1.5 border-2 border-dashed border-rule-strong px-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              <PlusIcon className="h-3.5 w-3.5" />새 과목
            </button>
          )}
        </div>
      )}

      {showNewForm && (
        <div className="grid gap-3 border border-dashed border-rule-strong bg-[#F7F8F8] p-4 sm:grid-cols-[minmax(0,1fr)_170px]">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">과목명</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 응용수학"
              className="field"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">
              시험 날짜 <span className="font-normal text-ink-muted">(선택)</span>
            </span>
            <input
              type="date"
              value={newExamDate}
              onChange={(e) => setNewExamDate(e.target.value)}
              className="field"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={handleCreateSubject}
              disabled={saving || !newName.trim()}
              className="btn-primary"
            >
              {saving ? "추가 중…" : "과목 추가"}
            </button>
            <button type="button" onClick={() => setShowNewForm(false)} className="btn-quiet">
              취소
            </button>
          </div>
        </div>
      )}

      {!loading && subjects.length === 0 && !showNewForm && (
        <p className="field-hint">아직 과목이 없어요. ‘새 과목’으로 먼저 추가해 주세요.</p>
      )}
      {error && <p className="text-xs font-semibold text-gap-1">{error}</p>}
    </div>
  );
}
