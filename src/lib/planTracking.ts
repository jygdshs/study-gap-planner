// 정보과학 프로젝트 7차시: 계획 이행 체크.
//
// 계획서 2번(IPO 설계) "처리" 마지막 문단을 코드로 옮겼다.
//  "계속 학습 정보를 입력받으면서 만든 학습 계획을 잘 지켰는지 확인하고
//   잘 지켰을 시 문제 풀이 결과와 개념 설명의 변화를 고려한 새로 학습 점수를 매기고
//   더 효율적인 학습 계획을 세운다."
//
//  1) 저장된 계획(plan_items) 중 오늘까지의 계획을 몇 칸 지켰는지 → 이행률
//  2) 계획을 지켰는데(완료 체크) 그 날짜 이후 새 학습 결과가 아직 없는 단원
//     → "결과 입력 필요" 목록. 결과를 입력해야 새 학습 점수/새 계획이 나온다.
//  3) 계획 갱신 시, 이미 완료한 칸은 기록으로 남기고 나머지 칸만 새 추천으로 바꾼다.

import type { PlanItem, StudyRecord } from "@/types/study";
import type { PlanDay } from "@/lib/scoring";

export interface AdherenceSummary {
  total: number; // 오늘까지 저장된 계획 칸 수
  completed: number; // 그중 완료 체크한 칸 수
  rate: number | null; // 0~100 (계획이 없으면 null)
}

/** fromISO ~ toISO(포함) 사이 날짜의 계획 이행률 */
export function summarizeAdherence(
  items: PlanItem[],
  fromISO: string,
  toISO: string
): AdherenceSummary {
  const inRange = items.filter((it) => it.plan_date >= fromISO && it.plan_date <= toISO);
  const completed = inRange.filter((it) => it.completed).length;
  return {
    total: inRange.length,
    completed,
    rate: inRange.length > 0 ? Math.round((completed / inRange.length) * 1000) / 10 : null,
  };
}

/**
 * 완료 체크를 했지만, 그 계획 날짜(포함) 이후에 같은 과목·단원의 학습 기록이 없는 칸.
 * 같은 단원이 여러 번 완료됐다면 가장 최근 완료 1건만 남긴다.
 */
export function findPendingResultInputs(items: PlanItem[], records: StudyRecord[]): PlanItem[] {
  const latestRecordDate = new Map<string, string>();
  for (const r of records) {
    const key = `${r.subject_id}::${r.unit}`;
    const prev = latestRecordDate.get(key);
    if (!prev || r.study_date > prev) latestRecordDate.set(key, r.study_date);
  }

  const latestCompleted = new Map<string, PlanItem>();
  for (const it of items) {
    if (!it.completed) continue;
    const key = `${it.subject_id}::${it.unit}`;
    const prev = latestCompleted.get(key);
    if (!prev || it.plan_date > prev.plan_date) latestCompleted.set(key, it);
  }

  return [...latestCompleted.entries()]
    .filter(([key, it]) => {
      const recordDate = latestRecordDate.get(key);
      return !recordDate || recordDate < it.plan_date;
    })
    .map(([, it]) => it)
    .sort((a, b) => (a.plan_date < b.plan_date ? -1 : 1));
}

export interface PlanItemUpsert {
  plan_date: string;
  slot: number;
  subject_id: string;
  unit: string;
  completed: boolean;
  completed_at: string | null;
}

/**
 * 추천 계획(planDays)을 저장할 때 바꿀 칸(upsert)과 지울 칸(delete)을 계산한다.
 *  - 이미 완료 체크한 칸은 지킨 기록이므로 건드리지 않는다.
 *  - 완료하지 않은 칸은 새 추천으로 덮어쓰고, 새 추천이 없는 칸은 지운다.
 */
export function diffPlanForSave(
  planDays: PlanDay[],
  savedItems: PlanItem[]
): { upserts: PlanItemUpsert[]; deleteIds: string[] } {
  const savedBySlot = new Map(savedItems.map((it) => [`${it.plan_date}#${it.slot}`, it]));
  const upserts: PlanItemUpsert[] = [];
  const deleteIds: string[] = [];

  for (const day of planDays) {
    for (const slot of [0, 1]) {
      const saved = savedBySlot.get(`${day.date}#${slot}`);
      if (saved?.completed) continue;

      const rec = day.items[slot];
      if (rec) {
        upserts.push({
          plan_date: day.date,
          slot,
          subject_id: rec.subjectId,
          unit: rec.unit,
          completed: false,
          completed_at: null,
        });
      } else if (saved) {
        deleteIds.push(saved.id);
      }
    }
  }

  return { upserts, deleteIds };
}
