// 서버 전용: Gemini를 부르는 API 라우트들(/api/analyze-problems, /api/concept)이 같이 쓰는 부분.
//  - 로그인 확인 (Supabase 로그인 토큰)
//  - 하루 사용 횟수 확인·증가 (ai_usage 테이블, 모든 AI 기능 합계)
//  - Gemini 호출: 붐비면(503) 한 번 더, 그래도 안 되면 다음 무료 모델로. 오류는 원인별 한국어 안내로.
// GEMINI_API_KEY는 이 파일을 쓰는 서버 코드에서만 읽힌다. 브라우저로 내려가지 않는다.

import { GoogleGenAI } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DAILY_AI_LIMIT = 50; // 하루 AI 사용 횟수 (PDF 분석 + 개념 정의 + 개념 채점 합계)

// 무료 등급에서 쓸 수 있는 Flash 모델들. 앞에서부터 시도한다. 첫 모델은 GEMINI_MODEL 환경변수로 바꿀 수 있다.
const MODELS = [
  ...new Set([process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]),
];
const RETRY_DELAY_MS = 3000;
// 모델 한 번 시도의 최대 시간. 최악의 경우(첫 모델 2번 + 다음 두 모델) 45초 × 4 + 3초 = 183초로,
// Vercel 함수 제한 시간(300초) 안에 끝나 화면이 오류 안내를 받을 수 있다. PDF 분석은 60초(최악 243초).
const ATTEMPT_TIMEOUT_MS = 45_000;

/** 잠깐 뒤 다시 하면 될 수 있는 오류: 서버 과부하·일시 오류, 연결 문제(상태 코드 없음) */
const isTransient = (status?: number) => !status || status >= 500;
/** 다른 모델로 바꾸면 될 수 있는 오류: 위 + 그 모델의 한도 초과(429)·모델 없음(404) */
const tryNextModel = (status?: number) => isTransient(status) || status === 429 || status === 404;

export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** 한국 날짜 YYYY-MM-DD (하루 사용 횟수 기준) */
function seoulDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

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

export interface AiContext {
  supabase: SupabaseClient;
  userId: string;
  day: string;
  used: number;
}

/** 키·로그인·하루 사용 횟수 확인. 문제가 있으면 바로 돌려줄 Response */
export async function startAiRequest(req: Request): Promise<AiContext | Response> {
  if (!process.env.GEMINI_API_KEY) {
    return fail("서버에 GEMINI_API_KEY가 설정되지 않았어요. 환경변수를 확인해 주세요.", 500);
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail("로그인이 필요해요.", 401);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return fail("로그인이 만료됐어요. 다시 로그인해 주세요.", 401);

  const day = seoulDay();
  const usage = await supabase.from("ai_usage").select("count").eq("day", day).maybeSingle();
  if (usage.error) {
    return fail(
      "AI 기능용 테이블이 없어요. Supabase SQL Editor에서 supabase/migrations/006_problem_analysis.sql을 실행해 주세요.",
      500
    );
  }
  const used = (usage.data as { count: number } | null)?.count ?? 0;
  if (used >= DAILY_AI_LIMIT) {
    return fail(`오늘 AI 사용 가능 횟수(${DAILY_AI_LIMIT}번)를 다 썼어요. 내일 다시 해 주세요.`, 429);
  }
  return { supabase, userId: userData.user.id, day, used };
}

/** 성공한 AI 요청만 1번으로 센다. 남은 횟수를 돌려준다 */
export async function countAiUse(ctx: AiContext): Promise<number> {
  await ctx.supabase
    .from("ai_usage")
    .upsert({ user_id: ctx.userId, day: ctx.day, count: ctx.used + 1 }, { onConflict: "user_id,day" });
  return DAILY_AI_LIMIT - ctx.used - 1;
}

type InteractionInput = { type: "text"; text: string } | { type: "document"; data: string; mime_type: "application/pdf" };

/**
 * Gemini에 구조화 출력(JSON)을 요청한다. 성공하면 파싱한 값과 모델 이름, 실패하면 안내 Response.
 * PDF·답안 같은 내용은 Gemini에 저장하지 말라고(store: false) 보낸다.
 */
export async function askGemini<T>(options: {
  system: string;
  input: InteractionInput[];
  schema: Record<string, unknown>;
  label: string; // 서버 로그용 이름
  attemptTimeoutMs?: number; // 모델 한 번 시도의 최대 시간 (기본 ATTEMPT_TIMEOUT_MS)
}): Promise<{ value: T; model: string } | Response> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError: ReturnType<typeof readGeminiError> | null = null;

  for (const [mi, model] of MODELS.entries()) {
    for (let attempt = 0; attempt < (mi === 0 ? 2 : 1); attempt++) {
      try {
        // SDK 자체 재시도는 끈다: 붐빌 때(503) SDK가 몰래 여러 번 기다리며 다시 보내 한 번에 몇 분씩 걸렸다.
        // 재시도·모델 전환은 이 반복문이 하고, 한 번 시도는 attemptTimeoutMs 안에 끝나게 한다.
        const interaction = await ai.interactions.create(
          {
            model,
            store: false,
            system_instruction: options.system,
            input: options.input,
            response_format: { type: "text", mime_type: "application/json", schema: options.schema },
          },
          { timeout_ms: options.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS, retries: { strategy: "none" } }
        );
        try {
          return { value: JSON.parse(interaction.output_text ?? "") as T, model };
        } catch {
          return fail("AI 응답을 읽지 못했어요. 다시 시도해 주세요.", 502);
        }
      } catch (error) {
        lastError = readGeminiError(error);
        // Vercel > Logs에서 원인을 볼 수 있게 남긴다 (키는 들어 있지 않음)
        console.error(`[${options.label}] Gemini error`, { ...lastError, model, attempt });
        if (!tryNextModel(lastError.status) || lastError.reason === "API_KEY_INVALID") return explain(lastError);
        if (!isTransient(lastError.status)) break; // 429·404는 기다리지 않고 바로 다음 모델
        if (attempt === 0 && mi === 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  return explain(lastError ?? { message: "알 수 없는 오류" });
}

function explain({ status, reason, message }: { status?: number; reason?: string; message: string }): Response {
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
  if (status) return fail(`Gemini 모델들이 모두 붐비고 있어요 (${status}). 몇 분 뒤 다시 해 주세요. (${message})`, 503);
  return fail(`Gemini 서버에 연결하지 못했어요. (${message})`, 502);
}
