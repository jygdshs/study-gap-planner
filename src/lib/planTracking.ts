// 정보과학 프로젝트 7차시: 계획 이행 체크.
//
// 계획서 2번(IPO 설계) "처리" 마지막 문단을 코드로 옮겼다.
//  "계속 학습 정보를 입력받으면서 만든 학습 계획을 잘 지켰는지 확인하고
//   잘 지켰을 시 문제 풀이 결과와 개념 설명의 변화를 고려한 새로 학습 점수를 매기고
//   더 효율적인 학습 계획을 세운다."
//
//  1) 저장된 계획(plan_items) 중 오늘까지의 계획을 몇 칸 지켰는지 → 이행률
//  2) 계획을 지켰는데(완료 체크) 그 날짜 이후 새 학습 결과가 아직 없는 단원
//     → "결과 입력 필요" 목록. 결과를 입력해야 새 학습 점수/새 계획이 나온다.
//  3) 계획 갱신 시, 이미 완료한 칸은 기록으로 남기고 나머지 칸만 새 추천으로 바꾼다.

import type { PlanItem, StudyRecord, Subject } from "@/types/study";
import { addDaysISO, dayOfWeekMonFirst, type PlanDay } from "@/lib/scoring";

export interface AdherenceSummary {
  total: number; // 오늘까지 저장된 계획 칸 수
  completed: number; // 그중 완료 체크한 칸 수
  rate: number | null; // 0~100 (계획이 없으면 null)
}

/** fromISO ~ toISO(포함) 사이 날짜의 계획 이행률 */
export function summarizeAdherence(
  items: PlanItem[],
  fromISO: string,
  toISO: string
): AdherenceSummary {
  const inRange = items.filter((it) => it.plan_date >= fromISO && it.plan_date <= toISO);
  const completed = inRange.filter((it) => it.completed).length;
  return {
    total: inRange.length,
    completed,
    rate: inRange.length > 0 ? Math.round((completed / inRange.length) * 1000) / 10 : null,
  };
}

/**
 * 완료 체크를 했지만, 그 계획 날짜(포함) 이후에 같은 과목·단원의 학습 기록이 없는 칸.
 * 같은 단원이 여러 번 완료됐다면 가장 최근 완료 1건만 남긴다.
 */
export function findPendingResultInputs(items: PlanItem[], records: StudyRecord[]): PlanItem[] {
  const latestRecordDate = new Map<string, string>();
  for (const r of records) {
    const key = `${r.subject_id}::${r.unit}`;
    const prev = latestRecordDate.get(key);
    if (!prev || r.study_date > prev) latestRecordDate.set(key, r.study_date);
  }

  const latestCompleted = new Map<string, PlanItem>();
  for (const it of items) {
    if (!it.completed) continue;
    const key = `${it.subject_id}::${it.unit}`;
    const prev = latestCompleted.get(key);
    if (!prev || it.plan_date > prev.plan_date) latestCompleted.set(key, it);
  }

  return [...latestCompleted.entries()]
    .filter(([key, it]) => {
      const recordDate = latestRecordDate.get(key);
      return !recordDate || recordDate < it.plan_date;
    })
    .map(([, it]) => it)
    .sort((a, b) => (a.plan_date < b.plan_date ? -1 : 1));
}

export interface PlanItemUpsert {
  plan_date: string;
  slot: number;
  subject_id: string;
  unit: string;
  completed: boolean;
  completed_at: string | null;
}

/**
 * 추천 계획(planDays)을 저장할 때 바꿀 칸(upsert)과 지울 칸(delete)을 계산한다.
 *  - 이미 완료 체크한 칸은 지킨 기록이므로 건드리지 않는다.
 *  - 완료하지 않은 칸은 새 추천으로 덮어쓰고, 새 추천이 없는 칸은 지운다.
 */
export function diffPlanForSave(
  planDays: PlanDay[],
  savedItems: PlanItem[]
): { upserts: PlanItemUpsert[]; deleteIds: string[] } {
  const savedBySlot = new Map(savedItems.map((it) => [`${it.plan_date}#${it.slot}`, it]));
  const upserts: PlanItemUpsert[] = [];
  const deleteIds: string[] = [];

  for (const day of planDays) {
    for (const slot of [0, 1]) {
      const saved = savedBySlot.get(`${day.date}#${slot}`);
      if (saved?.completed) continue;

      const rec = day.items[slot];
      if (rec) {
        upserts.push({
          plan_date: day.date,
          slot,
          subject_id: rec.subjectId,
          unit: rec.unit,
          completed: false,
          completed_at: null,
        });
      } else if (saved) {
        deleteIds.push(saved.id);
      }
    }
  }

  return { upserts, deleteIds };
}

// ---------------------------------------------------------------------------
// 계획 자동 재조정: 지난 날짜에 못 한 칸을 앞으로의 날짜로 옮긴다
// ---------------------------------------------------------------------------

/**
 * 지난 날짜(오늘 전)에 저장했지만 완료하지 못한 칸 중, 아직 '해결'되지 않은 것.
 * 해결 = 그 날짜 이후에 같은 단원을 완료 체크했거나, 같은 단원의 학습 결과를 입력했음.
 * 같은 단원이 여러 번 밀렸으면 가장 오래된 것 하나만 남긴다.
 */
export function findMissedItems(items: PlanItem[], records: StudyRecord[], today: string): PlanItem[] {
  const keyOf = (x: { subject_id: string; unit: string }) => `${x.subject_id}::${x.unit}`;
  const missed = new Map<string, PlanItem>();
  const sorted = [...items].sort((a, b) =>
    a.plan_date === b.plan_date ? a.slot - b.slot : a.plan_date < b.plan_date ? -1 : 1
  );
  for (const it of sorted) {
    if (it.completed || it.plan_date >= today) continue;
    const key = keyOf(it);
    if (missed.has(key)) continue;
    const doneLater = items.some((o) => o.completed && keyOf(o) === key && o.plan_date >= it.plan_date);
    const recordLater = records.some((r) => keyOf(r) === key && r.study_date >= it.plan_date);
    if (!doneLater && !recordLater) missed.set(key, it);
  }
  return [...missed.values()];
}

