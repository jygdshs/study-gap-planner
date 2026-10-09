"use client";

import { formatElapsed, useStudyTimer } from "@/lib/studyTimer";

// 공부 타이머가 돌고 있을 때 화면 아래에 붙는 막대: 과목·단원, 지난 시간 / 계획 시간, 일시정지·끝내고 기록·취소

export default function TimerBar() {
  const { timer, elapsedMs, pause, resume, finish, cancel } = useStudyTimer();
  if (!timer) return null;

  const minutes = elapsedMs / 60000;
  const over = timer.plannedMinutes != null && minutes > timer.plannedMinutes;
  const ratio = timer.plannedMinutes ? Math.min(1, minutes / timer.plannedMinutes) : 0;

  return (
    <div className="sticky bottom-0 z-30 border-t border-white/10 bg-shell text-white" role="region" aria-label="공부 타이머">
      {timer.plannedMinutes != null && (
        <div className="h-1 bg-white/10">
          <div className={`h-full ${over ? "bg-warn" : "bg-white/70"}`} style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <span className="flex min-w-0 flex-1 items-baseline gap-3">
          <span className={`text-[22px] font-extrabold tabular-nums ${timer.runningSince ? "" : "text-white/60"}`}>
            {formatElapsed(elapsedMs)}
          </span>
          <span className="min-w-0 truncate text-[14px] font-semibold">
            {timer.label}
            <span className="ml-2 font-normal text-shell-text">
              {timer.runningSince ? "공부 중" : "일시정지"}
              {timer.plannedMinutes != null && ` · 계획 ${timer.plannedMinutes}분`}
              {over && " · 계획 시간을 넘겼어요"}
            </span>
          </span>
        </span>
        <span className="flex gap-2">
          {timer.runningSince ? (
            <button type="button" onClick={pause} className="border border-white/30 px-3 py-1.5 text-[13px] font-semibold hover:bg-white/10">
              일시정지
            </button>
          ) : (
            <button type="button" onClick={resume} className="border border-white/30 px-3 py-1.5 text-[13px] font-semibold hover:bg-white/10">
              다시 시작
            </button>
          )}
          <button type="button" onClick={finish} className="bg-white px-3 py-1.5 text-[13px] font-bold text-[#18233A] hover:bg-[#E6EBF5]">
            끝내고 기록
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("타이머를 취소할까요? 지금까지 잰 시간은 기록되지 않아요.")) cancel();
            }}
            className="px-2 py-1.5 text-[13px] text-shell-text hover:text-white"
          >
            취소
          </button>
        </span>
      </div>
    </div>
  );
}
