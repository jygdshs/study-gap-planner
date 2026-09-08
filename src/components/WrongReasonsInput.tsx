"use client";

import { useState } from "react";

interface Props {
  value: string[];
  onChange: (reasons: string[]) => void;
  max?: number;
}

/**
 * 스케치의 "틀린 이유 (대표적인 틀린 이유 3~4개 입력)" 칸.
 * 한 번에 하나씩 입력해 태그로 추가하고, 최대 max개까지 담을 수 있다.
 */
export default function WrongReasonsInput({ value, onChange, max = 4 }: Props) {
  const [draft, setDraft] = useState("");

  const addReason = () => {
    const reason = draft.trim();
    if (!reason || value.length >= max) return;
    if (value.includes(reason)) {
      setDraft("");
      return;
    }
    onChange([...value, reason]);
    setDraft("");
  };

  const removeReason = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addReason();
            }
          }}
          placeholder={
            value.length >= max
              ? `최대 ${max}개까지 입력할 수 있어요`
              : "예: 개념을 헷갈림, 계산 실수, 시간 부족"
          }
          disabled={value.length >= max}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy disabled:bg-slate-100"
        />
        <button
          type="button"
          onClick={addReason}
          disabled={value.length >= max || !draft.trim()}
          className="rounded-lg bg-brand-navy px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          추가
        </button>
      </div>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((reason, idx) => (
            <li
              key={`${reason}-${idx}`}
              className="flex items-center gap-1 rounded-full bg-brand-blue px-3 py-1 text-xs text-brand-navy"
            >
              {reason}
              <button
                type="button"
                onClick={() => removeReason(idx)}
                aria-label={`${reason} 삭제`}
                className="ml-1 font-bold text-brand-navy/70 hover:text-brand-navy"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="text-xs text-slate-400">{value.length}/{max}개 입력됨</span>
    </div>
  );
}
