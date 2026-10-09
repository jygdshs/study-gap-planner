// AI 문제 유형 분석 API (Google Gemini, 무료 등급).
//
//  화면에서 필요한 쪽만 잘라낸 문제 PDF(base64)와 틀린 번호를 받아, Gemini에게 그 문항만 정리하게 한다.
//  로그인 확인·하루 사용 횟수·모델 전환·오류 안내는 src/lib/geminiServer.ts에서 한다. PDF는 저장하지 않는다.

import { askGemini, countAiUse, fail, startAiRequest } from "@/lib/geminiServer";
import {
  ANALYSIS_SCHEMA,
  CAUSES,
  MAX_PDF_BASE64,
  MAX_WRONG,
  type AnalysisResponse,
  type AnalyzeRequest,
} from "@/lib/problemAnalysis";
const SYSTEM_PROMPT = `너는 고등학생이 푼 문제 PDF에서, 학생이 틀렸다고 알려 준 문항만 찾아 정리하는 도우미다. 결과는 학생의 학습 공백 분석 앱에 저장되어, 어떤 유형의 문제를 왜 틀리는지 찾고 공부 계획을 세우는 데 쓰인다.

과목과 단원은 학생이 정했다. 그대로 두고 바꾸지 마라.

학생이 알려 준 번호마다 한 줄씩, 알려 준 순서대로 정리한다. 다른 문항은 쓰지 마라.
PDF의 문항 번호는 "009.", "09", "9)", "[9]", "문제 9"처럼 앞에 0이 붙거나 기호가 붙어 있을 수 있다. 숫자가 같으면 같은 문항이다(학생의 9번 = PDF의 009.). PDF는 학생이 고른 쪽만 잘라낸 것일 수 있으니 쪽 번호는 신경 쓰지 마라.
- number: 학생이 알려 준 번호 그대로 (PDF에 적힌 0 붙은 번호가 아니라).
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

export async function POST(req: Request) {
  // 1) 키·로그인·하루 사용 횟수
  const ctx = await startAiRequest(req);
  if (ctx instanceof Response) return ctx;

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

  // 3) Gemini에게 틀린 문항 정리 요청
  const request =
    `과목: ${subjectName}\n단원: ${unit}\n` +
    `학생이 전에 쓴 유형: ${knownTypes.length ? knownTypes.join(", ") : "(없음)"}\n` +
    `틀린 문항 (번호: 학생 메모):\n` +
    wrong.map((w) => `- ${w.number}번: ${w.memo || "(메모 없음)"}`).join("\n");

  const result = await askGemini<AnalysisResponse>({
    system: SYSTEM_PROMPT,
    input: [
      { type: "document", data: pdf, mime_type: "application/pdf" },
      { type: "text", text: request },
    ],
    schema: ANALYSIS_SCHEMA,
    label: "analyze-problems",
  });
  if (result instanceof Response) return result;
  const parsed = result.value;
  if (!Array.isArray(parsed?.problems)) return fail("AI 응답을 읽지 못했어요. 다시 시도해 주세요.", 502);

  // 원인 값이 목록 밖이면 '미정'으로 (학생이 고르게)
  const allowed = new Set<string>([...CAUSES, "미정"]);
  parsed.problems = parsed.problems.map((p) => ({ ...p, cause: allowed.has(p.cause) ? p.cause : "미정" }));

  // 4) 사용 횟수 +1 (성공한 분석만)
  const remaining = await countAiUse(ctx);
  return Response.json({ ...parsed, remaining, model: result.model });
}