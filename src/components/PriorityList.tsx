import { colorOf } from "@/lib/palette";
import { diffInDays, type SubjectPriority } from "@/lib/scoring";
import { ScoreBar, SubjectChip } from "@/components/ui";

/** 열이 고정된 우선순위 순위표: 순위 · 과목 색 · 과목 · 점수 램프 · 점수, 아래에 단원 */
export default function PriorityList({
  priorities,
  colors,
  today,
  showUnits = true,
}: {
  priorities: SubjectPriority[];
  colors: Map<string, string>;
  today: string;
  showUnits?: boolean;
}) {
  return (
    <ol>
      {priorities.map((sp, idx) => {
        const color = colorOf(colors, sp.subject.id);
        const dday = sp.subject.exam_date ? diffInDays(sp.subject.exam_date, today) : null;
        return (
          <li key={sp.subject.id} className="border-b border-rule last:border-b-0">
            <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 px-5 pb-2 pt-3.5">
              <span className="text-[22px] font-extrabold leading-none tracking-tight">{idx + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                <SubjectChip color={color} />
                <span className="truncate text-[16px] font-bold">{sp.subject.name}</span>
                {dday !== null && dday >= 0 && (
                  <span className="shrink-0 text-[13px] font-semibold text-danger">
                    시험 D-{dday === 0 ? "DAY" : dday}
                  </span>
                )}
              </span>
              <span className="text-right text-[18px] font-extrabold">
                {sp.hasRecords ? sp.score : "—"}
              </span>
              <span />
              <ScoreBar score={sp.hasRecords ? sp.score : 0} className="col-span-2 mt-2 w-full" />
            </div>
            {showUnits && sp.units.length > 0 && (
              <ul className="pb-3 pl-[60px] pr-5">
                {sp.units.map((u) => (
                  <li
                    key={u.unit}
                    className="grid grid-cols-[minmax(0,1fr)_64px_40px] items-center gap-2 py-1 text-[14px]"
                  >
                    <span className="truncate text-ink-soft">{u.unit}</span>
                    <ScoreBar score={u.finalScore} />
                    <span className="text-right font-semibold">{u.finalScore}</span>
                  </li>
                ))}
              </ul>
            )}
            {!sp.hasRecords && (
              <p className="px-5 pb-3 pl-[60px] text-xs text-ink-muted">
                아직 기록이 없어 계획에 들어가지 않아요.
              </p>
            )}
            {showUnits ? null : <div className="h-2" />}
          </li>
        );
      })}
    </ol>
  );
}
