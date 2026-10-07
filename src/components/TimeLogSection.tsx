"use client";

import { useState } from "react";
import { colorOf } from "@/lib/palette";
import { formatMinutes } from "@/lib/allocation";
import { dayOfWeekMonFirst, DAY_LABELS_FULL } from "@/lib/scoring";
import type { PlanData } from "@/lib/usePlanData";
import type { PlanItem } from "@/types/study";
import { SubjectChip } from "@/components/ui";

// 계획 vs 실제: 최근 7일 계획 칸마다 실제로 공부한 시간(분)을 적고, 계획 시간과 비교한다.
// 적은 시간은 주간 리포트의 '공부 시간 누적'에 과목·단원별로 쌓인다.

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export default function TimeLogSection({ data }: { data: PlanData }) {
  const { adherenceSlots, plannedMinutesOf, setActualMinutes, hasTimeColumns, colors, subjectNameById } = data;
  const rows = [...adherenceSlots].sort((a, b) =>
    a.plan_date === b.plan_date ? a.slot - b.slot : a.plan_date < b.plan_date ? 1 : -1
  );

  const logged = rows.filter((it) => it.actual_minutes != null);
  const plannedOfLogged = logged.reduce((s, it) => s + (plannedMinutesOf(it) ?? 0), 0);
  const actualOfLogged = logged.reduce((s, it) => s + (it.actual_minutes ?? 0), 0);
  const ratio = plannedOfLogged > 0 ? Math.round((actualOfLogged / plannedOfLogged) * 100) : null;

  return (
    <section className="sheet" aria-labelledby="timelog-title">
      <div className="sheet-head">
        <h2 id="timelog-title" className="sheet-title">
          계획 vs 실제 공부 시간
        </h2>
        <span className="text-xs text-ink-muted">최근 7일 · 분 단위</span>
      </div>

      {!hasTimeColumns ? (
        <p className="notice-warn m-5">
          실제 공부 시간을 저장하려면 Supabase SQL Editor에서{" "}
          <code>supabase/migrations/004_plan_minutes.sql</code>을 한 번 실행해 주세요.
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-[14px] text-ink-muted">계획을 저장하면 칸마다 실제 공부 시간을 적을 수 있어요.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-rule px-5 py-4">
            {logged.length === 0 ? (
              <p className="text-[14px] text-ink-soft">공부를 마친 칸에 실제로 걸린 시간을 적어 보세요.</p>
            ) : (
              <>
                <span className="text-[14px] text-ink-soft">
                  계획 <strong className="text-ink">{formatMinutes(plannedOfLogged)}</strong> → 실제{" "}
                  <strong className="text-[20px] font-extrabold text-ink">{formatMinutes(actualOfLogged)}</strong>
                </span>
                {ratio !== null && (
                  <span
                    className={`text-[14px] font-bold ${ratio >= 90 ? "text-ok" : ratio >= 60 ? "text-warn" : "text-danger"}`}
                  >
                    계획의 {ratio}%
                  </span>
                )}
                <span className="text-xs text-ink-muted">
                  {rows.length}칸 중 {logged.length}칸 기록
                </span>
              </>
            )}
          </div>
          <ol>
            {rows.map((it) => (
              <TimeRow
                key={`${it.id}-${it.actual_minutes ?? ""}`}
                item={it}
                planned={plannedMinutesOf(it)}
                color={colorOf(colors, it.subject_id)}
                name={subjectNameById.get(it.subject_id) ?? "?"}
                onSave={(m) => setActualMinutes(it, m)}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function TimeRow({
  item,
  planned,
  color,
  name,
  onSave,
}: {
  item: PlanItem;
  planned: number | null;
  color: string;
  name: string;
  onSave: (minutes: number | null) => Promise<boolean>;
}) {
  const [value, setValue] = useState(item.actual_minutes == null ? "" : String(item.actual_minutes));
  const [invalid, setInvalid] = useState(false);
  const actual = item.actual_minutes;
  const max = Math.max(planned ?? 0, actual ?? 0, 1);

  const commit = async () => {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isInteger(next) || next < 0 || next > 1440)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (next === (actual ?? null)) return;
    await onSave(next);
  };

  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-rule px-5 py-2.5 last:border-b-0">
      <span className="text-[13px] font-bold">
        {shortDate(item.plan_date)}
        <span className="ml-1 font-semibold text-ink-muted">{DAY_LABELS_FULL[dayOfWeekMonFirst(item.plan_date)]}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-[14px]">
        <SubjectChip color={color} />
        <span className="truncate">
          <span className="text-ink-soft">{name}</span> <strong>{item.unit}</strong>
          {item.completed && <span className="ml-1.5 text-xs font-semibold text-ok">완료</span>}
        </span>
      </span>
      <label className="flex items-center gap-1.5 text-[13px] text-ink-soft">
        <span className="hidden sm:inline">계획 {planned === null ? "—" : `${planned}분`} · 실제</span>
        <span className="sm:hidden">실제</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={1440}
          step={10}
          value={value}
          placeholder={planned === null ? "분" : String(planned)}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-invalid={invalid}
          aria-label={`${name} ${item.unit} 실제 공부 시간(분)`}
          className={`field w-[72px] py-1 text-right tabular-nums ${invalid ? "border-danger" : ""}`}
        />
        <span>분</span>
      </label>
      {/* 계획(테두리) 위에 실제(과목 색)를 겹친 막대 */}
      <div className="col-span-3 col-start-1 sm:col-span-2 sm:col-start-2">
        <div className="relative h-1.5 bg-ground" role="img" aria-label={`계획 ${planned ?? 0}분, 실제 ${actual ?? 0}분`}>
          {planned !== null && (
            <span
              className="absolute inset-y-0 left-0 border border-rule-strong"
              style={{ width: `${(planned / max) * 100}%` }}
            />
          )}
          {actual != null && actual > 0 && (
            <span className="absolute inset-y-0 left-0" style={{ width: `${(actual / max) * 100}%`, backgroundColor: color }} />
          )}
        </div>
      </div>
    </li>
  );
}
