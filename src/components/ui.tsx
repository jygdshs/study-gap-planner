// 여러 화면이 같이 쓰는 작은 표시 요소들.

import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { scoreColor } from "@/lib/palette";
import { AlertIcon } from "@/components/Icons";

/** 화면 제목. 큰 제목 + 한 줄 설명, 오른쪽에 화면별 동작을 둘 수 있다. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 pt-8 sm:flex-row sm:items-end sm:justify-between sm:pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function PageFrame({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full flex-col px-4 pb-16 sm:px-6 ${narrow ? "max-w-3xl" : "max-w-7xl"}`}
    >
      {children}
    </main>
  );
}

/** 과목 색 칩: 과목 색 코드가 이름보다 먼저 읽히도록 */
export function SubjectChip({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className ?? "h-3 w-3"}`}
      style={{ backgroundColor: color }}
    />
  );
}

/** 학습 점수 0~100 고정 램프 막대 */
export function ScoreBar({
  score,
  className,
  thick,
}: {
  score: number;
  className?: string;
  thick?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <span
      role="img"
      aria-label={`학습 점수 ${score}점`}
      className={`relative block overflow-hidden bg-ground ${thick ? "h-3" : "h-2"} ${className ?? "w-full"}`}
    >
      <span
        className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: scoreColor(clamped) }}
      />
      {[25, 50, 75].map((t) => (
        <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-sheet" style={{ left: `${t}%` }} />
      ))}
    </span>
  );
}

/** 점수 램프 범례 (0~100, 낮을수록 공백이 큼) */
export function ScoreLegend() {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-muted">
      <span>공백 큼</span>
      <span className="flex">
        {[10, 30, 50, 70, 90].map((s) => (
          <span key={s} className="h-2.5 w-5" style={{ backgroundColor: scoreColor(s) }} />
        ))}
      </span>
      <span>공백 작음</span>
    </div>
  );
}

export function ConfigNotice() {
  if (isSupabaseConfigured) return null;
  return (
    <p className="notice-warn mb-6">
      Supabase 연결이 아직 설정되지 않았어요. 프로젝트 루트의 <code>.env.local</code>에{" "}
      <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>를 넣고 다시
      실행해 주세요. (README 1~2번)
    </p>
  );
}

export function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="notice-error mb-6 flex items-start gap-2">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * 불러오는 중: 다 불러온 뒤와 같은 자리(왼쪽 목록 시트 + 오른쪽 격자 시트)에
 * 괘선만 그려 둔다. 데이터가 들어와도 화면이 튀지 않는다.
 */
export function LoadingSplit({ label }: { label: string }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true">
      <div className="sheet">
        <div className="sheet-head">
          <span className="text-sm text-ink-muted">{label}</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 border-b border-rule px-5 py-4 last:border-b-0">
            <span className="h-4 w-2/3 animate-pulse bg-ground" />
            <span className="h-2 w-full animate-pulse bg-ground" />
          </div>
        ))}
      </div>
      <div className="sheet">
        <div className="sheet-head">
          <span className="h-4 w-40 animate-pulse bg-ground" />
        </div>
        <div className="p-5">
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-px border border-rule bg-rule">
            {Array.from({ length: 32 }, (_, i) => (
              <span
                key={i}
                className={`bg-sheet ${i < 8 ? "h-12" : i >= 24 ? "h-10" : "h-20 md:h-24"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
