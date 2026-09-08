import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "학습 공백 분석 시스템 - 입력",
  description: "학습 공백 분석 및 개인별 학습 계획 추천 시스템 (입력 단계)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
