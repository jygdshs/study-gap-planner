"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { DAY_LABELS } from "@/types/study";

export default function AvailabilityPage() {
  const [hours, setHours] = useState<string[]>(Array(7).fill(""));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("weekly_availability")
        .select("*")
        .order("day_of_week", { ascending: true });

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else if (data) {
        const next = Array(7).fill("");
        data.forEach((row) => {
          next[row.day_of_week] = String(row.available_hours ?? 0);
        });
        setHours(next);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleChange = (idx: number, value: string) => {
    setHours((prev) => prev.map((h, i) => (i === idx ? value : h)));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const rows = hours.map((h, idx) => ({
      day_of_week: idx,
      available_hours: h === "" ? 0 : Number(h),
    }));

    const { error } = await supabase
      .from("weekly_availability")
      .upsert(rows, { onConflict: "day_of_week" });

    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: `저장 실패: ${error.message}` });
    } else {
      setMessage({ type: "ok", text: "요일별 공부 가능 시간이 저장되었습니다!" });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-10">
      <header className="rounded-xl bg-brand-orange px-6 py-5 text-center shadow-sm">
        <h1 className="text-lg font-bold text-brand-navy sm:text-xl">
          요일별 공부 가능 시간 설정
        </h1>
      </header>

      <Link href="/" className="text-sm text-brand-navy underline underline-offset-2">
        ← 처음으로
      </Link>

      {!isSupabaseConfigured && (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-800">
          Supabase 연결이 아직 설정되지 않았어요. 프로젝트 루트에 <code>.env.local</code> 을
          만들고 <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          값을 넣은 뒤 다시 실행해 주세요. (README.md 1~2번 참고)
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-xl bg-white p-5 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DAY_LABELS.map((label, idx) => (
              <label key={label} className="flex flex-col gap-1 text-xs text-slate-500">
                {label}요일 (시간)
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={hours[idx]}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-navy"
                />
              </label>
            ))}
          </div>
        )}

        {message && (
          <p
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === "ok"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-600"
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {saving ? "저장 중..." : "공부 가능 시간 저장하기"}
        </button>
      </section>
    </main>
  );
}
