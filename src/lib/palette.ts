// 교실 시간표 디자인: 과목 색 코드와 학습 점수 램프.
//
// - 과목 색: 과목을 만든 순서대로 8가지 진한 단색을 돌려 쓴다.
//   입력·계획·점수 어느 화면에서든 같은 과목은 같은 색이다. (흰 글자 대비 4.5:1 이상)
// - 학습 점수 램프: 0~100 하나의 고정 램프. 낮을수록(=학습 공백이 클수록) 진한 주홍.

import type { Subject } from "@/types/study";

export const SUBJECT_COLORS = [
  "#2459C8", // 파랑
  "#127A55", // 초록
  "#9A5B00", // 호박
  "#6B3FC0", // 보라
  "#0B7487", // 청록
  "#B4295F", // 자주
  "#4E5E12", // 올리브
  "#3F4C8C", // 남보라
] as const;

const FALLBACK_COLOR = "#5F6B7E";

/** subjectId → 색. 과목 생성 순서(created_at, 같으면 id)로 고정한다. */
export function buildSubjectColorMap(subjects: Subject[]): Map<string, string> {
  const ordered = [...subjects].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? -1 : 1) : a.created_at < b.created_at ? -1 : 1
  );
  return new Map(ordered.map((s, i) => [s.id, SUBJECT_COLORS[i % SUBJECT_COLORS.length]]));
}

export function colorOf(map: Map<string, string>, subjectId: string): string {
  return map.get(subjectId) ?? FALLBACK_COLOR;
}

// tailwind.config.ts의 gap 1~5와 같은 값
export const GAP_RAMP = ["#9E2A1C", "#C2412C", "#DD6E4E", "#EDA58F", "#F6D3C8"] as const;

/** 학습 점수(0~100) → 램프 색. 20점 단위 5단계. */
export function scoreColor(score: number): string {
  const idx = Math.min(4, Math.max(0, Math.floor(score / 20)));
  return GAP_RAMP[idx];
}

/** 램프 칸 위에 올릴 글자색 (진한 두 단계만 흰 글자) */
export function scoreTextColor(score: number): string {
  return score < 40 ? "#FFFFFF" : "#18233A";
}
