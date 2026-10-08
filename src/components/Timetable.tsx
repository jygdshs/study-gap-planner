"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import PlanCell from "@/components/PlanCell";
import DayTimeline from "@/components/DayTimeline";
import { CheckIcon } from "@/components/Icons";
import { colorOf, completedFill, subjectInk } from "@/lib/palette";
import { formatClock } from "@/lib/schedule";
import { dayCells, daySchedule } from "@/lib/dayCells";
import type { PlanDay } from "@/lib/scoring";
import type { PlanData } from "@/lib/usePlanData";

// 한 주 시간표. 넓은 화면은 격자, 좁은 화면은 요일별 행.
//  - 공부 시간대가 있으면 세로축이 실제 시각: 공부 블록과 쉬는 시간이 몇 시에 있는지 그대로 보인다
//  - 시간대가 하나도 없으면 요일 × 과목 칸(첫 과목·둘째 과목)으로 보여주고 시간대를 정하라고 안내
//  - 오늘 열은 머리부터 시간 줄까지 하나로 이어진 진남색 틀, 쉬는 날은 빗금
//  - 각 열 바닥: 공부 가능 시간 용량 막대(칸에 배정된 시간 비율대로 과목 색으로 나눠 채움)

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

const LABEL_COL = 52; // px, 시각(또는 과목 칸 이름) 표시 열

/**
 * days: 이번에 보여줄 날짜들(최대 7일, 한 주). 계획 기간이 길면 plan 화면이 주 단위로 잘라서 넘긴다.
 * 주를 바꾸면 key가 바뀌어 다시 마운트되고, 그 주의 칸이 다시 차례로 채워진다.
 */
