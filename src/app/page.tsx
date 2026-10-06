"use client";

import Link from "next/link";
import { usePlanData } from "@/lib/usePlanData";
import { colorOf } from "@/lib/palette";
import { DAY_LABELS_FULL, dayOfWeekMonFirst } from "@/lib/scoring";
import PlanCell from "@/components/PlanCell";
import PriorityList from "@/components/PriorityList";
import { ArrowRightIcon } from "@/components/Icons";
import { ConfigNotice, ErrorNotice, LoadingSplit, PageFrame } from "@/components/ui";

// 처음 화면 = 오늘의 시간표. 오늘 공부할 칸(바로 체크 가능), 이번 주 축소 시간표, 우선순위 상위 과목.

const CYCLE = [
  { href: "/input", label: "결과 입력" },
  { href: "/availability", label: "공부 시간" },
  { href: "/plan", label: "계획 · 체크" },
  { href: "/scores", label: "학습 점수" },
] as const;

export default function HomePage() {
  const data = usePlanData();
  const {
    today,
    loading,
    error,
    subjects,
    planDays,
    savedAt,
    colors,
    subjectNameById,
    toggleItem,
    isRestDay,
    subjectPriorities,
    hasSavedPlan,
    adherence,
  } = data;

  const todayPlan = planDays[0];
  const [, month, dayNum] = today.split("-").map(Number);
  const weekday = DAY_LABELS_FULL[dayOfWeekMonFirst(today)];

  const cycleLine = (
    <nav aria-label="사용 순서" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
      {CYCLE.map((step, i) => (
        <span key={step.href} className="flex items-center gap-2">
          <Link href={step.href} className="font-semibold text-ink-soft hover:text-ink hover:underline">
            {step.label}
          </Link>
          {i < CYCLE.length - 1 && <ArrowRightIcon className="h-3 w-3" />}
        </span>
      ))}
    </nav>
  );

  if (loading) {
    return (
      <PageFrame>
        <div className="pb-6 pt-10">
          <span className="block h-9 w-64 animate-pulse bg-rule" />
        </div>
        <LoadingSplit label="오늘의 계획을 불러오는 중…" />
      </PageFrame>
    );
  }

  // 아직 아무것도 없을 때: 무엇을 하는 도구인지 + 첫 행동
  if (error || subjects.length === 0) {
    return (
      <PageFrame>
        <div className="flex max-w-2xl flex-col gap-5 pb-10 pt-12">
          <ConfigNotice />
          {error && <ErrorNotice>데이터를 불러오지 못했어요. {error}</ErrorNotice>}
          <h1 className="text-[32px] font-extrabold leading-[1.18] tracking-[-0.035em] [text-wrap:balance] sm:text-[42px]">
            아는 것만 반복하지 않도록, 공백이 큰 단원부터.
          </h1>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-ink-soft">
            정답률, 개념 의미 유사도, 최근 학습일, 푼 문제 수, 시험까지 남은 날을 하나의 학습
            점수(0~100)로 합칩니다. 점수가 낮을수록 학습 공백이 큰 단원이고, 그 순서대로 요일별
            계획을 세웁니다.
          </p>
          <div>
            <Link href="/input" className="btn-primary">
              첫 학습 결과 입력하기 <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          <div className="border-t border-rule pt-4">{cycleLine}</div>
        </div>
      </PageFrame>
    );
  }

  const restToday = isRestDay(todayPlan);

  return (
    <PageFrame>
      <div className="flex flex-col gap-2 pb-6 pt-8 sm:pt-10">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[34px]">
          {month}월 {dayNum}일 {weekday}요일
        </h1>
        {cycleLine}
        <p className="text-[13px] text-ink-muted">결과를 다시 입력하면 점수와 계획이 새로 계산돼요.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 오늘 공부할 칸 */}
        <section className="sheet" aria-labelledby="today-title">
          <div className="sheet-head">
            <h2 id="today-title" className="text-[17px] font-bold tracking-tight">
              오늘 공부할 단원
            </h2>
            <span className="text-[13px] font-semibold text-ink-soft">
              공부 가능 {todayPlan.availableHours}시간
            </span>
          </div>
          <div className="flex flex-col gap-3 p-5">
            {restToday ? (
              <PlanCell kind="rest" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((slot) => {
                  const saved = savedAt(today, slot);
                  if (saved) {
                    return (
                      <PlanCell
                        key={`${slot}-${saved.id}`}
                        kind="saved"
                        color={colorOf(colors, saved.subject_id)}
                        subjectName={subjectNameById.get(saved.subject_id) ?? "?"}
                        unit={saved.unit}
                        completed={saved.completed}
                        checkable
                        onToggle={() => toggleItem(saved)}
                      />
                    );
                  }
                  const rec = todayPlan.items[slot];
                  return rec ? (
                    <PlanCell
                      key={`${slot}-rec`}
                      kind="suggested"
                      color={colorOf(colors, rec.subjectId)}
                      subjectName={rec.subjectName}
                      unit={rec.unit}
                    />
                  ) : (
                    <PlanCell key={`${slot}-empty`} kind="empty" />
                  );
                })}
              </div>
            )}
            <p className="text-[13px] leading-relaxed text-ink-muted">
              {restToday
                ? "오늘은 공부 가능 시간이 0시간이라 계획이 없어요."
                : hasSavedPlan
                  ? "공부를 마친 칸을 눌러 체크하세요."
                  : "점선 칸은 아직 저장하지 않은 추천이에요. 학습 계획에서 저장하면 체크할 수 있어요."}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
              <span className="text-[13px] text-ink-soft">
                최근 7일 이행{" "}
                <strong className="text-[16px] font-extrabold text-ink">
                  {adherence.rate === null ? "—" : `${adherence.rate}%`}
                </strong>
              </span>
              <Link href="/plan" className="btn-quiet">
                7일 시간표 보기 <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          {/* 이번 주 축소 시간표 */}
          <section className="sheet" aria-labelledby="week-title">
            <div className="sheet-head">
              <h2 id="week-title" className="sheet-title">
                이번 주 시간표
              </h2>
              <Link href="/plan" className="text-[13px] font-semibold text-[#2459C8] hover:underline">
                크게 보기
              </Link>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-7 gap-px border border-rule bg-rule">
                {planDays.map((day) => {
                  const isToday = day.date === today;
                  return (
                    <div
                      key={day.date}
                      className={`flex flex-col gap-1 p-1.5 ${
                        isToday
                          ? "bg-[#F1F3F7] outline outline-[3px] -outline-offset-[3px] outline-shell"
                          : "bg-sheet"
                      }`}
                    >
                      <span
                        className={`py-0.5 text-center text-[14px] font-extrabold ${isToday ? "bg-shell text-white" : ""}`}
                      >
                        {day.dayLabel}
                      </span>
                      {isRestDay(day) ? (
                        <span
                          className="h-[72px]"
                          title="쉬는 날"
                          style={{
                            backgroundImage:
                              "repeating-linear-gradient(135deg, #E9EDEB 0 5px, #FFFFFF 5px 10px)",
                          }}
                        />
                      ) : (
                        [0, 1].map((slot) => {
                          const saved = savedAt(day.date, slot);
                          const rec = day.items[slot];
                          const subjectId = saved?.subject_id ?? rec?.subjectId;
                          const unit = saved?.unit ?? rec?.unit;
                          if (!subjectId) return <span key={slot} className="min-h-[34px]" />;
                          const c = colorOf(colors, subjectId);
                          return (
                            <span
                              key={slot}
                              title={`${subjectNameById.get(subjectId) ?? ""} ${unit}${saved?.completed ? " (완료)" : ""}`}
                              aria-label={`${subjectNameById.get(subjectId) ?? ""} ${unit}${saved?.completed ? " 완료" : ""}`}
                              className="flex min-h-[34px] items-center px-1 py-0.5 text-[12px] font-bold leading-[1.2] sm:text-[13px]"
                              style={
                                saved
                                  ? saved.completed
                                    ? {
                                        backgroundColor: `color-mix(in srgb, ${c} 14%, white)`,
                                        color: c,
                                        textDecoration: "line-through",
                                      }
                                    : { backgroundColor: c, color: "#fff" }
                                  : { boxShadow: `inset 0 0 0 1px ${c}`, color: c }
                              }
                            >
                              <span className="line-clamp-2 break-all">{unit}</span>
                            </span>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 우선순위 상위 */}
          <section className="sheet" aria-labelledby="top-title">
            <div className="sheet-head">
              <h2 id="top-title" className="sheet-title">
                우선순위
              </h2>
              <Link href="/scores" className="text-[13px] font-semibold text-[#2459C8] hover:underline">
                점수 근거 보기
              </Link>
            </div>
            <PriorityList
              priorities={subjectPriorities.slice(0, 3)}
              colors={colors}
              today={today}
              showUnits={false}
            />
          </section>
        </div>
      </div>
    </PageFrame>
  );
}
