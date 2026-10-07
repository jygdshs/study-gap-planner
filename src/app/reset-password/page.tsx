"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { describeAuthError, useAuth } from "@/lib/auth";
import { ArrowRightIcon } from "@/components/Icons";
import { PageFrame, PageHeader } from "@/components/ui";

// 9차시: 비밀번호 재설정.
// 로그인 화면의 '비밀번호를 잊으셨나요?' → 메일 링크 → 이 화면.
// 메일 링크를 열면 supabase-js가 주소의 인증 정보로 임시 로그인(복구 세션)을 만들어 주고,
// 그 상태에서 새 비밀번호를 저장한다.

export default function ResetPasswordPage() {
  const { session } = useAuth();
  const [password, setPassword] = useState("");
  const [passwordCheck, setPasswordCheck] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 해요.");
      return;
    }
    if (password !== passwordCheck) {
      setError("비밀번호 확인이 일치하지 않아요.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(describeAuthError(error.message));
      return;
    }
    setDone(true);
  };

  return (
    <PageFrame>
      <PageHeader title="새 비밀번호 정하기" description="앞으로 로그인할 때 쓸 새 비밀번호를 입력하세요." />

      <section className="sheet w-full max-w-md" aria-label="새 비밀번호">
        {!session ? (
          <div className="flex flex-col items-start gap-4 p-5">
            <p className="notice-warn">
              재설정 링크가 만료됐거나 이미 사용됐어요. 로그인 화면에서 ‘비밀번호를 잊으셨나요?’로 메일을
              다시 받아 주세요.
            </p>
            <Link href="/login" className="btn-primary">
              로그인 화면으로 <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        ) : done ? (
          <div className="flex flex-col items-start gap-4 p-5">
            <p role="status" className="notice-ok">
              새 비밀번호로 바꿨어요. 다음부터 새 비밀번호로 로그인하세요.
            </p>
            <Link href="/" className="btn-primary">
              처음 화면으로 <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5" noValidate>
            <p className="text-[13px] text-ink-muted">{session.user.email}</p>
            <label className="flex flex-col gap-2">
              <span className="field-label">
                새 비밀번호 <span className="font-normal text-ink-muted">6자 이상</span>
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="field-label">새 비밀번호 확인</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordCheck}
                onChange={(e) => setPasswordCheck(e.target.value)}
                className="field"
              />
            </label>
            {error && (
              <p role="alert" className="notice-error">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn-primary py-3.5 text-[15px]">
              {busy ? "저장 중…" : "새 비밀번호 저장"}
            </button>
          </form>
        )}
      </section>
    </PageFrame>
  );
}
