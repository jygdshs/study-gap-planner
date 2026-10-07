import type { KeywordMatch } from "@/lib/keywords";

// 개념 의미 채점 근거: 기준 의미의 핵심어 하나하나가 내 설명에 들어 있었는지
//  - 맞춤(0.8점 이상): 초록 테두리
//  - 비슷함(부분 점수): 호박 점선 + 내가 쓴 비슷한 말
//  - 빠짐(0점): 주홍 테두리 + 취소선

export default function KeywordMatches({ matches }: { matches: KeywordMatch[] }) {
  if (matches.length === 0) return null;
  const hit = matches.filter((m) => m.credit >= 0.8).length;
  const missed = matches.filter((m) => m.credit === 0).length;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-ink-soft">
        핵심어 {matches.length}개 중 <strong className="text-ink">{hit}개</strong> 맞춤
        {missed > 0 && (
          <>
            , <strong className="text-danger">{missed}개</strong> 빠짐
          </>
        )}
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="핵심어 채점">
        {matches.map((m) => {
          const kind = m.credit >= 0.8 ? "hit" : m.credit > 0 ? "near" : "miss";
          return (
            <li
              key={m.keyword}
              title={
                kind === "hit"
                  ? "맞춤"
                  : kind === "near"
                    ? `비슷한 말 "${m.matchedWith}" (${Math.round(m.credit * 100)}%)`
                    : "내 설명에 없음"
              }
              className={`border px-2 py-0.5 text-[13px] font-semibold ${
                kind === "hit"
                  ? "border-ok text-ok"
                  : kind === "near"
                    ? "border-dashed border-warn text-warn"
                    : "border-danger/60 text-danger line-through decoration-1"
              }`}
            >
              {m.keyword}
              {kind === "near" && (
                <span className="ml-1 font-normal opacity-80">≈ {m.matchedWith}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
