"use client";

import { useMemo, useState } from "react";
import { addDaysISO, dayOfWeekMonFirst, DAY_LABELS_FULL } from "@/lib/scoring";
import { formatMinutes } from "@/lib/allocation";
import type { PlanItem, StudyRecord, Subject } from "@/types/study";

// 공부 달력: 앱으로 공부를 기록한 날을 달력에 채워 보여 준다.
//  - 공부한 날 = 학습 결과를 입력했거나, 계획 칸을 완료했거나, 실제 공부 시간을 적은 날
//  - 진하기: 그날 한 일(기록 + 완료한 칸)이 많을수록 진하다
//  - 연속 공부 일수: 오늘(오늘 아직 안 했으면 어제)부터 거꾸로 이어진 날 수
//  - 지난 달로 넘겨 가며 예전 기록과 계획 이행도 다시 볼 수 있다

interface DayInfo {
  records: StudyRecord[];
  done: PlanItem[]; // 완료한 계획 칸
  planned: number; // 그날 저장된 계획 칸 수
  minutes: number; // 실제 공부 시간(분)
  level: 0 | 1 | 2 | 3;
}

const monthKey = (iso: string) => iso.slice(0, 7);
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
const addMonths = (ym: string, n: number) => {
  const idx = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
};
const daysInMonth = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();

// 진하기 4단계 (공부 안 한 날은 바탕색). 색은 테마 토큰이라 다크 모드에서도 맞는다.
const LEVEL_BG = ["bg-sheet-muted", "bg-ok/25", "bg-ok/55", "bg-ok"];
const LEVEL_TEXT = ["text-ink-muted", "text-ink", "text-ink", "text-white"];

