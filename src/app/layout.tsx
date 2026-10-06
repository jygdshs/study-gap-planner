import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth";
import { THEME_INIT_SCRIPT } from "@/lib/themeScript";
// 한국어 UI 본문 서체: Pretendard (가변, 필요한 글자만 내려받는 동적 서브셋).
// CDN이 아니라 npm 패키지에서 불러와 앱과 함께 배포된다 → 발표 때 네트워크가 느려도 서체가 바뀌지 않는다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "학습 공백 분석",
  description: "학습 공백 분석 및 개인별 학습 계획 추천 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 화면을 그리기 전에 라이트/다크를 정해 깜빡임을 막는다 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
