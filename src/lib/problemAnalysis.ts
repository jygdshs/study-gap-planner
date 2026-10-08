// AI 문제 유형 분석 (Gemini): 서버(API 라우트)와 화면이 같이 쓰는 형식과 집계.
//
//  - 과목·단원·푼 문항 수·틀린 번호는 사용자가 정한다.
//  - 문제 PDF를 올리면 AI는 '틀린 번호의 문항만' 찾아 문제 유형과 필요한 개념을 정리한다.
//    문제를 직접 풀지는 않는다. 틀린 원인은 학생이 적은 메모가 있을 때만 분류하고, 없으면 학생이 고른다.
//  - 저장은 지금과 같은 학습 기록(문제 풀이 유형) 한 건 + 틀린 문항별 결과(problem_results)로 한다.
//    그래서 학습 점수·우선순위·계획은 지금의 처리 과정을 그대로 거친다.

import type { ProblemResult, StudyRecord } from "@/types/study";

export const CAUSES = ["계산 실수", "개념 부족", "문제 이해", "시간 부족", "기타"] as const;
export type Cause = (typeof CAUSES)[number];

/** AI가 돌려주는 틀린 문항 하나 */
export interface AnalyzedProblem {
  number: string;
  found: boolean; // PDF에서 그 번호의 문항을 찾았는지
  summary: string; // 무엇을 묻는 문제인지 한 줄 (풀이·정답 아님)
  problem_type: string;
  concept: string; // 풀려면 필요한 핵심 개념
  cause: Cause | "미정"; // 메모가 없으면 "미정" → 학생이 고른다
  confidence: "high" | "medium" | "low";
}

export interface AnalysisResponse {
  problems: AnalyzedProblem[];
  note: string;
}

/** API로 보내는 요청 */
export interface AnalyzeRequest {
  subjectName: string;
  unit: string;
  knownTypes: string[]; // 이 과목에서 전에 쓴 유형 이름 (같은 유형을 같은 이름으로 묶기 위해)
  wrong: { number: string; memo: string }[]; // 틀린 문항 번호와 학생 메모(선택)
  pdf: string; // base64 (필요한 쪽만 잘라낸 PDF)
}

export const DAILY_LIMIT = 20; // 하루 분석 횟수 (무료 한도를 아끼기 위해)
export const MAX_PDF_BASE64 = 4_000_000; // 서버 요청 크기 제한(4.5MB) 안쪽
export const MAX_WRONG = 30;

/** 구조화 출력(JSON) 스키마 */
export const ANALYSIS_SCHEMA = {
  type: "object",
  required: ["problems", "note"],
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        required: ["number", "found", "summary", "problem_type", "concept", "cause", "confidence"],
        properties: {
          number: { type: "string", description: "학생이 알려 준 틀린 문항 번호 그대로" },
          found: { type: "boolean", description: "PDF에서 그 번호의 문항을 찾았으면 true" },
          summary: { type: "string", description: "무엇을 묻는 문제인지 한 줄. 풀이나 정답은 쓰지 않는다" },
          problem_type: { type: "string", description: "이 문항이 요구하는 능력을 2~10자 한국어 명사구로" },
          concept: { type: "string", description: "이 문제를 풀려면 알아야 하는 핵심 개념 한 가지" },
          cause: { type: "string", enum: [...CAUSES, "미정"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    note: { type: "string" },
  },
};

/**
 * 문항 번호를 같은 모양으로: "009." "09번" "문9" "9)" → "9", "5-2"는 그대로.
 * 문제집 PDF는 번호를 001, 002처럼 0을 붙여 적는 경우가 많아, 0을 떼고 비교한다.
 */
export function normalizeProblemNo(raw: string): string {
  const s = String(raw).trim().replace(/^(문항|문제|문)\s*/, "").replace(/[.)\]번\s]+$/, "").replace(/^[\[(]/, "");
  return s.replace(/(^|[^\d])0+(?=\d)/g, "$1");
}

/** "3, 7, 12-14" → ["3","7","12","13","14"] (중복 제거, 입력 순서 유지, 앞의 0은 뗌) */
export function parseNumbers(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\s]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (b >= a && b - a <= 50) for (let n = a; n <= b; n++) out.push(String(n));
    } else {
      out.push(part);
    }
  }
  return [...new Set(out.map(normalizeProblemNo).filter(Boolean))];
}

/** "1-4, 7" → [1,2,3,4,7] (쪽 번호, 1부터) */
export function parsePages(input: string, pageCount: number): number[] {
  return parseNumbers(input)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= pageCount);
}

// ---------------------------------------------------------------------------
// 유형별 집계
// ---------------------------------------------------------------------------

export interface TypeStat {
  type: string;
  total: number;
  wrong: number;
  wrongRate: number; // 0~100
  topCause: string | null; // 가장 많이 나온 틀린 원인
}

/** 문항 결과를 유형별로 묶는다. 많이 틀린 순 (같으면 오답률 높은 순) */
export function typeStats(results: Pick<ProblemResult, "problem_type" | "correct" | "cause">[]): TypeStat[] {
  const byType = new Map<string, { total: number; wrong: number; causes: Map<string, number> }>();
  for (const r of results) {
    const key = r.problem_type.trim();
    if (!key) continue;
    const s = byType.get(key) ?? { total: 0, wrong: 0, causes: new Map() };
    s.total++;
    if (!r.correct) {
      s.wrong++;
      if (r.cause) s.causes.set(r.cause, (s.causes.get(r.cause) ?? 0) + 1);
    }
    byType.set(key, s);
  }
  return [...byType.entries()]
    .map(([type, s]) => ({
      type,
      total: s.total,
      wrong: s.wrong,
      wrongRate: Math.round((s.wrong / s.total) * 1000) / 10,
      topCause: [...s.causes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.wrong - a.wrong || b.wrongRate - a.wrongRate);
}

/**
 * 단원별 '가장 많이 틀린 유형' — 하루 시간표에 "접선의 방정식 위주"처럼 무엇을 공부할지 붙이는 데 쓴다.
 * 최근 기록(sinceISO 이후)의 문항만 보고, 2문항 이상 틀린 유형 중 가장 많이 틀린 것.
 */
export function weakestTypeByUnit(
  results: ProblemResult[],
  records: StudyRecord[],
  sinceISO: string
): Map<string, TypeStat> {
  const recordById = new Map(records.map((r) => [r.id, r]));
  const grouped = new Map<string, ProblemResult[]>();
  for (const pr of results) {
    const rec = recordById.get(pr.record_id);
    if (!rec || rec.study_date < sinceISO) continue;
    const key = `${rec.subject_id}::${rec.unit}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(pr);
  }
  const out = new Map<string, TypeStat>();
  for (const [key, prs] of grouped) {
    const weakest = typeStats(prs).find((s) => s.wrong >= 2);
    if (weakest) out.set(key, weakest);
  }
  return out;
}
