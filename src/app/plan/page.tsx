"use client";

import { useState } from "react";
import Link from "next/link";
import { addDaysISO, dayOfWeekMonFirst, DAY_LABELS_FULL } from "@/lib/scoring";
import { colorOf } from "@/lib/palette";
import { ADHERENCE_DAYS, usePlanData } from "@/lib/usePlanData";
import PlanCell from "@/components/PlanCell";
import PriorityList from "@/components/PriorityList";
import Timetable from "@/components/Timetable";
import { ArrowRightIcon, CheckIcon, RefreshIcon } from "@/components/Icons";
import {
  ConfigNotice,
  ErrorNotice,
  LoadingSplit,
  PageFrame,
  PageHeader,
  ScoreLegend,
  SubjectChip,
} from "@/components/ui";

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export default function PlanPage() {
  const data = usePlanData();
  const {
    today,
    subjects,
    loading,
    error,
    planError,
    saving,
    message,
    subjectPriorities,
    planDays,
    colors,
    subjectNameById,
    itemsByDate,
    hasSavedPlan,
    planOutdated,
    adherence,
    adherenceSlots,
    pendingInputs,
    pastDates,
    savePlan,
    toggleItem,
    horizon,
    noStudyHours,
  } = data;

  // 계획 기간이 7일보다 길면(시험 일정) 한 주씩 나눠 보여준다
  const weeks: (typeof planDays)[] = [];
  for (let i = 0; i < planDays.length; i += 7) weeks.push(planDays.slice(i, i + 7));
  const [weekIdx, setWeekIdx] = useState(0);
  const currentWeek = weeks[Math.min(weekIdx, weeks.length - 1)] ?? [];

  const upToDate = hasSavedPlan && !planOutdated;
  const weekRange = `${shortDate(planDays[0].date)} – ${shortDate(planDays[planDays.length - 1].date)}`;
  const periodNote = horizon.lastExamDate
    ? `마지막 시험 ${shortDate(horizon.lastExamDate)} 전날까지 · ${planDays.length}일`
    : `시험 일정 없음 · 기본 ${planDays.length}일`;
  // 이행 기록 격자의 날짜 열: 6일 전 ~ 오늘
  const adherenceDates = Array.from({ length: ADHERENCE_DAYS }, (_, i) =>
    addDaysISO(today, i - (ADHERENCE_DAYS - 1))
  );

  return (
    <PageFrame>
      <PageHeader
        title="학습 계획"
        description="학습 점수가 낮은 단원부터, 요일별 공부 가능 시간과 시험 일정에 맞춰 계획을 세웁니다. 시험 일정이 없으면 7일 계획이에요."
      />

      <ConfigNotice />
      {error && <ErrorNotice>데이터를 불러오지 못했어요. {error}</ErrorNotice>}

      {loading ? (
        <LoadingSplit label="학습 점수와 계획을 계산하는 중…" />
      ) : error ? null : subjects.length === 0 ? (
        <div className="sheet flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] text-ink-soft">
            아직 등록된 과목이 없어요. 과목과 학습 결과를 입력하면 학습 점수와 계획이 계산됩니다.
          </p>
          <Link href="/input" className="btn-primary">
            학습 결과 입력하기 <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        // 좁은 화면 순서: 우선순위 → 시간표 → 이행. 넓은 화면: 왼쪽에 우선순위·이행, 오른쪽에 시간표.
        <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="sheet lg:col-start-1 lg:row-start-1" aria-labelledby="priority-title">
            <div className="sheet-head">
              <h2 id="priority-title" className="sheet-title">
                우선순위
              </h2>
              <span className="text-xs text-ink-muted">낮은 점수부터</span>
            </div>
            <PriorityList priorities={subjectPriorities} colors={colors} today={today} />
            <div className="border-t border-rule px-5 py-3">
              <ScoreLegend />
            </div>
          </section>

          <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <section className="sheet" aria-labelledby="timetable-title">
              <div className="sheet-head">
                <div className="flex flex-col gap-0.5">
                  <h2 id="timetable-title" className="text-[17px] font-bold tracking-tight">
                    학습 시간표 <span className="ml-1 font-semibold text-ink-muted">{weekRange}</span>
                  </h2>
                  <p className="text-[13px] text-ink-soft">
                    {periodNote}{" "}
                    <Link href="/exams" className="font-semibold text-[#2459C8] hover:underline">
                      시험 일정 {horizon.lastExamDate ? "바꾸기" : "넣기"}
                    </Link>
                  </p>
                  <p className={`text-[13px] ${planOutdated ? "font-semibold text-warn" : "text-ink-muted"}`}>
                    {planError
                      ? "저장되지 않은 추천 계획이에요."
                      : !hasSavedPlan
                        ? "점선 칸은 추천이에요. 저장해야 날마다 체크할 수 있어요."
                        : planOutdated
                          ? "새 학습 결과가 반영된 추천이 있어요. 갱신해도 완료한 칸은 남아요."
                          : "오늘까지의 칸은 눌러서 완료 체크하세요."}
                  </p>
                </div>
                {!planError && (
                  <button
                    type="button"
                    onClick={savePlan}
                    disabled={saving || upToDate}
                    className={upToDate ? "btn-quiet" : "btn-primary"}
                  >
                    {upToDate ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : hasSavedPlan ? (
                      <RefreshIcon className="h-4 w-4" />
                    ) : null}
                    {saving
                      ? "저장 중…"
                      : !hasSavedPlan
                        ? "이 계획 저장하기"
                        : planOutdated
                          ? "새 학습 점수로 계획 갱신"
                          : "최신 계획 저장됨"}
                  </button>
                )}
              </div>

              {planError && (
                <p className="notice-warn m-5 mb-0">
                  계획 저장용 <code>plan_items</code> 테이블을 불러오지 못했어요 ({planError}).
                  Supabase SQL Editor에서 <code>supabase/schema.sql</code>의 4번 블록을 실행하면
                  저장·이행 체크를 쓸 수 있어요.
                </p>
              )}

              {noStudyHours && (
                <p className="notice-warn m-5 mb-0">
                  요일별 공부 가능 시간이 모두 0시간이라 계획 칸이 비어 있어요.{" "}
                  <Link href="/availability" className="font-semibold underline">
                    공부 시간 정하기
                  </Link>
                </p>
              )}

              {weeks.length > 1 && (
                <div role="tablist" aria-label="주 선택" className="flex gap-1 overflow-x-auto px-5 pt-5">
                  {weeks.map((w, i) => {
                    const active = i === Math.min(weekIdx, weeks.length - 1);
                    const examCount = w.reduce((n, d) => n + d.exams.length, 0);
                    return (
                      <button
                        key={w[0].date}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setWeekIdx(i)}
                        className={`flex shrink-0 flex-col items-start border px-3 py-1.5 text-left transition-colors ${
                          active ? "border-shell bg-shell text-white" : "border-rule-strong bg-sheet hover:border-ink"
                        }`}
                      >
                        <span className="text-[13px] font-bold">{i + 1}주차</span>
                        <span className={`text-[12px] ${active ? "text-shell-text" : "text-ink-muted"}`}>
                          {shortDate(w[0].date)} – {shortDate(w[w.length - 1].date)}
                          {examCount > 0 && ` · 시험 ${examCount}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <Timetable key={currentWeek[0]?.date} data={data} days={currentWeek} />

              {message && (
                <p
                  role="status"
                  className={`mx-5 mb-5 ${message.type === "ok" ? "notice-ok" : "notice-error"}`}
                >
                  {message.text}
                </p>
              )}
            </section>

            {!planError && pastDates.length > 0 && (
              <section className="sheet" aria-labelledby="past-title">
                <div className="sheet-head">
                  <h2 id="past-title" className="sheet-title">
                    지난 계획
                  </h2>
                  <span className="text-xs text-ink-muted">늦게라도 지킨 칸은 체크하세요</span>
                </div>
                <ol>
                  {pastDates.map((date) => (
                    <li
                      key={date}
                      className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 border-b border-rule px-5 py-2.5 last:border-b-0"
                    >
                      <span className="text-sm font-bold">
                        {shortDate(date)}{" "}
                        <span className="font-semibold text-ink-muted">
                          {DAY_LABELS_FULL[dayOfWeekMonFirst(date)]}
                        </span>
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 sm:max-w-md">
                        {itemsByDate.get(date)!.map((it) => (
                          <PlanCell
                            key={it.id}
                            kind="saved"
                            compact
                            color={colorOf(colors, it.subject_id)}
                            subjectName={subjectNameById.get(it.subject_id) ?? "?"}
                            unit={it.unit}
                            completed={it.completed}
                            checkable
                            onToggle={() => toggleItem(it)}
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          {!planError && (
            <section className="sheet lg:col-start-1 lg:row-start-2" aria-labelledby="adherence-title">
              <div className="sheet-head">
                <h2 id="adherence-title" className="sheet-title">
                  계획 이행
                </h2>
                <span className="text-xs text-ink-muted">최근 {ADHERENCE_DAYS}일</span>
              </div>
              <div className="flex flex-col gap-4 px-5 py-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-[40px] font-extrabold leading-none tracking-[-0.03em]">
                    {adherence.rate === null ? "—" : `${adherence.rate}%`}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {adherence.total}칸 중 {adherence.completed}칸 완료
                  </span>
                </div>
                {adherenceSlots.length > 0 ? (
                  // 시간표 한 장을 축소한 이행 기록: 날짜 열 × 교시 행, 완료 칸은 과목 색으로 채움
                  <div
                    className="grid gap-px border border-rule bg-rule"
                    style={{ gridTemplateColumns: `repeat(${ADHERENCE_DAYS}, minmax(0, 1fr))` }}
                    role="img"
                    aria-label={`최근 ${ADHERENCE_DAYS}일 계획 ${adherence.total}칸 중 ${adherence.completed}칸 완료`}
                  >
                    {[0, 1].map((slot) =>
                      adherenceDates.map((date) => {
                        const it = adherenceSlots.find((s) => s.plan_date === date && s.slot === slot);
                        const c = it ? colorOf(colors, it.subject_id) : null;
                        return (
                          <span
                            key={`${slot}-${date}`}
                            title={
                              it
                                ? `${shortDate(date)} ${subjectNameById.get(it.subject_id) ?? ""} ${it.unit} — ${it.completed ? "완료" : "미완료"}`
                                : `${shortDate(date)} 계획 없음`
                            }
                            className="flex h-7 items-center justify-center bg-sheet"
                            style={
                              it && c
                                ? it.completed
                                  ? { backgroundColor: c, color: "#fff" }
                                  : { boxShadow: `inset 0 0 0 2px ${c}` }
                                : undefined
                            }
                          >
                            {it?.completed && <CheckIcon className="h-3.5 w-3.5" />}
                          </span>
                        );
                      })
                    )}
                    {adherenceDates.map((date) => (
                      <span
                        key={`d-${date}`}
                        className={`bg-sheet py-1 text-center text-[12px] ${date === today ? "font-bold text-ink" : "text-ink-muted"}`}
                      >
                        {DAY_LABELS_FULL[dayOfWeekMonFirst(date)]}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-ink-muted">
                    계획을 저장하고 칸을 체크하면 여기에 쌓여요.
                  </p>
                )}
              </div>

              {pendingInputs.length > 0 && (
                <div className="border-t border-rule px-5 py-4">
                  <h3 className="text-[14px] font-bold">결과 입력 필요</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                    계획을 지켰지만 새 결과가 없는 단원이에요. 입력하면 점수와 계획이 다시
                    계산됩니다.
                  </p>
                  <ul className="mt-3 flex flex-col">
                    {pendingInputs.map((it) => (
                      <li key={it.id}>
                        <Link
                          href={`/input?subject=${it.subject_id}&unit=${encodeURIComponent(it.unit)}`}
                          className="group flex items-center gap-2 border-t border-rule py-2.5 text-sm first:border-t-0"
                        >
                          <SubjectChip color={colorOf(colors, it.subject_id)} />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold">
                              {subjectNameById.get(it.subject_id) ?? "?"} {it.unit}
                            </span>
                            <span className="ml-2 text-xs text-ink-muted">
                              {shortDate(it.plan_date)} 완료
                            </span>
                          </span>
                          <span className="flex items-center gap-1 text-[13px] font-semibold text-[#2459C8] group-hover:underline">
                            결과 입력 <ArrowRightIcon className="h-3.5 w-3.5" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </PageFrame>
  );
}
