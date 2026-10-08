// 공부 시간대 → 하루 시간표 (공부 / 쉬는 시간 나누기).
//
//  입력: 그날 공부 시간대(예: 19:00~22:30)와 칸별 공부 시간(점수에 따른 시간 배분 결과, 예: [100분, 50분])
//  처리:
//   1) 한 번에 너무 오래 앉아 있지 않도록 칸마다 최대 50분 단위로 나눈다 (100분 → 50 + 50)
//   2) 시간대 길이 − 공부 시간 = 쉬는 시간. 공부 사이사이에 고르게 나눠 넣는다 (5분 단위, 한 번에 최대 20분)
//   3) 그래도 남는 시간은 마지막에 '자유 시간'으로 둔다
//  출력: 시작·끝 시각이 붙은 블록 목록

export const MAX_SESSION = 50; // 한 번에 공부하는 최대 시간(분)
export const MAX_BREAK = 20; // 한 번에 쉬는 최대 시간(분)
const UNIT = 5;

export interface TimeWindow {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface ScheduleBlock {
  kind: "study" | "break" | "free";
  start: number; // 0시부터 분
  end: number;
  slot?: number; // study: 몇 교시 칸인지 (0, 1)
  part?: number; // study: 그 칸을 나눈 몇 번째 조각 (1부터)
  parts?: number; // study: 그 칸을 몇 조각으로 나눴는지
}

export interface DaySchedulePlan {
  blocks: ScheduleBlock[];
  studyMinutes: number;
  breakMinutes: number; // 공부 사이 쉬는 시간 합
  freeMinutes: number; // 마지막에 남는 자유 시간
  overflow: number; // 공부 시간이 시간대보다 긴 만큼(분). 0이면 딱 맞거나 여유 있음
}

/** "19:30" 또는 "19:30:00" → 1170 */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 1170 → "19:30" (24시 넘으면 다음 날로 넘겨 표시) */
export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** DB에서 온 "19:30:00" → "19:30". 비어 있으면 null */
export function normalizeTime(time: string | null | undefined): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

/** 시간대 길이(분). 끝이 시작보다 빠르면 0 */
export function windowMinutes(w: TimeWindow): number {
  return Math.max(0, toMinutes(w.end) - toMinutes(w.start));
}

/** 공부 시간 m분을 MAX_SESSION 이하 조각으로 나눈다 (5분 단위, 앞 조각이 조금 더 길게) */
export function splitSession(m: number): number[] {
  if (m <= 0) return [];
  const k = Math.ceil(m / MAX_SESSION);
  const units = Math.round(m / UNIT);
  const base = Math.floor(units / k);
  let extra = units - base * k;
  const parts = Array.from({ length: k }, () => {
    const u = base + (extra > 0 ? 1 : 0);
    extra--;
    return u * UNIT;
  });
  // 5분 단위로 반올림하며 생긴 차이는 마지막 조각에서 맞춘다
  parts[k - 1] += m - parts.reduce((a, b) => a + b, 0);
  return parts;
}

export function buildDaySchedule(window: TimeWindow, slotMinutes: (number | null)[]): DaySchedulePlan {
  const start = toMinutes(window.start);
  const total = windowMinutes(window);

  const sessions: { slot: number; minutes: number; part: number; parts: number }[] = [];
  slotMinutes.forEach((m, slot) => {
    const parts = splitSession(m ?? 0);
    parts.forEach((minutes, i) => sessions.push({ slot, minutes, part: i + 1, parts: parts.length }));
  });

  const studyMinutes = sessions.reduce((s, x) => s + x.minutes, 0);
  const spare = Math.max(0, total - studyMinutes);
  const overflow = Math.max(0, studyMinutes - total);

  // 쉬는 시간: 공부 사이 칸(gaps)마다 고르게, 5분 단위, 한 번에 최대 MAX_BREAK분
  const gaps = Math.max(0, sessions.length - 1);
  const breakUnits = gaps > 0 ? Math.min(Math.floor(spare / UNIT), (MAX_BREAK / UNIT) * gaps) : 0;
  const gapMinutes = Array.from({ length: gaps }, (_, i) => {
    const base = Math.floor(breakUnits / gaps);
    return (base + (i < breakUnits - base * gaps ? 1 : 0)) * UNIT;
  });

  const blocks: ScheduleBlock[] = [];
  let t = start;
  sessions.forEach((s, i) => {
    blocks.push({ kind: "study", start: t, end: t + s.minutes, slot: s.slot, part: s.part, parts: s.parts });
    t += s.minutes;
    const g = gapMinutes[i] ?? 0;
    if (g > 0) {
      blocks.push({ kind: "break", start: t, end: t + g });
      t += g;
    }
  });
  const breakMinutes = gapMinutes.reduce((a, b) => a + b, 0);
  const freeMinutes = Math.max(0, start + total - t);
  if (freeMinutes > 0) blocks.push({ kind: "free", start: t, end: t + freeMinutes });

  return { blocks, studyMinutes, breakMinutes, freeMinutes, overflow };
}
