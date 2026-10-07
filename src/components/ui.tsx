// 여러 화면이 같이 쓰는 작은 표시 요소들.

import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { scoreColor } from "@/lib/palette";
import { AlertIcon } from "@/components/Icons";

const BAND_DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

/**
 * 화면 제목 + 진남색 밴드.
 * 상단 메뉴의 진남색이 그대로 내려와 제목을 감싸고, 그 아래 흰 시트들이 밴드 끝에 살짝 걸친다.
 * 밴드 안에는 큰 시간표의 머리줄처럼 아주 옅은 요일 글자와 세로 괘선이 깔린다.
 */
export function PageHeader({
  title,
  description,
  action,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-header relative -mb-12 pb-[84px] pt-8 text-white sm:pt-12">
      <div
        aria-hidden
        className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden bg-shell"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          backgroundPosition: "center top",
        }}
      >
        <div className="relative mx-auto h-full max-w-7xl">
          <div className="band-rise absolute bottom-12 right-0 hidden select-none md:flex">
            {BAND_DAYS.map((d) => (
              <span
                key={d}
                className="flex w-[84px] items-end justify-center border-l border-white/[0.07] pb-1 text-[84px] font-extrabold leading-[0.8] text-white/[0.05] lg:w-[104px] lg:text-[104px]"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[38px]">
            {title}
          </h1>
          {description && (
            <p className="max-w-[60ch] text-[15px] leading-relaxed text-shell-text">{description}</p>
          )}
          {children}
        </div>
        {action}
      </div>
    </div>
  );
}

export function PageFrame({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <main
      className={`relative isolate mx-auto flex w-full flex-col px-4 pb-16 sm:px-6 ${narrow ? "max-w-3xl" : "max-w-7xl"}`}
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
  delay = 0,
}: {
  score: number;
  className?: string;
  thick?: boolean;
  /** 처음 나타날 때 왼쪽에서 차오르는 시간차(ms) — 목록에서 순서대로 */
  delay?: number;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <span
      role="img"
      aria-label={`학습 점수 ${score}점`}
      className={`relative block overflow-hidden bg-ground ${thick ? "h-3" : "h-2"} ${className ?? "w-full"}`}
    >
      <span
        className="bar-grow absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: scoreColor(clamped), animationDelay: `${delay}ms` }}
      />
      {[25, 50, 75].map((t) => (
        <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-sheet" style={{ left: `${t}%` }} />
      ))}
    </span>
  );
}

/** 점수 램프 범례 (0~100, 낮을수록 공백이 큼) */
export function ScoreLegend({ onDark }: { onDark?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${onDark ? "text-shell-text" : "text-ink-muted"}`}>
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
    <div className="rise-stagger grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true">
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
