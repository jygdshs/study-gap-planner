"use client";

import { useEffect, useRef, useState } from "react";
import { scoreColor, subjectInk } from "@/lib/palette";

interface Point {
  date: string; // YYYY-MM-DD
  score: number; // 0~100
}

/**
 * 외부 차트 라이브러리 없이 학습 점수 변화를 보여주는 SVG 꺾은선 그래프.
 * 스케치 5번의 "그래프 들어가는 곳(과목, 단원 누르면 학습 점수 변화 보여줌)"에 해당.
 * 선은 과목 색, 점은 그 시점 점수의 램프 색.
 *
 * 그래프 폭을 실제 화면 폭에 맞춰 그린다(viewBox = 실제 px). 고정 폭을 줄여서 그리면
 * 좁은 칸에서 글자와 점이 함께 작아지기 때문.
 */
export default function ScoreLineChart({
  points,
  color = "#5F6B7E",
  height = 300,
}: {
  points: Point[];
  color?: string;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) {
    return <p className="text-sm text-ink-muted">표시할 학습 기록이 없습니다.</p>;
  }

  const padL = 40;
  const padR = 28;
  const padT = 30;
  const padB = 36;
  const innerW = width - padL - padR;
  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0;

  const toX = (i: number) => (points.length > 1 ? padL + i * xStep : padL + innerW / 2);
  const toY = (score: number) => padT + (1 - Math.max(0, Math.min(100, score)) / 100) * (height - padT - padB);

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.score).toFixed(1)}`).join(" ");
  // 선 아래를 옅게 채워 변화가 한눈에 보이게
  const areaD =
    points.length > 1
      ? `${pathD} L ${toX(points.length - 1).toFixed(1)} ${toY(0)} L ${toX(0).toFixed(1)} ${toY(0)} Z`
      : "";

  // 점마다 점수를 적되, 점 사이가 좁으면 날짜·점수 글자를 건너뛴다
  const labelEvery = Math.max(1, Math.ceil(46 / Math.max(1, xStep)));
  const showLabel = (i: number) => i === points.length - 1 || (i % labelEvery === 0 && points.length - 1 - i >= labelEvery);
  const ink = subjectInk(color);

  return (
    <div ref={wrapRef} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block max-w-full"
        role="img"
        aria-label={`학습 점수 변화: ${points.map((p) => `${p.date.slice(5)} ${p.score}점`).join(", ")}`}
      >
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line
              x1={padL}
              x2={width - padR}
              y1={toY(g)}
              y2={toY(g)}
              style={{ stroke: g === 0 ? "rgb(var(--c-rule-strong))" : "rgb(var(--c-rule))" }}
              strokeWidth={1}
              strokeDasharray={g === 0 ? undefined : "3 4"}
            />
            <text x={padL - 10} y={toY(g) + 4} fontSize={13} textAnchor="end" style={{ fill: "rgb(var(--c-ink-muted))" }}>
              {g}
            </text>
          </g>
        ))}

        {areaD && <path d={areaD} style={{ fill: `color-mix(in srgb, ${color} 12%, transparent)` }} />}
        <path d={pathD} fill="none" strokeWidth={3} strokeLinejoin="round" style={{ stroke: ink }} />

        {points.map((p, i) => (
          <g key={`${p.date}-${i}`}>
            <rect
              x={toX(i) - 7}
              y={toY(p.score) - 7}
              width={14}
              height={14}
              fill={scoreColor(p.score)}
              strokeWidth={2.5}
              style={{ stroke: ink }}
            >
              <title>{`${p.date} ${p.score}점`}</title>
            </rect>
            {showLabel(i) && (
              <>
                <text
                  x={toX(i)}
                  y={toY(p.score) - 14}
                  fontSize={i === points.length - 1 ? 16 : 13}
                  fontWeight={i === points.length - 1 ? 800 : 700}
                  textAnchor="middle"
                  style={{ fill: "rgb(var(--c-ink))" }}
                >
                  {p.score}
                </text>
                <text x={toX(i)} y={height - 12} fontSize={13} textAnchor="middle" style={{ fill: "rgb(var(--c-ink-muted))" }}>
                  {`${Number(p.date.slice(5, 7))}.${Number(p.date.slice(8, 10))}`}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
