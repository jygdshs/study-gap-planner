// AI 문제 유형 분석: 서버(API 라우트)와 화면이 같이 쓰는 형식과 집계.
//
//  - 과목·단원은 사용자가 정한다. AI는 사진에서 문항마다 맞음/틀림, 문제 유형, 틀린 원인만 정리한다.
//  - 맞음/틀림은 사진에 있는 채점 표시(O, X, 빗금)나 정답지로만 판단하고, AI가 직접 풀어서 채점하지 않는다.
//  - 저장은 지금과 같은 학습 기록(문제 풀이 유형) 한 건 + 문항별 결과(problem_results)로 한다.
//    그래서 학습 점수·우선순위·계획은 지금의 처리 과정을 그대로 거친다.

import type { ProblemResult, StudyRecord } from "@/types/study";

export const CAUSES = ["계산 실수", "개념 부족", "문제 이해", "시간 부족", "기타"] as const;
export type Cause = (typeof CAUSES)[number];

export type ProblemOutcome = "correct" | "wrong" | "unknown";

/** AI가 돌려주는 문항 하나 */
export interface AnalyzedProblem {
  number: string;
  result: ProblemOutcome; // unknown = 채점 표시도 정답지도 없어 판단 못 함 → 사용자가 정한다
  problem_type: string;
  cause: Cause | "없음"; // 맞은 문항은 "없음"
  detail: string;
  confidence: "high" | "medium" | "low";
}

export interface AnalysisResponse {
  problems: AnalyzedProblem[];
  note: string; // 사진 전체에 대한 한마디 (흐림, 잘린 문항 등)
}

/** API로 보내는 요청 */
export interface AnalyzeRequest {
  subjectName: string;
  unit: string;
  knownTypes: string[]; // 이 과목에서 전에 쓴 유형 이름 (같은 유형을 같은 이름으로 묶기 위해)
  images: { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string }[]; // 학생 답안
  answerKey: { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string }[]; // 정답지 (선택)
}

export const MAX_IMAGES = 6; // 답안 + 정답지 합계
export const DAILY_LIMIT = 20; // 하루 분석 횟수

/** 구조화 출력(JSON) 스키마 — 모든 필드 필수, 추가 필드 없음 */
export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["problems", "note"],
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "result", "problem_type", "cause", "detail", "confidence"],
        properties: {
          number: { type: "string", description: "문항 번호. 사진에 적힌 그대로 (예: 3, 5-2)" },
          result: { type: "string", enum: ["correct", "wrong", "unknown"] },
          problem_type: { type: "string", description: "이 문항이 요구하는 능력을 2~10자 한국어 명사구로" },
          cause: { type: "string", enum: [...CAUSES, "없음"] },
          detail: { type: "string", description: "틀린 문항: 풀이 어디서 왜 틀렸는지 한 문장. 맞은 문항: 빈 문자열" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    note: { type: "string" },
  },
} as const;

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

/** 문항 결과를 유형별로 묶는다. 오답률 높은 순 (같으면 많이 틀린 순) */
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
    .sort((a, b) => b.wrongRate - a.wrongRate || b.wrong - a.wrong);
}

/**
 * 단원별 '가장 약한 유형' — 하루 시간표에 "단순 계산 위주"처럼 무엇을 공부할지 붙이는 데 쓴다.
 * 최근 days일 기록의 문항만 보고, 2문항 이상 틀린 유형 중 오답률이 가장 높은 것.
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
