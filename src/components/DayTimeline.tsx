"use client";

import Link from "next/link";
import { subjectInk } from "@/lib/palette";
import { formatMinutes } from "@/lib/allocation";
import { formatClock } from "@/lib/schedule";
import { dayCells, daySchedule } from "@/lib/dayCells";
import type { PlanDay } from "@/lib/scoring";
import type { PlanData } from "@/lib/usePlanData";
import { CheckIcon } from "@/components/Icons";

// 하루 시간표: 공부 시간대 안에서 공부 블록과 쉬는 시간을 시각과 함께 보여준다.
// 저장된 칸은 오늘까지 눌러서 완료 체크할 수 있다 (같은 과목을 나눈 조각은 한꺼번에 체크).

export default function DayTimeline({
  data,
  day,
  compact = false,
  showSummary = true,
}: {
  data: PlanData;
  day: PlanDay;
  compact?: boolean;
  showSummary?: boolean;
}) {
  const { isRestDay, toggleItem, today, weakTypeOf } = data;

  if (isRestDay(day)) {
    return <p className="text-[14px] text-ink-muted">쉬는 날이에요{day.special?.note ? ` (${day.special.note})` : ""}.</p>;
  }

  const cells = dayCells(data, day);
  const plan = daySchedule(data, day);

  if (!plan || !day.window) {
    return (
      <p className="text-[14px] leading-relaxed text-ink-muted">
        공부 시간대를 정하면 몇 시부터 무엇을 공부하고 언제 쉬는지 나눠 드려요.{" "}
        <Link href="/availability" className="font-semibold text-accent hover:underline">
          시간대 정하기
        </Link>
      </p>
    );
  }

  const row = `grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 border-l-[3px] px-2 ${compact ? "py-1.5" : "py-2"}`;

  return (
    <div className="flex flex-col gap-3">
      {showSummary && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-soft">
          <strong className="text-ink">
            {day.window.start}–{day.window.end}
          </strong>
          <span>공부 {formatMinutes(plan.studyMinutes)}</span>
          {plan.breakMinutes > 0 && <span>쉬는 시간 {formatMinutes(plan.breakMinutes)}</span>}
          {plan.freeMinutes > 0 && <span>자유 {formatMinutes(plan.freeMinutes)}</span>}
          {day.special && (
            <span className="font-semibold text-warn">특정 날 일정{day.special.note ? ` · ${day.special.note}` : ""}</span>
          )}
        </p>
      )}
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
              <li key={b.start} className={`${row} border-transparent text-[13px] text-ink-muted`}>
                <span className="tabular-nums">{time}</span>
                <span>{b.kind === "break" ? "쉬는 시간" : "자유 시간"}</span>
                <span className="tabular-nums">{len}분</span>
              </li>
            );
          }
          const cell = cells[b.slot ?? 0];
          if (!cell) return null;
          const ink = subjectInk(cell.color);
          const checkable = Boolean(cell.saved) && day.date <= today;
          const content = (
            <>
              <span className="text-[13px] font-semibold tabular-nums">{time}</span>
              <span className="min-w-0 truncate text-left text-[14px]">
                <span className="font-semibold" style={{ color: ink }}>
                  {cell.name}
                </span>{" "}
                <strong className={cell.completed ? "line-through" : ""}>{cell.unit}</strong>
                {(b.parts ?? 1) > 1 && (
                  <span className="ml-1.5 text-[12px] text-ink-muted">
                    {b.part}/{b.parts}
                  </span>
                )}
                {cell.carriedFrom && <span className="ml-1.5 text-[11px] font-bold text-warn">이월</span>}
                {(() => {
                  const weak = weakTypeOf(cell.subjectId, cell.unit);
                  return weak ? (
                    <span
                      className="ml-1.5 text-[12px] text-ink-soft"
                      title={`최근 ${weak.type} 문항 ${weak.total}개 중 ${weak.wrong}개 틀림${weak.topCause ? ` (주로 ${weak.topCause})` : ""}`}
                    >
                      · {weak.type} 위주
                    </span>
                  ) : null;
                })()}
                {!cell.saved && <span className="ml-1.5 text-[11px] text-ink-muted">추천</span>}
              </span>
              <span className="flex items-center gap-2 text-[13px] font-semibold tabular-nums">
                {len}분
                {checkable && (
                  <span
                    aria-hidden
                    className="flex h-[18px] w-[18px] items-center justify-center border-2"
                    style={{ borderColor: ink, color: ink }}
                  >
                    {cell.completed && <CheckIcon className="h-3 w-3" />}
                  </span>
                )}
              </span>
            </>
          );
          const style = {
            borderColor: ink,
            backgroundColor: `color-mix(in srgb, ${cell.color} ${cell.completed ? 5 : 10}%, transparent)`,
          };
          return (
            <li key={b.start} className={cell.completed ? "opacity-70" : ""}>
              {checkable ? (
                <button
                  type="button"
                  onClick={() => toggleItem(cell.saved!)}
                  aria-pressed={cell.completed}
                  aria-label={`${time} ${cell.name} ${cell.unit} ${cell.completed ? "완료 취소" : "완료 체크"}`}
                  className={`${row} w-full transition-colors hover:brightness-110`}
                  style={style}
                >
                  {content}
                </button>
              ) : (
                <div className={row} style={style}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
