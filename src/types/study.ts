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
  updated_at: string;
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
  created_at: string;
}
