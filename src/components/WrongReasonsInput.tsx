"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CloseIcon, PlusIcon } from "@/components/Icons";

interface Props {
  value: string[];
  onChange: (reasons: string[]) => void;
  max?: number;
}

// 처음 쓰는 사람도 바로 고를 수 있게 항상 보여주는 예시
const EXAMPLE_REASONS = ["계산 실수", "개념 이해 부족"];
// 고르기 목록에 한 번에 보여줄 개수
const SUGGESTION_LIMIT = 8;

const normalize = (r: string) => r.trim().replace(/\s+/g, " ");

/**
 * 스케치의 "틀린 이유 (대표적인 틀린 이유 3~4개 입력)" 칸.
 * 한 번에 하나씩 입력해 태그로 추가하고, 최대 max개까지 담을 수 있다.
 * 전에 적었던 틀린 이유(많이 쓴 순)와 예시를 버튼으로 골라 바로 추가할 수 있다.
 *         입력칸에 글자를 치면 그 글자가 들어간 이유만 추려서 보여준다.
 */
export default function WrongReasonsInput({ value, onChange, max = 4 }: Props) {
  const [draft, setDraft] = useState("");
  const [pastReasons, setPastReasons] = useState<string[]>([]);

  // 내 기록에서 틀린 이유를 모아 많이 쓴 순으로 정렬 (RLS로 내 기록만 온다)
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("study_records")
      .select("wrong_reasons")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const count = new Map<string, number>();
        for (const row of data as { wrong_reasons: string[] | null }[]) {
          for (const raw of row.wrong_reasons ?? []) {
            const r = normalize(raw);
            if (r) count.set(r, (count.get(r) ?? 0) + 1);
          }
        }
        setPastReasons([...count.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const full = value.length >= max;

  const add = (raw: string) => {
    const reason = normalize(raw);
    if (!reason || full) return;
    if (!value.includes(reason)) onChange([...value, reason]);
    setDraft("");
  };

  const removeReason = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  // 고르기 목록: 전에 쓴 이유(많이 쓴 순) + 예시, 이미 담은 것은 빼고, 입력 중이면 그 글자로 거른다
  const query = normalize(draft);
  const suggestions = [...pastReasons, ...EXAMPLE_REASONS.filter((e) => !pastReasons.includes(e))]
    .filter((r) => !value.includes(r))
    .filter((r) => !query || r.includes(query))
    .slice(0, SUGGESTION_LIMIT);

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
              add(draft);
            }
          }}
          placeholder={full ? `최대 ${max}개까지 입력할 수 있어요` : "직접 입력하거나 아래에서 고르기"}
          disabled={full}
          aria-label="틀린 이유"
          className="field flex-1"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={full || !draft.trim()}
          className="btn-quiet shrink-0 px-3"
        >
          <PlusIcon className="h-4 w-4" />
          추가
        </button>
      </div>

      {/* 전에 적었던 이유 · 예시에서 고르기 */}
      {!full && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="전에 적었던 틀린 이유에서 고르기">
          <span className="text-xs text-ink-muted">{query ? "비슷한 이유" : "전에 쓴 이유"}</span>
          {suggestions.map((r) => {
            const isExample = !pastReasons.includes(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => add(r)}
                title={isExample ? "예시" : "전에 적었던 이유"}
                className={`flex items-center gap-1 border px-2 py-0.5 text-[13px] text-ink-soft transition-colors hover:border-ink hover:bg-ground hover:text-ink ${
                  isExample ? "border-dashed border-rule-strong" : "border-rule-strong"
                }`}
              >
                <PlusIcon className="h-3 w-3" />
                {r}
              </button>
            );
          })}
        </div>
      )}

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
          {value.length}/{max}개 담음
        </span>
      </div>
    </div>
  );
}
