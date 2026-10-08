"use client";

import Link from "next/link";
import { colorOf, subjectInk } from "@/lib/palette";
import { formatMinutes } from "@/lib/allocation";
import { buildDaySchedule, formatClock } from "@/lib/schedule";
import type { PlanDay } from "@/lib/scoring";
import type { PlanData } from "@/lib/usePlanData";

// 하루 시간표: 공부 시간대 안에서 공부 블록과 쉬는 시간을 시각과 함께 보여준다.
// 칸(1·2교시)은 저장된 칸이 있으면 저장된 칸, 없으면 추천 칸 — 시간표와 같은 규칙.

export default function DayTimeline({ data, day, compact = false }: { data: PlanData; day: PlanDay; compact?: boolean }) {
  const { savedAt, minutesFor, colors, subjectNameById, isRestDay } = data;

  if (isRestDay(day)) {
    return <p className="text-[14px] text-ink-muted">쉬는 날이에요{day.special?.note ? ` (${day.special.note})` : ""}.</p>;
  }

  const cells = [0, 1].map((slot) => {
    const saved = savedAt(day.date, slot);
    const rec = day.items[slot];
    const subjectId = saved?.subject_id ?? rec?.subjectId;
    const unit = saved?.unit ?? rec?.unit;
    return subjectId && unit
      ? { subjectId, unit, name: subjectNameById.get(subjectId) ?? rec?.subjectName ?? "?", completed: Boolean(saved?.completed) }
      : null;
  });
  const minutes = minutesFor(day);

  if (!day.window) {
    return (
      <p className="text-[14px] leading-relaxed text-ink-muted">
        공부 시간대를 정하면 시작·끝 시각과 쉬는 시간까지 나눠 드려요.{" "}
        <Link href="/availability" className="font-semibold text-accent hover:underline">
          시간대 정하기
        </Link>
      </p>
    );
  }

  const plan = buildDaySchedule(day.window, minutes);

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-soft">
        <strong className="text-ink">
          {day.window.start}–{day.window.end}
        </strong>
        <span>공부 {formatMinutes(plan.studyMinutes)}</span>
        {plan.breakMinutes > 0 && <span>쉬는 시간 {formatMinutes(plan.breakMinutes)}</span>}
        {plan.freeMinutes > 0 && <span>자유 {formatMinutes(plan.freeMinutes)}</span>}
        {day.special && <span className="font-semibold text-warn">특정 날 일정{day.special.note ? ` · ${day.special.note}` : ""}</span>}
      </p>
      {plan.overflow > 0 && (
        <p className="notice-warn">
          공부 시간이 시간대보다 {formatMinutes(plan.overflow)} 길어요. 공부 시간이나 시간대를 고쳐 주세요.
        </p>
      )}
      <ol className="flex flex-col">
        {plan.blocks.map((b) => {
          const time = `${formatClock(b.start)}–${formatClock(b.end)}`;
          const len = b.end - b.start;
          if (b.kind !== "study") {
            return (
              <li
                key={b.start}
                className={`grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 border-l-[3px] border-transparent px-2 ${
                  compact ? "py-1" : "py-1.5"
                } text-[13px] text-ink-muted`}
              >
                <span className="tabular-nums">{time}</span>
                <span>{b.kind === "break" ? "쉬는 시간" : "자유 시간"}</span>
                <span className="tabular-nums">{len}분</span>
              </li>
            );
          }
          const cell = cells[b.slot ?? 0];
          const c = cell ? colorOf(colors, cell.subjectId) : "#5F6B7E";
          return (
            <li
              key={b.start}
              className={`grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 border-l-[3px] px-2 ${
                compact ? "py-1.5" : "py-2"
              } ${cell?.completed ? "opacity-60" : ""}`}
              style={{ borderColor: subjectInk(c), backgroundColor: `color-mix(in srgb, ${c} 9%, transparent)` }}
            >
              <span className="text-[13px] font-semibold tabular-nums">{time}</span>
              <span className="min-w-0 truncate text-[14px]">
                <span className="font-semibold" style={{ color: subjectInk(c) }}>
                  {cell?.name}
                </span>{" "}
                <strong className={cell?.completed ? "line-through" : ""}>{cell?.unit}</strong>
                {(b.parts ?? 1) > 1 && (
                  <span className="ml-1.5 text-[12px] text-ink-muted">
                    {b.part}/{b.parts}
                  </span>
                )}
              </span>
              <span className="text-[13px] font-semibold tabular-nums">{len}분</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
