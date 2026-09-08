import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="rounded-xl bg-brand-orange px-6 py-5 text-center shadow-sm">
        <h1 className="text-lg font-bold text-brand-navy sm:text-xl">
          과목 입력 · 학습 공백 분석 및 개인별 학습 계획 추천 시스템
        </h1>
      </header>

      <p className="text-center text-sm text-slate-600">
        학번 2511 정영광 · 정보과학 프로젝트 (1단계: 입력 화면)
      </p>

      <nav className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/input"
          className="flex flex-col gap-2 rounded-xl border border-brand-blue bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="text-base font-semibold text-brand-navy">
            ① 학습 결과 입력
          </span>
          <span className="text-sm text-slate-600">
            과목 · 단원을 고르고, 문제 풀이 결과 또는 개념 이해 결과를 입력합니다.
          </span>
        </Link>

        <Link
          href="/availability"
          className="flex flex-col gap-2 rounded-xl border border-brand-blue bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="text-base font-semibold text-brand-navy">
            ② 요일별 공부 가능 시간
          </span>
          <span className="text-sm text-slate-600">
            월~일 요일마다 하루에 공부할 수 있는 시간을 설정합니다.
          </span>
        </Link>
      </nav>

      <p className="text-center text-xs text-slate-400">
        * 학습 점수 계산과 개인별 학습 계획(처리·출력 단계)은 다음 단계에서 구현합니다.
      </p>
    </main>
  );
}