export interface CarriedItem {
  from: string; // 원래 계획 날짜
  to: string; // 옮겨 간 날짜
  subjectId: string;
  unit: string;
}

/**
 * 못 한 칸을 오래된 것부터, 공부 가능 시간이 있는 가장 가까운 날의 1교시에 넣는다.
 *  - 하루에 옮겨 오는 칸은 1개까지 (추천 계획이 밀린 공부로만 채워지지 않도록)
 *  - 그날 이미 같은 단원이 있으면 그 칸을 1교시로 올리기만 한다
 *  - 칸이 꽉 차 있으면 그날 점수가 더 높은(덜 급한) 2교시 추천을 뺀다
 *  - 시험이 끝난 과목은 옮기지 않는다
 */
export function carryOverMissed(
  planDays: PlanDay[],
  missed: PlanItem[],
  subjects: Subject[],
  scoreOf: (subjectId: string, unit: string) => number
): { days: PlanDay[]; carried: CarriedItem[] } {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const queue = missed.filter((m) => subjectById.has(m.subject_id));
  const carried: CarriedItem[] = [];

  const days = planDays.map((day) => {
    if (queue.length === 0 || day.availableHours <= 0) return day;
    const qi = queue.findIndex((m) => {
      const exam = subjectById.get(m.subject_id)!.exam_date;
      return !exam || exam > day.date;
    });
    if (qi < 0) return day;
    const [m] = queue.splice(qi, 1);
    carried.push({ from: m.plan_date, to: day.date, subjectId: m.subject_id, unit: m.unit });

    const items = [...day.items];
    const existing = items.findIndex((it) => it.subjectId === m.subject_id && it.unit === m.unit);
    let moved: PlanDay["items"][number];
    if (existing >= 0) {
      [moved] = items.splice(existing, 1);
      moved = { ...moved, carriedFrom: m.plan_date };
    } else {
      moved = {
        subjectId: m.subject_id,
        subjectName: subjectById.get(m.subject_id)!.name,
        unit: m.unit,
        score: scoreOf(m.subject_id, m.unit),
        carriedFrom: m.plan_date,
      };
      if (items.length >= 2) items.pop();
    }
    return { ...day, items: [moved, ...items] };
  });

  return { days, carried };
}

// ---------------------------------------------------------------------------
// 완료율 통계 (일 / 주 / 월)
// ---------------------------------------------------------------------------

export interface PeriodStat extends AdherenceSummary {
  label: string;
  from: string;
  to: string;
}

const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

/** 최근 days일, 날짜별 이행률 */
export function dailyStats(items: PlanItem[], today: string, days = 14): PeriodStat[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDaysISO(today, i - (days - 1));
    return { label: md(d), from: d, to: d, ...summarizeAdherence(items, d, d) };
  });
}

/** 최근 weeks주(월요일 시작), 주별 이행률. 이번 주는 오늘까지만 */
export function weeklyStats(items: PlanItem[], today: string, weeks = 8): PeriodStat[] {
  const thisMonday = addDaysISO(today, -dayOfWeekMonFirst(today));
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDaysISO(thisMonday, (i - (weeks - 1)) * 7);
    const sunday = addDaysISO(from, 6);
    const to = sunday > today ? today : sunday;
    return { label: `${md(from)}~`, from, to, ...summarizeAdherence(items, from, to) };
  });
}

/** 최근 months개월, 월별 이행률. 이번 달은 오늘까지만 */
export function monthlyStats(items: PlanItem[], today: string, months = 6): PeriodStat[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)); // 1~12
  return Array.from({ length: months }, (_, i) => {
    const idx = y * 12 + (m - 1) - (months - 1 - i);
    const yy = Math.floor(idx / 12);
    const mm = (idx % 12) + 1;
    const from = `${yy}-${String(mm).padStart(2, "0")}-01`;
    const nextIdx = idx + 1;
    const nextFrom = `${Math.floor(nextIdx / 12)}-${String((nextIdx % 12) + 1).padStart(2, "0")}-01`;
    const monthEnd = addDaysISO(nextFrom, -1);
    const to = monthEnd > today ? today : monthEnd;
    return { label: `${mm}월`, from, to, ...summarizeAdherence(items, from, to) };
  });
}

// ---------------------------------------------------------------------------
// 실제 공부 시간 누적
// ---------------------------------------------------------------------------

export interface StudyTimeTotal {
  subjectId: string;
  minutes: number;
  units: { unit: string; minutes: number }[]; // 많은 순
}

/** 실제 공부 시간(actual_minutes)을 과목·단원별로 더한다. 많은 과목부터 */
export function sumActualMinutes(items: PlanItem[]): StudyTimeTotal[] {
  const bySubject = new Map<string, Map<string, number>>();
  for (const it of items) {
    const min = it.actual_minutes ?? 0;
    if (min <= 0) continue;
    if (!bySubject.has(it.subject_id)) bySubject.set(it.subject_id, new Map());
    const units = bySubject.get(it.subject_id)!;
    units.set(it.unit, (units.get(it.unit) ?? 0) + min);
  }
  return [...bySubject.entries()]
    .map(([subjectId, units]) => ({
      subjectId,
      minutes: [...units.values()].reduce((a, b) => a + b, 0),
      units: [...units.entries()].map(([unit, minutes]) => ({ unit, minutes })).sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}
