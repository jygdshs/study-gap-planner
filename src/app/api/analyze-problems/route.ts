// AI 문제 유형 분석 API (Google Gemini, 무료 등급).
//
//  화면에서 필요한 쪽만 잘라낸 문제 PDF(base64)와 틀린 번호를 받아, Gemini에게 그 문항만 정리하게 한다.
//  - GEMINI_API_KEY는 서버 환경변수에만 있다. 브라우저로 내려가지 않는다.
//  - 로그인한 사용자만 쓸 수 있다: 요청에 붙은 Supabase 로그인 토큰을 확인한다.
//  - 하루 DAILY_LIMIT번까지 (ai_usage 테이블). PDF는 저장하지 않고, Gemini에도 저장하지 말라고(store: false) 보낸다.

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  ANALYSIS_SCHEMA,
  CAUSES,
  DAILY_LIMIT,
  MAX_PDF_BASE64,
  MAX_WRONG,
  type AnalysisResponse,
  type AnalyzeRequest,
} from "@/lib/problemAnalysis";

// 무료 등급에서 쓸 수 있는 Flash 모델들. 앞에서부터 시도하고, 사용자가 몰려 있거나(503) 한도에 걸리면 다음 모델로.
// 첫 모델은 GEMINI_MODEL 환경변수로 바꿀 수 있다.
const MODELS = [
  ...new Set([process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]),
];
const RETRY_DELAY_MS = 3000;

/** 잠깐 뒤 다시 하면 될 수 있는 오류: 서버 과부하·일시 오류, 연결 문제(상태 코드 없음) */
const isTransient = (status?: number) => !status || status >= 500;
/** 다른 모델로 바꾸면 될 수 있는 오류: 위 + 그 모델의 한도 초과(429)·모델 없음(404) */
const tryNextModel = (status?: number) => isTransient(status) || status === 429 || status === 404;

const SYSTEM_PROMPT = `너는 고등학생이 푼 문제 PDF에서, 학생이 틀렸다고 알려 준 문항만 찾아 정리하는 도우미다. 결과는 학생의 학습 공백 분석 앱에 저장되어, 어떤 유형의 문제를 왜 틀리는지 찾고 공부 계획을 세우는 데 쓰인다.

과목과 단원은 학생이 정했다. 그대로 두고 바꾸지 마라.

학생이 알려 준 번호마다 한 줄씩, 알려 준 순서대로 정리한다. 다른 문항은 쓰지 마라.
- number: 학생이 알려 준 번호 그대로.
- found: PDF에서 그 번호의 문항을 찾았으면 true. 못 찾았으면 false로 두고 나머지는 빈 문자열, cause는 "미정", confidence는 low.
- summary: 무엇을 묻는 문제인지 한 줄. 문제를 풀거나 정답·풀이를 쓰지 마라.
- problem_type: 이 문항이 요구하는 능력을 2~10자 한국어 명사구로. 예: 단순 계산, 공식 적용, 그래프 해석, 접선의 방정식, 넓이 계산, 보기 판단형, 서술형 풀이, 어휘 의미, 문법 판단, 지문 추론. 학생이 전에 쓴 유형 목록이 주어지면, 뜻이 같은 경우 반드시 그 이름을 그대로 다시 쓴다. 같은 능력을 묻는 문항은 같은 이름으로 묶는다. 단원 이름을 그대로 유형으로 쓰지 마라.
- concept: 이 문제를 풀려면 알아야 하는 핵심 개념 한 가지 (예: "미분계수의 정의", "정적분과 넓이의 관계").
- cause: 학생 메모가 있을 때만 메모를 보고 고른다.
  · 계산 실수: 방법은 아는데 부호, 사칙연산, 옮겨 적기에서 틀림
  · 개념 부족: 공식·정의·성질을 모르거나 잘못 앎
  · 문제 이해: 조건을 빠뜨리거나 묻는 것을 잘못 읽음
  · 시간 부족: 시간이 모자라 못 풀었음
  · 기타: 위에 해당하지 않음
  메모가 없으면 반드시 "미정". 문제 내용만 보고 원인을 짐작하지 마라.
- confidence: 문항을 확실히 찾고 유형이 분명하면 high, 수식이 깨져 보이거나 애매하면 low.

note에는 학생이 알아야 할 점(못 찾은 번호, 글자가 깨진 쪽 등)을 한두 문장으로 쓴다. 문제가 없으면 빈 문자열.`;

