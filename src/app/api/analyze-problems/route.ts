// AI 문제 유형 분석 API.
//
//  화면에서 줄인 사진(base64)을 받아 Claude에게 문항별 정리를 맡기고, 결과(JSON)를 그대로 돌려준다.
//  - ANTHROPIC_API_KEY는 서버 환경변수에만 있다. 브라우저로 내려가지 않는다.
//  - 로그인한 사용자만 쓸 수 있다: 요청에 붙은 Supabase 로그인 토큰을 확인한다.
//  - 하루 DAILY_LIMIT번까지 (ai_usage 테이블). 사진은 저장하지 않는다.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  ANALYSIS_SCHEMA,
  DAILY_LIMIT,
  MAX_IMAGES,
  type AnalysisResponse,
  type AnalyzeRequest,
} from "@/lib/problemAnalysis";

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const SYSTEM_PROMPT = `너는 고등학생의 시험지·문제집 사진을 문항별로 정리하는 도우미다. 결과는 학생의 학습 공백 분석 앱에 저장되어, 어떤 유형의 문제를 왜 틀리는지 찾는 데 쓰인다.

과목과 단원은 학생이 정했다. 그대로 두고 바꾸지 마라.

문항마다 다음을 정리한다.
- number: 사진에 적힌 문항 번호 그대로.
- result: 맞음(correct)/틀림(wrong)은 사진에 있는 채점 표시(O, ✓, X, 빗금, 감점 표시)나 함께 온 정답지와 비교해서만 정한다. 문제를 직접 풀어서 정답을 판단하지 마라. 채점 표시도 정답지도 없거나 알아볼 수 없으면 unknown으로 둔다. 정답지와 비교할 때는 학생의 최종 답만 비교한다.
- problem_type: 이 문항이 요구하는 능력을 2~10자 한국어 명사구로 쓴다. 예: 단순 계산, 공식 적용, 개념 이해, 그래프 해석, 도형 성질, 서술형 풀이, 어휘, 문법 판단, 지문 추론. 학생이 전에 쓴 유형 목록이 주어지면, 뜻이 같은 경우 반드시 그 이름을 그대로 다시 쓴다. 같은 능력을 묻는 문항은 같은 이름으로 묶는다. 단원 이름을 유형으로 쓰지 마라.
- cause: 틀린 문항만. 풀이 과정을 읽고 고른다.
  · 계산 실수: 방법은 맞는데 부호, 사칙연산, 옮겨 적기에서 틀림
  · 개념 부족: 공식·정의·성질을 잘못 알거나 잘못 적용함
  · 문제 이해: 조건을 빠뜨리거나 묻는 것을 잘못 읽음
  · 시간 부족: 풀이가 중간에 끊겼거나 비어 있고 끝부분 문항임
  · 기타: 풀이가 보이지 않거나 위에 해당하지 않음
  맞은 문항과 unknown 문항은 "없음".
- detail: 틀린 문항만, 풀이의 어디서 무엇을 잘못했는지 한 문장(예: "2번째 줄에서 -3을 이항할 때 부호를 바꾸지 않음"). 풀이가 안 보이면 그렇게 쓴다. 맞은 문항은 빈 문자열.
- confidence: 글씨가 흐리거나 채점 표시가 애매하면 low.

사진에 보이는 문항만 쓰고, 문항 하나에 한 줄이다. 이름 같은 개인정보는 옮겨 적지 마라. note에는 사진 전체에 대해 학생이 알아야 할 점(흐린 부분, 잘린 문항, 채점 표시가 없는 문항 등)을 한두 문장으로 쓴다. 문제가 없으면 빈 문자열.`;

