"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { DAY_LABELS, type DaySchedule } from "@/types/study";
import { addDaysISO, dayOfWeekMonFirst, DAY_LABELS_FULL, todayISO } from "@/lib/scoring";
import { normalizeTime, toMinutes } from "@/lib/schedule";
import { formatMinutes } from "@/lib/allocation";
import { ArrowRightIcon, CloseIcon, MinusIcon, PlusIcon } from "@/components/Icons";
import { ConfigNotice, ErrorNotice, PageFrame, PageHeader } from "@/components/ui";

// 요일별 공부 시간 + 공부 시간대.
//  - 시간대(시작~끝) 안에서 '공부할 시간'만큼 공부하고, 남는 시간은 쉬는 시간으로 나눈다 (src/lib/schedule.ts)
//  - 특정 날 일정: 그날만 공부 시간·시간대를 따로 정한다 (학원 보강, 가족 행사 등). 계획은 그날 이 값을 쓴다.

const STEP = 0.5;
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

interface DayRow {
  hours: string;
  start: string; // "HH:MM" 또는 ""
  end: string;
}

/** 공부 시간과 시간대가 맞는지. 문제가 없으면 null, 있으면 이유 */
function windowProblem(hours: number, start: string, end: string): string | null {
  if (!start && !end) return null;
  if (!start || !end) return "시작과 끝을 둘 다 정해 주세요.";
  const len = toMinutes(end) - toMinutes(start);
  if (len <= 0) return "끝 시각이 시작보다 늦어야 해요.";
  if (hours * 60 > len) return `시간대(${formatMinutes(len)})보다 공부 시간이 길어요.`;
  return null;
}

/** 시간대 안에서 쉬는 시간(분). 시간대가 없거나 맞지 않으면 null */
function restMinutes(hours: number, start: string, end: string): number | null {
  if (!start || !end || windowProblem(hours, start, end)) return null;
  return toMinutes(end) - toMinutes(start) - Math.round(hours * 60);
}

