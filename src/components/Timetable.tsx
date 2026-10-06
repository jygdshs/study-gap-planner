"use client";

import PlanCell from "@/components/PlanCell";
import { colorOf } from "@/lib/palette";
import type { PlanDay } from "@/lib/scoring";
import type { PlanData } from "@/lib/usePlanData";

// 7일 × 2교시 시간표. 넓은 화면은 격자, 좁은 화면은 요일별 행.
//  - 오늘 열은 머리부터 시간 줄까지 하나로 이어진 진남색 틀
//  - 쉬는 날은 두 교시를 합친 빗금 칸
//  - 각 열 바닥: 공부 가능 시간 용량 막대(칸에 배정된 과목 색으로 나눠 채움)

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

/** 하루 공부 가능 시간을 계획 칸 수로 나눈 시간 */
function perItemLabel(hours: number, items: number): string {
  if (items === 0 || hours === 0) return "";
  const minutes = Math.round((hours * 60) / items);
  return minutes % 60 === 0 ? `칸당 ${minutes / 60}시간` : `칸당 ${minutes}분`;
}

const LABEL_COL = 52; // px, 교시 표시 열

export default function Timetable({ data }: { data: PlanData }) {
  const { planDays, today, savedAt, colors, subjectNameById, toggleItem, isRestDay, settled } = data;
  const maxHours = Math.max(1, ...planDays.map((d) => d.availableHours));
  const todayIdx = planDays.findIndex((d) => d.date === today);

  const renderCell = (day: PlanDay, slot: number, compact = false) => {
    const animate = settled.current;
    const saved = savedAt(day.date, slot);
    if (saved) {
      return (
        <PlanCell
          key={`${slot}-${saved.id}-${saved.subject_id}-${saved.unit}`}
          kind="saved"
          compact={compact}
          animate={animate}
          color={colorOf(colors, saved.subject_id)}
          subjectName={subjectNameById.get(saved.subject_id) ?? "?"}
          unit={saved.unit}
          completed={saved.completed}
          checkable={saved.plan_date <= today}
          onToggle={() => toggleItem(saved)}
        />
      );
    }
    const rec = day.items[slot];
    if (rec) {
      return (
        <PlanCell
          key={`${slot}-rec-${rec.subjectId}-${rec.unit}`}
          kind="suggested"
          compact={compact}
          animate={animate}
          color={colorOf(colors, rec.subjectId)}
          subjectName={rec.subjectName}
          unit={rec.unit}
        />
      );
    }
    return <PlanCell key={`${slot}-empty`} kind="empty" compact={compact} />;
  };

  /** 그날 칸에 배정된 과목 색 (용량 막대 채움용) */
  const dayColors = (day: PlanDay): string[] =>
    [0, 1]
      .map((slot) => {
        const saved = savedAt(day.date, slot);
        if (saved) return colorOf(colors, saved.subject_id);
        const rec = day.items[slot];
        return rec ? colorOf(colors, rec.subjectId) : null;
      })
      .filter((c): c is string => c !== null);

  const renderCapacity = (day: PlanDay) => {
    const fills = dayColors(day);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex h-2 bg-ground" role="img" aria-label={`공부 가능 ${day.availableHours}시간`}>
          <div className="flex h-full" style={{ width: `${(day.availableHours / maxHours) * 100}%` }}>
            {fills.map((c, i) => (
              <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px] leading-tight text-ink-muted lg:text-[13px]">
          <span className="whitespace-nowrap font-bold text-ink-soft">{day.availableHours}시간</span>
          <span className="whitespace-nowrap">{perItemLabel(day.availableHours, fills.length)}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 넓은 화면: 요일 × 교시 격자 */}
      <div className="hidden p-5 md:block">
        <div className="relative">
          <div
            className="grid gap-px border border-rule bg-rule"
            style={{ gridTemplateColumns: `${LABEL_COL}px repeat(7, minmax(0, 1fr))` }}
          >
            <div className="bg-sheet" />
            {planDays.map((day) => {
              const isToday = day.date === today;
              return (
                <div
                  key={day.date}
                  className={`flex flex-col items-center gap-1 py-2.5 ${isToday ? "bg-shell text-white" : "bg-sheet"}`}
                >
                  <span className="text-[19px] font-extrabold leading-none">{day.dayLabel}</span>
                  <span className={`text-[12px] lg:text-[13px] ${isToday ? "font-semibold text-shell-text" : "text-ink-muted"}`}>
                    {isToday ? "오늘" : shortDate(day.date)}
                  </span>
                </div>
              );
            })}

            {/* 1교시 줄 (쉬는 날은 두 교시를 합친 칸) */}
            <div className="flex items-center justify-center bg-sheet text-[12px] font-semibold text-ink-muted lg:text-[13px]">
              1교시
            </div>
            {planDays.map((day) =>
              isRestDay(day) ? (
                <div key={day.date} className="row-span-2 bg-sheet p-1">
                  <PlanCell kind="rest" />
                </div>
              ) : (
                <div key={day.date} className="bg-sheet p-1">
                  {renderCell(day, 0)}
                </div>
              )
            )}

            {/* 2교시 줄 */}
            <div className="flex items-center justify-center bg-sheet text-[12px] font-semibold text-ink-muted lg:text-[13px]">
              2교시
            </div>
            {planDays
              .filter((day) => !isRestDay(day))
              .map((day) => (
                <div key={day.date} className="bg-sheet p-1">
                  {renderCell(day, 1)}
                </div>
              ))}

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
              className="pointer-events-none absolute inset-y-0 border-[3px] border-shell"
              style={{
                left: `calc(${LABEL_COL + 1}px + ${todayIdx} * ((100% - ${LABEL_COL + 2}px) / 7))`,
                width: `calc((100% - ${LABEL_COL + 2}px) / 7 + 1px)`,
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
                isToday ? "border-l-0 bg-[#F1F3F7] outline outline-[3px] -outline-offset-[3px] outline-shell" : ""
              }`}
            >
              <div
                className={`flex flex-col items-center justify-center gap-0.5 self-stretch ${
                  isToday ? "bg-shell text-white" : ""
                }`}
              >
                <span className="text-[18px] font-extrabold leading-none">{day.dayLabel}</span>
                <span className={`text-[12px] ${isToday ? "font-semibold text-shell-text" : "text-ink-muted"}`}>
                  {isToday ? "오늘" : shortDate(day.date)}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {isRestDay(day) ? (
                  <PlanCell kind="rest" compact />
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
