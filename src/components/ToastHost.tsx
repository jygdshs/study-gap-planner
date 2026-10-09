"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/Icons";

// 화면 아래에 잠깐 뜨는 알림. 어느 화면에서든 showToast(...)로 띄운다.
//  - action: "되돌리기"처럼 누를 수 있는 버튼 (삭제 되돌리기 등)
//  - 화면을 옮겨도 사라지지 않도록 AppShell에 하나만 둔다

export interface ToastOptions {
  text: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  duration?: number; // ms (기본 6초)
}

const EVENT = "app-toast";

export function showToast(options: ToastOptions) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastOptions>(EVENT, { detail: options }));
}

export default function ToastHost() {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastOptions>).detail;
      if (timer.current) clearTimeout(timer.current);
      const id = Date.now();
      setToast({ ...detail, id });
      timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), detail.duration ?? 6000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <div className="pointer-events-auto flex max-w-lg items-center gap-3 bg-shell px-4 py-3 text-[14px] text-white shadow-lg">
        <span className="min-w-0 flex-1">{toast.text}</span>
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await toast.onAction?.();
              } finally {
                setBusy(false);
                setToast(null);
              }
            }}
            className="shrink-0 border border-white/40 px-2.5 py-1 font-semibold hover:bg-white/10 disabled:opacity-60"
          >
            {busy ? "…" : toast.actionLabel}
          </button>
        )}
        <button type="button" onClick={() => setToast(null)} aria-label="알림 닫기" className="shrink-0 p-1 text-white/70 hover:text-white">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
