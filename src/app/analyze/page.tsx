"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/scoring";
import {
  CAUSES,
  MAX_IMAGES,
  typeStats,
  type AnalyzedProblem,
  type AnalyzeRequest,
  type Cause,
} from "@/lib/problemAnalysis";
import SubjectPicker from "@/components/SubjectPicker";
import UnitInput from "@/components/UnitInput";
import { ArrowRightIcon, CloseIcon, PlusIcon } from "@/components/Icons";
import { ConfigNotice, PageFrame, PageHeader } from "@/components/ui";

// AI 문제 유형 분석: 채점한 시험지·문제집 사진을 올리면 AI가 문항별로 정리한다.
//  1) 과목·단원·날짜는 사용자가 정한다
//  2) 사진(필수) + 정답지(선택)를 올린다. 화면에서 크기를 줄여 보낸다
//  3) AI 결과를 표로 확인하고 고친다 (손글씨를 잘못 읽을 수 있으므로 꼭 확인)
//  4) 저장: 학습 기록(문제 풀이) 1건 + 문항별 결과 → 지금과 같은 점수·계획 계산으로 들어간다

const MAX_SIDE = 1600; // 사진 긴 변(px)
const MAX_TOTAL_BASE64 = 3_800_000; // 서버 요청 크기 제한(4.5MB) 안쪽으로

interface Photo {
  id: string;
  name: string;
  preview: string; // data URL
  data: string; // base64 (data URL 앞부분 제외)
}

interface Row extends Omit<AnalyzedProblem, "cause"> {
  key: string;
  cause: Cause | "없음";
}

