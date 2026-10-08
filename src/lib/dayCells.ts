// 그날 공부할 과목 칸 [첫 과목, 둘째 과목] — 저장된 칸이 있으면 저장된 칸, 없으면 추천 칸.
// 시간표(Timetable), 하루 시간표(DayTimeline), 내보내기가 같은 규칙을 쓰도록 한 곳에 모았다.

import type { PlanItem } from "@/types/study";
import type { PlanDay } from "@/lib/scoring";
import type { PlanData } from "@/lib/usePlanData";
import { colorOf } from "@/lib/palette";
import { buildDaySchedule, type DaySchedulePlan } from "@/lib/schedule";

export interface DayCell {
  slot: number;
  subjectId: string;
  name: string;
  unit: string;
  color: string;
  minutes: number | null;
  saved: PlanItem | undefined; // 저장된 칸이면 그 행 (체크 가능)
  completed: boolean;
  carriedFrom?: string; // 지난 날 못 한 공부를 옮겨 온 칸
}

export function dayCells(data: PlanData, day: PlanDay): (DayCell | null)[] {
  const { savedAt, minutesFor, colors, subjectNameById } = data;
  const minutes = minutesFor(day);
  return [0, 1].map((slot) => {
    const saved = savedAt(day.date, slot);
    const rec = day.items[slot];
    const subjectId = saved?.subject_id ?? rec?.subjectId;
    const unit = saved?.unit ?? rec?.unit;
    if (!subjectId || !unit) return null;
    // 이월 표시: 추천 칸이 이월이고, 저장된 칸이 있으면 같은 단원이고 아직 안 했을 때만
    const carried =
      rec?.carriedFrom && (!saved || (saved.subject_id === rec.subjectId && saved.unit === rec.unit && !saved.completed))
        ? rec.carriedFrom
        : undefined;
    return {
      slot,
      subjectId,
      name: subjectNameById.get(subjectId) ?? rec?.subjectName ?? "?",
      unit,
      color: colorOf(colors, subjectId),
      minutes: minutes[slot],
      saved,
      completed: Boolean(saved?.completed),
      carriedFrom: carried,
    };
  });
}

/** 그날 시간대가 있으면 공부·쉬는 시간 블록, 없으면 null */
export function daySchedule(data: PlanData, day: PlanDay): DaySchedulePlan | null {
  if (!day.window || data.isRestDay(day)) return null;
  return buildDaySchedule(day.window, data.minutesFor(day));
}
