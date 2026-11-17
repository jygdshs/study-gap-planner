"use client";

import { useState } from "react";
import { colorOf } from "@/lib/palette";
import { dayOfWeekMonFirst, DAY_LABELS_FULL, addDaysISO } from "@/lib/scoring";
import type { PlanData } from "@/lib/usePlanData";
import type { PlanItem } from "@/types/study";
import { SubjectChip } from "@/components/ui";

// 공부 내용 메모: 저장된 계획 칸마다 풀 문제집, 쪽, 문제 번호 같은 구체적인 내용을 적는다.
// 적은 메모는 시간표 칸에 마우스를 올렸을 때, 하루 시간표, 캘린더(.ics) 내보내기에 함께 나온다.
// 과목·단원이 새 추천으로 바뀌는 칸은 예전 메모가 맞지 않으니 저장할 때 지워진다.

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
const SHOWN_DAYS = 7;

export default function PlanNotesSection({ data }: { data: PlanData }) {
  const { planItems, today, hasNoteColumn, setNote, colors, subjectNameById } = data;
  const [showAll, setShowAll] = useState(false);

  const upcoming = planItems
    .filter((it) => it.plan_date >= today)
    .sort((a, b) => (a.plan_date === b.plan_date ? a.slot - b.slot : a.plan_date < b.plan_date ? -1 : 1));
  const limit = addDaysISO(today, SHOWN_DAYS - 1);
  const rows = showAll ? upcoming : upcoming.filter((it) => it.plan_date <= limit);
  const hidden = upcoming.length - rows.length;

  return (
    <section className="sheet" aria-labelledby="plan-notes-title">
      <div className="sheet-head">
        <h2 id="plan-notes-title" className="sheet-title">
          공부 내용 메모
        </h2>
        <span className="text-xs text-ink-muted">풀 문제집, 쪽, 문제 번호를 적어 두세요</span>
      </div>

      {!hasNoteColumn ? (
        <p className="notice-warn m-5">
          메모를 저장하려면 Supabase SQL Editor에서 <code>supabase/migrations/010_plan_note.sql</code>을 한 번 실행해
          주세요.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-[14px] text-ink-muted">계획을 저장하면 칸마다 공부 내용을 적을 수 있어요.</p>
      ) : (
        <>
          <ol>
            {rows.map((it) => (
              <NoteRow
                key={`${it.id}-${it.subject_id}-${it.unit}-${it.note ?? ""}`}
                item={it}
                color={colorOf(colors, it.subject_id)}
                name={subjectNameById.get(it.subject_id) ?? "?"}
                onSave={(text) => setNote(it, text)}
              />
            ))}
          </ol>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full border-t border-rule px-5 py-2.5 text-[13px] font-semibold text-accent hover:underline"
            >
              이후 계획 {hidden}칸 더 보기
            </button>
          )}
        </>
      )}
    </section>
  );
}

function NoteRow({
  item,
  color,
  name,
  onSave,
}: {
  item: PlanItem;
  color: string;
  name: string;
  onSave: (text: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(item.note ?? "");

  const commit = async () => {
    if (value.trim() === (item.note ?? "")) return;
    await onSave(value);
  };

  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-b border-rule px-5 py-2.5 last:border-b-0 sm:grid-cols-[52px_minmax(0,2fr)_minmax(0,3fr)]">
      <span className="text-[13px] font-bold">
        {shortDate(item.plan_date)}
        <span className="ml-1 font-semibold text-ink-muted">{DAY_LABELS_FULL[dayOfWeekMonFirst(item.plan_date)]}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-[14px]">
        <SubjectChip color={color} />
        <span className="truncate">
          <span className="text-ink-soft">{name}</span> <strong>{item.unit}</strong>
        </span>
      </span>
      <input
        type="text"
        value={value}
        maxLength={200}
        placeholder="예: 쎈 수학 p.45~52, 12~20번"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${name} ${item.unit} 공부 내용 메모`}
        className="field col-span-2 py-1.5 text-[14px] sm:col-span-1"
      />
    </li>
  );
}
