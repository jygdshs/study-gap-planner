// 시험 결과 비교 + 개념 복습 퀴즈 계산.
//
// 1) 시험 결과 비교
//    - 예측 점수 = 그 시험 '전날'까지의 기록만으로 계산한 과목 학습 점수(단원 평균).
//      시험 임박 감점은 모든 과목이 시험 직전에 똑같이 받으므로 빼고, 준비 정도만 비교한다.
//    - 실제 점수 = 받은 점수 ÷ 만점 × 100
//    - 결과가 3개 이상이면 피어슨 상관계수 r로 '학습 점수가 높을수록 실제 성적도 높았는지' 본다.
// 2) 개념 복습 퀴즈
//    - 개념 의미 기록이 있는 단원마다 가장 최근 기준 의미로 문제를 낸다.
//    - 핵심어 점수가 낮을수록, 마지막으로 본 지 오래될수록 먼저 낸다.

import type { ExamResult, StudyRecord, Subject } from "@/types/study";
import { addDaysISO, buildUnitStatuses, diffInDays, scoreOfRecord } from "@/lib/scoring";
import { extractKeywords } from "@/lib/keywords";

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// 시험 결과 비교
// ---------------------------------------------------------------------------

/** 시험 전날 기준 과목 학습 점수 (기록이 없으면 null) */
export function predictedSubjectScore(
  subject: Subject,
  records: StudyRecord[],
  examDate: string
): number | null {
  const before = records.filter((r) => r.subject_id === subject.id && r.study_date < examDate);
  if (before.length === 0) return null;
  // exam_date를 비워 시험 임박 감점을 빼고 계산한다
  const units = buildUnitStatuses([{ ...subject, exam_date: null }], before, addDaysISO(examDate, -1));
  if (units.length === 0) return null;
  return round1(units.reduce((s, u) => s + u.finalScore, 0) / units.length);
}

export interface ComparisonRow {
  result: ExamResult;
  subjectName: string;
  actual: number; // 0~100 환산
  predicted: number | null;
  diff: number | null; // 실제 - 예측
  unitsCount: number; // 예측에 쓰인 단원 수
}

export interface ComparisonSummary {
  rows: ComparisonRow[];
  paired: number; // 예측과 실제가 모두 있는 결과 수
  meanAbsDiff: number | null; // 평균 |실제 - 예측|
  meanDiff: number | null; // 평균 (실제 - 예측): +면 실제가 더 높게 나옴
  r: number | null; // 피어슨 상관계수 (3개 이상일 때)
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100;
}

export function compareExamResults(
  results: ExamResult[],
  subjects: Subject[],
  records: StudyRecord[]
): ComparisonSummary {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const rows: ComparisonRow[] = results
    .map((result) => {
      const subject = byId.get(result.subject_id);
      const actual = round1((Number(result.score) / Number(result.max_score)) * 100);
      const predicted = subject ? predictedSubjectScore(subject, records, result.exam_date) : null;
      const unitsCount = subject
        ? new Set(
            records
              .filter((r) => r.subject_id === subject.id && r.study_date < result.exam_date)
              .map((r) => r.unit)
          ).size
        : 0;
      return {
        result,
        subjectName: subject?.name ?? "?",
        actual,
        predicted,
        diff: predicted === null ? null : round1(actual - predicted),
        unitsCount,
      };
    })
    .sort((a, b) => (a.result.exam_date < b.result.exam_date ? 1 : -1));

  const paired = rows.filter((r) => r.predicted !== null);
  const diffs = paired.map((r) => r.diff as number);
  return {
    rows,
    paired: paired.length,
    meanAbsDiff: diffs.length ? round1(diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length) : null,
    meanDiff: diffs.length ? round1(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null,
    r: pearson(
      paired.map((r) => r.predicted as number),
      paired.map((r) => r.actual)
    ),
  };
}

/** 상관계수를 말로 */
export function describeCorrelation(r: number): string {
  const a = Math.abs(r);
  const strength = a >= 0.7 ? "강한" : a >= 0.4 ? "뚜렷한" : a >= 0.2 ? "약한" : "거의 없는";
  if (a < 0.2) return "학습 점수와 실제 성적 사이에 관계가 거의 없어요.";
  return r > 0
    ? `${strength} 양의 관계예요. 학습 점수가 높은 과목일수록 실제 성적도 높았어요.`
    : `${strength} 음의 관계예요. 학습 점수와 실제 성적이 반대로 움직였어요. 점수 계산 기준을 다시 살펴볼 필요가 있어요.`;
}

// ---------------------------------------------------------------------------
// 개념 복습 퀴즈
// ---------------------------------------------------------------------------

export interface QuizItem {
  subjectId: string;
  subjectName: string;
  unit: string;
  reference: string; // 가장 최근 기준 의미 (문제의 정답)
  term: string; // 설명할 개념 이름 = 기준 의미의 첫 핵심어 (예: "품사는 단어를…" → 품사), 없으면 단원 이름
  lastScore: number; // 마지막 핵심어 일치도
  lastDate: string;
  attempts: number; // 지금까지 기록 수
  priority: number; // 낮을수록 먼저
}

export function buildQuizQueue(subjects: Subject[], records: StudyRecord[], today: string): QuizItem[] {
  const nameById = new Map(subjects.map((s) => [s.id, s.name]));
  const groups = new Map<string, StudyRecord[]>();
  for (const r of records) {
    if (r.record_type !== "concept" || !r.concept_reference?.trim()) continue;
    const key = `${r.subject_id}::${r.unit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const items: QuizItem[] = [];
  for (const rs of groups.values()) {
    const latest = [...rs].sort((a, b) =>
      a.study_date === b.study_date ? (a.created_at < b.created_at ? -1 : 1) : a.study_date < b.study_date ? -1 : 1
    )[rs.length - 1];
    const lastScore = scoreOfRecord(latest).metricValue;
    const daysSince = Math.max(0, diffInDays(today, latest.study_date));
    items.push({
      subjectId: latest.subject_id,
      subjectName: nameById.get(latest.subject_id) ?? "?",
      unit: latest.unit,
      reference: latest.concept_reference!.trim(),
      // 개념 이름을 적어 둔 기록이면 그 이름, 아니면 기준 의미의 첫 핵심어
      term: latest.concept_name?.trim() || (extractKeywords(latest.concept_reference!)[0] ?? latest.unit),
      lastScore,
      lastDate: latest.study_date,
      attempts: rs.length,
      // 점수가 낮을수록, 오래 안 볼수록(하루 1점, 최대 30점) 먼저
      priority: lastScore - Math.min(30, daysSince),
    });
  }
  return items.sort((a, b) => a.priority - b.priority);
}