export default function StudyCalendar({
  records,
  planItems,
  subjects,
  today,
}: {
  records: StudyRecord[];
  planItems: PlanItem[];
  subjects: Subject[];
  today: string;
}) {
  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState<string | null>(null);
  const nameById = new Map(subjects.map((s) => [s.id, s.name]));

  const byDate = useMemo(() => {
    const map = new Map<string, DayInfo>();
    const get = (d: string) => {
      let info = map.get(d);
      if (!info) {
        info = { records: [], done: [], planned: 0, minutes: 0, level: 0 };
        map.set(d, info);
      }
      return info;
    };
    for (const r of records) get(r.study_date).records.push(r);
    for (const it of planItems) {
      const info = get(it.plan_date);
      info.planned++;
      if (it.completed) info.done.push(it);
      info.minutes += it.actual_minutes ?? 0;
    }
    for (const info of map.values()) {
      const n = info.records.length + info.done.length;
      info.level = n === 0 && info.minutes === 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : 3;
    }
    return map;
  }, [records, planItems]);

  // 연속 공부 일수 / 최장 기록 / 가장 이른 기록일
  const { streak, best, earliest } = useMemo(() => {
    const isActive = (d: string) => (byDate.get(d)?.level ?? 0) > 0;
    let s = 0;
    let d = isActive(today) ? today : addDaysISO(today, -1);
    while (isActive(d)) {
      s++;
      d = addDaysISO(d, -1);
    }
    const days = [...byDate.keys()].filter(isActive).sort();
    let b = 0;
    let run = 0;
    let prev = "";
    for (const k of days) {
      run = prev && addDaysISO(prev, 1) === k ? run + 1 : 1;
      b = Math.max(b, run);
      prev = k;
    }
    return { streak: s, best: b, earliest: [...byDate.keys()].sort()[0] ?? today };
  }, [byDate, today]);

  const monthActive = [...byDate.entries()].filter(([k, v]) => monthKey(k) === month && v.level > 0).length;
  const monthLen = month === monthKey(today) ? Number(today.slice(8, 10)) : daysInMonth(month);
  const lead = dayOfWeekMonFirst(`${month}-01`);
  const cells = Math.ceil((lead + daysInMonth(month)) / 7) * 7;

  const canPrev = monthKey(earliest) < month;
  const canNext = month < monthKey(today);

  const sel = selected && monthKey(selected) === month ? selected : null;
  const selInfo = sel ? byDate.get(sel) : undefined;

  return (
    <section className="sheet" aria-labelledby="study-cal-title">
      <div className="sheet-head">
        <h2 id="study-cal-title" className="sheet-title">
          공부 달력
        </h2>
        <span className="text-xs text-ink-muted">기록을 입력하거나 계획 칸을 완료한 날이 채워져요</span>
      </div>

      <div className="grid gap-px border-b border-rule bg-rule sm:grid-cols-3">
        <div className="bg-sheet px-5 py-3">
          <span className="block text-[12px] text-ink-muted">연속 공부</span>
          <span className="text-[26px] font-extrabold leading-tight tabular-nums">
            {streak}
            <span className="ml-1 text-[14px] font-bold text-ink-soft">일째</span>
          </span>
        </div>
        <div className="bg-sheet px-5 py-3">
          <span className="block text-[12px] text-ink-muted">최장 연속 기록</span>
          <span className="text-[26px] font-extrabold leading-tight tabular-nums">
            {best}
            <span className="ml-1 text-[14px] font-bold text-ink-soft">일</span>
          </span>
        </div>
        <div className="bg-sheet px-5 py-3">
          <span className="block text-[12px] text-ink-muted">{Number(month.slice(5, 7))}월에 공부한 날</span>
          <span className="text-[26px] font-extrabold leading-tight tabular-nums">
            {monthActive}
            <span className="ml-1 text-[14px] font-bold text-ink-soft">/ {monthLen}일</span>
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, -1))}
            disabled={!canPrev}
            aria-label="이전 달"
            className="btn-quiet px-3 py-1.5 disabled:opacity-40"
          >
            ◀
          </button>
          <span className="text-[16px] font-bold tabular-nums">
            {month.slice(0, 4)}년 {Number(month.slice(5, 7))}월
          </span>
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={!canNext}
            aria-label="다음 달"
            className="btn-quiet px-3 py-1.5 disabled:opacity-40"
          >
            ▶
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS_FULL.map((d) => (
            <span key={d} className="py-1 text-center text-[12px] font-bold text-ink-soft">
              {d}
            </span>
          ))}
          {Array.from({ length: cells }, (_, i) => {
            const dayNo = i - lead + 1;
            if (dayNo < 1 || dayNo > daysInMonth(month)) return <span key={i} aria-hidden />;
            const date = `${month}-${String(dayNo).padStart(2, "0")}`;
            const info = byDate.get(date);
            const level = info?.level ?? 0;
            const future = date > today;
            const isToday = date === today;
            const label = `${shortDate(date)} · ${
              level === 0 ? "공부 기록 없음" : `기록 ${info!.records.length}개 · 완료 ${info!.done.length}칸`
            }`;
            return (
              <button
                key={i}
                type="button"
                disabled={future}
                onClick={() => setSelected(sel === date ? null : date)}
                title={label}
                aria-label={label}
                aria-pressed={sel === date}
                className={`flex h-11 items-center justify-center text-[13px] font-semibold tabular-nums ${
                  future ? "bg-sheet-muted/50 text-rule-strong" : `${LEVEL_BG[level]} ${LEVEL_TEXT[level]}`
                } ${isToday ? "outline outline-2 -outline-offset-2 outline-mark" : ""} ${
                  sel === date ? "ring-2 ring-accent" : ""
                }`}
              >
                {dayNo}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-muted">
          <span>적게</span>
          {LEVEL_BG.map((c, i) => (
            <span key={i} className={`h-3.5 w-3.5 border border-rule ${c}`} aria-hidden />
          ))}
          <span>많이</span>
        </div>

        {sel && (
          <div className="mt-4 border border-rule bg-sheet-alt p-3 text-[14px]">
            <p className="font-bold">
              {shortDate(sel)} ({DAY_LABELS_FULL[dayOfWeekMonFirst(sel)]})
            </p>
            {!selInfo || selInfo.level === 0 ? (
              <p className="mt-1 text-ink-muted">
                {selInfo && selInfo.planned > 0
                  ? `계획 ${selInfo.planned}칸이 있었지만 완료하지 못했어요.`
                  : "이날은 기록이 없어요."}
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5 text-ink-soft">
                {selInfo.records.map((r) => (
                  <li key={r.id}>
                    기록 · {nameById.get(r.subject_id) ?? "?"} {r.unit}
                  </li>
                ))}
                {selInfo.done.map((it) => (
                  <li key={it.id}>
                    계획 완료 · {nameById.get(it.subject_id) ?? "?"} {it.unit}
                    {it.actual_minutes ? ` (${formatMinutes(it.actual_minutes)})` : ""}
                  </li>
                ))}
                {selInfo.planned > selInfo.done.length && (
                  <li className="text-ink-muted">못 한 계획 {selInfo.planned - selInfo.done.length}칸</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
