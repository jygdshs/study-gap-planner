"use client";

import { useEffect, useState } from "react";
import { useAuth, USERNAME_MAX, USERNAME_MIN, validateUsername } from "@/lib/auth";
import { PageFrame, PageHeader } from "@/components/ui";

// 내 정보: 상단에 보이는 아이디를 바꾼다. (이메일은 로그인용이라 여기서는 보여주기만)

export default function AccountPage() {
  const { user, displayName, hasUsername, updateUsername, signOut } = useAuth();
  const [draft, setDraft] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // 다른 기기에서 바꿔 세션이 갱신된 경우 등, 저장된 값이 바뀌면 입력칸도 맞춘다
  useEffect(() => {
    setDraft(displayName);
  }, [displayName]);

  const trimmed = draft.trim();
  const unchanged = hasUsername && trimmed === displayName;
  const liveError = draft.length > 0 ? validateUsername(draft) : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    const error = await updateUsername(draft);
    setSaving(false);
    setMessage(error ? { type: "error", text: error } : { type: "ok", text: "아이디를 바꿨어요." });
  };

  return (
    <PageFrame>
      <PageHeader title="내 정보" description="상단 메뉴에 보이는 아이디를 바꿀 수 있어요. 로그인은 이메일로 해요." />

      <section className="sheet w-full max-w-md" aria-labelledby="account-title">
        <div className="sheet-head">
          <h2 id="account-title" className="sheet-title">
            계정
          </h2>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5 p-5" noValidate>
          {!hasUsername && (
            <p className="notice-warn">
              아직 아이디를 정하지 않아 이메일 앞부분(<strong>{displayName}</strong>)을 대신 보여주고
              있어요. 원하는 아이디로 바꿔 보세요.
            </p>
          )}

          <label className="flex flex-col gap-2">
            <span className="field-label">
              아이디{" "}
              <span className="font-normal text-ink-muted">
                {USERNAME_MIN}~{USERNAME_MAX}자 · 다른 사람과 같아도 돼요
              </span>
            </span>
            <input
              type="text"
              autoComplete="nickname"
              value={draft}
              maxLength={USERNAME_MAX}
              onChange={(e) => {
                setDraft(e.target.value);
                setMessage(null);
              }}
              aria-invalid={liveError ? true : undefined}
              className="field text-[17px] font-bold"
            />
            <span className={`text-xs ${liveError ? "text-danger" : "text-ink-muted"}`}>
              {liveError ?? `${trimmed.length}/${USERNAME_MAX}자`}
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="field-label">이메일</span>
            <span className="border border-rule bg-sheet-alt px-3 py-2.5 text-[15px] text-ink-soft">
              {user?.email}
            </span>
          </div>

          {message && (
            <p
              role={message.type === "error" ? "alert" : "status"}
              className={message.type === "ok" ? "notice-ok" : "notice-error"}
            >
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || unchanged || !!liveError || trimmed.length === 0}
            className="btn-primary py-3"
          >
            {saving ? "저장 중…" : unchanged ? "지금 아이디예요" : "아이디 저장하기"}
          </button>

          <button type="button" onClick={signOut} className="btn-quiet">
            로그아웃
          </button>
        </form>
      </section>
    </PageFrame>
  );
}
