// 계획서 2번(IPO 설계) "입력" 항목을 코드로 옮긴 타입 정의입니다.

export type RecordType = "problem" | "concept";

export interface Subject {
  id: string;
  name: string;
  exam_date: string | null; // YYYY-MM-DD
  created_at: string;
}

export interface StudyRecordInput {
  subject_id: string;
  unit: string;
  record_type: RecordType;
  study_date: string; // YYYY-MM-DD

  // 문제 풀이 유형
  problems_total?: number | null;
  problems_correct?: number | null;
  problems_wrong?: number | null;

  // 개념 의미 유형
  concept_reference?: string | null;
  concept_answer?: string | null;

  // 공통
  wrong_reasons: string[];
}

export interface StudyRecord extends StudyRecordInput {
  id: string;
  created_at: string;
}

export const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export interface WeeklyAvailability {
  day_of_week: number; // 0(월) ~ 6(일)
  available_hours: number;
  // 005 마이그레이션: 공부 시간대 "HH:MM" 또는 "HH:MM:SS" (없으면 시간대 없이 시간만)
  start_time?: string | null;
  end_time?: string | null;
  updated_at: string;
}

// 특정 날 일정: 그날만 요일별 공부 시간 대신 쓴다
export interface DaySchedule {
  date: string; // YYYY-MM-DD
  available_hours: number;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  created_at: string;
}

// AI 문제 유형 분석: 학습 기록 한 건에 달린 문항별 결과 (006 마이그레이션)
export interface ProblemResult {
  id: string;
  record_id: string;
  problem_no: string;
  correct: boolean;
  problem_type: string;
  cause: string | null; // 계산 실수 / 개념 부족 / 문제 이해 / 시간 부족 / 기타 (맞은 문항은 null)
  detail: string | null;
  created_at: string;
}

// 실제 시험 성적 (학습 점수 예측과 비교)
export interface ExamResult {
  id: string;
  subject_id: string;
  exam_date: string; // YYYY-MM-DD
  score: number; // 받은 점수
  max_score: number; // 만점
  created_at: string;
}

// 7차시: 저장된 학습 계획 1칸 + 이행 여부
export interface PlanItem {
  id: string;
  plan_date: string; // YYYY-MM-DD
  slot: number; // 0 또는 1 (하루 최대 2칸)
  subject_id: string;
  unit: string;
  completed: boolean;
  completed_at: string | null;
  // 004 마이그레이션: 계획 vs 실제 공부 시간(분). 마이그레이션 전이면 필드 자체가 없다
  planned_minutes?: number | null;
  actual_minutes?: number | null;
  created_at: string;
}
