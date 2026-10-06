"use client";

import { useState } from "react";
import { CloseIcon, PlusIcon } from "@/components/Icons";

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
              : "예: 계산 실수 (Enter로 추가)"
          }
          disabled={value.length >= max}
          aria-label="틀린 이유"
          className="field flex-1"
        />
        <button
          type="button"
          onClick={addReason}
          disabled={value.length >= max || !draft.trim()}
          className="btn-quiet shrink-0 px-3"
        >
          <PlusIcon className="h-4 w-4" />
          추가
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((reason, idx) => (
          <span
            key={`${reason}-${idx}`}
            className="flex items-center gap-1 border border-ink bg-sheet py-1 pl-2.5 pr-1 text-[13px] font-semibold"
          >
            {reason}
            <button
              type="button"
              onClick={() => removeReason(idx)}
              aria-label={`${reason} 삭제`}
              className="flex h-5 w-5 items-center justify-center text-ink-muted hover:bg-ground hover:text-ink"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="text-xs text-ink-muted">
          {value.length}/{max}개
        </span>
      </div>
    </div>
  );
}