export default function Timetable({ data, days }: { data: PlanData; days?: PlanDay[] }) {
  const { today, savedAt, colors, subjectNameById, toggleItem, isRestDay, minutesFor } = data;
  const planDays = days ?? data.planDays.slice(0, 7);
  const maxHours = Math.max(1, ...data.planDays.map((d) => d.availableHours));

  // 처음 그려진 직후 한 프레임 뒤에 true → 그 뒤 새로 생긴 칸은 시간차 없이 채워진다
  const settled = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      settled.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const todayIdx = planDays.findIndex((d) => d.date === today);

  // 처음 들어올 때: 요일(열) 순서대로, 같은 요일 안에서는 교시 순서대로 시간차를 두고 채운다.
  // 그 뒤 갱신으로 바뀐 칸은 시간차 없이 바로 채워진다.
  const delayFor = (dayIdx: number, slot: number) =>
    settled.current ? 0 : 120 + dayIdx * 70 + slot * 110;

  const renderCell = (day: PlanDay, slot: number, compact = false) => {
    const animate = true;
    const delay = delayFor(planDays.indexOf(day), slot);
    const minutes = minutesFor(day)[slot];
    const saved = savedAt(day.date, slot);
    const rec = day.items[slot];
    // 이월 표시: 추천 칸이 이월이고, 저장된 칸이 있으면 같은 단원일 때만
    const carriedFrom =
      rec?.carriedFrom && (!saved || (saved.subject_id === rec.subjectId && saved.unit === rec.unit))
        ? rec.carriedFrom
        : undefined;
    if (saved) {
      return (
        <PlanCell
          key={`${slot}-${saved.id}-${saved.subject_id}-${saved.unit}`}
          kind="saved"
          compact={compact}
          animate={animate}
          delay={delay}
          minutes={minutes}
          carriedFrom={saved.completed ? undefined : carriedFrom}
          color={colorOf(colors, saved.subject_id)}
          subjectName={subjectNameById.get(saved.subject_id) ?? "?"}
          unit={saved.unit}
          completed={saved.completed}
          checkable={saved.plan_date <= today}
          onToggle={() => toggleItem(saved)}
        />
      );
    }
    if (rec) {
      return (
        <PlanCell
          key={`${slot}-rec-${rec.subjectId}-${rec.unit}`}
          kind="suggested"
          compact={compact}
          animate={animate}
          delay={delay}
          minutes={minutes}
          carriedFrom={carriedFrom}
          color={colorOf(colors, rec.subjectId)}
          subjectName={rec.subjectName}
          unit={rec.unit}
        />
      );
    }
    return <PlanCell key={`${slot}-empty`} kind="empty" compact={compact} />;
  };

  /** 그날 칸에 배정된 과목 색과 시간(분) — 용량 막대를 배정 시간 비율대로 나눠 채운다 */
  const dayFills = (day: PlanDay): { color: string; minutes: number }[] => {
    const minutes = minutesFor(day);
    return [0, 1]
      .map((slot) => {
        const saved = savedAt(day.date, slot);
        const subjectId = saved?.subject_id ?? day.items[slot]?.subjectId;
        return subjectId ? { color: colorOf(colors, subjectId), minutes: minutes[slot] ?? 0 } : null;
      })
      .filter((f): f is { color: string; minutes: number } => f !== null);
  };

  const renderCapacity = (day: PlanDay) => {
    const fills = dayFills(day);
    const barDelay = settled.current ? 0 : 420 + planDays.indexOf(day) * 70;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex h-2 bg-ground" role="img" aria-label={`공부 가능 ${day.availableHours}시간`}>
          <div
            className="bar-grow flex h-full"
            style={{ width: `${(day.availableHours / maxHours) * 100}%`, animationDelay: `${barDelay}ms` }}
          >
            {fills.map((f, i) => (
              <span key={i} className="h-full" style={{ backgroundColor: f.color, flexGrow: Math.max(1, f.minutes) }} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px] leading-tight text-ink-muted lg:text-[13px]">
          <span className="whitespace-nowrap font-bold text-ink-soft">{day.availableHours}시간</span>
          {day.window && (
            <span className="whitespace-nowrap tabular-nums">
              {day.window.start}–{day.window.end}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // 시간 축: 그 주에 시간대가 있는 날이 하나라도 있으면, 칸을 실제 시각 위치에 놓는다.
  // 축은 그 주의 가장 이른 시작 ~ 가장 늦은 끝(정시로 맞춤). 높이는 대략 600px이 되도록 분당 px를 정한다.
  // ---------------------------------------------------------------------------
  const schedules = new Map(planDays.map((d) => [d.date, daySchedule(data, d)]));
  const timed = [...schedules.values()].filter((s) => s !== null);
  const axis = (() => {
    if (timed.length === 0) return null;
    const first = Math.min(...timed.map((s) => s!.blocks[0]?.start ?? Infinity));
    const last = Math.max(...timed.map((s) => s!.blocks[s!.blocks.length - 1]?.end ?? -Infinity));
    if (!isFinite(first) || !isFinite(last)) return null;
    const start = Math.floor(first / 60) * 60;
    const end = Math.max(start + 60, Math.ceil(last / 60) * 60);
    const ppm = Math.min(2, Math.max(1, 600 / (end - start)));
    const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start / 60 + i);
    return { start, end, ppm, height: (end - start) * ppm, hours };
  })();
  // 정시마다 옅은 가로줄 (축 시작이 정시라 0px부터 60분 간격)
  const hourLines = axis
    ? {
        backgroundImage: `repeating-linear-gradient(to bottom, rgb(var(--c-rule) / 0.7) 0 1px, transparent 1px ${60 * axis.ppm}px)`,
      }
    : undefined;

  const renderTimeColumn = (day: PlanDay, di: number) => {
    if (!axis) return null;
    if (isRestDay(day)) {
      return (
        <div className="absolute inset-1">
          <PlanCell kind="rest" animate delay={delayFor(di, 0)} />
        </div>
      );
    }
    const plan = schedules.get(day.date);
    const cells = dayCells(data, day);
    // 시간대를 안 정한 날: 위쪽에 과목 칸만 쌓고 '시간대 미정'
    if (!plan) {
      return (
        <div className="absolute inset-x-1 top-1 flex flex-col gap-1">
          <span className="text-center text-[11px] font-semibold text-ink-muted">시간대 미정</span>
          {renderCell(day, 0, true)}
          {renderCell(day, 1, true)}
        </div>
      );
    }
    return plan.blocks.map((b, bi) => {
      const top = (b.start - axis.start) * axis.ppm;
      const height = Math.max(14, (b.end - b.start) * axis.ppm - 2);
      const time = `${formatClock(b.start)}–${formatClock(b.end)}`;
      const motion = settled.current ? undefined : { animationDelay: `${120 + di * 70 + bi * 40}ms` };
      if (b.kind !== "study") {
        if (b.kind === "free") return null;
        return (
          <div
            key={b.start}
            title={`${time} 쉬는 시간`}
            className="cell-fill absolute inset-x-1 flex items-center justify-center overflow-hidden text-[11px] text-ink-muted"
            style={{
              ...motion,
              top,
              height,
              backgroundImage:
                "repeating-linear-gradient(135deg, rgb(var(--c-ground)) 0 4px, transparent 4px 8px)",
            }}
          >
            {height >= 16 && `쉬기 ${b.end - b.start}분`}
          </div>
        );
      }
      const cell = cells[b.slot ?? 0];
      if (!cell) return null;
      const ink = subjectInk(cell.color);
      const checkable = Boolean(cell.saved) && day.date <= today;
      const style = cell.saved
        ? cell.completed
          ? { backgroundColor: completedFill(cell.color), color: ink }
          : { backgroundColor: cell.color, color: "#fff" }
        : { backgroundColor: "rgb(var(--c-sheet))", color: ink, borderColor: ink }; // 추천 칸: 점선 테두리
      const weak = data.weakTypeOf(cell.subjectId, cell.unit);
      const label = `${time} ${cell.name} ${cell.unit}${weak ? ` (${weak.type} 위주)` : ""}${cell.saved ? (cell.completed ? " 완료" : "") : " 추천"}`;
      const body = (
        <>
          <span className="block text-[11px] font-semibold leading-tight tabular-nums opacity-90 lg:text-[12px]">
            {height >= 40 ? time : formatClock(b.start)}
          </span>
          <span
            className={`block truncate text-[12px] font-bold leading-tight lg:text-[13px] ${cell.completed ? "line-through" : ""}`}
          >
            {height >= 58 ? cell.name + " " : ""}
            {cell.unit}
            {(b.parts ?? 1) > 1 && (
              <span className="ml-1 text-[10px] font-semibold opacity-80 lg:text-[11px]">
                {b.part}/{b.parts}
              </span>
            )}
          </span>
          {cell.carriedFrom && height >= 58 && <span className="block text-[10px] font-bold">이월</span>}
          {cell.completed && (
            <CheckIcon className="absolute right-1 top-1 h-3.5 w-3.5" aria-hidden />
          )}
        </>
      );
      const base = "cell-fill absolute inset-x-1 overflow-hidden px-1.5 py-1 text-left";
      return checkable ? (
        <button
          key={b.start}
          type="button"
          title={`${label} — 눌러서 ${cell.completed ? "체크 취소" : "완료 체크"}`}
          aria-label={`${label} ${cell.completed ? "완료 취소" : "완료 체크"}`}
          aria-pressed={cell.completed}
          onClick={() => toggleItem(cell.saved!)}
          className={`${base} transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
          style={{ ...style, ...motion, top, height }}
        >
          {body}
        </button>
      ) : (
        <div
          key={b.start}
          title={cell.saved ? `${label} (그날이 되면 체크할 수 있어요)` : `${label} — 저장하면 체크할 수 있어요`}
          className={`${base} ${cell.saved ? "" : "border border-dashed"}`}
          style={{ ...style, ...motion, top, height }}
        >
          {body}
        </div>
      );
    });
  };

  return (
    <>
      {!axis && planDays.some((d) => !isRestDay(d)) && (
        <p className="mx-5 mt-5 text-[13px] text-ink-soft">
          공부 시간대를 정하면 시간표가 몇 시부터 몇 시까지 공부하고 쉬는지로 바뀌어요.{" "}
          <Link href="/availability" className="font-semibold text-accent hover:underline">
            시간대 정하기
          </Link>
        </p>
      )}
      {/* 넓은 화면: 요일 × 시각 격자 (시간대가 없으면 요일 × 과목 칸) */}
      <div className="hidden p-5 md:block">
        <div className="relative">
          <div
            className="grid gap-px border border-rule bg-rule"
            style={{ gridTemplateColumns: `${LABEL_COL}px repeat(${planDays.length}, minmax(0, 1fr))` }}
          >
            <div className="bg-sheet" />
            {planDays.map((day) => {
              const isToday = day.date === today;
              return (
                <div
                  key={day.date}
                  className={`flex flex-col items-center gap-1 py-2.5 ${isToday ? "bg-mark text-on-mark" : "bg-sheet"}`}
                >
                  <span className="text-[19px] font-extrabold leading-none">{day.dayLabel}</span>
                  <span className={`text-[12px] lg:text-[13px] ${isToday ? "font-semibold text-on-mark/75" : "text-ink-muted"}`}>
                    {isToday ? "오늘" : shortDate(day.date)}
                  </span>
                  {day.exams.map((ex) => (
                    <span
                      key={ex.subjectId}
                      className="mt-0.5 max-w-full truncate px-1.5 py-0.5 text-[11px] font-bold text-white lg:text-[12px]"
                      style={{ backgroundColor: colorOf(colors, ex.subjectId) }}
                    >
                      {ex.subjectName} 시험
                    </span>
                  ))}
                  {day.special && (
                    <span
                      title={day.special.note ? `특정 날 일정: ${day.special.note}` : "특정 날 일정"}
                      className={`mt-0.5 max-w-full truncate border px-1.5 py-px text-[11px] font-bold lg:text-[12px] ${
                        isToday ? "border-on-mark/60" : "border-warn text-warn"
                      }`}
                    >
                      {day.special.note || "일정 변경"}
                    </span>
                  )}
                </div>
              );
            })}

            {axis ? (
              <>
                {/* 시각 눈금 열 */}
                <div className="relative bg-sheet" style={{ height: axis.height }}>
                  {axis.hours.map((h) => (
                    <span
                      key={h}
                      className="absolute right-1.5 -translate-y-1/2 text-[11px] tabular-nums text-ink-muted lg:text-[12px]"
                      style={{ top: (h * 60 - axis.start) * axis.ppm }}
                    >
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
                {planDays.map((day, di) => (
                  <div key={day.date} className="relative bg-sheet" style={{ height: axis.height, ...hourLines }}>
                    {renderTimeColumn(day, di)}
                  </div>
                ))}
              </>
            ) : (
              <>
                {/* 시간대가 하나도 없는 주: 과목 칸 두 줄 (쉬는 날은 두 줄을 합친 칸) */}
                <div className="flex items-center justify-center bg-sheet px-1 text-center text-[12px] font-semibold leading-tight text-ink-muted lg:text-[13px]">
                  첫 과목
                </div>
                {planDays.map((day) =>
                  isRestDay(day) ? (
                    <div key={day.date} className="row-span-2 bg-sheet p-1">
                      <PlanCell kind="rest" animate delay={delayFor(planDays.indexOf(day), 0)} />
                    </div>
                  ) : (
                    <div key={day.date} className="bg-sheet p-1">
                      {renderCell(day, 0)}
                    </div>
                  )
                )}
                <div className="flex items-center justify-center bg-sheet px-1 text-center text-[12px] font-semibold leading-tight text-ink-muted lg:text-[13px]">
                  둘째 과목
                </div>
                {planDays
                  .filter((day) => !isRestDay(day))
                  .map((day) => (
                    <div key={day.date} className="bg-sheet p-1">
                      {renderCell(day, 1)}
                    </div>
                  ))}
              </>
            )}

            <div className="flex items-center justify-center bg-sheet text-[12px] font-semibold text-ink-muted lg:text-[13px]">
              시간
            </div>
            {planDays.map((day) => (
              <div key={day.date} className="bg-sheet px-2 py-2.5">
                {renderCapacity(day)}
              </div>
            ))}
          </div>

          {/* 오늘 열: 머리부터 시간 줄까지 하나로 이어진 틀 */}
          {todayIdx >= 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 border-[3px] border-mark"
              style={{
                left: `calc(${LABEL_COL + 1}px + ${todayIdx} * ((100% - ${LABEL_COL + 2}px) / ${planDays.length}))`,
                width: `calc((100% - ${LABEL_COL + 2}px) / ${planDays.length} + 1px)`,
              }}
            />
          )}
        </div>
      </div>

      {/* 좁은 화면: 요일별 행 */}
      <ol className="md:hidden">
        {planDays.map((day) => {
          const isToday = day.date === today;
          return (
            <li
              key={day.date}
              className={`grid grid-cols-[52px_minmax(0,1fr)] gap-3 border-b border-rule px-4 py-3 last:border-b-0 ${
                isToday ? "border-l-0 bg-today outline outline-[3px] -outline-offset-[3px] outline-mark" : ""
              }`}
            >
              <div
                className={`flex flex-col items-center justify-center gap-0.5 self-stretch ${
                  isToday ? "bg-mark text-on-mark" : ""
                }`}
              >
                <span className="text-[18px] font-extrabold leading-none">{day.dayLabel}</span>
                <span className={`text-[12px] ${isToday ? "font-semibold text-on-mark/75" : "text-ink-muted"}`}>
                  {isToday ? "오늘" : shortDate(day.date)}
                </span>
                {day.exams.map((ex) => (
                  <span
                    key={ex.subjectId}
                    className="mt-1 w-full truncate px-0.5 text-center text-[11px] font-bold text-white"
                    style={{ backgroundColor: colorOf(colors, ex.subjectId) }}
                  >
                    {ex.subjectName}
                  </span>
                ))}
                {day.special && (
                  <span
                    title={day.special.note ? `특정 날 일정: ${day.special.note}` : "특정 날 일정"}
                    className={`mt-1 w-full truncate border px-0.5 text-center text-[11px] font-bold ${
                      isToday ? "border-on-mark/60" : "border-warn text-warn"
                    }`}
                  >
                    {day.special.note || "변경"}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {isRestDay(day) ? (
                  <PlanCell kind="rest" compact animate delay={delayFor(planDays.indexOf(day), 0)} />
                ) : day.window ? (
                  <DayTimeline data={data} day={day} compact showSummary={false} />
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {renderCell(day, 0, true)}
                    {renderCell(day, 1, true)}
                  </div>
                )}
                {renderCapacity(day)}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
