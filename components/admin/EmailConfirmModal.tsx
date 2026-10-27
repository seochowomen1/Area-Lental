"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

import Modal, { MODAL_BTN_DANGER, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from "@/components/ui/Modal";
import { adminErrorText, adminFetch, isAuthBusyError } from "@/lib/adminFetch";
import { formatShortMd } from "@/lib/payment";
import { EMAIL_SECTION_ID, OPEN_EMAIL_MODAL_EVENT } from "@/lib/paymentUi";

const SEND_FAIL = "메일을 보내지 못했습니다. 잠시 후 다시 눌러 주세요.";
const PREVIEW_FAIL = "메일 미리보기를 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.";

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
  /** 열었을 때 원본(제목·본문) — 고친 뒤 닫으면 확인(③-E) */
  const [original, setOriginal] = useState<{ subject: string; body: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [sendError, setSendError] = useState<{ text: string; busy: boolean } | null>(null);
  const [openError, setOpenError] = useState<{ text: string; busy: boolean } | null>(null);
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
    setOpenError(null);
    try {
      const res = await adminFetch(`/api/admin/email-preview?requestId=${encodeURIComponent(requestId)}`);
      const data = await res.json();
      if (data.ok) {
        setOriginal({ subject: data.subject, body: data.body });
        setSendError(null);
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
        setOpenError({ text: PREVIEW_FAIL, busy: false });
      }
    } catch (e) {
      setOpenError({ text: adminErrorText(e, PREVIEW_FAIL), busy: isAuthBusyError(e) });
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

  const forceClose = useCallback(() => {
    setConfirmClose(false);
    setOpen(false);
    setContent(null);
    setOriginal(null);
    setSendError(null);
  }, []);

  const dirty = !!content && !!original && (content.subject !== original.subject || content.body !== original.body);

  /** 닫기·ESC·바깥 클릭 — 고친 내용이 있으면 확인(③-E) */
  const requestClose = useCallback(() => {
    if (sending) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    forceClose();
  }, [sending, dirty, forceClose]);

  const send = useCallback(async () => {
    if (!content || sending) return;
    setSending(true);
    setSendError(null);

    const form = new FormData();
    form.set("subject", content.subject);
    form.set("body", content.body);
    // 수신자는 서버가 requestId로 조회 · 감사 target=신청번호 · 본문에 결제 링크가 있으면 paymentNoticeSentAt 기록 (03_api §8-2)
    form.set("requestId", requestId);

    try {
      const res = await adminFetch(`/api/admin/send-email`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.ok) {
        setToast("메일이 발송되었습니다.");
        forceClose();
        router.replace(pathname, { scroll: false });
        router.refresh();
      } else {
        setSendError({ text: SEND_FAIL, busy: false });
      }
    } catch (e) {
      setSendError({ text: adminErrorText(e, SEND_FAIL), busy: isAuthBusyError(e) });
    } finally {
      setSending(false);
    }
  }, [content, sending, router, pathname, requestId, forceClose]);

  const showSendButton = currentStatus !== "접수";

  return (
    <>
      {/* 토스트 메시지 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] animate-fade-in rounded-lg bg-ink px-5 py-3 text-sm font-medium text-white shadow-xl" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {/* 저장 완료 토스트 */}
      {saved === "1" && !mailed && (
        <SavedToast />
      )}

      {/* 메일 발송 버튼 — 처리 상태(승인/반려/취소)일 때만 표시 */}
      {showSendButton && (
        <section id={EMAIL_SECTION_ID} className="rounded-xl border-2 border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-base font-bold text-slate-900">메일 발송</h2>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-slate-600 mb-3">
              현재 처리 상태를 기반으로 신청자에게 안내 메일을 발송합니다.
            </p>
            <button
              type="button"
              onClick={openEmailModal}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-slate-50 disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
              </svg>
              {loading ? "불러오는 중…" : "메일 작성 및 발송"}
            </button>
            {openError && (
              <p role="alert" className={`mt-2 text-[13px] ${openError.busy ? "text-amber-800" : "text-red-700"}`}>{openError.text}</p>
            )}
            <p className="mt-2 text-[13px] text-slate-500">
              * 메일 내용을 미리 확인하고 수정한 뒤 발송할 수 있습니다.
            </p>
          </div>
        </section>
      )}

      {/* 이메일 확인 모달 — 공통 Modal(포커스 트랩·ESC·스크롤 잠금 · 보내는 중엔 닫히지 않음) */}
      <Modal
        open={open && !!content}
        onClose={requestClose}
        busy={sending || confirmClose}
        size="lg"
        title="메일 발송 확인"
        footer={
          <div className="flex w-full flex-col items-end gap-2">
            <div className="flex w-full justify-end gap-2">
              <button type="button" onClick={requestClose} disabled={sending} data-modal-cancel className={`${MODAL_BTN_SECONDARY} flex-1 md:flex-none`}>
                취소
              </button>
              <button type="button" onClick={send} disabled={sending} className={`${MODAL_BTN_PRIMARY} flex-1 md:flex-none`}>
                {sending ? "보내는 중…" : "메일 발송"}
              </button>
            </div>
            {sendError && (
              <p role="alert" className={`text-[13px] ${sendError.busy ? "text-amber-800" : "text-red-700"}`}>{sendError.text}</p>
            )}
          </div>
        }
      >
        {content && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">아래 내용을 확인하고 필요 시 수정한 뒤 발송해 주세요.</p>

            {/* 결제 안내 포함 여부 상태 줄 — 승인 상태일 때만 (02_ui §3) */}
            {isApprovedStatus(content.status ?? currentStatus) &&
              (content.paymentGuideIncluded ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  결제 안내 포함됨{content.paymentDueDate ? ` · 기한 ${formatShortMd(content.paymentDueDate)}` : ""}
                </div>
              ) : (
                <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  결제 링크가 저장되지 않아 이 메일에는 결제 안내가 없습니다. 링크를 먼저 저장하려면 닫기를 누르세요.
                </div>
              ))}

            <div>
              <label htmlFor="mail-to" className="mb-1 block text-sm font-semibold text-slate-600">받는 사람</label>
              {/* 받는 사람 = 신청 시 저장된 이메일(수정 불가 · audit-fix-1 [7]) */}
              <input
                id="mail-to"
                type="email"
                value={content.to}
                readOnly
                aria-readonly="true"
                className="w-full cursor-default rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[15px] text-slate-700 outline-none"
              />
            </div>

            <div>
              <label htmlFor="mail-subject" className="mb-1 block text-sm font-semibold text-slate-600">제목</label>
              <input
                id="mail-subject"
                data-autofocus
                type="text"
                value={content.subject}
                onChange={(e) => setContent({ ...content, subject: e.target.value })}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-brand focus:ring-2 focus:ring-sky sm:text-[15px]"
              />
            </div>

            <div>
              <label htmlFor="mail-body" className="mb-1 block text-sm font-semibold text-slate-600">본문</label>
              <textarea
                id="mail-body"
                value={content.body}
                onChange={(e) => setContent({ ...content, body: e.target.value })}
                rows={16}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-base outline-none focus:border-brand focus:ring-2 focus:ring-sky sm:text-[15px]"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 고친 메일을 닫을 때 확인(③-E) — 첫 포커스 [계속 작성] */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="고친 메일 내용이 사라집니다. 닫을까요?"
        showClose={false}
        size="sm"
        zIndexClass="z-[60]"
        bodyClassName="hidden"
        footer={
          <>
            <button type="button" data-modal-cancel onClick={() => setConfirmClose(false)} className={MODAL_BTN_SECONDARY}>
              계속 작성
            </button>
            <button type="button" onClick={forceClose} className={MODAL_BTN_DANGER}>
              닫기
            </button>
          </>
        }
      >
        {null}
      </Modal>
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
    <div role="status" className="fixed bottom-6 right-6 z-[60] rounded-lg bg-ink px-5 py-3 text-sm font-medium text-white shadow-xl">
      저장되었습니다.
    </div>
  );
}
