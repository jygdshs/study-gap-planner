"use client";

import type { GradeResult } from "@/lib/conceptAi";

// AI 개념 채점 결과: 판정 + 한두 문장 피드백 + 맞은 점 / 빠진 점 / 잘못 안 점

const VERDICT_STYLE: Record<GradeResult["verdict"], string> = {
  정확: "border-ok text-ok",
  "대체로 맞음": "border-ok text-ok",
  "일부 맞음": "border-warn text-warn",
  틀림: "border-danger text-danger",
};

export default function ConceptGradeView({
  grade,
}: {
  grade: Pick<GradeResult, "verdict" | "feedback" | "good_points" | "missing_points" | "misconceptions">;
}) {
  const groups = [
    { label: "맞게 쓴 점", items: grade.good_points, mark: "○", tone: "text-ok" },
    { label: "빠진 점", items: grade.missing_points, mark: "△", tone: "text-warn" },
    { label: "잘못 안 점", items: grade.misconceptions, mark: "×", tone: "text-danger" },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] leading-relaxed">
        <span className={`mr-2 inline-block border px-1.5 py-px text-[12px] font-bold ${VERDICT_STYLE[grade.verdict] ?? ""}`}>
          {grade.verdict}
        </span>
        {grade.feedback}
      </p>
      {groups.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-soft">{g.label}</span>
              <ul className="flex flex-col gap-0.5">
                {g.items.map((item) => (
                  <li key={item} className="flex gap-1.5 text-[13px] leading-snug">
                    <span className={`shrink-0 font-bold ${g.tone}`} aria-hidden>
                      {g.mark}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
