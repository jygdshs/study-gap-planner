// 정보과학 프로젝트 4~5차시: 처리(Process) + 출력(Output)에 쓰이는 계산 로직.
//
// 계획서 2번(IPO 설계) "처리" 항목을 그대로 코드로 옮겼다.
//  - 문제 풀이 유형: 정답률이 낮을수록 학습 점수가 낮다(=더 취약하다, 우선 학습 대상)
//  - 개념 의미 유형: 기준 의미와 내가 쓴 의미가 얼마나 비슷한지(유사도)로 점수를 매긴다
//  - "점수(정답률/유사도)가 비슷한 단원들 사이에서만" 아래 두 가지로 동점자를 가린다
//    ① 문제 풀이 유형은 문제를 더 많이 풀었는데도 점수가 비슷하면 그만큼 더 낮춘다
//       (많이 풀어봤는데도 오답률이 그대로라면 더 뿌리 깊은 공백으로 본다)
//    ② 마지막으로 학습한 지 얼마 안 됐을수록 점수를 살짝 더 낮춘다
//       (최근에 공부했는데도 점수가 비슷하게 낮다는 건 아직 안 익숙하다는 뜻으로 보고
//        한 번 더 복습하도록 우선순위를 올리기 위함)
//    → 점수가 이미 확연히 다른 단원끼리는 이 두 보정이 적용되지 않는다(순수 동점자 처리이기 때문).
//  - 과목별 시험 날짜가 가까울수록 그 과목 단원들의 점수를 낮춘다(동점 여부와 무관하게 항상 적용)
//
// 학습 점수는 0~100점이며, "점수가 낮을수록 우선적으로 학습해야 하는 단원/과목"이다.

import type { RecordType, StudyRecord, Subject, WeeklyAvailability } from "@/types/study";
import { keywordScore } from "@/lib/keywords";

// ---------------------------------------------------------------------------
// 날짜 유틸 (별도 라이브러리 없이 순수 JS Date로 처리)
// ---------------------------------------------------------------------------

