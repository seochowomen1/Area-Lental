"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

type EmailContent = {
  to: string;
  subject: string;
  body: string;
};

export default function EmailConfirmModal({ requestId }: { requestId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const emailPending = searchParams.get("emailPending");
  const saved = searchParams.get("saved");
  const mailed = searchParams.get("mailed");

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<EmailContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 저장 후 이메일 발송 대기 상태 감지
  useEffect(() => {
    if (saved === "1" && emailPending) {
      setLoading(true);
      fetch(`/api/admin/email-preview?requestId=${encodeURIComponent(requestId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setContent({ to: data.to, subject: data.subject, body: data.body });
            setOpen(true);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [saved, emailPending, requestId]);

  // 메일 발송 완료 토스트
  useEffect(() => {
    if (mailed === "1") {
      setToast("메일이 발송되었습니다.");
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [mailed]);

  const close = useCallback(() => {
    setOpen(false);
    setContent(null);
    // URL에서 emailPending 파라미터 제거
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const send = useCallback(async () => {
    if (!content) return;
    setSending(true);

    const form = new FormData();
    form.set("to", content.to);
    form.set("subject", content.subject);
    form.set("body", content.body);

    try {
      const res = await fetch(`/api/admin/send-email`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.ok) {
        setToast("메일이 발송되었습니다.");
        setOpen(false);
        setContent(null);
        router.replace(pathname, { scroll: false });
      } else {
        setToast(data.message || "발송 실패");
      }
    } catch {
      setToast("발송 중 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  }, [content, router, pathname]);

  return (
    <>
      {/* 토스트 메시지 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] animate-fade-in rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 저장 완료 토스트 (이메일 없는 경우) */}
      {saved === "1" && !emailPending && !mailed && (
        <SavedToast />
      )}

      {/* 이메일 확인 모달 */}
      {open && content && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">메일 발송 확인</h2>
              <p className="mt-1 text-sm text-gray-500">
                아래 내용을 확인하고 필요 시 수정한 뒤 발송해 주세요.
              </p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">받는 사람</label>
                <input
                  type="email"
                  value={content.to}
                  onChange={(e) => setContent({ ...content, to: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">제목</label>
                <input
                  type="text"
                  value={content.subject}
                  onChange={(e) => setContent({ ...content, subject: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">본문</label>
                <textarea
                  value={content.body}
                  onChange={(e) => setContent({ ...content, body: e.target.value })}
                  rows={16}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={close}
                disabled={sending}
                className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                발송 안 함
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="rounded-lg bg-[rgb(var(--brand-primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {sending ? "발송 중..." : "메일 발송"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SavedToast() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
      저장되었습니다.
    </div>
  );
}
