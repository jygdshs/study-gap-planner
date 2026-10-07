"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { describeAuthError, USERNAME_MAX, validateUsername } from "@/lib/auth";
import { ConfigNotice, PageFrame, PageHeader } from "@/components/ui";

// 8차시: 이메일 + 비밀번호 로그인 / 회원가입.
// 로그인에 성공하면 AppShell이 처음 화면으로 보낸다.

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordCheck, setPasswordCheck] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setMessage(null);
    setPasswordCheck("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!email.trim() || !password) {
      setMessage({ type: "error", text: "이메일과 비밀번호를 입력해 주세요." });
      return;
    }
    if (mode === "signup") {
      const usernameError = validateUsername(username);
      if (usernameError) {
        setMessage({ type: "error", text: usernameError });
        return;
      }
      if (password.length < 6) {
        setMessage({ type: "error", text: "비밀번호는 6자 이상이어야 해요." });
        return;
      }
      if (password !== passwordCheck) {
        setMessage({ type: "error", text: "비밀번호 확인이 일치하지 않아요." });
        return;
      }
    }

    setBusy(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) setMessage({ type: "error", text: describeAuthError(error.message) });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // 아이디는 계정 정보(user_metadata)에 함께 저장 → 상단 메뉴에 이메일 대신 표시
      options: { emailRedirectTo: window.location.origin, data: { username: username.trim() } },
    });
    setBusy(false);
    if (error) {
      setMessage({ type: "error", text: describeAuthError(error.message) });
      return;
    }
    if (!data.session) {
      // 이메일 인증이 켜져 있으면 세션 없이 가입만 된다
      setMessage({
        type: "ok",
        text: `${email.trim()} 으로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 여기서 로그인하세요.`,
      });
      setMode("signin");
      setPassword("");
      setPasswordCheck("");
    }
  };

  return (
    <PageFrame>
      <PageHeader
        title={mode === "signin" ? "로그인" : "회원가입"}
        description="같은 계정으로 로그인하면 휴대폰·노트북 어디서든 같은 학습 기록과 계획을 볼 수 있어요."
      />
      <ConfigNotice />

      <section className="sheet w-full max-w-md" aria-label={mode === "signin" ? "로그인" : "회원가입"}>
        <div role="tablist" aria-label="로그인 또는 회원가입" className="grid grid-cols-2 border-b border-rule">
          {(
            [
              ["signin", "로그인"],
              ["signup", "회원가입"],
            ] as const
          ).map(([value, label]) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchMode(value)}
                className={`relative py-3.5 text-[15px] font-bold transition-colors ${
                  active ? "text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 bottom-[-1px] h-[3px] bg-mark transition-transform duration-200 ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5" noValidate>
          <label className="flex flex-col gap-2">
            <span className="field-label">이메일</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="field"
            />
          </label>

          {mode === "signup" && (
            <label className="flex flex-col gap-2">
              <span className="field-label">
                아이디 <span className="font-normal text-ink-muted">상단에 표시돼요 · 2~{USERNAME_MAX}자</span>
              </span>
              <input
                type="text"
                autoComplete="nickname"
                value={username}
                maxLength={USERNAME_MAX}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="예: 공부왕2511"
                className="field"
              />
            </label>
          )}

          <label className="flex flex-col gap-2">
            <span className="field-label">
              비밀번호 {mode === "signup" && <span className="font-normal text-ink-muted">6자 이상</span>}
            </span>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
            />
          </label>

          {mode === "signup" && (
            <label className="flex flex-col gap-2">
              <span className="field-label">비밀번호 확인</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordCheck}
                onChange={(e) => setPasswordCheck(e.target.value)}
                className="field"
              />
            </label>
          )}

          {message && (
            <p
              role={message.type === "error" ? "alert" : "status"}
              className={message.type === "ok" ? "notice-ok" : "notice-error"}
            >
              {message.text}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary py-3.5 text-[15px]">
            {busy ? "처리 중…" : mode === "signin" ? "로그인" : "가입하기"}
          </button>

          <p className="text-center text-[13px] text-ink-muted">
            {mode === "signin" ? "처음이세요? " : "이미 계정이 있나요? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-accent hover:underline"
            >
              {mode === "signin" ? "회원가입" : "로그인"}
            </button>
          </p>
        </form>
      </section>
    </PageFrame>
  );
}