export default function AvailabilityPage() {
  const { user } = useAuth();
  const today = todayISO();
  const [rows, setRows] = useState<DayRow[]>(Array.from({ length: 7 }, () => ({ hours: "", start: "", end: "" })));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  // 005 마이그레이션(시간대 열, day_schedules 테이블)을 실행했는지
  const [hasWindows, setHasWindows] = useState(false);
  const [specials, setSpecials] = useState<DaySchedule[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [weeklyRes, windowCheck, specialRes] = await Promise.all([
        supabase.from("weekly_availability").select("*").order("day_of_week", { ascending: true }),
        supabase.from("weekly_availability").select("start_time, end_time").limit(1),
        supabase.from("day_schedules").select("*").gte("date", today).order("date", { ascending: true }),
      ]);

      if (weeklyRes.error) {
        setLoadError(describeLoadError(weeklyRes.error.message));
      } else if (weeklyRes.data) {
        const next: DayRow[] = Array.from({ length: 7 }, () => ({ hours: "", start: "", end: "" }));
        weeklyRes.data.forEach((row) => {
          next[row.day_of_week] = {
            hours: String(row.available_hours ?? 0),
            start: normalizeTime(row.start_time) ?? "",
            end: normalizeTime(row.end_time) ?? "",
          };
        });
        setRows(next);
      }
      setHasWindows(!windowCheck.error && !specialRes.error);
      setSpecials(specialRes.error ? [] : ((specialRes.data as DaySchedule[]) ?? []));
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (idx: number, patch: Partial<DayRow>) => {
    setMessage(null);
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const nudge = (idx: number, delta: number) => {
    const current = rows[idx].hours === "" ? 0 : Number(rows[idx].hours);
    const next = Math.max(0, Math.min(24, Math.round((current + delta) / STEP) * STEP));
    update(idx, { hours: String(next) });
  };

  /** 이 요일의 시간대를 다른 요일에도 똑같이 (공부 시간은 그대로) */
  const copyWindow = (idx: number, targets: number[]) => {
    setMessage(null);
    const { start, end } = rows[idx];
    setRows((prev) => prev.map((r, i) => (targets.includes(i) ? { ...r, start, end } : r)));
  };

  const values = rows.map((r) => (r.hours === "" ? 0 : Number(r.hours) || 0));
  const problems = rows.map((r, i) => windowProblem(values[i], r.start, r.end));
  const weekTotal = values.reduce((a, b) => a + b, 0);
  const scaleMax = Math.max(4, ...values);

  const handleSave = async () => {
    const bad = problems.findIndex((p) => p !== null);
    if (bad >= 0) {
      setMessage({ type: "error", text: `${DAY_LABELS[bad]}요일: ${problems[bad]}` });
      return;
    }
    setSaving(true);
    setMessage(null);

    // 8차시: 요일별 시간은 사용자마다 7행 → (user_id, day_of_week) 기준으로 덮어쓴다
    const payload = rows.map((r, idx) => ({
      user_id: user?.id,
      day_of_week: idx,
      available_hours: values[idx],
      ...(hasWindows ? { start_time: r.start || null, end_time: r.end || null } : {}),
    }));

    const { error } = await supabase.from("weekly_availability").upsert(payload, { onConflict: "user_id,day_of_week" });
    setSaving(false);
    setMessage(
      error
        ? { type: "error", text: `저장 실패: ${error.message}` }
        : { type: "ok", text: "요일별 공부 시간이 저장되었습니다!" }
    );
  };

  return (
    <PageFrame>
      <PageHeader
        title="요일별 공부 시간"
        description="요일마다 공부할 시간대와 그 안에서 공부할 시간을 정해요. 남는 시간은 쉬는 시간으로 나눠 하루 시간표를 만듭니다."
        action={
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-shell-text">한 주 합계</span>
            <span className="text-[30px] font-extrabold tracking-tight text-white">{weekTotal}시간</span>
          </div>
        }
      />
      <ConfigNotice />
      {loadError && <ErrorNotice>공부 시간을 불러오지 못했어요. {loadError}</ErrorNotice>}
      {!loading && !loadError && !hasWindows && (
        <p className="notice-warn mb-6">
          공부 시간대와 특정 날 일정을 저장하려면 Supabase SQL Editor에서{" "}
          <code>supabase/migrations/005_time_windows.sql</code>을 한 번 실행해 주세요. 지금은 하루 공부 시간만 저장돼요.
        </p>
      )}

      <div className="rise-stagger flex flex-col gap-6">
        <section className="sheet" aria-labelledby="week-title" aria-busy={loading}>
          <div className="sheet-head">
            <h2 id="week-title" className="sheet-title">
              한 주 시간표
            </h2>
            <span className="text-xs text-ink-muted">공부 시간 0.5시간 단위 · 시간대는 선택</span>
          </div>

          <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4 lg:grid-cols-7">
            {DAY_LABELS.map((label, idx) => {
              const v = values[idx];
              const row = rows[idx];
              const rest = restMinutes(v, row.start, row.end);
              const problem = problems[idx];
              return (
                <div key={label} className="flex flex-col gap-3 bg-sheet p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[20px] font-extrabold leading-none">{label}</span>
                    <span className="text-xs text-ink-muted">{v === 0 ? "쉬는 날" : `${v}시간`}</span>
                  </div>

                  {/* 막대: 하루 공부 가능 시간 */}
                  <div className="relative h-20 bg-ground" aria-hidden>
                    <div
                      className="bar-rise absolute inset-x-0 bottom-0 bg-mark transition-[height] duration-300 ease-out"
                      style={{ height: `${(v / scaleMax) * 100}%`, animationDelay: `${220 + idx * 60}ms` }}
                    />
                    {Array.from({ length: Math.floor(scaleMax) - 1 }, (_, i) => (
                      <span
                        key={i}
                        className="absolute inset-x-0 h-px bg-sheet/60"
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
                      className="w-9 shrink-0 border border-rule-strong text-ink hover:bg-ground disabled:text-rule-strong disabled:hover:bg-sheet"
                    >
                      <MinusIcon className="mx-auto h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={STEP}
                      value={row.hours}
                      disabled={loading}
                      onChange={(e) => update(idx, { hours: e.target.value })}
                      aria-label={`${label}요일 공부할 시간(시간)`}
                      className="field -mx-px min-w-0 rounded-none px-1 text-center text-[17px] font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => nudge(idx, STEP)}
                      disabled={loading}
                      aria-label={`${label}요일 30분 늘리기`}
                      className="w-9 shrink-0 border border-rule-strong text-ink hover:bg-ground disabled:text-rule-strong"
                    >
                      <PlusIcon className="mx-auto h-4 w-4" />
                    </button>
                  </div>

                  {/* 공부 시간대 */}
                  {hasWindows && v > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-rule pt-3">
                      <span className="text-[12px] font-semibold text-ink-soft">공부 시간대</span>
                      <TimeField
                        label="시작"
                        value={row.start}
                        onChange={(start) => update(idx, { start })}
                        ariaLabel={`${label}요일 공부 시작 시각`}
                      />
                      <TimeField
                        label="끝"
                        value={row.end}
                        onChange={(end) => update(idx, { end })}
                        ariaLabel={`${label}요일 공부 끝 시각`}
                      />
                      <p className={`text-[12px] leading-snug ${problem ? "font-semibold text-danger" : "text-ink-muted"}`}>
                        {problem ??
                          (rest === null
                            ? "시간대를 정하면 쉬는 시간까지 나눠요."
                            : rest === 0
                              ? "쉬는 시간 없이 꽉 차요."
                              : `쉬는 시간 ${formatMinutes(rest)}`)}
                      </p>
                      {row.start && row.end && !problem && (
                        <button
                          type="button"
                          onClick={() => copyWindow(idx, idx < 5 ? [0, 1, 2, 3, 4] : [5, 6])}
                          className="self-start text-[12px] font-semibold text-accent hover:underline"
                        >
                          {idx < 5 ? "평일 모두 이 시간대로" : "주말 모두 이 시간대로"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {/* 2칸·4칸 배치에서 남는 8번째 자리: 빈 괘선 대신 한 주 요약 */}
            <div className="flex flex-col justify-center gap-1 bg-sheet p-4 lg:hidden">
              <span className="text-[13px] font-semibold text-ink-muted">한 주 합계</span>
              <span className="text-[28px] font-extrabold leading-none tracking-tight">{weekTotal}시간</span>
              <span className="text-[13px] text-ink-muted">하루 평균 {Math.round((weekTotal / 7) * 10) / 10}시간</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-rule p-5 sm:flex-row sm:items-center sm:justify-between">
            {message ? (
              <div
                role={message.type === "error" ? "alert" : "status"}
                className={`flex flex-wrap items-center gap-3 ${message.type === "ok" ? "notice-ok" : "notice-error"}`}
              >
                <span>{message.text}</span>
                {message.type === "ok" && (
                  <Link href="/plan" className="flex items-center gap-1 font-semibold underline">
                    계획 보기 <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-xs text-ink-muted">
                저장하면 학습 계획의 칸당 시간과 하루 시간표(공부·쉬는 시간)가 바뀌어요.
              </p>
            )}
            <button type="button" onClick={handleSave} disabled={saving || loading} className="btn-primary sm:min-w-[200px]">
              {saving ? "저장 중…" : "공부 시간 저장하기"}
            </button>
          </div>
        </section>

        {hasWindows && (
          <SpecialDays
            today={today}
            specials={specials}
            setSpecials={setSpecials}
            weekly={rows}
            userId={user?.id}
          />
        )}
      </div>
    </PageFrame>
  );
}

function TimeField({
  label,
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[12px] text-ink-muted">{label}</span>
      <input
        type="time"
        step={300}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="field min-w-0 px-2 py-1.5 text-[14px] tabular-nums"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// 특정 날 일정
// ---------------------------------------------------------------------------

const EMPTY_FORM = { date: "", off: false, hours: "", start: "", end: "", note: "" };

function SpecialDays({
  today,
  specials,
  setSpecials,
  weekly,
  userId,
}: {
  today: string;
  specials: DaySchedule[];
  setSpecials: (fn: (prev: DaySchedule[]) => DaySchedule[]) => void;
  weekly: DayRow[];
  userId: string | undefined;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const set = (patch: Partial<typeof EMPTY_FORM>) => {
    setMessage(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  // 날짜를 고르면 그 요일의 평소 설정을 채워 두고 바꿀 부분만 고치게 한다
  const pickDate = (date: string) => {
    const existing = specials.find((s) => s.date === date);
    if (existing) {
      set({
        date,
        off: Number(existing.available_hours) === 0,
        hours: String(existing.available_hours),
        start: normalizeTime(existing.start_time) ?? "",
        end: normalizeTime(existing.end_time) ?? "",
        note: existing.note ?? "",
      });
      return;
    }
    const w = date ? weekly[dayOfWeekMonFirst(date)] : null;
    set({ date, off: false, hours: w?.hours ?? "", start: w?.start ?? "", end: w?.end ?? "", note: "" });
  };

  const hours = form.off ? 0 : Number(form.hours) || 0;
  const problem = !form.date
    ? "날짜를 골라 주세요."
    : form.date < today
      ? "오늘 이후 날짜만 정할 수 있어요."
      : form.off
        ? null
        : hours <= 0
          ? "공부할 시간을 넣거나 '공부 안 함'을 고르세요."
          : windowProblem(hours, form.start, form.end);
  const rest = form.off ? null : restMinutes(hours, form.start, form.end);
  const editing = specials.some((s) => s.date === form.date);

  const save = async () => {
    if (problem) {
      setMessage({ type: "error", text: problem });
      return;
    }
    setSaving(true);
    const row = {
      user_id: userId,
      date: form.date,
      available_hours: hours,
      start_time: form.off ? null : form.start || null,
      end_time: form.off ? null : form.end || null,
      note: form.note.trim() || null,
    };
    const { data, error } = await supabase
      .from("day_schedules")
      .upsert(row, { onConflict: "user_id,date" })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setMessage({ type: "error", text: `저장 실패: ${error.message}` });
      return;
    }
    setSpecials((prev) =>
      [...prev.filter((s) => s.date !== form.date), data as DaySchedule].sort((a, b) => (a.date < b.date ? -1 : 1))
    );
    setMessage({ type: "ok", text: `${shortDate(form.date)} 일정을 저장했어요. 학습 계획에 바로 반영돼요.` });
    setForm(EMPTY_FORM);
  };

  const remove = async (date: string) => {
    const { error } = await supabase.from("day_schedules").delete().eq("date", date);
    if (error) {
      setMessage({ type: "error", text: `삭제 실패: ${error.message}` });
      return;
    }
    setSpecials((prev) => prev.filter((s) => s.date !== date));
    if (form.date === date) setForm(EMPTY_FORM);
    setMessage({ type: "ok", text: `${shortDate(date)} 일정을 지웠어요. 그날은 다시 요일별 시간을 써요.` });
  };

  return (
    <section className="sheet" aria-labelledby="special-title">
      <div className="sheet-head">
        <h2 id="special-title" className="sheet-title">
          특정 날 일정
        </h2>
        <span className="text-xs text-ink-muted">그날만 요일별 시간 대신 적용돼요</span>
      </div>

      <div className="grid gap-px bg-rule lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* 입력 */}
        <div className="flex flex-col gap-4 bg-sheet p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
              <span className="field-label">날짜</span>
              <input
                type="date"
                min={today}
                max={addDaysISO(today, 365)}
                value={form.date}
                onChange={(e) => pickDate(e.target.value)}
                className="field"
              />
            </label>
            <fieldset className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
              <legend className="field-label mb-1.5">그날은</legend>
              <div className="flex border border-rule-strong">
                {[
                  { off: false, label: "시간 바꾸기" },
                  { off: true, label: "공부 안 함" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={form.off === o.off}
                    onClick={() => set({ off: o.off })}
                    className={`flex-1 px-2 py-2 text-[13px] font-semibold ${
                      form.off === o.off ? "bg-mark text-on-mark" : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {!form.off && (
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="field-label">공부할 시간</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={STEP}
                  value={form.hours}
                  onChange={(e) => set({ hours: e.target.value })}
                  className="field px-2 text-right tabular-nums"
                  placeholder="시간"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="field-label">시작</span>
                <input
                  type="time"
                  step={300}
                  value={form.start}
                  onChange={(e) => set({ start: e.target.value })}
                  className="field px-2 tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="field-label">끝</span>
                <input
                  type="time"
                  step={300}
                  value={form.end}
                  onChange={(e) => set({ end: e.target.value })}
                  className="field px-2 tabular-nums"
                />
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="field-label">
              메모 <span className="font-normal text-ink-muted">(선택)</span>
            </span>
            <input
              type="text"
              maxLength={40}
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="예: 학원 보강, 가족 모임"
              className="field"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-[13px] ${form.date && problem ? "font-semibold text-danger" : "text-ink-muted"}`}>
              {form.date && problem
                ? problem
                : form.off
                  ? "그날은 계획을 비워요."
                  : rest === null
                    ? "시간대를 비워 두면 시간만 바뀌어요."
                    : `공부 ${formatMinutes(Math.round(hours * 60))} · 쉬는 시간 ${formatMinutes(rest)}`}
            </p>
            <div className="flex gap-2">
              {form.date && (
                <button type="button" onClick={() => setForm(EMPTY_FORM)} className="btn-quiet">
                  취소
                </button>
              )}
              <button type="button" onClick={save} disabled={saving || !form.date} className="btn-primary">
                {saving ? "저장 중…" : editing ? "일정 고치기" : "일정 추가"}
              </button>
            </div>
          </div>
          {message && (
            <p role={message.type === "error" ? "alert" : "status"} className={message.type === "ok" ? "notice-ok" : "notice-error"}>
              {message.text}
            </p>
          )}
        </div>

        {/* 목록 */}
        <div className="bg-sheet">
          {specials.length === 0 ? (
            <p className="p-5 text-[14px] leading-relaxed text-ink-muted">
              아직 정한 날이 없어요. 시험 전 보강이나 가족 행사처럼 평소와 다른 날을 넣으면, 그날 계획과 하루 시간표가 그
              일정에 맞춰 다시 짜여요.
            </p>
          ) : (
            <ul>
              {specials.map((s) => {
                const h = Number(s.available_hours);
                const start = normalizeTime(s.start_time);
                const end = normalizeTime(s.end_time);
                const usual = weekly[dayOfWeekMonFirst(s.date)];
                return (
                  <li
                    key={s.date}
                    className={`flex items-center gap-3 border-b border-rule px-5 py-3 last:border-b-0 ${
                      form.date === s.date ? "bg-today" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => pickDate(s.date)}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                      aria-label={`${shortDate(s.date)} 일정 고치기`}
                    >
                      <span className="text-[15px] font-bold">
                        {shortDate(s.date)}{" "}
                        <span className="font-semibold text-ink-muted">{DAY_LABELS_FULL[dayOfWeekMonFirst(s.date)]}</span>
                        <span className="ml-2 text-[14px] font-semibold">
                          {h === 0 ? "공부 안 함" : `${h}시간${start && end ? ` · ${start}–${end}` : ""}`}
                        </span>
                      </span>
                      <span className="truncate text-[12px] text-ink-muted">
                        {s.note ? `${s.note} · ` : ""}평소 {usual.hours || 0}시간
                        {usual.start && usual.end ? ` ${usual.start}–${usual.end}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.date)}
                      aria-label={`${shortDate(s.date)} 일정 지우기`}
                      title="지우기"
                      className="p-1.5 text-ink-muted hover:bg-ground hover:text-danger"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
