"use client";

interface Point {
  date: string; // YYYY-MM-DD
  score: number; // 0~100
}

/**
 * 외부 차트 라이브러리 없이 학습 점수 변화를 보여주는 간단한 SVG 꺾은선 그래프.
 * 스케치 5번의 "그래프 들어가는 곳(과목, 단원 누르면 학습 점수 변화 보여줌)"에 해당.
 */
export default function ScoreLineChart({
  points,
  height = 180,
}: {
  points: Point[];
  height?: number;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-400">표시할 학습 기록이 없습니다.</p>;
  }

  const width = 640;
  const padding = 36;
  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const toX = (i: number) => padding + i * xStep;
  const toY = (score: number) =>
    height - padding - (Math.max(0, Math.min(100, score)) / 100) * (height - padding * 2);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.score).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="학습 점수 변화 그래프"
    >
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line
            x1={padding}
            x2={width - padding}
            y1={toY(g)}
            y2={toY(g)}
            stroke="#dbeafe"
            strokeWidth={1}
          />
          <text x={2} y={toY(g) + 4} fontSize={10} fill="#64748b">
            {g}
          </text>
        </g>
      ))}

      <path d={pathD} fill="none" stroke="#0f4c66" strokeWidth={2} />

      {points.map((p, i) => (
        <g key={`${p.date}-${i}`}>
          <circle cx={toX(i)} cy={toY(p.score)} r={3.5} fill="#f4a97c" stroke="#0f4c66" strokeWidth={1} />
          <text x={toX(i)} y={height - 8} fontSize={9} textAnchor="middle" fill="#64748b">
            {p.date.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}
