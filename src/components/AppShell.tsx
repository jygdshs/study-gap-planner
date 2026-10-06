"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { TimetableMark } from "@/components/Icons";
import { useAuth } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/input", label: "결과 입력" },
  { href: "/availability", label: "공부 시간" },
  { href: "/exams", label: "시험 일정" },
  { href: "/plan", label: "학습 계획" },
  { href: "/scores", label: "학습 점수" },
] as const;

const LOGIN_PATH = "/login";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, user, loading, signOut } = useAuth();
  const onLogin = pathname === LOGIN_PATH;

  // 8차시: 로그인하지 않았으면 로그인 화면으로, 로그인했는데 로그인 화면이면 처음 화면으로
  useEffect(() => {
    if (loading) return;
    if (!session && !onLogin) router.replace(LOGIN_PATH);
    if (session && onLogin) router.replace("/");
  }, [loading, session, onLogin, router]);

  // 로그인 여부를 확인하는 동안(또는 이동하는 동안)에는 데이터 화면을 그리지 않는다
  const ready = !loading && (session ? !onLogin : onLogin);

  const account = session && (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="max-w-[180px] truncate text-shell-text" title={user?.email ?? ""}>
        {user?.email}
      </span>
      <button
        type="button"
        onClick={signOut}
        className="border border-white/25 px-2.5 py-1 font-semibold text-white transition-colors hover:bg-white/10"
      >
        로그아웃
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-shell text-white">
        <div className="mx-auto flex max-w-7xl flex-col sm:h-14 sm:flex-row sm:items-stretch sm:justify-between sm:px-6">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-0 sm:py-0">
            <Link href="/" className="flex items-center gap-2.5" aria-label="학습 공백 분석 — 처음 화면">
              <TimetableMark className="h-5 w-5" />
              <span className="text-[15px] font-bold tracking-tight">학습 공백 분석</span>
            </Link>
            <div className="flex items-center gap-3 sm:hidden">
              {account}
              <ThemeToggle />
            </div>
          </div>

          {session && (
            <div className="flex items-stretch gap-6">
              <nav aria-label="주 메뉴" className="overflow-x-auto border-t border-shell-line sm:border-t-0">
                <ul className="flex h-full min-w-max">
                  {NAV.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <li key={item.href} className="flex">
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={`relative flex items-center px-4 py-3 text-sm font-semibold transition-colors sm:px-3 sm:py-0 lg:px-4 ${
                            active ? "text-white" : "text-shell-text hover:text-white"
                          }`}
                        >
                          {item.label}
                          <span
                            aria-hidden
                            className={`absolute inset-x-4 bottom-0 h-[3px] bg-white transition-transform duration-200 sm:inset-x-3 lg:inset-x-4 ${
                              active ? "scale-x-100" : "scale-x-0"
                            }`}
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="hidden items-center sm:flex">{account}</div>
            </div>
          )}
          <div className="hidden items-center pl-4 sm:flex">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex-1">
        {ready ? (
          children
        ) : (
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-ink-muted" aria-busy="true">
            로그인 확인 중…
          </div>
        )}
      </div>

      <footer className="border-t border-rule">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-ink-muted sm:px-6">
          학습 공백 분석 및 개인별 학습 계획 추천 시스템 · 2511 정영광 · 정보과학 프로젝트
        </p>
      </footer>
    </div>
  );
}
