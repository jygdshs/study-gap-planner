"use client";

import { scoreColor } from "@/lib/palette";

interface Point {
  date: string; // YYYY-MM-DD
  score: number; // 0~100
}

/**
 * 외부 차트 라이브러리 없이 학습 점수 변화를 보여주는 SVG 꺾은선 그래프.
 * 스케치 5번의 "그래프 들어가는 곳(과목, 단원 누르면 학습 점수 변화 보여줌)"에 해당.
 * 선은 과목 색, 점은 그 시점 점수의 램프 색.
 */
export default function ScoreLineChart({
  points,
  color = "#18233A",
  height = 200,
}: {
  points: Point[];
  color?: string;
  height?: number;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-ink-muted">표시할 학습 기록이 없습니다.</p>;
  }

  const width = 640;
  const padL = 34;
  const padR = 20;
  const padT = 16;
  const padB = 30;
  const innerW = width - padL - padR;
  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0;

  const toX = (i: number) => (points.length > 1 ? padL + i * xStep : padL + innerW / 2);
  const toY = (score: number) =>
    padT + (1 - Math.max(0, Math.min(100, score)) / 100) * (height - padT - padB);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.score).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
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
            stroke={g === 0 ? "#A9B3AF" : "#E3E7E5"}
            strokeWidth={1}
          />
          <text x={padL - 8} y={toY(g) + 4} fontSize={11} textAnchor="end" fill="#5F6B7E">
            {g}
          </text>
        </g>
      ))}

      <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />

      {points.map((p, i) => (
        <g key={`${p.date}-${i}`}>
          <rect
            x={toX(i) - 5}
            y={toY(p.score) - 5}
            width={10}
            height={10}
            fill={scoreColor(p.score)}
            stroke={color}
            strokeWidth={2}
          />
          <text x={toX(i)} y={height - 9} fontSize={11} textAnchor="middle" fill="#5F6B7E">
            {`${Number(p.date.slice(5, 7))}.${Number(p.date.slice(8, 10))}`}
          </text>
        </g>
      ))}

      <text
        x={Math.min(toX(points.length - 1), width - padR - 4)}
        y={toY(last.score) - 12}
        fontSize={13}
        fontWeight={800}
        textAnchor={points.length > 1 ? "end" : "middle"}
        fill="#18233A"
      >
        {last.score}
      </text>
    </svg>
  );
}
