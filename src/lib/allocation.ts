// 9차시: 점수에 따른 시간 배분.
// 하루 공부 가능 시간을 그날 계획 칸들에 나눌 때, 학습 점수가 낮은(공백이 큰) 단원에 더 많이 준다.
//  - 가중치 = (110 - 학습 점수)²   → 공백이 클수록 훨씬 더 많이, 100점이어도 복습 시간은 받는다
//  - 10분 단위로 반올림, 칸마다 최소 20분 (하루 시간이 모자라면 똑같이 나눔)
//  - 반올림 오차는 가장 취약한 칸에 더하거나 빼서 합계가 정확히 하루 시간이 되게 한다

const STEP = 10;
const MIN_MINUTES = 20;
const BASE = 110;

export function allocateMinutes(totalHours: number, scores: number[]): number[] {
  const total = Math.round(totalHours * 60);
  const n = scores.length;
  if (n === 0 || total <= 0) return scores.map(() => 0);
  if (n === 1) return [total];

  // 최소 시간도 못 줄 만큼 짧은 날은 똑같이 나눈다
  if (total < MIN_MINUTES * n) {
    const even = Math.floor(total / n / STEP) * STEP;
    const out = scores.map(() => even);
    out[0] += total - even * n;
    return out;
  }

  const weights = scores.map((s) => (BASE - Math.max(0, Math.min(100, s))) ** 2);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) =>
    Math.max(MIN_MINUTES, Math.round((total * w) / sum / STEP) * STEP)
  );

  // 합계 맞추기: 가장 취약한(가중치가 큰) 칸에서 조정
  let diff = total - out.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => [w, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  for (const i of order) {
    if (diff === 0) break;
    const next = Math.max(MIN_MINUTES, out[i] + diff);
    diff -= next - out[i];
    out[i] = next;
  }
  return out;
}

/** 분 → "1시간 30분" / "40분" */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0분";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
