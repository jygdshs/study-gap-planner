"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PlusIcon } from "@/components/Icons";

// 단원 입력칸 + 전에 썼던 단원 고르기.
//  - 고른 과목에서 전에 기록한 단원을 많이 쓴 순으로 버튼으로 보여주고, 누르면 그 단원이 들어간다.
//  - 과목 이름에 맞는 예시 단원도 함께 보여준다 (아직 써 본 적 없으면 점선 테두리).
//  - 입력칸에 글자를 치면 그 글자가 들어간 단원만 추린다.
// 같은 단원을 매번 똑같은 이름으로 적어야 점수·계획이 한 단원으로 모이므로, 고르기가 오타를 줄여 준다.

// 과목 이름에 이 낱말이 들어가면 예시 단원을 보여준다
const EXAMPLE_UNITS: { match: string; units: string[] }[] = [{ match: "수학", units: ["1계 미분방정식"] }];
const SUGGESTION_LIMIT = 8;

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

export default function UnitInput({
  subjectId,
  value,
  onChange,
  className,
}: {
  subjectId: string;
  value: string;
  onChange: (unit: string) => void;
  className?: string;
}) {
  const [pastUnits, setPastUnits] = useState<string[]>([]);
  const [subjectName, setSubjectName] = useState("");

  useEffect(() => {
    if (!subjectId) {
      setPastUnits([]);
      setSubjectName("");
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase.from("study_records").select("unit").eq("subject_id", subjectId),
      supabase.from("subjects").select("name").eq("id", subjectId).maybeSingle(),
    ]).then(([recordsRes, subjectRes]) => {
      if (cancelled) return;
      const count = new Map<string, number>();
      for (const row of (recordsRes.data as { unit: string }[] | null) ?? []) {
        const u = normalize(row.unit ?? "");
        if (u) count.set(u, (count.get(u) ?? 0) + 1);
      }
      setPastUnits([...count.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u));
      setSubjectName((subjectRes.data as { name: string } | null)?.name ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const examples = EXAMPLE_UNITS.filter((e) => subjectName.includes(e.match)).flatMap((e) => e.units);
  const query = normalize(value);
  const suggestions = [...pastUnits, ...examples.filter((e) => !pastUnits.includes(e))]
    .filter((u) => u !== query)
    .filter((u) => !query || u.includes(query))
    .slice(0, SUGGESTION_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={subjectId ? "직접 입력하거나 아래에서 고르기" : "예: 미분"}
        aria-label="단원"
        className={className ?? "field"}
      />
      {subjectId && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="전에 썼던 단원에서 고르기">
          <span className="text-xs text-ink-muted">{query ? "비슷한 단원" : "전에 쓴 단원"}</span>
          {suggestions.map((u) => {
            const isExample = !pastUnits.includes(u);
            return (
              <button
                key={u}
                type="button"
                onClick={() => onChange(u)}
                title={isExample ? "예시 단원" : "전에 기록한 단원"}
                className={`flex items-center gap-1 border px-2 py-0.5 text-[13px] text-ink-soft transition-colors hover:border-ink hover:bg-ground hover:text-ink ${
                  isExample ? "border-dashed border-rule-strong" : "border-rule-strong"
                }`}
              >
                <PlusIcon className="h-3 w-3" />
                {u}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
