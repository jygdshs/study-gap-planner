"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, describeLoadError } from "@/lib/supabaseClient";
import {
  addDaysISO,
  dayOfWeekMonFirst,
  diffInDays,
  DAY_LABELS_FULL,
  planHorizon,
  todayISO,
} from "@/lib/scoring";
import { buildSubjectColorMap, colorOf } from "@/lib/palette";
import { ArrowRightIcon, CloseIcon, PlusIcon } from "@/components/Icons";
import { ConfigNotice, ErrorNotice, LoadingSplit, PageFrame, PageHeader, SubjectChip } from "@/components/ui";
import type { Subject } from "@/types/study";

// 8차시: 과목별 시험 날짜 입력.
// 시험 일정이 있으면 학습 계획은 오늘부터 마지막 시험 전날까지, 없으면 지금처럼 7일.

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export default function ExamsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  // 9차시: 과목 이름 수정·삭제
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = todayISO();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("subjects").select("*").order("created_at");
    if (error) {
      setLoadError(describeLoadError(error.message));
    } else {
      const list = (data as Subject[]) ?? [];
      setSubjects(list);
      setDates(Object.fromEntries(list.map((s) => [s.id, s.exam_date ?? ""])));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colors = buildSubjectColorMap(subjects);
  const changed = subjects.filter((s) => (s.exam_date ?? "") !== (dates[s.id] ?? ""));

  // 입력 중인 날짜로 미리 계산한 계획 기간
  const draftSubjects = subjects.map((s) => ({ ...s, exam_date: dates[s.id] || null }));
  const horizon = planHorizon(draftSubjects, today);
  const lastPlanDay = addDaysISO(today, horizon.days - 1);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    for (const s of changed) {
      const { error } = await supabase
        .from("subjects")
        .update({ exam_date: dates[s.id] || null })
        .eq("id", s.id);
      if (error) {
        setSaving(false);
        setMessage({ type: "error", text: `${s.name} 저장 실패: ${error.message}` });
        return;
      }
    }
    await load();
    setSaving(false);
    setMessage({ type: "ok", text: "시험 일정을 저장했어요. 학습 계획이 새 기간으로 다시 계산됩니다." });
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setMessage(null);
    const { error } = await supabase.from("subjects").insert({ name, exam_date: newDate || null });
    if (error) {
      setMessage({ type: "error", text: `과목 추가 실패: ${error.message}` });
      return;
    }
    setNewName("");
    setNewDate("");
    await load();
  };

  const startEdit = (s: Subject) => {
    setEditingId(s.id);
    setEditName(s.name);
    setConfirmDelete(false);
    setMessage(null);
  };

  const handleRename = async (s: Subject) => {
    const name = editName.trim();
    if (!name) {
      setMessage({ type: "error", text: "과목 이름을 입력해 주세요." });
      return;
    }
    if (name === s.name) {
      setEditingId(null);
      return;
    }
    setBusyId(s.id);
    const { error } = await supabase.from("subjects").update({ name }).eq("id", s.id);
    setBusyId(null);
    if (error) {
      setMessage({
        type: "error",
        text: error.message.includes("duplicate")
          ? "같은 이름의 과목이 이미 있어요."
          : `이름 변경 실패: ${error.message}`,
      });
      return;
    }
    setEditingId(null);
    await load();
    setMessage({ type: "ok", text: `과목 이름을 ‘${name}’(으)로 바꿨어요.` });
  };

  const handleDelete = async (s: Subject) => {
    setBusyId(s.id);
    // 기록·계획 칸은 DB에서 함께 지워진다 (subject_id on delete cascade)
    const { error } = await supabase.from("subjects").delete().eq("id", s.id);
    setBusyId(null);
    if (error) {
      setMessage({ type: "error", text: `과목 삭제 실패: ${error.message}` });
      return;
    }
    setEditingId(null);
    await load();
    setMessage({ type: "ok", text: `‘${s.name}’ 과목과 그 기록·계획을 지웠어요.` });
  };

  // 달력: 오늘이 있는 주 월요일부터 마지막 시험이 있는 주 일요일까지
  const calendarEnd = horizon.lastExamDate ?? lastPlanDay;
  const calStart = addDaysISO(today, -dayOfWeekMonFirst(today));
  const calDays = diffInDays(calendarEnd, calStart) + 1;
  const calLength = Math.ceil(calDays / 7) * 7;
  const examsOn = (d: string) => draftSubjects.filter((s) => s.exam_date === d);

  return (
    <PageFrame>
      <PageHeader
        title="시험 일정"
        description="과목마다 시험 날짜를 넣으면 오늘부터 마지막 시험 전날까지 계획을 세워요. 비워 두면 지금처럼 7일 계획이에요."
        action={
          <div className="flex flex-col items-start gap-0.5 sm:items-end">
            <span className="text-sm text-shell-text">학습 계획 기간</span>
            <span className="text-[26px] font-extrabold tracking-tight text-white">
              {shortDate(today)} – {shortDate(lastPlanDay)}{" "}
              <span className="text-[17px] font-bold text-shell-text">{horizon.days}일</span>
            </span>
          </div>
        }
      />
      <ConfigNotice />
      {loadError && <ErrorNotice>시험 일정을 불러오지 못했어요. {loadError}</ErrorNotice>}

      {loading ? (
        <LoadingSplit label="과목을 불러오는 중…" />
      ) : (
        <div className="rise-stagger grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* 과목별 시험 날짜 */}
          <section className="sheet" aria-labelledby="exam-list-title">
            <div className="sheet-head">
              <h2 id="exam-list-title" className="sheet-title">
                과목별 시험 날짜
              </h2>
              <span className="text-xs text-ink-muted">비우면 시험 없음</span>
            </div>

            {subjects.length === 0 ? (
              <p className="px-5 py-4 text-[14px] text-ink-soft">아직 과목이 없어요. 아래에서 추가하세요.</p>
            ) : (
              <ul>
                {subjects.map((s) => {
                  const value = dates[s.id] ?? "";
                  const dday = value ? diffInDays(value, today) : null;
                  return (
                    <li
                      key={s.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-rule px-5 py-3 sm:grid-cols-[minmax(0,1fr)_180px_88px]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <SubjectChip color={colorOf(colors, s.id)} />
                        <span className="truncate text-[16px] font-bold">{s.name}</span>
                        {editingId !== s.id && (
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="shrink-0 border border-rule-strong px-1.5 py-px text-[12px] font-semibold text-ink-soft hover:border-ink hover:text-ink"
                          >
                            편집
                          </button>
                        )}
                      </span>
                      <span className="flex items-center gap-1 sm:order-none">
                        <input
                          type="date"
                          value={value}
                          onChange={(e) => {
                            setMessage(null);
                            setDates((prev) => ({ ...prev, [s.id]: e.target.value }));
                          }}
                          aria-label={`${s.name} 시험 날짜`}
                          className="field py-2 text-[14px]"
                        />
                        {value && (
                          <button
                            type="button"
                            onClick={() => setDates((prev) => ({ ...prev, [s.id]: "" }))}
                            aria-label={`${s.name} 시험 날짜 지우기`}
                            className="flex h-9 w-9 shrink-0 items-center justify-center text-ink-muted hover:bg-ground hover:text-ink"
                          >
                            <CloseIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                      <span
                        className={`col-span-2 text-[13px] font-semibold sm:col-span-1 sm:text-right ${
                          dday === null ? "text-ink-muted" : dday < 0 ? "text-ink-muted" : "text-danger"
                        }`}
                      >
                        {dday === null ? (
                          "시험 없음"
                        ) : dday <= 0 ? (
                          <Link href="/results" className="text-accent hover:underline">
                            {dday === 0 ? "오늘 시험 · 결과 입력" : "시험 끝남 · 결과 입력"}
                          </Link>
                        ) : (
                          `D-${dday}`
                        )}
                      </span>

                      {editingId === s.id && (
                        <div className="col-span-full mt-2 flex flex-col gap-2 border border-rule bg-sheet-alt p-3">
                          <div className="flex gap-2">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleRename(s)}
                              aria-label="과목 이름"
                              className="field py-2 text-[14px]"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleRename(s)}
                              disabled={busyId === s.id}
                              className="btn-primary shrink-0 py-2"
                            >
                              이름 저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="btn-quiet shrink-0 py-2"
                            >
                              닫기
                            </button>
                          </div>
                          {confirmDelete ? (
                            <div className="flex flex-wrap items-center justify-between gap-2 border border-danger/40 px-3 py-2 text-[13px]">
                              <span>
                                ‘{s.name}’과 이 과목의 <strong>학습 기록·계획 칸이 모두</strong> 지워져요.
                              </span>
                              <span className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(s)}
                                  disabled={busyId === s.id}
                                  className="bg-danger px-2.5 py-1 text-[12px] font-bold text-sheet disabled:opacity-60"
                                >
                                  {busyId === s.id ? "삭제 중…" : "모두 삭제"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(false)}
                                  className="border border-rule-strong px-2.5 py-1 text-[12px] font-semibold"
                                >
                                  취소
                                </button>
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(true)}
                              className="self-start text-[12px] font-semibold text-danger hover:underline"
                            >
                              과목 삭제…
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* 과목 추가 */}
            <div className="grid gap-2 border-b border-rule bg-sheet-alt px-5 py-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="새 과목명 (예: 영어)"
                aria-label="새 과목명"
                className="field py-2 text-[14px]"
              />
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                aria-label="새 과목 시험 날짜"
                className="field py-2 text-[14px]"
              />
              <button type="button" onClick={handleAdd} disabled={!newName.trim()} className="btn-quiet py-2">
                <PlusIcon className="h-4 w-4" />
                과목 추가
              </button>
            </div>

            <div className="flex flex-col gap-3 p-5">
              {message && (
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
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || changed.length === 0}
                className="btn-primary"
              >
                {saving
                  ? "저장 중…"
                  : changed.length === 0
                    ? "바뀐 날짜 없음"
                    : `시험 일정 저장하기 (${changed.length}과목)`}
              </button>
            </div>
          </section>

          {/* 시험까지 달력 */}
          <section className="sheet" aria-labelledby="exam-cal-title">
            <div className="sheet-head">
              <h2 id="exam-cal-title" className="sheet-title">
                {horizon.lastExamDate ? "시험까지 달력" : "기본 계획 기간 (7일)"}
              </h2>
              <span className="text-xs text-ink-muted">진한 칸 = 계획 기간</span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-7 gap-px border border-rule bg-rule">
                {DAY_LABELS_FULL.map((d) => (
                  <span key={d} className="bg-sheet py-1.5 text-center text-[13px] font-bold text-ink-soft">
                    {d}
                  </span>
                ))}
                {Array.from({ length: calLength }, (_, i) => {
                  const date = addDaysISO(calStart, i);
                  const inPlan = date >= today && date <= lastPlanDay;
                  const isToday = date === today;
                  const exams = examsOn(date);
                  return (
                    <div
                      key={date}
                      style={{ animationDelay: `${260 + i * 14}ms` }}
                      className={`cell-pop flex min-h-[64px] flex-col gap-1 p-1.5 ${
                        isToday
                          ? "bg-today outline outline-[3px] -outline-offset-[3px] outline-mark"
                          : inPlan
                            ? "bg-sheet"
                            : "bg-sheet-muted"
                      }`}
                    >
                      <span
                        className={`text-[12px] font-semibold ${
                          date < today ? "text-rule-strong" : inPlan || exams.length ? "text-ink" : "text-ink-muted"
                        }`}
                      >
                        {isToday ? "오늘" : shortDate(date)}
                      </span>
                      {inPlan && !exams.length && <span className="mt-auto h-1 bg-mark/70" aria-hidden />}
                      {exams.map((s) => (
                        <span
                          key={s.id}
                          className="truncate px-1 py-0.5 text-[12px] font-bold text-white"
                          style={{ backgroundColor: colorOf(colors, s.id) }}
                          title={`${s.name} 시험`}
                        >
                          {s.name} 시험
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                시험을 본 날부터 그 과목은 계획에서 빠지고, 시험이 가까운 과목일수록 그날 계획에서
                먼저 배정돼요.
              </p>
            </div>
          </section>
        </div>
      )}
    </PageFrame>
  );
}
