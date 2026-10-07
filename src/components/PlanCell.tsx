"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/Icons";
import { completedFill, subjectInk } from "@/lib/palette";
import { formatMinutes } from "@/lib/allocation";

// 시간표 한 칸. 계획 블록 = 과목 색 단색 블록.
//  - saved: 저장된 계획. 오늘까지의 칸은 칸 전체를 눌러 완료 체크한다.
//  - completed: 완료 → 블록이 옅어지고 단원에 취소선, 도장이 찍힌다.
//  - suggested: 아직 저장 안 된 추천 → 과목 색 점선 테두리.
//  - rest: 공부 가능 시간이 0인 날. 두 교시를 합친 빗금 칸.
//
// 움직임: 칸이 처음 생길 때(화면에 들어올 때, 갱신으로 바뀌었을 때) 왼쪽부터 채워진다.
// delay로 요일·교시마다 시간차를 줘서 시간표가 차례로 채워지는 것처럼 보이게 한다.
// 이미 있던 칸은 다시 그려져도 전환이 반복되지 않고, 새로 완료한 칸만 도장이 찍힌다.

// minutes: 9차시 점수에 따른 시간 배분 — 이 칸에 배정된 공부 시간(분)
type Common = { compact?: boolean; animate?: boolean; delay?: number; minutes?: number | null };

type Props = Common &
  (
    | {
        kind: "saved";
        color: string;
        subjectName: string;
        unit: string;
        completed: boolean;
        checkable: boolean;
        onToggle: () => void;
      }
    | { kind: "suggested"; color: string; subjectName: string; unit: string }
    | { kind: "empty" }
    | { kind: "rest" }
  );

export default function PlanCell(props: Props) {
  // 처음 마운트될 때의 값만 기억한다 (이후 리렌더에서 전환이 다시 도는 것을 막음)
  const [fillOnMount] = useState(Boolean(props.animate));
  const [delayOnMount] = useState(props.delay ?? 0);
  const [initiallyCompleted] = useState(props.kind === "saved" && props.completed);

  const minH = props.compact ? "min-h-[56px]" : "min-h-[84px] lg:min-h-[96px]";
  const fill = fillOnMount ? "cell-fill" : "";
  const motion = fillOnMount ? { animationDelay: `${delayOnMount}ms` } : undefined;
  // 배정 시간은 좁은 칸에서도 한 줄에 들어가게 분 단위로 짧게 (70분), 마우스를 올리면 1시간 10분
  const timeLabel =
    props.minutes && props.minutes > 0 ? (
      <span
        className="text-[12px] font-semibold leading-none tabular-nums opacity-90"
        title={`배정 시간 ${formatMinutes(props.minutes)}`}
      >
        {props.minutes}분
      </span>
    ) : null;
  const subjectText = props.compact ? "text-[12px]" : "text-[12px] lg:text-[13px]";
  const unitText = props.compact ? "text-[14px]" : "text-[14px] lg:text-[16px]";

  if (props.kind === "rest") {
    return (
      <div
        className={`${fill} flex h-full ${minH} items-center justify-center text-[13px] font-semibold text-ink-muted`}
        style={{
          ...motion,
          backgroundImage:
            "repeating-linear-gradient(135deg, rgb(var(--c-ground)) 0 6px, rgb(var(--c-sheet)) 6px 12px)",
        }}
      >
        <span className="bg-sheet px-2 py-0.5">쉬는 날</span>
      </div>
    );
  }

  if (props.kind === "empty") {
    return <div className={`${minH} bg-sheet`} />;
  }

  if (props.kind === "suggested") {
    return (
      <div
        className={`${fill} flex h-full ${minH} flex-col justify-between gap-1 border border-dashed bg-sheet p-2`}
        style={{ ...motion, borderColor: subjectInk(props.color), color: subjectInk(props.color) }}
      >
        <span className={`${subjectText} font-semibold leading-none`}>{props.subjectName}</span>
        <span className="flex flex-col gap-1">
          <span className={`${unitText} font-bold leading-snug`}>{props.unit}</span>
          {timeLabel}
        </span>
      </div>
    );
  }

  const { color, subjectName, unit, completed, checkable, onToggle } = props;
  const label = `${subjectName} ${unit} ${completed ? "완료" : "계획"}`;

  const body = (
    <>
      <span className={`pr-7 ${subjectText} font-semibold leading-none ${completed ? "" : "text-white/85"}`}>
        {subjectName}
      </span>
      <span className={`flex flex-col gap-1 pr-6 ${completed ? "" : "text-white"}`}>
        <span className={`${unitText} font-bold leading-snug ${completed ? "line-through decoration-2" : ""}`}>
          {unit}
        </span>
        {timeLabel}
      </span>
      {completed ? (
        <span
          aria-hidden
          className={`stamp-in absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center border-2`}
          style={{
            borderColor: subjectInk(color),
            color: subjectInk(color),
            // 처음부터 완료였던 칸은 칸이 다 채워진 뒤에 도장이 찍힌다
            animationDelay: initiallyCompleted && fillOnMount ? `${delayOnMount + 380}ms` : undefined,
          }}
        >
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
      ) : (
        checkable && (
          <span
            aria-hidden
            className="absolute bottom-1.5 right-1.5 h-[18px] w-[18px] border-2 border-white/90 transition-colors group-hover:bg-white/25"
          />
        )
      )}
    </>
  );

  const style = completed
    ? { ...motion, backgroundColor: completedFill(color), color: subjectInk(color) }
    : { ...motion, backgroundColor: color };
  const base = `${fill} relative flex h-full ${minH} flex-col justify-between gap-1 p-2 text-left transition-colors duration-300`;

  if (!checkable) {
    return (
      <div className={base} style={style} title="그날이 되면 체크할 수 있어요">
        {body}
      </div>
    );
  }

  return (
    <label
      className={`${base} group cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}
      style={style}
      title={completed ? "완료 체크 취소" : "계획을 지켰으면 눌러서 체크"}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={completed}
        onChange={onToggle}
        aria-label={label}
      />
      {body}
    </label>
  );
}
