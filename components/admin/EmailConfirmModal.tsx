"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import { formatShortMd } from "@/lib/payment";
import { EMAIL_SECTION_ID, OPEN_EMAIL_MODAL_EVENT } from "@/lib/paymentUi";

type EmailContent = {
  to: string;
  subject: string;
  body: string;
  /** 묶음 표시 상태(email-preview 응답 · 03_api §8-1) */
  status?: string;
  /** 승인 ≥1 and 결제 링크 있음 → 본문에 [결제 안내] 블록 포함 */
  paymentGuideIncluded?: boolean;
  paymentDueDate?: string;
  paymentLinkUrl?: string;
};

interface EmailConfirmModalProps {
  requestId: string;
  /** 현재 신청 상태 — 접수가 아닌 경우에만 메일 발송 버튼 표시 */
  currentStatus: string;
}

export default function EmailConfirmModal({ requestId, currentStatus }: EmailConfirmModalProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const saved = searchParams.get("saved");
  const mailed = searchParams.get("mailed");

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<EmailContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 메일 발송 완료 토스트
  useEffect(() => {
    if (mailed === "1") {
      setToast("메일이 발송되었습니다.");
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [mailed]);

  /** 메일 발송 모달 열기 — 이메일 프리뷰를 가져와 모달 표시 */
  const openEmailModal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/email-preview?requestId=${encodeURIComponent(requestId)}`);
      const data = await res.json();
      if (data.ok) {
        setContent({
          to: data.to,
          subject: data.subject,
          body: data.body,
          status: typeof data.status === "string" ? data.status : undefined,
          paymentGuideIncluded: !!data.paymentGuideIncluded,
          paymentDueDate: typeof data.paymentDueDate === "string" ? data.paymentDueDate : "",
          paymentLinkUrl: typeof data.paymentLinkUrl === "string" ? data.paymentLinkUrl : "",
        });
        setOpen(true);
      } else {
        setToast("이메일 미리보기를 불러오지 못했습니다.");
      }
    } catch {
      setToast("이메일 미리보기를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  // 결제 안내 섹션(2단계 "승인 메일 보내기")에서 모달 열기 요청
  useEffect(() => {
    const handler = () => {
      void openEmailModal();
    };
    window.addEventListener(OPEN_EMAIL_MODAL_EVENT, handler);
    return () => window.removeEventListener(OPEN_EMAIL_MODAL_EVENT, handler);
  }, [openEmailModal]);

  const close = useCallback(() => {
    setOpen(false);
    setContent(null);
  }, []);

  const send = useCallback(async () => {
    if (!content) return;
    setSending(true);

    const form = new FormData();
    form.set("subject", content.subject);
    form.set("body", content.body);
    // 수신자는 서버가 requestId로 조회 · 감사 target=신청번호 · 본문에 결제 링크가 있으면 paymentNoticeSentAt 기록 (03_api §8-2)
    form.set("requestId", requestId);

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
        router.refresh();
      } else {
        setToast(data.message || "발송 실패");
      }
    } catch {
      setToast("발송 중 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  }, [content, router, pathname, requestId]);

  const showSendButton = currentStatus !== "접수";

  return (
    <>
      {/* 토스트 메시지 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] animate-fade-in rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 저장 완료 토스트 */}
      {saved === "1" && !mailed && (
        <SavedToast />
      )}

      {/* 메일 발송 버튼 — 처리 상태(승인/반려/취소)일 때만 표시 */}
      {showSendButton && (
        <section id={EMAIL_SECTION_ID} className="rounded-xl border-2 border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">메일 발송</h2>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-gray-600 mb-3">
              현재 처리 상태를 기반으로 신청자에게 안내 메일을 발송합니다.
            </p>
            <button
              type="button"
              onClick={openEmailModal}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
              </svg>
              {loading ? "불러오는 중..." : "메일 작성 및 발송"}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              * 메일 내용을 미리 확인하고 수정한 뒤 발송할 수 있습니다.
            </p>
          </div>
        </section>
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

            {/* 결제 안내 포함 여부 상태 줄 — 승인 상태일 때만 (02_ui §3) */}
            {isApprovedStatus(content.status ?? currentStatus) &&
              (content.paymentGuideIncluded ? (
                <div className="mx-6 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  결제 안내 포함됨{content.paymentDueDate ? ` · 기한 ${formatShortMd(content.paymentDueDate)}` : ""}
                </div>
              ) : (
                <div role="status" className="mx-6 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  결제 링크가 저장되지 않아 이 메일에는 결제 안내가 없습니다. 링크를 먼저 저장하려면 닫기를 누르세요.
                </div>
              ))}

            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">받는 사람</label>
                {/* 받는 사람 = 신청 시 저장된 이메일(수정 불가 · audit-fix-1 [7]) */}
                <input
                  type="email"
                  value={content.to}
                  readOnly
                  aria-readonly="true"
                  className="w-full cursor-default rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none"
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
                className="flex-1 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 md:flex-none"
              >
                취소
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="flex-1 rounded-lg bg-[rgb(var(--brand-primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 md:flex-none"
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

/** 승인 회차가 있는 상태인지(단건 "승인" · 묶음 "승인"/"부분처리") — 결제 안내 상태 줄 표시 조건 */
function isApprovedStatus(status: string): boolean {
  return status === "승인" || status === "부분처리" || status.includes("승인");
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