function toDateOnly(value: Date | string): Date {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** a - b 를 '일' 단위로 반환 (a가 b보다 미래면 양수) */
export function diffInDays(a: Date | string, b: Date | string): number {
  const A = toDateOnly(a).getTime();
  const B = toDateOnly(b).getTime();
  return Math.round((A - B) / (1000 * 60 * 60 * 24));
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function addDaysISO(baseISO: string, days: number): string {
  const d = toDateOnly(baseISO);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export const DAY_LABELS_FULL = ["월", "화", "수", "목", "금", "토", "일"] as const;

/** 월요일=0 ... 일요일=6 로 맞춘 요일 인덱스 (JS의 getDay()는 일요일=0이라 보정) */
export function dayOfWeekMonFirst(iso: string): number {
  const jsDay = toDateOnly(iso).getDay(); // 0(일) ~ 6(토)
  return (jsDay + 6) % 7; // 0(월) ~ 6(일)
}

// ---------------------------------------------------------------------------
// 개념 의미 유사도: 형태소 분석기가 없어도 한글 문장을 대략 비교할 수 있도록
// 공백을 지운 뒤 "문자 2-gram" 집합의 자카드 유사도를 사용한다.
// (완벽한 의미 비교는 아니지만, 간단한 채점 기준으로는 충분하다)
// ---------------------------------------------------------------------------

function charBigrams(text: string): Set<string> {
  const clean = text.replace(/\s+/g, "");
  if (clean.length === 0) return new Set();
  if (clean.length === 1) return new Set([clean]);
  const grams = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) grams.add(clean.slice(i, i + 2));
  return grams;
}

/** 0(전혀 다름) ~ 1(똑같음) 사이의 유사도 */
export function textSimilarity(a: string, b: string): number {
  const A = charBigrams(a);
  const B = charBigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const gram of A) if (B.has(gram)) intersection++;
  const union = A.size + B.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// 기록 1개에 대한 점수 (정답률 또는 의미 유사도)
// ---------------------------------------------------------------------------

export interface RecordScore {
  record: StudyRecord;
  metricLabel: string; // "정답률" | "핵심어 일치도"
  metricValue: number; // 0~100
}

export function scoreOfRecord(record: StudyRecord): RecordScore {
  if (record.record_type === "problem") {
    const total = record.problems_total ?? 0;
    const correct = record.problems_correct ?? 0;
    const value = total > 0 ? (correct / total) * 100 : 50;
    return { record, metricLabel: "정답률", metricValue: Math.round(value * 10) / 10 };
  }

  // 9차시: 개념 의미는 '핵심 단어 일치도'로 채점한다 (src/lib/keywords.ts)
  const { score } = keywordScore(record.concept_reference ?? "", record.concept_answer ?? "");
  return { record, metricLabel: "핵심어 일치도", metricValue: score };
}

// ---------------------------------------------------------------------------
// 단원(과목+단원) 단위 학습 상태
// ---------------------------------------------------------------------------

export interface UnitStatus {
  subjectId: string;
  subjectName: string;
  unit: string;
  recordType: RecordType;
  latestRecord: StudyRecord;
  finalScore: number; // 0~100, 낮을수록 우선 학습 대상
  metricLabel: string;
  metricValue: number;
  tiedWithOthers: boolean; // 다른 단원과 점수(metricValue)가 비슷해 동점자 처리가 적용됐는지
  recencyPenalty: number;
  volumePenalty: number;
  examPenalty: number;
  history: { date: string; score: number }[]; // 그래프용 (오래된 순)
  wrongReasonsHistory: { date: string; reasons: string[] }[];
}

// 이 이내로 점수(metricValue) 차이가 나면 "비슷하다"고 보고 동점자 처리를 적용한다.
const TIE_SCORE_THRESHOLD = 5;

function recencyTieBreak(lastStudyISO: string, todayISOStr: string): number {
  const daysSince = diffInDays(todayISOStr, lastStudyISO);
  if (daysSince < 0 || daysSince > 14) return 0;
  // 최근에 공부했을수록(0일에 가까울수록) 최대 8점까지 감점
  return ((14 - daysSince) / 14) * 8;
}

// 문제 풀이 유형에서 "정답률은 비슷한데 문제를 더 많이 풀었다"를 반영하는 감점.
// 문제 10개당 2점씩, 최대 5점까지 깎는다(25문제 이상이면 만점 감점).
function volumeTieBreak(problemsTotal: number): number {
  if (!problemsTotal || problemsTotal <= 0) return 0;
  return Math.min(5, problemsTotal * 0.2);
}

function examPenalty(examDate: string | null, todayISOStr: string): number {
  if (!examDate) return 0;
  const daysUntil = diffInDays(examDate, todayISOStr);
  // 이미 끝난 시험은 감점하지 않는다 (예전에는 음수가 0으로 잘려 최대 감점 15점이 붙었음)
  if (daysUntil < 0 || daysUntil > 30) return 0;
  const clamped = Math.max(0, Math.min(30, daysUntil));
  // 시험이 가까울수록(0일에 가까울수록) 최대 15점까지 감점
  return ((30 - clamped) / 30) * 15;
}

export function buildUnitStatuses(
  subjects: Subject[],
  records: StudyRecord[],
  todayISOStr: string = todayISO()
): UnitStatus[] {
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const grouped = new Map<string, StudyRecord[]>();

  for (const r of records) {
    const key = `${r.subject_id}::${r.unit}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  // 1단계: 단원별로 가장 최근 기록의 기본 점수(정답률/유사도)만 먼저 계산해 둔다.
  // "점수가 비슷한 단원끼리만" 동점자 처리를 적용해야 하므로, 비교 대상이 될
  // 전체 기본 점수 목록이 먼저 필요하다.
  interface Prepared {
    subjectId: string;
    subject: Subject;
    unit: string;
    sorted: StudyRecord[];
    latest: StudyRecord;
    baseScore: RecordScore;
  }

  const prepared: Prepared[] = [];
  for (const [key, groupRecords] of grouped) {
    const [subjectId, unit] = key.split("::");
    const subject = subjectMap.get(subjectId);
    if (!subject) continue;

    // 같은 날짜에 여러 번 입력했다면 나중에 만든(created_at이 늦은) 기록을 우선한다
    const sorted = [...groupRecords].sort((a, b) => {
      if (a.study_date !== b.study_date) return a.study_date < b.study_date ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
    const latest = sorted[sorted.length - 1];
    prepared.push({ subjectId, subject, unit, sorted, latest, baseScore: scoreOfRecord(latest) });
  }

  // 2단계: 다른 단원과 기본 점수가 TIE_SCORE_THRESHOLD 이내로 비슷한 단원에만
  // 최근 학습일 감점(recency)과 문제 풀이량 감점(volume)을 적용한다.
  const statuses: UnitStatus[] = prepared.map((p) => {
    const tied = prepared.some(
      (other) =>
        other !== p &&
        Math.abs(other.baseScore.metricValue - p.baseScore.metricValue) <= TIE_SCORE_THRESHOLD
    );

    const rPenalty = tied ? recencyTieBreak(p.latest.study_date, todayISOStr) : 0;
    const vPenalty =
      tied && p.latest.record_type === "problem"
        ? volumeTieBreak(p.latest.problems_total ?? 0)
        : 0;
    const ePenalty = examPenalty(p.subject.exam_date, todayISOStr);

    const finalScore = Math.max(
      0,
      Math.min(
        100,
        Math.round((p.baseScore.metricValue - rPenalty - vPenalty - ePenalty) * 10) / 10
      )
    );

    return {
      subjectId: p.subjectId,
      subjectName: p.subject.name,
      unit: p.unit,
      recordType: p.latest.record_type,
      latestRecord: p.latest,
      finalScore,
      metricLabel: p.baseScore.metricLabel,
      metricValue: p.baseScore.metricValue,
      tiedWithOthers: tied,
      recencyPenalty: Math.round(rPenalty * 10) / 10,
      volumePenalty: Math.round(vPenalty * 10) / 10,
      examPenalty: Math.round(ePenalty * 10) / 10,
      history: p.sorted.map((r) => ({ date: r.study_date, score: scoreOfRecord(r).metricValue })),
      wrongReasonsHistory: p.sorted.map((r) => ({ date: r.study_date, reasons: r.wrong_reasons })),
    };
  });

  return statuses.sort((a, b) => a.finalScore - b.finalScore);
}

// ---------------------------------------------------------------------------
// 과목 단위 우선순위 (해당 과목 단원들의 평균 점수)
// ---------------------------------------------------------------------------

export interface SubjectPriority {
  subject: Subject;
  score: number; // 낮을수록 우선 학습
  hasRecords: boolean;
  units: UnitStatus[];
}

export function buildSubjectPriorities(
  subjects: Subject[],
  unitStatuses: UnitStatus[]
): SubjectPriority[] {
  const bySubject = new Map<string, UnitStatus[]>();
  for (const u of unitStatuses) {
    if (!bySubject.has(u.subjectId)) bySubject.set(u.subjectId, []);
    bySubject.get(u.subjectId)!.push(u);
  }

  const priorities: SubjectPriority[] = subjects.map((s) => {
    const units = (bySubject.get(s.id) ?? []).sort((a, b) => a.finalScore - b.finalScore);
    const hasRecords = units.length > 0;
    const score = hasRecords
      ? Math.round((units.reduce((sum, u) => sum + u.finalScore, 0) / units.length) * 10) / 10
      : 50; // 아직 학습 기록이 없는 과목은 중간값(50점)으로 두고 화면에서 별도 표시
    return { subject: s, score, hasRecords, units };
  });

  return priorities.sort((a, b) => a.score - b.score);
}

// ---------------------------------------------------------------------------
// 계획 기간 (8차시: 시험 일정 반영)
//  - 시험 일정이 없으면 지금처럼 오늘부터 7일
//  - 앞으로 볼 시험이 있으면 오늘부터 '마지막 시험 전날'까지 (최대 60일)
// ---------------------------------------------------------------------------

export const DEFAULT_HORIZON_DAYS = 7;
export const MAX_HORIZON_DAYS = 60;

export interface PlanHorizon {
  days: number;
  lastExamDate: string | null; // 앞으로 볼 마지막 시험 날짜 (없으면 null → 기본 7일)
}

export function planHorizon(subjects: Subject[], todayISOStr: string = todayISO()): PlanHorizon {
  const upcoming = subjects
    .map((s) => s.exam_date)
    .filter((d): d is string => !!d && d > todayISOStr)
    .sort();
  if (upcoming.length === 0) return { days: DEFAULT_HORIZON_DAYS, lastExamDate: null };

  const lastExamDate = upcoming[upcoming.length - 1];
  // 오늘 ~ 마지막 시험 전날: 일수 = 마지막 시험까지 남은 날
  const days = Math.min(MAX_HORIZON_DAYS, Math.max(1, diffInDays(lastExamDate, todayISOStr)));
  return { days, lastExamDate };
}

/** 그날 공부할 수 있는 과목인지: 시험이 없거나, 시험이 그날보다 뒤에 있는 과목 */
function isStudyableOn(subject: Subject, dateISO: string): boolean {
  return !subject.exam_date || subject.exam_date > dateISO;
}

// ---------------------------------------------------------------------------
// 날짜별 개인 학습 계획
// ---------------------------------------------------------------------------

export interface PlanDay {
  date: string;
  dayLabel: string;
  availableHours: number;
  // 하루 최대 2개 추천. carriedFrom: 그 날짜에 못 한 공부를 옮겨 온 칸 (planTracking.carryOverMissed)
  items: { subjectId: string; subjectName: string; unit: string; score: number; carriedFrom?: string }[];
  exams: { subjectId: string; subjectName: string }[]; // 그날 보는 시험
}

// 같은 단원을 또 넣을 때마다 이만큼 점수를 더해서 비교한다.
// → 가장 취약한 단원이 앞쪽 날에 먼저, 더 자주 들어가되 다른 단원도 골고루 돈다.
const REPEAT_WEIGHT = 12;

/**
 * 날짜마다 그날 기준으로 학습 점수를 다시 계산해 계획을 세운다.
 *  - 시험이 끝난(그날이 시험일이거나 지난) 과목은 그날부터 빠진다.
 *  - 시험 임박 감점·최근 학습 감점이 그날 기준으로 바뀌므로, 시험이 다가오는 과목일수록 우선순위가 올라간다.
 *  - 하루 2칸: (그날 학습 점수 + 이미 배정된 횟수 × REPEAT_WEIGHT)가 가장 낮은 단원부터 고른다.
 */
export function buildStudyPlan(
  subjects: Subject[],
  records: StudyRecord[],
  weeklyAvailability: WeeklyAvailability[],
  todayISOStr: string = todayISO(),
  horizonDays: number = planHorizon(subjects, todayISOStr).days
): PlanDay[] {
  const hoursByDay = new Map(weeklyAvailability.map((w) => [w.day_of_week, w.available_hours]));
  const timesPlanned = new Map<string, number>();
  const days: PlanDay[] = [];

  for (let i = 0; i < horizonDays; i++) {
    const date = addDaysISO(todayISOStr, i);
    const dow = dayOfWeekMonFirst(date);
    const availableHours = hoursByDay.get(dow) ?? 0;

    const exams = subjects
      .filter((s) => s.exam_date === date)
      .map((s) => ({ subjectId: s.id, subjectName: s.name }));

    const items: PlanDay["items"] = [];
    if (availableHours > 0) {
      const studyable = subjects.filter((s) => isStudyableOn(s, date));
      const units = buildUnitStatuses(studyable, records, date);

      for (let slot = 0; slot < 2; slot++) {
        let best: UnitStatus | null = null;
        let bestWeight = Infinity;
        for (const u of units) {
          if (items.some((it) => it.subjectId === u.subjectId && it.unit === u.unit)) continue;
          const weight = u.finalScore + (timesPlanned.get(`${u.subjectId}::${u.unit}`) ?? 0) * REPEAT_WEIGHT;
          if (weight < bestWeight) {
            best = u;
            bestWeight = weight;
          }
        }
        if (!best) break;
        const key = `${best.subjectId}::${best.unit}`;
        timesPlanned.set(key, (timesPlanned.get(key) ?? 0) + 1);
        items.push({
          subjectId: best.subjectId,
          subjectName: best.subjectName,
          unit: best.unit,
          score: best.finalScore,
        });
      }
    }

    // 하루 안에서는 더 취약한(점수가 낮은) 단원을 1교시에
    items.sort((a, b) => a.score - b.score);
    days.push({ date, dayLabel: DAY_LABELS_FULL[dow], availableHours, items, exams });
  }

  return days;
}
