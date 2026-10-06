import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // 개발/빌드 중 .env.local 설정을 깜빡했을 때 바로 알아챌 수 있도록 콘솔에 경고만 남깁니다.
  // (throw 하지 않는 이유: createClient에 빈 문자열을 넘기면 즉시 예외가 나서
  //  .env.local 없이는 `next build`조차 실패하기 때문. 실제 요청은 어차피 실패하므로
  //  더미 URL로 만들어 두고, 화면 쪽에서 isSupabaseConfigured로 안내 문구를 보여준다.)
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경 변수가 설정되지 않았습니다. .env.local을 확인하세요."
  );
}

/**
 * 8차시 통합 테스트에서 발견: Supabase 무료 프로젝트가 7일 미접속으로 일시 정지되면
 * 주소 자체를 찾지 못해 "Failed to fetch"만 떠서 원인을 알기 어렵다. 해결 방법을 함께 안내한다.
 */
export function describeLoadError(message: string): string {
  if (/failed to fetch|network/i.test(message)) {
    return `${message} — Supabase 프로젝트가 일시 정지됐을 수 있어요. 대시보드에서 프로젝트를 복구(Restore)한 뒤 다시 시도해 주세요.`;
  }
  return message;
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "public-anon-key-placeholder"
);
