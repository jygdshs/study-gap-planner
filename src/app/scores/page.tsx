"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { StudyRecord, Subject } from "@/types/study";
import { buildUnitStatuses, scoreOfRecord, type UnitStatus } from "@/lib/scoring";
import ScoreLineChart from "@/components/ScoreLineChart";

export default function ScoresPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const [subjectsRes, recordsRes] = await Promise.all([
        supabase.from("subjects").select("*"),
        supabase.from("study_records").select("*"),
      ]);

      const firstError = subjectsRes.error ?? recordsRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      setSubjects((subjectsRes.data as Subject[]) ?? []);
      setRecords((recordsRes.data as StudyRecord[]) ?? []);
      setLoading(false);
    };

    load();
  }, []);

  const unitStatuses = useMemo(() => buildUnitStatuses(subjects, records), [subjects, records]);

  const columns = useMemo(
    () =>
      [...unitStatuses].sort((a, b) =>
        a.subjectName === b.subjectName
          ? a.unit.localeCompare(b.unit)
          : a.subjectName.localeCompare(b.subjectName)
      ),
    [unitStatuses]
  );

  const allDates = useMemo(
    () => Array.from(new Set(records.map((r) => r.study_date))).sort(),
    [records]
  );

  const cellScore = (date: string, unit: UnitStatus): number | null => {
    const onDate = records.filter(
      (r) => r.subject_id === unit.subjectId && r.unit === unit.unit && r.study_date === date
    );
    if (onDate.length === 0) return null;
    const latest = onDate.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).pop()!;
    return scoreOfRecord(latest).metricValue;
  };

  const selectedUnit = columns.find((c) => `${c.subjectId}::${c.unit}` === selectedKey) ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="rounded-xl bg-brand-orange px-6 py-5 text-center shadow-sm">
        <h1 className="text-lg font-bold text-brand-navy sm:text-xl">
          과목/단원 학습 점수 보기
        </h1>
      </header>

      <div className="flex justify-between text-sm">
        <Link href="/" className="text-brand-navy underline underline-offset-2">
          ← 처음으로
        </Link>
        <Link href="/plan" className="text-brand-navy underline underline-offset-2">
          학습 계획 보기 →
        </Link>
      </div>

      {!isSupabaseConfigured && (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Supabase 연결이 아직 설정되지 않았어요. README.md 1~2번을 참고해 `.env.local`을
          설정해 주세요.
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-600">
          데이터를 불러오지 못했어요: {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">학습 점수를 불러오는 중...</p>
      ) : columns.length === 0 ? (
        <p className="rounded-xl bg-white p-5 text-sm text-slate-500 shadow-sm">
          아직 학습 기록이 없어요.{" "}
          <Link href="/input" className="text-brand-navy underline underline-offset-2">
            학습 결과 입력
          </Link>
          에서 먼저 기록을 남겨 주세요.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-brand-navy">
              작성 일시 · 과목/단원별 학습 점수
            </h2>
            <p className="text-xs text-slate-400">
              과목/단원 이름을 누르면 아래에 점수 변화 그래프가 나옵니다.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-slate-200 bg-brand-blue/40 px-2 py-1 text-left font-medium text-brand-navy">
                      작성 일시 / 과목·단원
                    </th>
                    {columns.map((c) => {
                      const key = `${c.subjectId}::${c.unit}`;
                      return (
                        <th key={key} className="border border-slate-200 px-1 py-1">
                          <button
                            type="button"
                            onClick={() => setSelectedKey(key)}
                            className={`w-full rounded px-1 py-1 text-center font-medium ${
                              selectedKey === key
                                ? "bg-brand-navy text-white"
                                : "text-brand-navy hover:bg-brand-blue/40"
                            }`}
                          >
                            {c.subjectName}
                            <br />
                            {c.unit}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {allDates.map((date) => (
                    <tr key={date}>
                      <td className="border border-slate-200 px-2 py-1 text-slate-500">{date}</td>
                      {columns.map((c) => {
                        const key = `${c.subjectId}::${c.unit}`;
                        const score = cellScore(date, c);
                        return (
                          <td
                            key={key}
                            className="border border-slate-200 px-2 py-1 text-center text-slate-600"
                          >
                            {score === null ? "" : score}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-brand-navy">학습 점수 변화 그래프</h2>
            {selectedUnit ? (
              <>
                <p className="text-xs text-slate-500">
                  {selectedUnit.subjectName} · {selectedUnit.unit} ({selectedUnit.metricLabel}{" "}
                  기준, 최근 점수 {selectedUnit.finalScore}점)
                </p>
                <ScoreLineChart points={selectedUnit.history} />

                <div className="flex flex-col gap-1">
                  <h3 className="text-xs font-semibold text-brand-navy">틀린 이유 변화</h3>
                  <ul className="flex flex-col gap-1 text-xs text-slate-500">
                    {selectedUnit.wrongReasonsHistory.map((h, idx) => (
                      <li key={`${h.date}-${idx}`}>
                        <span className="font-medium text-slate-600">{h.date}</span>{" "}
                        {h.reasons.length > 0 ? h.reasons.join(", ") : "기록 없음"}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                위 표에서 과목·단원을 눌러 그래프를 확인해 보세요.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
