"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buildSubjectColorMap, colorOf } from "@/lib/palette";
import { showToast } from "@/components/ToastHost";
import { SubjectChip } from "@/components/ui";
import type { Subject } from "@/types/study";

// 단원 이름 바꾸기·합치기.
//  "1계 미분방정식"과 "1계미분방정식"처럼 이름이 조금만 달라도 단원이 둘로 갈라져 점수가 나뉜다.
//  이름을 바꾸면 그 단원의 학습 기록과 저장된 계획 칸이 모두 새 이름으로 바뀌고,
//  같은 과목에 이미 있는 이름으로 바꾸면 두 단원이 하나로 합쳐진다.

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

interface UnitRow {
  subjectId: string;
  unit: string;
  records: number;
}

export default function UnitManager({ subjects }: { subjects: Subject[] }) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // "subjectId::unit"
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colors = buildSubjectColorMap(subjects);

  const load = async () => {
    const { data, error } = await supabase.from("study_records").select("subject_id, unit");
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const count = new Map<string, UnitRow>();
    for (const r of (data as { subject_id: string; unit: string }[]) ?? []) {
      const key = `${r.subject_id}::${r.unit}`;
      const row = count.get(key) ?? { subjectId: r.subject_id, unit: r.unit, records: 0 };
      row.records++;
      count.set(key, row);
    }
    setUnits([...count.values()].sort((a, b) => a.unit.localeCompare(b.unit, "ko")));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  /** 띄어쓰기만 다른 단원 (합치기 후보) */
  const lookalike = (row: UnitRow) =>
    units.find((o) => o !== row && o.subjectId === row.subjectId && o.unit.replace(/\s/g, "") === row.unit.replace(/\s/g, ""));

  const rename = async (row: UnitRow, rawName: string) => {
    const next = normalize(rawName);
    setError(null);
    if (!next || next === row.unit) {
      setEditing(null);
      return;
    }
    const target = units.find((u) => u.subjectId === row.subjectId && u.unit === next);
    if (target && !window.confirm(`'${next}' 단원이 이미 있어요. 두 단원을 하나로 합칠까요? (기록 ${row.records + target.records}개)`)) {
      return;
    }
    setBusy(true);
    const [recs, plans] = await Promise.all([
      supabase.from("study_records").update({ unit: next }).eq("subject_id", row.subjectId).eq("unit", row.unit),
      supabase.from("plan_items").update({ unit: next }).eq("subject_id", row.subjectId).eq("unit", row.unit),
    ]);
    setBusy(false);
    const err = recs.error ?? plans.error;
    if (err) {
      setError(`바꾸지 못했어요: ${err.message}`);
      return;
    }
    setEditing(null);
    showToast({ text: target ? `'${row.unit}'을 '${next}'에 합쳤어요.` : `'${row.unit}' 이름을 '${next}'(으)로 바꿨어요.` });
    await load();
  };

  const bySubject = subjects
    .map((s) => ({ subject: s, rows: units.filter((u) => u.subjectId === s.id) }))
    .filter((g) => g.rows.length > 0);

  return (
    <section className="sheet" aria-labelledby="units-manage-title">
      <div className="sheet-head">
        <h2 id="units-manage-title" className="sheet-title">
          단원 이름 바꾸기 · 합치기
        </h2>
        <span className="text-xs text-ink-muted">같은 이름으로 바꾸면 합쳐져요</span>
      </div>
      {error && <p className="notice-error m-5 mb-0">{error}</p>}
      {loading ? (
        <p className="px-5 py-4 text-[14px] text-ink-muted">단원을 불러오는 중…</p>
      ) : bySubject.length === 0 ? (
        <p className="px-5 py-4 text-[14px] text-ink-muted">아직 기록한 단원이 없어요.</p>
      ) : (
        <div className="flex flex-col">
          {bySubject.map(({ subject, rows }) => (
            <div key={subject.id} className="border-b border-rule px-5 py-3 last:border-b-0">
              <h3 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
                <SubjectChip color={colorOf(colors, subject.id)} />
                {subject.name}
              </h3>
              <ul className="flex flex-col gap-1">
                {rows.map((row) => {
                  const key = `${row.subjectId}::${row.unit}`;
                  const twin = lookalike(row);
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-2 text-[14px]">
                      {editing === key ? (
                        <form
                          className="flex flex-1 flex-wrap items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            rename(row, draft);
                          }}
                        >
                          <input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            list={`units-${subject.id}`}
                            autoFocus
                            aria-label={`${row.unit} 새 이름`}
                            className="field min-w-[160px] flex-1 px-2 py-1 text-[14px]"
                          />
                          <datalist id={`units-${subject.id}`}>
                            {rows.filter((r) => r !== row).map((r) => (
                              <option key={r.unit} value={r.unit} />
                            ))}
                          </datalist>
                          <button type="submit" disabled={busy} className="btn-primary px-3 py-1 text-[13px]">
                            {busy ? "바꾸는 중…" : "바꾸기"}
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className="btn-quiet px-3 py-1 text-[13px]">
                            취소
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate">
                            <strong>{row.unit}</strong>
                            <span className="ml-2 text-[12px] text-ink-muted">기록 {row.records}개</span>
                            {twin && (
                              <button
                                type="button"
                                onClick={() => rename(row, twin.unit)}
                                className="ml-2 text-[12px] font-semibold text-warn hover:underline"
                                title={`띄어쓰기만 다른 '${twin.unit}' 단원이 있어요`}
                              >
                                &lsquo;{twin.unit}&rsquo;에 합치기
                              </button>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(key);
                              setDraft(row.unit);
                            }}
                            className="text-[13px] font-semibold text-accent hover:underline"
                          >
                            이름 바꾸기
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
