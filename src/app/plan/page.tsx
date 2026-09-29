"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { StudyRecord, Subject, WeeklyAvailability } from "@/types/study";
import {
  buildStudyPlan,
  buildSubjectPriorities,
  buildUnitStatuses,
  type SubjectPriority,
  type PlanDay,
} from "@/lib/scoring";

export default function PlanPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [availability, setAvailability] = useState<WeeklyAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const [subjectsRes, recordsRes, availabilityRes] = await Promise.all([
        supabase.from("subjects").select("*"),
        supabase.from("study_records").select("*"),
        supabase.from("weekly_availability").select("*"),
      ]);

      const firstError = subjectsRes.error ?? recordsRes.error ?? availabilityRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      setSubjects((subjectsRes.data as Subject[]) ?? []);
      setRecords((recordsRes.data as StudyRecord[]) ?? []);
      setAvailability((availabilityRes.data as WeeklyAvailability[]) ?? []);
      setLoading(false);
    };

    load();
  }, []);

  const unitStatuses = buildUnitStatuses(subjects, records);
  const subjectPriorities: SubjectPriority[] = buildSubjectPriorities(subjects, unitStatuses);
  const planDays: PlanDay[] = buildStudyPlan(subjectPriorities, availability);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="rounded-xl bg-brand-orange px-6 py-5 text-center shadow-sm">
        <h1 className="text-lg font-bold text-brand-navy sm:text-xl">
          과목 입력 · 학습 공백 분석 및 개인별 학습 계획 추천 시스템
        </h1>
      </header>

      <Link href="/" className="text-sm text-brand-navy underline underline-offset-2">
        ← 처음으로
      </Link>

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
        <p className="text-sm text-slate-400">학습 계획을 계산하는 중...</p>
      ) : subjects.length === 0 ? (
        <p className="rounded-xl bg-white p-5 text-sm text-slate-500 shadow-sm">
          아직 등록된 과목이 없어요.{" "}
          <Link href="/input" className="text-brand-navy underline underline-offset-2">
            학습 결과 입력
          </Link>
          에서 과목과 학습 기록을 먼저 추가해 주세요.
        </p>
      ) : (
        <>
          {/* 과목별 우선순위 (처리 결과) */}
          <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-brand-navy">과목별 학습 점수 · 우선순위</h2>
            <p className="text-xs text-slate-400">
              점수가 낮을수록 학습 공백이 크다는 뜻이라 먼저 공부해야 할 과목입니다.
            </p>
            <ol className="flex flex-col gap-2">
              {subjectPriorities.map((sp, idx) => (
                <li
                  key={sp.subject.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-brand-navy">{sp.subject.name}</span>
                    {sp.subject.exam_date && (
                      <span className="text-xs text-slate-400">시험: {sp.subject.exam_date}</span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="font-semibold text-brand-navy">{sp.score}점</span>
                    {!sp.hasRecords && (
                      <span className="ml-2 text-xs text-slate-400">(기록 없음)</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* 요일별 학습 계획 (출력) */}
          <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-brand-navy">요일별 개인 학습 계획</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed border-collapse text-xs">
                <thead>
                  <tr>
                    {planDays.map((day) => (
                      <th
                        key={day.date}
                        className="border border-slate-200 bg-brand-blue/40 px-2 py-1 text-center font-medium text-brand-navy"
                      >
                        {day.date.slice(5)} ({day.dayLabel})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1].map((row) => (
                    <tr key={row}>
                      {planDays.map((day) => (
                        <td
                          key={day.date}
                          className="border border-slate-200 px-2 py-2 text-center align-top text-slate-600"
                        >
                          {day.items[row]
                            ? `${day.items[row].subjectName} ${day.items[row].unit}`
                            : "--"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    {planDays.map((day) => (
                      <td
                        key={day.date}
                        className="border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[10px] text-slate-400"
                      >
                        공부 가능 {day.availableHours}시간
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/input"
              className="rounded-xl bg-brand-orange px-4 py-3 text-center text-sm font-semibold text-brand-navy shadow-sm"
            >
              새 학습 결과 입력하기
            </Link>
            <Link
              href="/scores"
              className="rounded-xl bg-brand-navy px-4 py-3 text-center text-sm font-semibold text-white shadow-sm"
            >
              학습 점수 보러 가기
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
