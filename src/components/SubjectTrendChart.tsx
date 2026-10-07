"use client";

import { subjectInk } from "@/lib/palette";
import type { SubjectTrend } from "@/lib/analysis";

// 과목별 학습 점수 변화 꺾은선 (외부 라이브러리 없이 SVG). 선이 올라갈수록 학습 공백이 줄어든 것.

export default function SubjectTrendChart({
  trend,
  colorOf,
  nameOf,
}: {
  trend: SubjectTrend;
  colorOf: (subjectId: string) => string;
  nameOf: (subjectId: string) => string;
}) {
  const { dates, series } = trend;
  if (dates.length === 0 || series.length === 0) {
    return <p className="px-5 py-4 text-[14px] text-ink-muted">학습 기록이 쌓이면 과목별 점수 변화가 그려져요.</p>;
  }

  const width = 640;
  const height = 230;
  const padL = 34;
  const padR = 44;
  const padT = 14;
  const padB = 28;
  const innerW = width - padL - padR;
  const toX = (i: number) => (dates.length > 1 ? padL + (i * innerW) / (dates.length - 1) : padL + innerW / 2);
  const toY = (v: number) => padT + (1 - v / 100) * (height - padT - padB);
  // 날짜 글자가 겹치지 않도록 최대 7개만
  const labelEvery = Math.max(1, Math.ceil(dates.length / 7));

  // 선 끝 점수 글자: 위에서부터 14px 이상 떨어지도록 밀어 겹치지 않게
  const endLabelY = new Map<string, number>();
  const ends = series
    .map((s) => {
      const i = s.points.map((p, k) => (p === null ? -1 : k)).filter((k) => k >= 0).pop()!;
      return { id: s.subjectId, y: toY(s.points[i]!) + 4 };
    })
    .sort((a, b) => a.y - b.y);
  let prevY = -Infinity;
  for (const e of ends) {
    const y = Math.max(e.y, prevY + 14);
    endLabelY.set(e.id, y);
    prevY = y;
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={series
          .map((s) => {
            const pts = s.points.filter((p): p is number => p !== null);
            return `${nameOf(s.subjectId)} ${pts[0]}점에서 ${pts[pts.length - 1]}점`;
          })
          .join(", ")}
      >
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={width - padR}
              y1={toY(g)}
              y2={toY(g)}
              strokeWidth={1}
              style={{ stroke: g === 0 ? "rgb(var(--c-rule-strong))" : "rgb(var(--c-rule))" }}
            />
            <text x={padL - 8} y={toY(g) + 4} fontSize={11} textAnchor="end" style={{ fill: "rgb(var(--c-ink-muted))" }}>
              {g}
            </text>
          </g>
        ))}
        {dates.map((d, i) =>
          i % labelEvery === 0 || i === dates.length - 1 ? (
            <text
              key={d}
              x={toX(i)}
              y={height - 8}
              fontSize={11}
              textAnchor="middle"
              style={{ fill: "rgb(var(--c-ink-muted))" }}
            >
              {`${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`}
            </text>
          ) : null
        )}

        {series.map((s) => {
          const ink = subjectInk(colorOf(s.subjectId));
          // null(그날까지 기록 없음)은 건너뛰고, 처음 기록한 날부터 선을 잇는다
          const pts = s.points
            .map((v, i) => (v === null ? null : ([toX(i), toY(v), v] as const)))
            .filter((p): p is readonly [number, number, number] => p !== null);
          const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
          const last = pts[pts.length - 1];
          return (
            <g key={s.subjectId}>
              <path d={d} fill="none" strokeWidth={2.5} strokeLinejoin="round" style={{ stroke: ink }} />
              {pts.map(([x, y], i) => (
                <rect key={i} x={x - 3.5} y={y - 3.5} width={7} height={7} style={{ fill: ink }} />
              ))}
              <text x={last[0] + 8} y={endLabelY.get(s.subjectId)} fontSize={12} fontWeight={800} style={{ fill: ink }}>
                {last[2]}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => {
          const pts = s.points.filter((p): p is number => p !== null);
          const change = Math.round((pts[pts.length - 1] - pts[0]) * 10) / 10;
          return (
            <li key={s.subjectId} className="flex items-center gap-1.5 text-[13px]">
              <span className="h-2.5 w-2.5" style={{ backgroundColor: colorOf(s.subjectId) }} aria-hidden />
              <span className="font-semibold">{nameOf(s.subjectId)}</span>
              {pts.length > 1 && (
                <span className={change > 0 ? "font-bold text-ok" : change < 0 ? "font-bold text-danger" : "text-ink-muted"}>
                  {change > 0 ? `+${change}` : change < 0 ? `−${Math.abs(change)}` : "그대로"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
