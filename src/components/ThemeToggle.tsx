"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/Icons";
// 첫 화면에서 테마를 먼저 정하는 스크립트는 src/lib/themeScript.ts (서버 레이아웃에서 쓰므로 분리)

// 라이트/다크 모드 전환.
// - 처음에는 기기 설정(prefers-color-scheme)을 따른다.
// - 버튼으로 고르면 localStorage('theme')에 기억하고, 그 뒤로는 기기 설정보다 우선한다.
// html[data-theme]는 layout.tsx의 THEME_INIT_SCRIPT가 화면을 그리기 전에 먼저 정해 둔다(깜빡임 방지).


type Theme = "light" | "dark";

function readStored(): Theme | null {
  try {
    const s = localStorage.getItem("theme");
    return s === "light" || s === "dark" ? s : null;
  } catch {
    return null;
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

    // 직접 고른 적이 없으면 기기 설정이 바뀔 때 따라간다
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStored()) return;
      const next: Theme = media.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    media.addEventListener("change", onChange);

    // 상단 메뉴에는 휴대폰용·PC용 버튼이 따로 있으므로, 어느 쪽에서 바꿔도 아이콘이 같이 바뀌게 한다
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      media.removeEventListener("change", onChange);
      observer.disconnect();
    };
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // 저장이 막힌 환경(시크릿 모드 등)에서는 이번 화면에서만 바뀐다
    }
    setTheme(next);
  };

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 바꾸기" : "다크 모드로 바꾸기"}
      title={isDark ? "라이트 모드" : "다크 모드"}
      className="flex h-8 w-8 items-center justify-center border border-white/25 text-white transition-colors hover:bg-white/10"
    >
      {theme === null ? null : isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
}
