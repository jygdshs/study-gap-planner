"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import { DAY_LABELS } from "@/types/study";
import { ArrowRightIcon, MinusIcon, PlusIcon } from "@/components/Icons";
import { ConfigNotice, ErrorNotice, PageFrame, PageHeader } from "@/components/ui";

const STEP = 0.5;

export default function AvailabilityPage() {
  const [hours, setHours] = useState<string[]>(Array(7).fill(""));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("weekly_availability")
        .select("*")
        .order("day_of_week", { ascending: true });

      if (error) {
        setLoadError(describeLoadError(error.message));
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
    setMessage(null);
    setHours((prev) => prev.map((h, i) => (i === idx ? value : h)));
  };

  const nudge = (idx: number, delta: number) => {
    const current = hours[idx] === "" ? 0 : Number(hours[idx]);
    const next = Math.max(0, Math.min(24, Math.round((current + delta) / STEP) * STEP));
    handleChange(idx, String(next));
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

  const values = hours.map((h) => (h === "" ? 0 : Number(h) || 0));
  const weekTotal = values.reduce((a, b) => a + b, 0);
  const scaleMax = Math.max(4, ...values);

  return (
    <PageFrame>
      <PageHeader
        title="요일별 공부 시간"
        description="요일마다 하루에 공부할 수 있는 시간이에요. 0시간인 날은 계획을 비워 둡니다."
        action={
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-ink-soft">한 주 합계</span>
            <span className="text-[28px] font-extrabold tracking-tight">{weekTotal}시간</span>
          </div>
        }
      />
      <ConfigNotice />
      {loadError && <ErrorNotice>공부 시간을 불러오지 못했어요. {loadError}</ErrorNotice>}

      <section className="sheet" aria-labelledby="week-title" aria-busy={loading}>
        <div className="sheet-head">
          <h2 id="week-title" className="sheet-title">
            한 주 시간표
          </h2>
          <span className="text-xs text-ink-muted">0.5시간 단위</span>
        </div>

        <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4 lg:grid-cols-7">
          {DAY_LABELS.map((label, idx) => {
            const v = values[idx];
            return (
              <div key={label} className="flex flex-col gap-3 bg-sheet p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[20px] font-extrabold leading-none">{label}</span>
                  <span className="text-xs text-ink-muted">{v === 0 ? "쉬는 날" : `${v}시간`}</span>
                </div>

                {/* 막대: 하루 공부 가능 시간 */}
                <div className="relative h-24 bg-ground" aria-hidden>
                  <div
                    className="absolute inset-x-0 bottom-0 bg-shell transition-[height] duration-300 ease-out"
                    style={{ height: `${(v / scaleMax) * 100}%` }}
                  />
                  {Array.from({ length: Math.floor(scaleMax) - 1 }, (_, i) => (
                    <span
                      key={i}
                      className="absolute inset-x-0 h-px bg-sheet/70"
                      style={{ bottom: `${((i + 1) / scaleMax) * 100}%` }}
                    />
                  ))}
                </div>

                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => nudge(idx, -STEP)}
                    disabled={loading || v <= 0}
                    aria-label={`${label}요일 30분 줄이기`}
                    className="w-9 shrink-0 border border-rule-strong text-ink hover:bg-ground disabled:text-rule-strong disabled:hover:bg-sheet">
                    <MinusIcon className="mx-auto h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={STEP}
                    value={hours[idx]}
                    disabled={loading}
                    onChange={(e) => handleChange(idx, e.target.value)}
                    aria-label={`${label}요일 공부 가능 시간(시간)`}
                    className="field -mx-px min-w-0 rounded-none px-1 text-center text-[17px] font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => nudge(idx, STEP)}
                    disabled={loading}
                    aria-label={`${label}요일 30분 늘리기`}
                    className="w-9 shrink-0 border border-rule-strong text-ink hover:bg-ground disabled:text-rule-strong">
                    <PlusIcon className="mx-auto h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t border-rule p-5 sm:flex-row sm:items-center sm:justify-between">
          {message ? (
            <div
              role={message.type === "error" ? "alert" : "status"}
              className={`flex flex-wrap items-center gap-3 ${
                message.type === "ok" ? "notice-ok" : "notice-error"
              }`}
            >
              <span>{message.text}</span>
              {message.type === "ok" && (
                <Link href="/plan" className="flex items-center gap-1 font-semibold underline">
                  계획 보기 <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">저장하면 학습 계획의 칸당 시간이 바뀌어요.</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-primary sm:min-w-[200px]"
          >
            {saving ? "저장 중…" : "공부 시간 저장하기"}
          </button>
        </div>
      </section>
    </PageFrame>
  );
}
