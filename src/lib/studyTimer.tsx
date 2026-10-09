"use client";

// 공부 타이머 + 자동 기록.
//  - 하루 시간표의 공부 칸에서 '시작' → 화면 아래 타이머 막대가 돈다 (다른 화면으로 가도, 새로고침해도 이어짐)
//  - '끝내고 기록' → 그 계획 칸의 실제 공부 시간(actual_minutes)에 걸린 시간을 더하고 완료 체크
//  - 한 번에 하나만 돈다. 진행 상태는 이 브라우저에만 저장한다(localStorage)

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { showToast } from "@/components/ToastHost";

export const PLAN_ITEMS_CHANGED = "plan-items-changed";
const STORAGE_KEY = "study-timer";

export interface RunningTimer {
  planItemId: string;
  label: string; // "수학 미분"
  plannedMinutes: number | null;
  accumulatedMs: number; // 일시정지 전까지 쌓인 시간
  runningSince: number | null; // 지금 돌고 있으면 시작 시각(ms), 멈췄으면 null
}

interface TimerApi {
  timer: RunningTimer | null;
  elapsedMs: number;
  start: (t: Pick<RunningTimer, "planItemId" | "label" | "plannedMinutes">) => void;
  pause: () => void;
  resume: () => void;
  finish: () => Promise<void>;
  cancel: () => void;
}

const TimerContext = createContext<TimerApi | null>(null);

function load(): RunningTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RunningTimer) : null;
  } catch {
    return null;
  }
}
function persist(t: RunningTimer | null) {
  try {
    if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장이 막힌 브라우저면 이 화면에서만 돈다
  }
}

export function StudyTimerProvider({ children }: { children: React.ReactNode }) {
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setTimer(load()), []);
  useEffect(() => {
    if (!timer?.runningSince) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer?.runningSince]);

  const update = useCallback((t: RunningTimer | null) => {
    setTimer(t);
    persist(t);
    setNow(Date.now());
  }, []);

  const elapsedMs = timer ? timer.accumulatedMs + (timer.runningSince ? now - timer.runningSince : 0) : 0;

  const api: TimerApi = {
    timer,
    elapsedMs,
    start: (t) => update({ ...t, accumulatedMs: 0, runningSince: Date.now() }),
    pause: () => {
      if (!timer?.runningSince) return;
      update({ ...timer, accumulatedMs: timer.accumulatedMs + (Date.now() - timer.runningSince), runningSince: null });
    },
    resume: () => {
      if (!timer || timer.runningSince) return;
      update({ ...timer, runningSince: Date.now() });
    },
    cancel: () => update(null),
    finish: async () => {
      if (!timer) return;
      const total = timer.accumulatedMs + (timer.runningSince ? Date.now() - timer.runningSince : 0);
      const minutes = Math.max(1, Math.round(total / 60000));
      // 이미 적어 둔 실제 시간이 있으면 더한다 (같은 칸을 두 번 나눠 공부한 경우)
      const { data, error: readError } = await supabase
        .from("plan_items")
        .select("actual_minutes")
        .eq("id", timer.planItemId)
        .maybeSingle();
      if (readError) {
        showToast({ text: `기록하지 못했어요: ${readError.message}` });
        return;
      }
      const prev = (data as { actual_minutes: number | null } | null)?.actual_minutes ?? 0;
      const { error } = await supabase
        .from("plan_items")
        .update({ actual_minutes: Math.min(1440, prev + minutes), completed: true, completed_at: new Date().toISOString() })
        .eq("id", timer.planItemId);
      if (error) {
        showToast({ text: `기록하지 못했어요: ${error.message}` });
        return;
      }
      const label = timer.label;
      update(null);
      window.dispatchEvent(new Event(PLAN_ITEMS_CHANGED));
      showToast({ text: `${label} ${minutes}분을 기록하고 완료 체크했어요.` });
    },
  };

  return <TimerContext.Provider value={api}>{children}</TimerContext.Provider>;
}

export function useStudyTimer(): TimerApi {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useStudyTimer는 StudyTimerProvider 안에서만 쓸 수 있어요.");
  return ctx;
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