/**
 * Gemini 오류에서 상태 코드·사유·메시지를 꺼낸다.
 * Interactions API는 BadRequestError 같은 자체 오류를 던지고, 본문(body)에 JSON 문자열로
 * [{ error: { code, message, status, details: [{ reason }] } }] 형태의 내용이 들어 있다.
 */
function readGeminiError(error: unknown): { status?: number; reason?: string; message: string } {
  const e = error as { status?: number; statusCode?: number; body?: unknown; message?: string; cause?: { message?: string } };
  const status = e?.status ?? e?.statusCode;
  let reason: string | undefined;
  let message = e?.message ?? String(error);
  try {
    const raw = typeof e?.body === "string" ? JSON.parse(e.body) : e?.body;
    const err = (Array.isArray(raw) ? raw[0] : raw)?.error;
    if (err?.message) message = err.message;
    reason =
      (err?.details as { reason?: string }[] | undefined)?.find((d) => d?.reason)?.reason ?? err?.status ?? undefined;
  } catch {
    // 본문이 JSON이 아니면 원래 메시지를 쓴다
  }
  if (!status && e?.cause?.message) message = `${message} (${e.cause.message})`;
  return { status, reason, message: String(message).slice(0, 300) };
}

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** 한국 날짜 YYYY-MM-DD (하루 사용 횟수 기준) */
function seoulDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return fail("서버에 GEMINI_API_KEY가 설정되지 않았어요. 환경변수를 확인해 주세요.", 500);
  }

  // 1) 로그인 확인
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail("로그인이 필요해요.", 401);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return fail("로그인이 만료됐어요. 다시 로그인해 주세요.", 401);
  const userId = userData.user.id;

  // 2) 요청 확인
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return fail("요청 형식이 올바르지 않아요.");
  }
  const subjectName = String(body.subjectName ?? "").trim().slice(0, 40);
  const unit = String(body.unit ?? "").trim().slice(0, 60);
  const wrong = (Array.isArray(body.wrong) ? body.wrong : [])
    .map((w) => ({ number: String(w?.number ?? "").trim().slice(0, 10), memo: String(w?.memo ?? "").trim().slice(0, 100) }))
    .filter((w) => w.number);
  const pdf = typeof body.pdf === "string" ? body.pdf : "";
  if (!subjectName || !unit) return fail("과목과 단원을 정해 주세요.");
  if (wrong.length === 0) return fail("틀린 문항 번호를 넣어 주세요.");
  if (wrong.length > MAX_WRONG) return fail(`틀린 문항은 한 번에 ${MAX_WRONG}개까지 분석할 수 있어요.`);
  if (!pdf.startsWith("JVBER")) return fail("PDF 파일이 아니에요."); // base64로 쓴 "%PDF"
  if (pdf.length > MAX_PDF_BASE64) return fail("PDF가 너무 커요. 틀린 문항이 있는 쪽만 골라 주세요.");
  const knownTypes = (Array.isArray(body.knownTypes) ? body.knownTypes : [])
    .map((t) => String(t).trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, 30);

  // 3) 하루 사용 횟수
  const day = seoulDay();
  const usage = await supabase.from("ai_usage").select("count").eq("day", day).maybeSingle();
  if (usage.error) {
    return fail(
      "AI 분석용 테이블이 없어요. Supabase SQL Editor에서 supabase/migrations/006_problem_analysis.sql을 실행해 주세요.",
      500
    );
  }
  const used = (usage.data as { count: number } | null)?.count ?? 0;
  if (used >= DAILY_LIMIT) return fail(`오늘 분석 가능 횟수(${DAILY_LIMIT}번)를 다 썼어요. 내일 다시 해 주세요.`, 429);

  // 4) Gemini에게 틀린 문항 정리 요청
  const request =
    `과목: ${subjectName}\n단원: ${unit}\n` +
    `학생이 전에 쓴 유형: ${knownTypes.length ? knownTypes.join(", ") : "(없음)"}\n` +
    `틀린 문항 (번호: 학생 메모):\n` +
    wrong.map((w) => `- ${w.number}번: ${w.memo || "(메모 없음)"}`).join("\n");

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const callModel = async (model: string) => {
    const interaction = await ai.interactions.create({
      model,
      store: false,
      system_instruction: SYSTEM_PROMPT,
      input: [
        { type: "document", data: pdf, mime_type: "application/pdf" },
        { type: "text", text: request },
      ],
      response_format: { type: "text", mime_type: "application/json", schema: ANALYSIS_SCHEMA },
    });
    return interaction.output_text;
  };

  // 첫 모델은 일시 오류면 한 번 더 기다렸다 시도, 그래도 안 되면 다음 모델로
  let text: string | undefined;
  let usedModel: string | null = null;
  let lastError: ReturnType<typeof readGeminiError> | null = null;
  attempts: for (const [mi, model] of MODELS.entries()) {
    for (let attempt = 0; attempt < (mi === 0 ? 2 : 1); attempt++) {
      try {
        text = await callModel(model);
        usedModel = model;
        break attempts;
      } catch (error) {
        lastError = readGeminiError(error);
        // Vercel > Logs에서 원인을 볼 수 있게 남긴다 (키는 들어 있지 않음)
        console.error("[analyze-problems] Gemini error", { ...lastError, model, attempt });
        if (!tryNextModel(lastError.status) || lastError.reason === "API_KEY_INVALID") break attempts;
        if (!isTransient(lastError.status)) break; // 429·404는 기다리지 않고 바로 다음 모델
        if (attempt === 0 && mi === 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  if (!usedModel && lastError) {
    const { status, reason, message } = lastError;
    if (reason === "API_KEY_INVALID") {
      return fail("Gemini API 키가 올바르지 않아요. Vercel 환경변수의 GEMINI_API_KEY 값을 다시 확인해 주세요.", 500);
    }
    if (status === 429) return fail("Gemini 무료 사용 한도에 걸렸어요. 잠시(또는 내일) 뒤 다시 해 주세요.", 429);
    if (status === 401 || status === 403) {
      return fail(`이 계정에서 Gemini API를 쓸 수 없어요. 학교 계정이면 관리자가 막아 두었을 수 있어요. (${message})`, 500);
    }
    if (status === 404) {
      return fail(`쓸 수 있는 Gemini 모델을 찾지 못했어요. GEMINI_MODEL 환경변수로 모델을 지정해 주세요. (${message})`, 500);
    }
    if (status && status < 500) return fail(`Gemini 요청 오류 (${status}): ${message}`, 400);
    if (status) {
      return fail(`Gemini 모델들이 모두 붐비고 있어요 (${status}). 몇 분 뒤 다시 해 주세요. (${message})`, 503);
    }
    return fail(`Gemini 서버에 연결하지 못했어요. (${message})`, 502);
  }
  let parsed: AnalysisResponse;
  try {
    parsed = JSON.parse(text ?? "") as AnalysisResponse;
    if (!Array.isArray(parsed.problems)) throw new Error("bad shape");
  } catch {
    return fail("AI 응답을 읽지 못했어요. 다시 시도해 주세요.", 502);
  }
  // 원인 값이 목록 밖이면 '미정'으로 (학생이 고르게)
  const allowed = new Set<string>([...CAUSES, "미정"]);
  parsed.problems = parsed.problems.map((p) => ({ ...p, cause: allowed.has(p.cause) ? p.cause : "미정" }));

  // 5) 사용 횟수 +1 (성공한 분석만)
  await supabase.from("ai_usage").upsert({ user_id: userId, day, count: used + 1 }, { onConflict: "user_id,day" });

  return Response.json({ ...parsed, remaining: DAILY_LIMIT - used - 1, model: usedModel });
}
