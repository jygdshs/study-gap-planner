// 9차시: 틀린 이유 분석 + 주간 성장 리포트 계산.
// 화면(scores, report)은 이 결과를 그리기만 한다.

import type { PlanItem, StudyRecord, Subject } from "@/types/study";
import { addDaysISO, scoreOfRecord } from "@/lib/scoring";
import { summarizeAdherence } from "@/lib/planTracking";

const normalizeReason = (r: string) => r.trim().replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// 틀린 이유 분석
// ---------------------------------------------------------------------------

export type Trend = "up" | "down" | "same" | "new";

export interface ReasonStat {
  reason: string;
  count: number; // 전체 기간 등장 횟수
  recent: number; // 최근 14일
  previous: number; // 그 전 14일
  trend: Trend; // 최근 14일이 그 전 14일보다 늘었는지
  bySubject: { subjectId: string; count: number }[]; // 많은 순
  units: string[]; // 나온 단원 (과목명 단원)
  lastDate: string;
}

export function analyzeWrongReasons(
  records: StudyRecord[],
  subjects: Subject[],
  today: string
): ReasonStat[] {
  const nameById = new Map(subjects.map((s) => [s.id, s.name]));
  const recentFrom = addDaysISO(today, -13);
  const previousFrom = addDaysISO(today, -27);
  const map = new Map<
    string,
    { count: number; recent: number; previous: number; subj: Map<string, number>; units: Set<string>; last: string }
  >();

  for (const r of records) {
    for (const raw of r.wrong_reasons ?? []) {
      const reason = normalizeReason(raw);
      if (!reason) continue;
      if (!map.has(reason))
        map.set(reason, { count: 0, recent: 0, previous: 0, subj: new Map(), units: new Set(), last: "" });
      const s = map.get(reason)!;
      s.count++;
      if (r.study_date >= recentFrom) s.recent++;
      else if (r.study_date >= previousFrom) s.previous++;
      s.subj.set(r.subject_id, (s.subj.get(r.subject_id) ?? 0) + 1);
      s.units.add(`${nameById.get(r.subject_id) ?? "?"} ${r.unit}`);
      if (r.study_date > s.last) s.last = r.study_date;
    }
  }

  return [...map.entries()]
    .map(([reason, s]): ReasonStat => ({
      reason,
      count: s.count,
      recent: s.recent,
      previous: s.previous,
      trend:
        s.previous === 0 && s.recent > 0
          ? "new"
          : s.recent > s.previous
            ? "up"
            : s.recent < s.previous
              ? "down"
              : "same",
      bySubject: [...s.subj.entries()]
        .map(([subjectId, count]) => ({ subjectId, count }))
        .sort((a, b) => b.count - a.count),
      units: [...s.units],
      lastDate: s.last,
    }))
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1));
}

// ---------------------------------------------------------------------------
// 주간 성장 리포트 (이번 주 = 오늘 포함 최근 7일, 지난주 = 그 앞 7일)
// ---------------------------------------------------------------------------

export interface WeekStats {
  from: string;
  to: string;
  records: number;
  studyDays: number;
  avgScore: number | null; // 그 주 기록들의 기본 점수(정답률/핵심어 일치도) 평균
  adherenceRate: number | null;
  planned: number;
  completed: number;
}

export interface UnitChange {
  subjectId: string;
  unit: string;
  before: number; // 이번 주 전 마지막 기본 점수
  after: number; // 이번 주 마지막 기본 점수
  delta: number;
}

export interface WeeklyReport {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  dayCounts: { date: string; count: number }[]; // 이번 주 날짜별 기록 수
  improved: UnitChange[]; // 많이 오른 순
  declined: UnitChange[]; // 많이 내려간 순
  newUnits: { subjectId: string; unit: string; score: number }[]; // 이번 주 처음 기록한 단원
  topReasons: { reason: string; count: number }[]; // 이번 주 틀린 이유
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const latestOf = (rs: StudyRecord[]) =>
  [...rs].sort((a, b) =>
    a.study_date === b.study_date ? (a.created_at < b.created_at ? -1 : 1) : a.study_date < b.study_date ? -1 : 1
  )[rs.length - 1];

function weekStats(records: StudyRecord[], planItems: PlanItem[], from: string, to: string): WeekStats {
  const inWeek = records.filter((r) => r.study_date >= from && r.study_date <= to);
  const scores = inWeek.map((r) => scoreOfRecord(r).metricValue);
  const adherence = summarizeAdherence(planItems, from, to);
  return {
    from,
    to,
    records: inWeek.length,
    studyDays: new Set(inWeek.map((r) => r.study_date)).size,
    avgScore: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    adherenceRate: adherence.rate,
    planned: adherence.total,
    completed: adherence.completed,
  };
}

export function buildWeeklyReport(
  records: StudyRecord[],
  planItems: PlanItem[],
  today: string
): WeeklyReport {
  const thisFrom = addDaysISO(today, -6);
  const lastFrom = addDaysISO(today, -13);
  const lastTo = addDaysISO(today, -7);

  const dayCounts = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysISO(thisFrom, i);
    return { date, count: records.filter((r) => r.study_date === date).length };
  });

  // 단원별: 이번 주 마지막 점수 vs 이번 주 전 마지막 점수
  const byUnit = new Map<string, StudyRecord[]>();
  for (const r of records) {
    const key = `${r.subject_id}::${r.unit}`;
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key)!.push(r);
  }
  const changes: UnitChange[] = [];
  const newUnits: WeeklyReport["newUnits"] = [];
  for (const rs of byUnit.values()) {
    const during = rs.filter((r) => r.study_date >= thisFrom && r.study_date <= today);
    if (during.length === 0) continue;
    const before = rs.filter((r) => r.study_date < thisFrom);
    const after = latestOf(during);
    const afterScore = scoreOfRecord(after).metricValue;
    // 비교 기준: 이번 주 전 마지막 기록. 없으면 이번 주 첫 기록(이번 주 안에 2번 이상 기록한 경우)
    const earliestDuring = [...during].sort((a, b) =>
      a.study_date === b.study_date ? (a.created_at < b.created_at ? -1 : 1) : a.study_date < b.study_date ? -1 : 1
    )[0];
    const baseline = before.length > 0 ? latestOf(before) : during.length >= 2 ? earliestDuring : null;
    if (!baseline) {
      newUnits.push({ subjectId: after.subject_id, unit: after.unit, score: afterScore });
      continue;
    }
    const beforeScore = scoreOfRecord(baseline).metricValue;
    changes.push({
      subjectId: after.subject_id,
      unit: after.unit,
      before: beforeScore,
      after: afterScore,
      delta: round1(afterScore - beforeScore),
    });
  }

  const reasonCount = new Map<string, number>();
  for (const r of records) {
    if (r.study_date < thisFrom || r.study_date > today) continue;
    for (const raw of r.wrong_reasons ?? []) {
      const reason = normalizeReason(raw);
      if (reason) reasonCount.set(reason, (reasonCount.get(reason) ?? 0) + 1);
    }
  }

  return {
    thisWeek: weekStats(records, planItems, thisFrom, today),
    lastWeek: weekStats(records, planItems, lastFrom, lastTo),
    dayCounts,
    improved: changes.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta),
    declined: changes.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta),
    newUnits,
    topReasons: [...reasonCount.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
