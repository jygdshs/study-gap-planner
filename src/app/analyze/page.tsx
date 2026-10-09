"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/scoring";
import {
  CAUSES,
  MAX_PDF_BASE64,
  MAX_WRONG,
  normalizeProblemNo,
  parseNumbers,
  parsePages,
  typeStats,
  type AnalyzedProblem,
  type AnalyzeRequest,
  type Cause,
} from "@/lib/problemAnalysis";
import { findProblemPages } from "@/lib/pdfTools";
import { getPdf, listPdfs, removePdf, savePdf, type StoredPdfMeta } from "@/lib/pdfStore";
import SubjectPicker from "@/components/SubjectPicker";
import UnitInput from "@/components/UnitInput";
import { ArrowRightIcon, CloseIcon } from "@/components/Icons";
import { ConfigNotice, PageFrame, PageHeader } from "@/components/ui";

// AI 문제 유형 분석 (Gemini, 무료 등급)
//  1) 과목·단원·날짜·푼 문항 수는 사용자가 정한다
//  2) 문제 PDF를 올리고 틀린 번호를 적는다 (번호마다 왜 틀렸는지 메모는 선택)
//  3) 브라우저에서 필요한 쪽만 잘라 보내면, AI가 틀린 문항만 찾아 유형·필요한 개념을 정리한다
//  4) 결과를 확인·수정하고 저장 → 학습 기록(문제 풀이) 1건 + 틀린 문항별 결과 → 지금과 같은 점수·계획 계산

