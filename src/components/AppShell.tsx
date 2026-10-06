"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TimetableMark } from "@/components/Icons";

const NAV = [
  { href: "/input", label: "결과 입력" },
  { href: "/availability", label: "공부 시간" },
  { href: "/plan", label: "학습 계획" },
  { href: "/scores", label: "학습 점수" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 bg-shell text-white">
        <div className="mx-auto flex max-w-7xl flex-col sm:h-14 sm:flex-row sm:items-stretch sm:justify-between sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 px-4 py-3 sm:px-0 sm:py-0"
            aria-label="학습 공백 분석 — 처음 화면"
          >
            <TimetableMark className="h-5 w-5" />
            <span className="text-[15px] font-bold tracking-tight">학습 공백 분석</span>
          </Link>

          <nav aria-label="주 메뉴" className="overflow-x-auto border-t border-shell-line sm:border-t-0">
            <ul className="flex h-full min-w-max">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href} className="flex">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center px-4 py-3 text-sm font-semibold transition-colors sm:py-0 ${
                        active ? "text-white" : "text-shell-text hover:text-white"
                      }`}
                    >
                      {item.label}
                      <span
                        aria-hidden
                        className={`absolute inset-x-4 bottom-0 h-[3px] bg-white transition-transform duration-200 ${
                          active ? "scale-x-100" : "scale-x-0"
                        }`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-rule">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-ink-muted sm:px-6">
          학습 공백 분석 및 개인별 학습 계획 추천 시스템 · 2511 정영광 · 정보과학 프로젝트
        </p>
      </footer>
    </div>
  );
}
