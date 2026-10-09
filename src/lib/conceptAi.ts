// 개념 의미 AI: 정의 가져오기 + 채점. 서버(/api/concept)와 화면이 같이 쓰는 형식과, 화면에서 부르는 함수.
//
//  - 정의: 개념 이름을 주면 AI가 고등학생 수준의 정확한 정의를 1~3문장으로 쓴다.
//          화면은 이 정의를 학생이 자기 설명을 쓰기 전까지 보여주지 않는다 (컨닝 방지).
//  - 채점: 기준 의미(직접 입력이든 AI 정의든)와 학생 설명을 비교해 뜻이 얼마나 맞는지 0~100점.
//          낱말이 같은지가 아니라 핵심 내용·조건이 맞는지, 잘못 알고 있는 부분이 있는지로 매긴다.
//  - AI가 안 될 때(한도·과부하)는 화면에서 예전 방식(핵심어 일치도)으로 채점할 수 있다.

import { supabase } from "@/lib/supabaseClient";

export interface DefinitionResult {
  found: boolean; // 그런 개념이 있고 정의할 수 있으면 true
  definition: string;
  note: string; // 못 찾았거나 뜻이 여러 개일 때 안내
}

export interface GradeResult {
  score: number; // 0~100
  verdict: "정확" | "대체로 맞음" | "일부 맞음" | "틀림";
  feedback: string; // 한두 문장
  good_points: string[]; // 맞게 쓴 핵심 내용
  missing_points: string[]; // 빠진 핵심 내용
  misconceptions: string[]; // 잘못 알고 있는 내용
}

export const DEFINITION_SCHEMA = {
  type: "object",
  required: ["found", "definition", "note"],
  properties: {
    found: { type: "boolean" },
    definition: { type: "string", description: "고등학생 교과서 수준의 정확한 정의 1~3문장" },
    note: { type: "string" },
  },
};

export const GRADE_SCHEMA = {
  type: "object",
  required: ["score", "verdict", "feedback", "good_points", "missing_points", "misconceptions"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    verdict: { type: "string", enum: ["정확", "대체로 맞음", "일부 맞음", "틀림"] },
    feedback: { type: "string" },
    good_points: { type: "array", items: { type: "string" } },
    missing_points: { type: "array", items: { type: "string" } },
    misconceptions: { type: "array", items: { type: "string" } },
  },
};

export const SUGGEST_SCHEMA = {
  type: "object",
  required: ["concepts"],
  properties: {
    concepts: { type: "array", items: { type: "string" }, description: "그 단원의 핵심 개념 이름 5~10개" },
  },
};

export type ConceptRequest =
  | { action: "suggest"; subjectName: string; unit: string }
  | { action: "define"; subjectName: string; unit: string; concept: string }
  | { action: "grade"; subjectName: string; unit: string; concept: string; reference: string; answer: string };

/** /api/concept 호출. 실패하면 한국어 안내가 담긴 Error를 던진다 */
async function callConceptApi<T>(body: ConceptRequest): Promise<T & { remaining?: number; model?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
  const res = await fetch("/api/concept", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ error: `AI 요청 실패 (${res.status})` }));
  if (!res.ok) throw new Error(json.error ?? `AI 요청 실패 (${res.status})`);
  return json;
}

/** 단원의 핵심 개념 이름 목록 (같은 단원은 이 브라우저에 기억해 두고 다시 묻지 않는다) */
export async function suggestConcepts(subjectName: string, unit: string): Promise<string[]> {
  const key = `concept-suggest:${subjectName}::${unit}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as string[];
  } catch {
    // 저장소를 못 쓰면 매번 묻는다
  }
  const r = await callConceptApi<{ concepts: string[] }>({ action: "suggest", subjectName, unit });
  const concepts = (r.concepts ?? []).map((c) => c.trim()).filter(Boolean);
  try {
    localStorage.setItem(key, JSON.stringify(concepts));
  } catch {
    // 무시
  }
  return concepts;
}

export function fetchDefinition(subjectName: string, unit: string, concept: string) {
  return callConceptApi<DefinitionResult>({ action: "define", subjectName, unit, concept });
}

export function gradeConcept(subjectName: string, unit: string, concept: string, reference: string, answer: string) {
  return callConceptApi<GradeResult>({ action: "grade", subjectName, unit, concept, reference, answer });
}