function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** 한국 날짜 YYYY-MM-DD (하루 사용 횟수 기준) */
function seoulDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return badRequest("서버에 ANTHROPIC_API_KEY가 설정되지 않았어요. 환경변수를 확인해 주세요.", 500);
  }

  // 1) 로그인 확인
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return badRequest("로그인이 필요해요.", 401);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return badRequest("로그인이 만료됐어요. 다시 로그인해 주세요.", 401);
  const userId = userData.user.id;

  // 2) 요청 확인
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return badRequest("요청 형식이 올바르지 않아요.");
  }
  const subjectName = String(body.subjectName ?? "").trim().slice(0, 40);
  const unit = String(body.unit ?? "").trim().slice(0, 60);
  const images = Array.isArray(body.images) ? body.images : [];
  const answerKey = Array.isArray(body.answerKey) ? body.answerKey : [];
  if (!subjectName || !unit) return badRequest("과목과 단원을 정해 주세요.");
  if (images.length === 0) return badRequest("답안 사진을 한 장 이상 올려 주세요.");
  if (images.length + answerKey.length > MAX_IMAGES) return badRequest(`사진은 모두 ${MAX_IMAGES}장까지 올릴 수 있어요.`);
  for (const img of [...images, ...answerKey]) {
    if (!MEDIA_TYPES.has(img?.media_type) || typeof img?.data !== "string" || img.data.length < 100) {
      return badRequest("사진 형식이 올바르지 않아요. JPG·PNG·WEBP만 올릴 수 있어요.");
    }
  }
  const knownTypes = (Array.isArray(body.knownTypes) ? body.knownTypes : [])
    .map((t) => String(t).trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, 30);

  // 3) 하루 사용 횟수
  const day = seoulDay();
  const usage = await supabase.from("ai_usage").select("count").eq("day", day).maybeSingle();
  if (usage.error) {
    return badRequest(
      "AI 분석용 테이블이 없어요. Supabase SQL Editor에서 supabase/migrations/006_problem_analysis.sql을 실행해 주세요.",
      500
    );
  }
  const used = (usage.data as { count: number } | null)?.count ?? 0;
  if (used >= DAILY_LIMIT) return badRequest(`오늘 분석 가능 횟수(${DAILY_LIMIT}번)를 다 썼어요. 내일 다시 해 주세요.`, 429);

  // 4) Claude에게 문항별 정리 요청
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text:
        `과목: ${subjectName}\n단원: ${unit}\n` +
        `학생이 전에 쓴 유형: ${knownTypes.length ? knownTypes.join(", ") : "(없음)"}\n` +
        `정답지: ${answerKey.length ? `${answerKey.length}장 있음` : "없음 — 채점 표시로만 판단"}`,
    },
  ];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `학생 답안 사진 ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  });
  answerKey.forEach((img, i) => {
    content.push({ type: "text", text: `정답지 사진 ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  });

  const client = new Anthropic();
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // 안전 분류기가 거절하면 서버에서 다른 모델로 다시 시도 (거절 사유에 맞는 모델을 자동으로 고름)
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return badRequest("API 키가 올바르지 않아요.", 500);
    if (error instanceof Anthropic.RateLimitError) return badRequest("AI 요청이 몰려 있어요. 잠시 뒤 다시 해 주세요.", 429);
    if (error instanceof Anthropic.BadRequestError) return badRequest(`AI 요청 오류: ${error.message}`, 400);
    if (error instanceof Anthropic.APIError) return badRequest(`AI 서버 오류 (${error.status}). 잠시 뒤 다시 해 주세요.`, 502);
    return badRequest("AI 서버에 연결하지 못했어요.", 502);
  }

  if (message.stop_reason === "refusal") {
    return badRequest("AI가 이 사진을 분석하지 못했어요. 시험지만 보이게 다시 찍어 주세요.", 422);
  }
  if (message.stop_reason === "max_tokens") {
    return badRequest("문항이 너무 많아요. 사진을 나눠서 올려 주세요.", 422);
  }
  const text = message.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  let parsed: AnalysisResponse;
  try {
    parsed = JSON.parse(text) as AnalysisResponse;
  } catch {
    return badRequest("AI 응답을 읽지 못했어요. 다시 시도해 주세요.", 502);
  }

  // 5) 사용 횟수 +1 (성공한 분석만)
  await supabase.from("ai_usage").upsert({ user_id: userId, day, count: used + 1 }, { onConflict: "user_id,day" });

  return Response.json({ ...parsed, remaining: DAILY_LIMIT - used - 1 });
}
