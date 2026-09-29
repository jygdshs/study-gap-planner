// 정보과학 프로젝트 4~5차시: 처리(Process) + 출력(Output)에 쓰이는 계산 로직.
//
// 계획서 2번(IPO 설계) "처리" 항목을 그대로 코드로 옮겼다.
//  - 문제 풀이 유형: 정답률이 낮을수록 학습 점수가 낮다(=더 취약하다, 우선 학습 대상)
//  - 개념 의미 유형: 기준 의미와 내가 쓴 의미가 얼마나 비슷한지(유사도)로 점수를 매긴다
//  - 같은 조건이면 "마지막으로 학습한 지 얼마 안 됐을수록" 점수를 살짝 더 낮춘다
//    (최근에 공부했는데도 점수가 낮다는 건 아직 안 익숙하다는 뜻으로 보고,
//     한 번 더 복습하도록 우선순위를 올리기 위함)
//  - 과목별 시험 날짜가 가까울수록 그 과목 단원들의 점수를 더 낮춘다
//
// 학습 점수는 0~100점이며, "점수가 낮을수록 우선적으로 학습해야 하는 단원/과목"이다.

import type { RecordType, StudyRecord, Subject, WeeklyAvailability } from "@/types/study";

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
  metricLabel: string; // "정답률" | "의미 유사도"
  metricValue: number; // 0~100
}

export function scoreOfRecord(record: StudyRecord): RecordScore {
  if (record.record_type === "problem") {
    const total = record.problems_total ?? 0;
    const correct = record.problems_correct ?? 0;
    const value = total > 0 ? (correct / total) * 100 : 50;
    return { record, metricLabel: "정답률", metricValue: Math.round(value * 10) / 10 };
  }

  const similarity = textSimilarity(record.concept_reference ?? "", record.concept_answer ?? "");
  return {
    record,
    metricLabel: "의미 유사도",
    metricValue: Math.round(similarity * 1000) / 10,
  };
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
  recencyPenalty: number;
  examPenalty: number;
  history: { date: string; score: number }[]; // 그래프용 (오래된 순)
  wrongReasonsHistory: { date: string; reasons: string[] }[];
}

function recencyPenalty(lastStudyISO: string, todayISOStr: string): number {
  const daysSince = diffInDays(todayISOStr, lastStudyISO);
  if (daysSince < 0 || daysSince > 14) return 0;
  // 최근에 공부했을수록(0일에 가까울수록) 최대 8점까지 감점 → 복습 우선순위를 살짝 높인다
  return ((14 - daysSince) / 14) * 8;
}

function examPenalty(examDate: string | null, todayISOStr: string): number {
  if (!examDate) return 0;
  const daysUntil = diffInDays(examDate, todayISOStr);
  if (daysUntil > 30) return 0;
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

  const statuses: UnitStatus[] = [];

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
    const latestScore = scoreOfRecord(latest);

    const rPenalty = recencyPenalty(latest.study_date, todayISOStr);
    const ePenalty = examPenalty(subject.exam_date, todayISOStr);
    const finalScore = Math.max(
      0,
      Math.min(100, Math.round((latestScore.metricValue - rPenalty - ePenalty) * 10) / 10)
    );

    statuses.push({
      subjectId,
      subjectName: subject.name,
      unit,
      recordType: latest.record_type,
      latestRecord: latest,
      finalScore,
      metricLabel: latestScore.metricLabel,
      metricValue: latestScore.metricValue,
      recencyPenalty: Math.round(rPenalty * 10) / 10,
      examPenalty: Math.round(ePenalty * 10) / 10,
      history: sorted.map((r) => ({ date: r.study_date, score: scoreOfRecord(r).metricValue })),
      wrongReasonsHistory: sorted.map((r) => ({ date: r.study_date, reasons: r.wrong_reasons })),
    });
  }

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
// 요일별 개인 학습 계획
// ---------------------------------------------------------------------------

export interface PlanDay {
  date: string;
  dayLabel: string;
  availableHours: number;
  items: { subjectName: string; unit: string; score: number }[]; // 하루 최대 2개 추천
}

export function buildStudyPlan(
  subjectPriorities: SubjectPriority[],
  weeklyAvailability: WeeklyAvailability[],
  todayISOStr: string = todayISO(),
  horizonDays = 7
): PlanDay[] {
  const hoursByDay = new Map(weeklyAvailability.map((w) => [w.day_of_week, w.available_hours]));

  // 모든 단원을 학습 점수 오름차순(가장 취약한 것부터)으로 모은다
  const allUnits = subjectPriorities
    .flatMap((sp) => sp.units)
    .sort((a, b) => a.finalScore - b.finalScore);

  const topN = allUnits.slice(0, Math.min(Math.max(allUnits.length, 1), 6));
  const days: PlanDay[] = [];

  for (let i = 0; i < horizonDays; i++) {
    const date = addDaysISO(todayISOStr, i);
    const dow = dayOfWeekMonFirst(date);
    const availableHours = hoursByDay.get(dow) ?? 0;

    const items: PlanDay["items"] = [];
    if (availableHours > 0 && topN.length > 0) {
      const first = topN[i % topN.length];
      items.push({ subjectName: first.subjectName, unit: first.unit, score: first.finalScore });

      if (topN.length > 1) {
        const second = topN[(i + 1) % topN.length];
        if (second.unit !== first.unit || second.subjectName !== first.subjectName) {
          items.push({
            subjectName: second.subjectName,
            unit: second.unit,
            score: second.finalScore,
          });
        }
      }
    }

    days.push({ date, dayLabel: DAY_LABELS_FULL[dow], availableHours, items });
  }

  return days;
}