/** 사진을 긴 변 maxSide px JPEG로 줄인다 */
async function shrinkImage(file: File, maxSide: number, quality: number): Promise<Photo> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`${file.name}: 이 사진 형식은 열 수 없어요. JPG나 PNG로 올려 주세요.`));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", quality);
    return { id: crypto.randomUUID(), name: file.name, preview, data: preview.split(",")[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const RESULT_LABEL: Record<AnalyzedProblem["result"], string> = { correct: "맞음", wrong: "틀림", unknown: "모름" };

export default function AnalyzePage() {
  const { user } = useAuth();
  const [subjectId, setSubjectId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [unit, setUnit] = useState("");
  const [studyDate, setStudyDate] = useState(todayISO());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [keyPhotos, setKeyPhotos] = useState<Photo[]>([]);
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  // 과목을 고르면 이름과, 그 과목에서 전에 쓴 유형 이름을 불러온다 (AI가 같은 이름으로 묶도록)
  useEffect(() => {
    if (!subjectId) {
      setSubjectName("");
      setKnownTypes([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase.from("subjects").select("name").eq("id", subjectId).maybeSingle(),
      supabase.from("study_records").select("id").eq("subject_id", subjectId),
    ]).then(async ([s, recs]) => {
      if (cancelled) return;
      setSubjectName((s.data as { name: string } | null)?.name ?? "");
      const ids = ((recs.data as { id: string }[] | null) ?? []).map((r) => r.id);
      if (ids.length === 0) return setKnownTypes([]);
      const pr = await supabase.from("problem_results").select("problem_type").in("record_id", ids);
      if (cancelled) return;
      const count = new Map<string, number>();
      for (const r of (pr.data as { problem_type: string }[] | null) ?? []) {
        count.set(r.problem_type, (count.get(r.problem_type) ?? 0) + 1);
      }
      setKnownTypes([...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t));
    });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const addFiles = async (files: FileList | null, which: "answer" | "key") => {
    if (!files || files.length === 0) return;
    setError(null);
    const room = MAX_IMAGES - photos.length - keyPhotos.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (list.length < files.length) setError(`사진은 모두 ${MAX_IMAGES}장까지예요.`);
    try {
      const shrunk = await Promise.all(list.map((f) => shrinkImage(f, MAX_SIDE, 0.85)));
      (which === "answer" ? setPhotos : setKeyPhotos)((prev) => [...prev, ...shrunk]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 읽지 못했어요.");
    }
  };

  const ready = Boolean(subjectId && subjectName && unit.trim() && photos.length > 0);

  const analyze = async () => {
    if (!ready) return;
    setAnalyzing(true);
    setError(null);
    setRows(null);
    setSaved(false);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");

      // 너무 크면 한 번 더 줄여서 보낸다
      let answer = photos;
      let key = keyPhotos;
      const size = () => [...answer, ...key].reduce((n, p) => n + p.data.length, 0);
      if (size() > MAX_TOTAL_BASE64) {
        const reshrink = async (p: Photo) => {
          const blob = await (await fetch(p.preview)).blob();
          return shrinkImage(new File([blob], p.name, { type: "image/jpeg" }), 1200, 0.7);
        };
        answer = await Promise.all(answer.map(reshrink));
        key = await Promise.all(key.map(reshrink));
        if (size() > MAX_TOTAL_BASE64) throw new Error("사진이 너무 커요. 장수를 줄여서 나눠 올려 주세요.");
      }

      const body: AnalyzeRequest = {
        subjectName,
        unit: unit.trim(),
        knownTypes,
        images: answer.map((p) => ({ media_type: "image/jpeg", data: p.data })),
        answerKey: key.map((p) => ({ media_type: "image/jpeg", data: p.data })),
      };
      const res = await fetch("/api/analyze-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({ error: `분석 실패 (${res.status})` }));
      if (!res.ok) throw new Error(json.error ?? `분석 실패 (${res.status})`);

      const problems = (json.problems as AnalyzedProblem[]) ?? [];
      if (problems.length === 0) throw new Error("사진에서 문항을 찾지 못했어요. 문항 번호가 보이게 다시 찍어 주세요.");
      setRows(problems.map((p, i) => ({ ...p, key: `${i}-${p.number}` })));
      setNote(json.note ?? "");
      setRemaining(typeof json.remaining === "number" ? json.remaining : null);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석하지 못했어요.");
    }
    setAnalyzing(false);
  };

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev
        ? prev.map((r) => {
            if (r.key !== key) return r;
            const next = { ...r, ...patch };
            // 맞음으로 바꾸면 원인·근거를 비우고, 틀림으로 바꾸면 원인 기본값
            if (patch.result === "correct") return { ...next, cause: "없음", detail: "" };
            if (patch.result === "wrong" && next.cause === "없음") return { ...next, cause: "기타" };
            return next;
          })
        : prev
    );

  const unknownCount = rows?.filter((r) => r.result === "unknown").length ?? 0;
  const emptyType = rows?.some((r) => !r.problem_type.trim()) ?? false;
  const total = rows?.length ?? 0;
  const correctCount = rows?.filter((r) => r.result === "correct").length ?? 0;
  const stats = rows
    ? typeStats(
        rows
          .filter((r) => r.result !== "unknown")
          .map((r) => ({ problem_type: r.problem_type, correct: r.result === "correct", cause: r.cause === "없음" ? null : r.cause }))
      )
    : [];

  const save = async () => {
    if (!rows || unknownCount > 0 || emptyType) return;
    setSaving(true);
    setError(null);
    const wrongRows = rows.filter((r) => r.result === "wrong");
    // 틀린 이유: "유형 · 원인" (많이 나온 순, 최대 6개) — 학습 점수 화면의 틀린 이유 분석에 그대로 쓰인다
    const reasonCount = new Map<string, number>();
    for (const r of wrongRows) {
      const reason = `${r.problem_type.trim()} · ${r.cause}`;
      reasonCount.set(reason, (reasonCount.get(reason) ?? 0) + 1);
    }
    const wrongReasons = [...reasonCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r]) => r);

    const { data: record, error: recError } = await supabase
      .from("study_records")
      .insert({
        subject_id: subjectId,
        unit: unit.trim(),
        record_type: "problem",
        study_date: studyDate,
        problems_total: total,
        problems_correct: correctCount,
        problems_wrong: total - correctCount,
        wrong_reasons: wrongReasons,
        concept_reference: null,
        concept_answer: null,
      })
      .select("id")
      .single();
    if (recError || !record) {
      setSaving(false);
      setError(`저장 실패: ${recError?.message ?? "알 수 없는 오류"}`);
      return;
    }

    const { error: prError } = await supabase.from("problem_results").insert(
      rows.map((r) => ({
        user_id: user?.id,
        record_id: (record as { id: string }).id,
        problem_no: r.number.trim() || "?",
        correct: r.result === "correct",
        problem_type: r.problem_type.trim(),
        cause: r.result === "wrong" ? r.cause : null,
        detail: r.result === "wrong" ? r.detail.trim() || null : null,
      }))
    );
    setSaving(false);
    if (prError) {
      // 문항 결과를 못 넣었으면 방금 만든 기록도 지워 반쪽짜리 기록이 남지 않게 한다
      await supabase.from("study_records").delete().eq("id", (record as { id: string }).id);
      setError(`저장 실패: ${prError.message}`);
      return;
    }
    setSaved(true);
  };

  const reset = () => {
    setPhotos([]);
    setKeyPhotos([]);
    setRows(null);
    setNote("");
    setSaved(false);
    setError(null);
  };

  return (
    <PageFrame>
      <PageHeader
        title="사진으로 결과 입력"
        description="채점한 시험지·문제집 사진을 올리면 AI가 문항마다 맞음·틀림, 문제 유형, 틀린 원인을 정리해요. 확인하고 저장하면 학습 점수와 계획에 반영돼요."
        action={
          <Link href="/input" className="btn-light">
            직접 입력하기
          </Link>
        }
      />
      <ConfigNotice />

      <div className="rise-stagger grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 1. 무엇을 풀었나 + 사진 */}
        <section className="sheet" aria-labelledby="setup-title">
          <div className="sheet-head">
            <h2 id="setup-title" className="sheet-title">
              무엇을 풀었나요
            </h2>
          </div>
          <div className="flex flex-col gap-6 p-5">
            <div className="flex flex-col gap-2">
              <span className="field-label">과목</span>
              <SubjectPicker subjectId={subjectId} onSubjectChange={setSubjectId} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="field-label">단원</span>
              <UnitInput subjectId={subjectId} value={unit} onChange={setUnit} />
            </div>
            <label className="flex flex-col gap-2">
              <span className="field-label">푼 날짜</span>
              <input
                type="date"
                value={studyDate}
                onChange={(e) => setStudyDate(e.target.value)}
                className="field sm:max-w-[220px]"
              />
            </label>

            <PhotoPicker
              label="답안 사진"
              hint="채점 표시(O·X)가 보이게 찍어 주세요. 이름은 가리고 찍어 주세요."
              photos={photos}
              onAdd={(f) => addFiles(f, "answer")}
              onRemove={(id) => setPhotos((p) => p.filter((x) => x.id !== id))}
              full={photos.length + keyPhotos.length >= MAX_IMAGES}
            />
            <PhotoPicker
              label="정답지 (선택)"
              hint="채점을 안 했다면 정답지를 올려 주세요. AI가 학생 답과 정답을 비교만 해요."
              photos={keyPhotos}
              onAdd={(f) => addFiles(f, "key")}
              onRemove={(id) => setKeyPhotos((p) => p.filter((x) => x.id !== id))}
              full={photos.length + keyPhotos.length >= MAX_IMAGES}
            />

            <p className="text-xs leading-relaxed text-ink-muted">
              사진은 분석을 위해 AI(Claude)에 보내지고, 이 앱에는 저장되지 않아요. AI는 문제를 직접 풀어서 채점하지 않고,
              채점 표시나 정답지로만 맞음·틀림을 정해요. 하루 분석 횟수에 제한이 있어요.
            </p>

            {error && !rows && (
              <p role="alert" className="notice-error">
                {error}
              </p>
            )}

            <button type="button" onClick={analyze} disabled={!ready || analyzing} className="btn-primary">
              {analyzing ? "AI가 문항을 정리하는 중… (30초~1분)" : "AI로 분석하기"}
            </button>
            {!ready && (
              <p className="-mt-3 text-xs text-ink-muted">과목, 단원, 답안 사진을 넣으면 분석할 수 있어요.</p>
            )}
          </div>
        </section>

        {/* 2. 결과 확인 */}
        <section ref={resultRef} className="sheet scroll-mt-24" aria-labelledby="result-title" aria-busy={analyzing}>
          <div className="sheet-head">
            <h2 id="result-title" className="sheet-title">
              분석 결과 확인
            </h2>
            {remaining !== null && <span className="text-xs text-ink-muted">오늘 남은 분석 {remaining}번</span>}
          </div>

          {!rows ? (
            <p className="p-5 text-[14px] leading-relaxed text-ink-muted">
              {analyzing
                ? "사진을 읽고 있어요. 문항이 많으면 1분 넘게 걸릴 수 있어요."
                : "분석이 끝나면 문항별 결과가 여기에 나와요. 손글씨를 잘못 읽을 수 있으니 저장하기 전에 꼭 확인해 주세요."}
            </p>
          ) : saved ? (
            <div className="flex flex-col items-start gap-4 p-5">
              <p className="notice-ok">
                {subjectName} {unit} 결과를 저장했어요. {total}문항 중 {correctCount}문항 맞음.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/scores" className="btn-primary">
                  학습 점수 보기 <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <Link href="/plan" className="btn-quiet">
                  계획 보기
                </Link>
                <button type="button" onClick={reset} className="btn-quiet">
                  다른 사진 분석
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-rule px-5 py-4">
                <span className="text-[14px] text-ink-soft">
                  {total}문항 중 <strong className="text-[20px] font-extrabold text-ink">{correctCount}</strong> 맞음
                </span>
                {unknownCount > 0 && (
                  <span className="text-[13px] font-semibold text-warn">맞음·틀림을 모르는 문항 {unknownCount}개를 정해 주세요</span>
                )}
              </div>
              {note && <p className="notice-warn mx-5 mt-4">{note}</p>}

              {stats.some((s) => s.wrong > 0) && (
                <div className="border-b border-rule px-5 py-4">
                  <h3 className="mb-2 text-[13px] font-bold">유형별 오답</h3>
                  <ul className="flex flex-col gap-1.5">
                    {stats
                      .filter((s) => s.wrong > 0)
                      .map((s) => (
                        <li key={s.type} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[14px]">
                          <span className="truncate">
                            <strong>{s.type}</strong>
                            {s.topCause && <span className="ml-2 text-[12px] text-ink-muted">주로 {s.topCause}</span>}
                          </span>
                          <span className="font-bold tabular-nums">
                            {s.wrong}/{s.total} 틀림
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <datalist id="known-types">
                {[...new Set([...knownTypes, ...rows.map((r) => r.problem_type)])].filter(Boolean).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <ol>
                {rows.map((r) => (
                  <li key={r.key} className="flex flex-col gap-2 border-b border-rule px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={r.number}
                        onChange={(e) => updateRow(r.key, { number: e.target.value })}
                        aria-label="문항 번호"
                        className="field w-14 px-2 py-1 text-center text-[14px] font-bold"
                      />
                      <div className="flex border border-rule-strong" role="radiogroup" aria-label={`${r.number}번 채점`}>
                        {(["correct", "wrong", "unknown"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            role="radio"
                            aria-checked={r.result === v}
                            onClick={() => updateRow(r.key, { result: v })}
                            className={`px-2.5 py-1 text-[13px] font-semibold ${
                              r.result === v
                                ? v === "correct"
                                  ? "bg-ok/15 text-ok shadow-[inset_0_0_0_2px_currentColor]"
                                  : v === "wrong"
                                    ? "bg-danger/15 text-danger shadow-[inset_0_0_0_2px_currentColor]"
                                    : "bg-warn/15 text-warn shadow-[inset_0_0_0_2px_currentColor]"
                                : "text-ink-soft hover:text-ink"
                            }`}
                          >
                            {RESULT_LABEL[v]}
                          </button>
                        ))}
                      </div>
                      <input
                        value={r.problem_type}
                        list="known-types"
                        onChange={(e) => updateRow(r.key, { problem_type: e.target.value })}
                        aria-label={`${r.number}번 문제 유형`}
                        placeholder="문제 유형"
                        className={`field min-w-[120px] flex-1 px-2 py-1 text-[14px] ${r.problem_type.trim() ? "" : "border-danger"}`}
                      />
                      {r.confidence === "low" && (
                        <span className="text-[12px] font-semibold text-warn" title="AI가 확신하지 못한 문항이에요">
                          확인 필요
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev?.filter((x) => x.key !== r.key) ?? null)}
                        aria-label={`${r.number}번 지우기`}
                        className="ml-auto p-1 text-ink-muted hover:text-danger"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {r.result === "wrong" && (
                      <div className="flex flex-wrap items-center gap-2 pl-16">
                        <select
                          value={r.cause}
                          onChange={(e) => updateRow(r.key, { cause: e.target.value as Cause })}
                          aria-label={`${r.number}번 틀린 원인`}
                          className="field w-auto px-2 py-1 text-[13px]"
                        >
                          {CAUSES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <input
                          value={r.detail}
                          onChange={(e) => updateRow(r.key, { detail: e.target.value })}
                          aria-label={`${r.number}번 틀린 이유 설명`}
                          placeholder="어디서 왜 틀렸는지"
                          className="field min-w-[180px] flex-1 px-2 py-1 text-[13px]"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <button
                  type="button"
                  onClick={() =>
                    setRows((prev) => [
                      ...(prev ?? []),
                      {
                        key: crypto.randomUUID(),
                        number: "",
                        result: "unknown",
                        problem_type: "",
                        cause: "없음",
                        detail: "",
                        confidence: "high",
                      },
                    ])
                  }
                  className="btn-quiet"
                >
                  <PlusIcon className="h-4 w-4" /> 문항 추가
                </button>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || unknownCount > 0 || emptyType || total === 0}
                    className="btn-primary"
                  >
                    {saving ? "저장 중…" : "확인했어요, 저장하기"}
                  </button>
                  {(unknownCount > 0 || emptyType) && (
                    <span className="text-xs text-ink-muted">
                      {unknownCount > 0 ? "모든 문항의 맞음·틀림을 정해야" : "모든 문항에 유형을 적어야"} 저장할 수 있어요
                    </span>
                  )}
                </div>
              </div>
              {error && (
                <p role="alert" className="notice-error mx-5 mb-5">
                  {error}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

function PhotoPicker({
  label,
  hint,
  photos,
  onAdd,
  onRemove,
  full,
}: {
  label: string;
  hint: string;
  photos: Photo[];
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  full: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <span className="field-label">{label}</span>
      <span className="field-hint -mt-1">{hint}</span>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative h-24 w-20 border border-rule-strong bg-ground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt={p.name} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              aria-label={`${p.name} 빼기`}
              className="absolute right-0.5 top-0.5 bg-sheet/90 p-0.5 text-ink hover:text-danger"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-24 w-20 flex-col items-center justify-center gap-1 border border-dashed border-rule-strong text-[12px] text-ink-soft hover:border-ink hover:text-ink"
          >
            <PlusIcon className="h-5 w-5" />
            사진 추가
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
