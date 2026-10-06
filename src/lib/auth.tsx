"use client";

// 8차시: 로그인 상태(Supabase Auth, 이메일+비밀번호)를 앱 전체에 알려 주는 Provider.
// 세션은 supabase-js가 브라우저에 저장하므로, 새로고침하거나 다른 탭을 열어도 로그인이 유지된다.
// 데이터는 DB의 RLS가 '로그인한 사용자 자기 행만' 돌려주므로, 다른 기기에서 같은 계정으로 들어오면 같은 데이터가 보인다.

import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/** Supabase Auth 영어 오류 메시지를 화면용 한국어로 */
export function describeAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "이메일 또는 비밀번호가 맞지 않아요.";
  if (m.includes("email not confirmed"))
    return "아직 이메일 인증이 안 됐어요. 받은 메일함(스팸함 포함)에서 인증 링크를 눌러 주세요.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (m.includes("password should be at least") || m.includes("weak password"))
    return "비밀번호는 6자 이상이어야 해요.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.";
  if (m.includes("invalid email") || m.includes("unable to validate email"))
    return "이메일 형식이 올바르지 않아요.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "서버에 연결하지 못했어요. Supabase 프로젝트가 일시 정지됐는지 확인해 주세요.";
  return message;
}