interface LoadedPdf {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

interface Row extends Omit<AnalyzedProblem, "cause"> {
  cause: Cause | "미정";
  memo: string;
}

/** Uint8Array → base64 (큰 파일도 스택이 넘치지 않게 나눠서) */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 고른 쪽만 남긴 새 PDF */
async function slicePdf(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

export default function AnalyzePage() {
  const { user } = useAuth();
  const [subjectId, setSubjectId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [unit, setUnit] = useState("");
  const [studyDate, setStudyDate] = useState(todayISO());
  const [totalInput, setTotalInput] = useState("");
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [pagesInput, setPagesInput] = useState("");
  const [autoPages, setAutoPages] = useState<Map<string, number> | null>(null); // 번호 → 자동으로 찾은 쪽
  const [findingPages, setFindingPages] = useState(false);
  const [recentPdfs, setRecentPdfs] = useState<StoredPdfMeta[]>([]);
  const [numbersInput, setNumbersInput] = useState("");
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const numbers = parseNumbers(numbersInput);
  const total = Number(totalInput);
  const totalValid = Number.isInteger(total) && total > 0 && total >= numbers.length;
  const manualPages = pdf ? parsePages(pagesInput, pdf.pageCount) : [];
  // 쪽을 직접 적지 않았으면, 틀린 번호가 있는 쪽을 PDF 글자에서 자동으로 찾은 결과를 쓴다
  const numbersKey = numbers.join(",");
  const missingNumbers = autoPages ? numbers.filter((n) => !autoPages.has(n)) : [];
  const usingAuto = manualPages.length === 0 && autoPages !== null && autoPages.size > 0;
  // 자동으로 다 찾았으면 그 쪽만, 일부 못 찾았으면 전체를 보낸다 (AI가 나머지를 찾도록)
  const pages = manualPages.length > 0 ? manualPages : usingAuto && missingNumbers.length === 0 ? [...new Set(autoPages!.values())].sort((a, b) => a - b) : [];
  const ready = Boolean(
    subjectId && subjectName && unit.trim() && pdf && numbers.length > 0 && numbers.length <= MAX_WRONG && totalValid
  );

  useEffect(() => {
    setAutoPages(null);
    if (!pdf || numbers.length === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setFindingPages(true);
      try {
        const found = await findProblemPages(pdf.bytes, numbers);
        if (!cancelled) setAutoPages(found);
      } catch {
        if (!cancelled) setAutoPages(new Map()); // 글자가 없는 PDF 등: 못 찾음으로 두고 전체를 보낸다
      }
      if (!cancelled) setFindingPages(false);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, numbersKey]);

  // 이 브라우저에 기억해 둔 PDF 목록
  useEffect(() => {
    listPdfs().then(setRecentPdfs);
  }, []);

  const openPdf = async (name: string, bytes: Uint8Array) => {
    setError(null);
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageCount = doc.getPageCount();
      setPdf({ name, bytes, pageCount });
      setPagesInput("");
      await savePdf(name, bytes, pageCount); // 같은 PDF 기억
      setRecentPdfs(await listPdfs());
    } catch {
      setError("PDF를 열지 못했어요. 암호가 걸려 있거나 손상된 파일일 수 있어요.");
    }
  };
  const loadPdf = async (file: File | undefined) => {
    if (!file) return;
    await openPdf(file.name, new Uint8Array(await file.arrayBuffer()));
  };
  const openRecent = async (name: string) => {
    const bytes = await getPdf(name);
    if (bytes) await openPdf(name, bytes);
    else setError("기억해 둔 PDF를 열지 못했어요. 다시 올려 주세요.");
  };

  const analyze = async () => {
    if (!ready || !pdf) return;
    setAnalyzing(true);
    setError(null);
    setRows(null);
    setSaved(false);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");

      // 쪽을 골랐으면 그 쪽만 잘라서 보낸다 (전송 크기와 무료 한도를 아끼기 위해)
      const bytes = pages.length > 0 ? await slicePdf(pdf.bytes, pages) : pdf.bytes;
      const b64 = toBase64(bytes);
      if (b64.length > MAX_PDF_BASE64) {
        throw new Error("PDF가 너무 커요. 아래 '틀린 문항이 있는 쪽'에 쪽 번호를 적어 필요한 쪽만 보내 주세요.");
      }

      const body: AnalyzeRequest = {
        subjectName,
        unit: unit.trim(),
        knownTypes,
        wrong: numbers.map((n) => ({ number: n, memo: memos[n] ?? "" })),
        pdf: b64,
      };
      const res = await fetch("/api/analyze-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({ error: `분석 실패 (${res.status})` }));
      if (!res.ok) throw new Error(json.error ?? `분석 실패 (${res.status})`);

      const problems = (json.problems as AnalyzedProblem[]) ?? [];
      // 학생이 적은 번호 순서대로, AI가 빠뜨린 번호도 빈 줄로 채운다
      // AI가 "009"처럼 돌려줘도 학생이 적은 "9"와 맞춰 본다
      const byNo = new Map(problems.map((p) => [normalizeProblemNo(p.number), p]));
      setRows(
        numbers.map((n) => {
          const p = byNo.get(n);
          return {
            number: n,
            found: p?.found ?? false,
            summary: p?.summary ?? "",
            problem_type: p?.problem_type ?? "",
            concept: p?.concept ?? "",
            cause: p?.cause ?? "미정",
            confidence: p?.confidence ?? "low",
            memo: memos[n] ?? "",
          };
        })
      );
      setNote(json.note ?? "");
      setRemaining(typeof json.remaining === "number" ? json.remaining : null);
      setUsedModel(typeof json.model === "string" ? json.model : null);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석하지 못했어요.");
    }
    setAnalyzing(false);
  };

  const updateRow = (n: string, patch: Partial<Row>) =>
    setRows((prev) => prev?.map((r) => (r.number === n ? { ...r, ...patch } : r)) ?? null);

  const undecided = rows?.filter((r) => r.cause === "미정").length ?? 0;
  const emptyType = rows?.some((r) => !r.problem_type.trim()) ?? false;
  const wrongCount = rows?.length ?? 0;
  const stats = rows
    ? typeStats(rows.map((r) => ({ problem_type: r.problem_type, correct: false, cause: r.cause === "미정" ? null : r.cause })))
    : [];

  const save = async () => {
    if (!rows || undecided > 0 || emptyType || !totalValid) return;
    setSaving(true);
    setError(null);
    // 틀린 이유: "유형 · 원인" (많이 나온 순, 최대 6개) — 학습 점수 화면의 틀린 이유 분석에 그대로 쓰인다
    const reasonCount = new Map<string, number>();
    for (const r of rows) {
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
        problems_correct: total - wrongCount,
        problems_wrong: wrongCount,
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
    const recordId = (record as { id: string }).id;

    const resultRows = rows.map((r) => ({
      user_id: user?.id,
      record_id: recordId,
      problem_no: r.number,
      correct: false,
      problem_type: r.problem_type.trim(),
      cause: r.cause,
      detail: r.memo.trim() || null,
      summary: r.summary.trim() || null,
      concept: r.concept.trim() || null,
    }));
    // 008: 어느 PDF 몇 쪽 문항인지도 남긴다 (틀린 문제 다시 풀기에서 그 쪽을 보여주려고)
    const sourcePage = (n: string) => autoPages?.get(n) ?? (manualPages.length === 1 ? manualPages[0] : null);
    let { error: prError } = await supabase
      .from("problem_results")
      .insert(resultRows.map((r) => ({ ...r, source_name: pdf?.name ?? null, source_page: sourcePage(r.problem_no) })));
    if (prError && /source_(name|page)/.test(prError.message)) {
      // 008 마이그레이션 전이면 쪽 정보 없이 저장
      ({ error: prError } = await supabase.from("problem_results").insert(resultRows));
    }
    setSaving(false);
    if (prError) {
      // 문항 결과를 못 넣었으면 방금 만든 기록도 지워 반쪽짜리 기록이 남지 않게 한다
      await supabase.from("study_records").delete().eq("id", recordId);
      setError(`저장 실패: ${prError.message}`);
      return;
    }
    setSaved(true);
  };

  const reset = () => {
    setPdf(null);
    setPagesInput("");
    setNumbersInput("");
    setMemos({});
    setTotalInput("");
    setRows(null);
    setNote("");
    setSaved(false);
    setError(null);
  };

  return (
    <PageFrame>
      <PageHeader
        title="PDF로 틀린 문제 분석"
        description="푼 문제의 PDF를 올리고 틀린 번호를 적으면, AI(Gemini)가 그 문항만 찾아 문제 유형과 필요한 개념을 정리해요. 확인하고 저장하면 학습 점수와 계획에 반영돼요."
        action={
          <Link href="/input" className="btn-light">
            직접 입력하기
          </Link>
        }
      />
      <ConfigNotice />

      <div className="rise-stagger grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 1. 입력 */}
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
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2">
                <span className="field-label">푼 날짜</span>
                <input type="date" value={studyDate} onChange={(e) => setStudyDate(e.target.value)} className="field" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="field-label">푼 문항 수</span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={totalInput}
                  onChange={(e) => setTotalInput(e.target.value)}
                  placeholder="예: 20"
                  className={`field ${totalInput && !totalValid ? "border-danger" : ""}`}
                />
              </label>
            </div>

            {/* PDF */}
            <div className="flex flex-col gap-2">
              <span className="field-label">문제 PDF</span>
              <span className="field-hint -mt-1">
                글자가 들어 있는 PDF(문제집·모의고사 원본)가 가장 잘 돼요. 이름 같은 개인정보가 없는 파일을 올려 주세요.
              </span>
              {pdf ? (
                <div className="flex items-center gap-3 border border-rule-strong px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{pdf.name}</span>
                  <span className="shrink-0 text-[13px] text-ink-muted">{pdf.pageCount}쪽</span>
                  <button
                    type="button"
                    onClick={() => setPdf(null)}
                    aria-label="PDF 빼기"
                    className="p-1 text-ink-muted hover:text-danger"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="btn-quiet justify-start">
                    PDF 고르기
                  </button>
                  {/* 같은 PDF 기억: 이 브라우저에 저장해 둔 최근 PDF */}
                  {recentPdfs.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-ink-muted">최근에 쓴 PDF (이 브라우저에만 저장돼요)</span>
                      <ul className="flex flex-col border border-rule">
                        {recentPdfs.map((r) => (
                          <li key={r.name} className="flex items-center gap-2 border-b border-rule last:border-b-0">
                            <button
                              type="button"
                              onClick={() => openRecent(r.name)}
                              className="flex min-w-0 flex-1 items-baseline gap-2 px-3 py-2 text-left hover:bg-sheet-alt"
                            >
                              <span className="min-w-0 truncate text-[14px] font-semibold">{r.name}</span>
                              <span className="shrink-0 text-[12px] text-ink-muted">{r.pageCount}쪽</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await removePdf(r.name);
                                setRecentPdfs(await listPdfs());
                              }}
                              aria-label={`${r.name} 목록에서 지우기`}
                              className="p-2 text-ink-muted hover:text-danger"
                            >
                              <CloseIcon className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  loadPdf(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {pdf && pdf.pageCount > 1 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-ink-soft">
                    틀린 문항이 있는 쪽{" "}
                    <span className="text-ink-muted">(비우면 틀린 번호로 자동으로 찾아요)</span>
                  </span>
                  <input
                    value={pagesInput}
                    onChange={(e) => setPagesInput(e.target.value)}
                    placeholder={`자동 · 직접 적으려면 예: 2-3, 5 (1~${pdf.pageCount}쪽)`}
                    className="field"
                  />
                  <span className="text-xs text-ink-muted">
                    {manualPages.length > 0
                      ? `${manualPages.join(", ")}쪽만 보내요`
                      : numbers.length === 0
                        ? "틀린 번호를 적으면 그 문항이 있는 쪽을 찾아요."
                        : findingPages || autoPages === null
                          ? "틀린 문항이 있는 쪽을 찾는 중…"
                          : autoPages.size === 0
                            ? "PDF에서 번호를 찾지 못해 전체를 보내요. (글자가 없는 스캔 PDF일 수 있어요)"
                            : missingNumbers.length > 0
                              ? `${[...autoPages.entries()].map(([n, p]) => `${n}번→${p}쪽`).join(", ")} · ${missingNumbers.join(", ")}번은 못 찾아서 전체를 보내요`
                              : `자동으로 찾았어요: ${[...autoPages.entries()].map(([n, p]) => `${n}번→${p}쪽`).join(", ")} (${pages.join(", ")}쪽만 보내요)`}
                  </span>
                </label>
              )}
            </div>

            {/* 틀린 번호 */}
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-2">
                <span className="field-label">틀린 문항 번호</span>
                <input
                  value={numbersInput}
                  onChange={(e) => setNumbersInput(e.target.value)}
                  placeholder="예: 3, 7, 12-14"
                  className="field"
                />
              </label>
              {numbers.length > MAX_WRONG && (
                <span className="text-xs font-semibold text-danger">한 번에 {MAX_WRONG}개까지예요.</span>
              )}
              {totalInput && numbers.length > 0 && !totalValid && (
                <span className="text-xs font-semibold text-danger">틀린 문항이 푼 문항 수보다 많아요.</span>
              )}
              {numbers.length > 0 && numbers.length <= MAX_WRONG && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-ink-muted">
                    왜 틀렸는지 짧게 적으면 AI가 원인도 분류해요 (선택). 비우면 결과에서 직접 골라요.
                  </span>
                  {numbers.map((n) => (
                    <label key={n} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-right text-[14px] font-bold">{n}번</span>
                      <input
                        value={memos[n] ?? ""}
                        onChange={(e) => setMemos((m) => ({ ...m, [n]: e.target.value }))}
                        placeholder="예: 부호 실수, 공식이 헷갈림"
                        maxLength={100}
                        className="field px-2 py-1.5 text-[14px]"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs leading-relaxed text-ink-muted">
              PDF는 분석을 위해 Google Gemini로 보내지고 이 앱에는 저장되지 않아요. 무료 등급이라 보낸 내용이 Google 서비스
              개선에 쓰일 수 있어요. AI는 문제를 풀지 않고 무엇을 묻는 문제인지만 정리해요.
            </p>

            {error && !rows && (
              <p role="alert" className="notice-error">
                {error}
              </p>
            )}

            <button type="button" onClick={analyze} disabled={!ready || analyzing} className="btn-primary">
              {analyzing ? "AI가 틀린 문항을 찾는 중… (붐비면 1분 넘게 걸릴 수 있어요)" : `틀린 ${numbers.length || ""}문항 분석하기`}
            </button>
            {!ready && (
              <p className="-mt-3 text-xs text-ink-muted">
                과목, 단원, 푼 문항 수, PDF, 틀린 번호를 넣으면 분석할 수 있어요.
              </p>
            )}
          </div>
        </section>

        {/* 2. 결과 확인 */}
        <section ref={resultRef} className="sheet scroll-mt-24" aria-labelledby="result-title" aria-busy={analyzing}>
          <div className="sheet-head">
            <h2 id="result-title" className="sheet-title">
              분석 결과 확인
            </h2>
            {remaining !== null && (
              <span className="text-xs text-ink-muted">
                {usedModel && `${usedModel} 분석 · `}오늘 남은 분석 {remaining}번
              </span>
            )}
          </div>

          {!rows ? (
            <p className="p-5 text-[14px] leading-relaxed text-ink-muted">
              {analyzing
                ? "PDF에서 틀린 문항을 찾고 있어요."
                : "분석이 끝나면 틀린 문항마다 문제 유형과 필요한 개념이 여기에 나와요. 저장하기 전에 확인하고 고쳐 주세요."}
            </p>
          ) : saved ? (
            <div className="flex flex-col items-start gap-4 p-5">
              <p className="notice-ok">
                {subjectName} {unit} 결과를 저장했어요. {total}문항 중 {total - wrongCount}문항 맞음.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/scores" className="btn-primary">
                  학습 점수 보기 <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <Link href="/plan" className="btn-quiet">
                  계획 보기
                </Link>
                <Link href="/retry" className="btn-quiet">
                  틀린 문제 다시 풀기
                </Link>
                <button type="button" onClick={reset} className="btn-quiet">
                  다른 문제 분석
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-rule px-5 py-4">
                <span className="text-[14px] text-ink-soft">
                  {total}문항 중 <strong className="text-[20px] font-extrabold text-ink">{total - wrongCount}</strong> 맞음 ·
                  틀린 {wrongCount}문항
                </span>
                {undecided > 0 && (
                  <span className="text-[13px] font-semibold text-warn">틀린 원인 {undecided}개를 골라 주세요</span>
                )}
              </div>
              {note && <p className="notice-warn mx-5 mt-4">{note}</p>}

              {stats.length > 0 && (
                <div className="border-b border-rule px-5 py-4">
                  <h3 className="mb-2 text-[13px] font-bold">많이 틀린 유형</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.map((s) => (
                      <span key={s.type} className="border border-rule-strong px-2 py-0.5 text-[13px]">
                        <strong>{s.type}</strong> {s.wrong}
                        {s.topCause && <span className="ml-1 text-ink-muted">· {s.topCause}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <datalist id="known-types">
                {[...new Set([...knownTypes, ...rows.map((r) => r.problem_type)])].filter(Boolean).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <ol>
                {rows.map((r) => (
                  <li key={r.number} className="flex flex-col gap-2 border-b border-rule px-5 py-3">
                    <div className="flex items-start gap-3">
                      <span className="w-12 shrink-0 pt-1 text-[16px] font-extrabold">{r.number}번</span>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <p className={`text-[14px] leading-relaxed ${r.found ? "text-ink-soft" : "font-semibold text-warn"}`}>
                          {r.found ? r.summary || "(요약 없음)" : "PDF에서 이 문항을 찾지 못했어요. 유형을 직접 적어 주세요."}
                          {r.found && r.confidence === "low" && (
                            <span className="ml-2 text-[12px] font-semibold text-warn">확인 필요</span>
                          )}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[12px] text-ink-muted">문제 유형</span>
                            <input
                              value={r.problem_type}
                              list="known-types"
                              onChange={(e) => updateRow(r.number, { problem_type: e.target.value })}
                              className={`field px-2 py-1 text-[14px] ${r.problem_type.trim() ? "" : "border-danger"}`}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[12px] text-ink-muted">필요한 개념</span>
                            <input
                              value={r.concept}
                              onChange={(e) => updateRow(r.number, { concept: e.target.value })}
                              className="field px-2 py-1 text-[14px]"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`${r.number}번 틀린 원인`}>
                          {CAUSES.map((c) => (
                            <button
                              key={c}
                              type="button"
                              role="radio"
                              aria-checked={r.cause === c}
                              onClick={() => updateRow(r.number, { cause: c })}
                              className={`border px-2 py-0.5 text-[13px] font-semibold transition-colors ${
                                r.cause === c
                                  ? "border-mark bg-mark text-on-mark"
                                  : r.cause === "미정"
                                    ? "border-dashed border-warn text-ink-soft hover:text-ink"
                                    : "border-rule-strong text-ink-soft hover:text-ink"
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev?.filter((x) => x.number !== r.number) ?? null)}
                        aria-label={`${r.number}번 빼기`}
                        title="잘못 적은 번호면 빼기"
                        className="p-1 text-ink-muted hover:text-danger"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col items-end gap-1 p-5">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || undecided > 0 || emptyType || wrongCount === 0}
                  className="btn-primary"
                >
                  {saving ? "저장 중…" : "확인했어요, 저장하기"}
                </button>
                {(undecided > 0 || emptyType) && (
                  <span className="text-xs text-ink-muted">
                    {undecided > 0 ? "모든 문항의 틀린 원인을 골라야" : "모든 문항에 유형을 적어야"} 저장할 수 있어요
                  </span>
                )}
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
