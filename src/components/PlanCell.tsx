"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/Icons";

// 시간표 한 칸. 계획 블록 = 과목 색 단색 블록.
//  - saved: 저장된 계획. 오늘까지의 칸은 칸 전체를 눌러 완료 체크한다.
//  - completed: 완료 → 블록이 옅어지고 단원에 취소선, 도장이 찍힌다.
//  - suggested: 아직 저장 안 된 추천 → 과목 색 점선 테두리.
//  - rest: 공부 가능 시간이 0인 날. 두 교시를 합친 빗금 칸.
//
// 움직임은 '바뀐 칸'에만: 페이지가 처음 그려질 때는 정지 상태이고,
// 그 뒤 갱신으로 새로 생긴 칸(animate)만 채워지는 전환을, 새로 완료한 칸만 도장 전환을 한다.

type Common = { compact?: boolean; animate?: boolean };

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
  // 처음 마운트될 때의 값만 기억한다 (이후 리렌더에서 클래스가 붙어 전환이 다시 도는 것을 막음)
  const [fillOnMount] = useState(Boolean(props.animate));
  const [initiallyCompleted] = useState(props.kind === "saved" && props.completed);

  const minH = props.compact ? "min-h-[56px]" : "min-h-[84px] lg:min-h-[96px]";
  const fill = fillOnMount ? "cell-fill" : "";
  const subjectText = props.compact ? "text-[12px]" : "text-[12px] lg:text-[13px]";
  const unitText = props.compact ? "text-[14px]" : "text-[14px] lg:text-[16px]";

  if (props.kind === "rest") {
    return (
      <div
        className={`flex h-full ${minH} items-center justify-center text-[13px] font-semibold text-ink-muted`}
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, #E9EDEB 0 6px, #FFFFFF 6px 12px)",
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
        style={{ borderColor: props.color, color: props.color }}
      >
        <span className={`${subjectText} font-semibold leading-none`}>{props.subjectName}</span>
        <span className={`${unitText} font-bold leading-snug`}>{props.unit}</span>
      </div>
    );
  }

  const { color, subjectName, unit, completed, checkable, onToggle } = props;
  const label = `${subjectName} ${unit} ${completed ? "완료" : "계획"}`;

  const body = (
    <>
      <span className={`${subjectText} font-semibold leading-none ${completed ? "" : "text-white/85"}`}>
        {subjectName}
      </span>
      <span
        className={`pr-6 ${unitText} font-bold leading-snug ${
          completed ? "line-through decoration-2" : "text-white"
        }`}
      >
        {unit}
      </span>
      {completed ? (
        <span
          aria-hidden
          className={`${initiallyCompleted ? "rotate-[-6deg]" : "stamp-in"} absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center border-2`}
          style={{ borderColor: color, color }}
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
    ? { backgroundColor: `color-mix(in srgb, ${color} 14%, white)`, color }
    : { backgroundColor: color };
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
      className={`${base} group cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#2459C8]`}
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
