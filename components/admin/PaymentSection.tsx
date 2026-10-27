"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AUTH_STORE_BUSY_MESSAGE } from "@/lib/adminConstants";
import { adminFetch, AdminFetchError, isAuthBusyError } from "@/lib/adminFetch";

import Checkbox from "@/components/ui/Checkbox";
import { PAYMENT_LABELS } from "@/lib/labels";
import { PAYMENT_METHODS, addDaysYmd, formatShortMd, autoCancelReason } from "@/lib/payment";
import { formatKRW } from "@/lib/pricing";
import {
  EMAIL_SECTION_ID,
  OPEN_EMAIL_MODAL_EVENT,
  fullDateTimeFromIso,
  hasPaymentFlow,
  shortDateTimeFromIso,
  type PaymentViewDTO,
} from "@/lib/paymentUi";

type Panel = "notice" | "confirm" | "refund" | "restore" | null;

type Props = {
  requestId: string;
  view: PaymentViewDTO;
  todayYmd: string;
};

/* ── 스타일 토큰 (02_ui §0) ── */
// 버튼 3종·비활성(투명도 없음) — audit-fix-2 ③-A-5
const DISABLED = "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500";
const BTN_PRIMARY =
  `inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl bg-brand px-5 py-2 text-[15px] font-semibold text-white hover:bg-brand-hover ${DISABLED}`;
const BTN_OUTLINE =
  `inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2 text-[15px] font-semibold text-ink hover:bg-slate-50 ${DISABLED}`;
const BTN_OUTLINE_SM =
  `inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-slate-50 ${DISABLED}`;
const BTN_PRIMARY_SM =
  `inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover ${DISABLED}`;
const BTN_DISABLED_SM =
  "inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 cursor-not-allowed";
const INPUT =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-sky/40 min-h-[44px] sm:text-[15px]";
const LABEL = "block text-sm font-semibold text-slate-700 mb-1.5";
const HELP = "mt-1 text-[13px] text-slate-500 leading-5";
const HELP_WARN = "mt-1 text-[13px] text-amber-800 leading-5";
const ERR = "mt-1 text-[13px] font-semibold text-red-700";
const ERR_BUSY = "mt-1 text-[13px] font-semibold text-amber-800";
const LINK = "inline-flex min-h-[44px] items-center text-sm font-semibold text-brand underline hover:opacity-80";

/** ③-D 실패 문구(네트워크·서버 오류) */
const SAVE_FAIL = "저장하지 못했습니다. 잠시 후 다시 눌러 주세요.";

function isAllowedLinkClient(url: string): boolean {
  if (!url.trim()) return true; // 빈값 허용(기한만 저장)
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "seochowomen.kr" || h === "www.seochowomen.kr";
  } catch {
    return false;
  }
}

/**
 * 관리자 API 호출 — 401은 로그인으로, 503 AUTH_STORE_BUSY는 로그인으로 보내지 않고 G-1 문구(R3).
 * 그 밖 4xx는 서버 message를 그대로 보여 주고, 네트워크·5xx는 ③-D 실패 문구.
 */
async function callApi(url: string, method: "PUT" | "POST", body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await adminFetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
    return { status: res.status, data };
  } catch (e) {
    if (e instanceof AdminFetchError) {
      if (e.busy) throw e;
      if (e.status >= 500) throw e;
      return { status: e.status, data: { ok: false, message: e.message, code: e.code } };
    }
    throw e;
  }
}

/** catch 블록 문구 — busy(503)면 G-1, 아니면 ③-D */
function failText(e: unknown, fallback: string = SAVE_FAIL): { text: string; busy: boolean } {
  if (isAuthBusyError(e)) return { text: AUTH_STORE_BUSY_MESSAGE, busy: true };
  return { text: fallback, busy: false };
}

export default function PaymentSection({ requestId, view, todayYmd }: Props) {
  const router = useRouter();
  const base = `/api/admin/requests/${encodeURIComponent(requestId)}`;

  const [panel, setPanel] = useState<Panel>(null);
  /** 처리 중인 버튼 — 그 버튼만 라벨을 처리 중 문구로 바꾼다(③-D) */
  const [busyAction, setBusyAction] = useState<null | "notice" | "payment" | "refund" | "homepage" | "restore">(null);
  const busy = busyAction !== null;
  const [error, setError] = useState<string | null>(null);
  /** 503 지연이면 오류색 대신 접수톤 */
  const [errorBusy, setErrorBusy] = useState(false);
  /** 4단계(홈페이지 마감) 버튼 아래 실패 문구 */
  const [homeError, setHomeError] = useState<{ text: string; busy: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [noticeWarnings, setNoticeWarnings] = useState<string[]>([]);
  const [restoreConflicts, setRestoreConflicts] = useState<Array<{ requestId: string; date: string; startTime: string; endTime: string; reason: string }>>([]);

  // 1단계 폼
  const [link, setLink] = useState(view.paymentLinkUrl);
  const [due, setDue] = useState(view.paymentDueDate || view.defaultDueDate);
  const [posted, setPosted] = useState(view.homepageState !== "notPosted");
  const dueRef = useRef<HTMLInputElement>(null);

  // 3단계 폼
  const [method, setMethod] = useState<string>(view.paymentMethod || PAYMENT_METHODS[0]);
  const [paidAt, setPaidAt] = useState(view.paidAt || todayYmd);
  const [amount, setAmount] = useState<string>(String(view.paymentState === "paid" || view.paymentState === "refunded" ? view.paidAmountKRW : view.approvedFeeKRW));
  const [note, setNote] = useState(view.paymentNote);

  // 환불 폼
  const [refundedAt, setRefundedAt] = useState(todayYmd);
  const [refundAmount, setRefundAmount] = useState<string>(String(view.paidAmountKRW));
  const [refundReason, setRefundReason] = useState("");

  // 복구 폼
  const [restoreDue, setRestoreDue] = useState(addDaysYmd(todayYmd, 7));

  // 서버 데이터가 바뀌면(router.refresh) 폼 기본값 동기화
  useEffect(() => {
    setLink(view.paymentLinkUrl);
    setDue(view.paymentDueDate || view.defaultDueDate);
    setPosted(view.homepageState !== "notPosted");
    setMethod(view.paymentMethod || PAYMENT_METHODS[0]);
    setPaidAt(view.paidAt || todayYmd);
    setAmount(String(view.paymentState === "paid" || view.paymentState === "refunded" ? view.paidAmountKRW : view.approvedFeeKRW));
    setNote(view.paymentNote);
    setRefundAmount(String(view.paidAmountKRW));
  }, [view, todayYmd]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openPanel = useCallback((p: Panel) => {
    setError(null);
    setErrorBusy(false);
    setRestoreConflicts([]);
    setPanel(p);
  }, []);

  const closePanel = useCallback(() => {
    setError(null);
    setErrorBusy(false);
    setPanel(null);
  }, []);

  /* ── 파생 상태 ── */
  const flow = hasPaymentFlow(view);
  const isAuto = view.paymentState === "autoCancelled";
  const isPaid = view.paymentState === "paid";
  const isRefunded = view.paymentState === "refunded";
  const isOverdue = view.paymentState === "overdue";
  const posted_ = view.homepageState === "posted";
  const closed_ = view.homepageState === "closed";
  const hasLink = !!view.paymentLinkUrl;

  const step1Done = !!view.paymentDueDate;
  const step2Done = !!view.noticeSentAt;
  const step3Done = isPaid || isRefunded;
  const step4NotPosted = step3Done && view.homepageState === "notPosted" && !isAuto; // 현장 결제 · 게시 안 함 → 자동 완료 취급
  const step4Done = closed_ || step4NotPosted;
  // 4단계 버튼: 3단계 완료 전엔 비활성(오케스트레이터 지시) · 자동 취소 건은 예외로 활성
  const step4Enabled = isAuto ? !closed_ : step3Done && posted_ && !closed_;

  let current: 0 | 1 | 2 | 3 | 4 = 0;
  if (isAuto) current = closed_ ? 0 : 4;
  else if (!step1Done) current = 1;
  else if (!step2Done && hasLink) current = 2;
  else if (!step3Done) current = 3;
  else if (!step4Done) current = 4;

  const summary = (() => {
    if (!flow) return "";
    if (isAuto) return closed_ ? `자동 취소 · 홈페이지 마감 ${formatShortMd(view.homepageClosedAt)}` : "자동 취소 · 4단계만 남음";
    if (current === 0) return closed_ ? `완료 · 홈페이지 마감 ${formatShortMd(view.homepageClosedAt)}` : "완료";
    const due = view.dueDateShort ? (isOverdue ? ` · 결제 기한 ${view.dueDateShort} 지남` : ` · 결제 기한 ${view.dueDateShort}`) : "";
    return `${current}단계 진행 중${due}`;
  })();

  /* ── 동작 ── */
  const focusDue = useCallback(() => {
    openPanel("notice");
    window.setTimeout(() => {
      dueRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      dueRef.current?.focus();
    }, 50);
  }, [openPanel]);

  const openEmail = useCallback(() => {
    const sec = document.getElementById(EMAIL_SECTION_ID);
    sec?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent(OPEN_EMAIL_MODAL_EVENT));
  }, []);

  async function saveNotice() {
    setError(null);
    setErrorBusy(false);
    if (!due) return setError("결제 기한을 입력해 주세요.");
    if (due < todayYmd)
      return setError("결제 기한은 오늘 이전으로 저장할 수 없습니다. 이미 지난 기한으로 두려면 그대로 두고, 취소하려면 처리 상태에서 취소하세요.");
    if (!isAllowedLinkClient(link)) return setError("결제 링크는 https://www.seochowomen.kr 로 시작하는 주소만 저장할 수 있습니다.");
    if (busy) return;
    setErrorBusy(false);
    setBusyAction("notice");
    try {
      const { data } = await callApi(`${base}/payment-notice`, "PUT", {
        paymentLinkUrl: link.trim(),
        paymentDueDate: due,
        homepagePosted: posted,
      });
      if (!data.ok) return setError(String(data.message || "저장에 실패했습니다."));
      const changed = data.dueDateChanged as { from?: string; to?: string } | null;
      setNoticeWarnings(Array.isArray(data.warnings) ? (data.warnings as string[]) : []);
      setToast(changed && changed.from ? `결제 기한을 ${formatShortMd(changed.to ?? due)}로 바꿨습니다. 자동 취소 대상에서 제외됩니다.` : "결제 안내를 저장했습니다.");
      setPanel(null);
      router.refresh();
    } catch (e) {
      const f = failText(e);
      setError(f.text);
      setErrorBusy(f.busy);
    } finally {
      setBusyAction(null);
    }
  }

  const amountNum = Number.parseInt(amount || "0", 10);
  const amountDiffers = Number.isFinite(amountNum) && amountNum !== view.approvedFeeKRW;

  async function savePayment() {
    setError(null);
    setErrorBusy(false);
    if (!paidAt) return setError("결제일을 입력해 주세요.");
    if (paidAt > todayYmd) return setError("결제일은 오늘 이후로 입력할 수 없습니다.");
    if (!Number.isFinite(amountNum) || amountNum < 0) return setError("결제 금액은 0원 이상이어야 합니다.");
    if (amountDiffers && !note.trim()) return setError("승인 금액과 다른 금액은 비고가 필요합니다.");
    if (busy) return;
    setErrorBusy(false);
    setBusyAction("payment");
    try {
      const { data } = await callApi(`${base}/payment`, "POST", {
        paymentMethod: method,
        paidAt,
        paidAmountKRW: amountNum,
        paymentNote: note.trim(),
      });
      if (!data.ok) return setError(String(data.message || "기록에 실패했습니다."));
      setToast(data.action === "update" ? "결제 기록을 수정했습니다." : "결제 완료로 기록했습니다.");
      setPanel(null);
      router.refresh();
    } catch (e) {
      const f = failText(e);
      setError(f.text);
      setErrorBusy(f.busy);
    } finally {
      setBusyAction(null);
    }
  }

  async function saveRefund() {
    setError(null);
    setErrorBusy(false);
    const n = Number.parseInt(refundAmount || "0", 10);
    if (!refundedAt) return setError("환불일을 입력해 주세요.");
    if (refundedAt > todayYmd) return setError("환불일은 오늘 이후로 입력할 수 없습니다.");
    if (!Number.isFinite(n) || n < 0 || n > view.paidAmountKRW) return setError("환불 금액은 0원 이상, 결제 금액 이하여야 합니다.");
    if (!refundReason.trim()) return setError("환불 사유를 입력해 주세요.");
    if (busy) return;
    setErrorBusy(false);
    setBusyAction("refund");
    try {
      const { data } = await callApi(`${base}/payment/refund`, "POST", {
        refundedAt,
        refundAmountKRW: n,
        refundReason: refundReason.trim(),
      });
      if (!data.ok) return setError(String(data.message || "기록에 실패했습니다."));
      setToast("환불로 기록했습니다.");
      setPanel(null);
      setRefundReason("");
      router.refresh();
    } catch (e) {
      const f = failText(e);
      setError(f.text);
      setErrorBusy(f.busy);
    } finally {
      setBusyAction(null);
    }
  }

  async function closeHomepage() {
    if (busy) return;
    setError(null);
    setErrorBusy(false);
    setHomeError(null);
    setBusyAction("homepage");
    try {
      const { data } = await callApi(`${base}/homepage-close`, "POST", {});
      if (!data.ok) {
        setHomeError({ text: String(data.message || SAVE_FAIL), busy: false });
        return;
      }
      setToast("홈페이지 마감을 기록했습니다. 노출이 끝났습니다.");
      router.refresh();
    } catch (e) {
      setHomeError(failText(e));
    } finally {
      setBusyAction(null);
    }
  }

  async function restore() {
    setError(null);
    setErrorBusy(false);
    setRestoreConflicts([]);
    if (!restoreDue) return setError("새 결제 기한을 입력해 주세요.");
    if (restoreDue < todayYmd)
      return setError("결제 기한은 오늘 이전으로 저장할 수 없습니다. 이미 지난 기한으로 두려면 그대로 두고, 취소하려면 처리 상태에서 취소하세요.");
    if (busy) return;
    setErrorBusy(false);
    setBusyAction("restore");
    try {
      const { data } = await callApi(`${base}/restore`, "POST", { paymentDueDate: restoreDue });
      if (!data.ok) {
        setError(String(data.message || "복구에 실패했습니다."));
        if (Array.isArray(data.conflicts)) setRestoreConflicts(data.conflicts as typeof restoreConflicts);
        return;
      }
      setToast("승인으로 복구했습니다.");
      setPanel(null);
      router.refresh();
    } catch (e) {
      const f = failText(e);
      setError(f.text);
      setErrorBusy(f.busy);
    } finally {
      setBusyAction(null);
    }
  }

  /* ── 렌더 ── */
  if (!flow) {
    return (
      <SectionCard title="결제 안내·확인">
        <p className="text-sm text-slate-500">승인 후에 결제 안내를 진행할 수 있습니다.</p>
      </SectionCard>
    );
  }

  const dueAfterUsage = !!(due && view.usageStartDate && due > view.usageStartDate);

  return (
    <>
      {toast && (
        <div aria-live="polite" className="fixed bottom-6 right-6 z-[60] rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* ── 경고 띠 (우선순위: 빨강 > 주황) ── */}
      {isOverdue ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 md:flex-row md:items-center md:justify-between">
          <span>결제 기한 {view.dueDateShort}이 지났습니다. 다음 09:00에 자동 취소됩니다. 기다려 주려면 [기한 연장], 현장에서 받았으면 [결제 확인]을 누르세요.</span>
          <div className="flex gap-2 md:shrink-0">
            <button type="button" onClick={focusDue} className={`${BTN_OUTLINE_SM} flex-1 md:flex-none`}>기한 연장</button>
            <button type="button" onClick={() => openPanel("confirm")} className={`${BTN_PRIMARY_SM} flex-1 md:flex-none`}>결제 확인</button>
          </div>
        </div>
      ) : isPaid && posted_ ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          결제가 끝났는데 홈페이지 강좌가 아직 게시 중입니다. 다른 사람이 결제할 수 있으니 홈페이지에서 마감·미게시로 바꾼 뒤 아래 4단계를 눌러 주세요.
        </div>
      ) : isAuto && posted_ ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          결제 기한이 지나 신청이 자동 취소되었습니다. 복지종합시스템과 홈페이지의 강좌는 자동으로 닫히지 않습니다. 홈페이지에서 마감·미게시로 바꾼 뒤 아래 4단계를 눌러 주세요.
        </div>
      ) : null}

      <SectionCard title="결제 안내·확인" summary={summary}>
        {/* 자동 취소 띠 + 승인으로 복구 */}
        {isAuto && (
          <div className="mb-3">
            <div role="status" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
              <span>
                {fullDateTimeFromIso(view.autoCancelledAt)} 자동 취소 · 사유: {autoCancelReason(view.paymentDueDate)}
              </span>
              <button type="button" onClick={() => (panel === "restore" ? closePanel() : openPanel("restore"))} className={`${BTN_OUTLINE_SM} md:shrink-0`}>
                승인으로 복구
              </button>
            </div>
            {panel === "restore" && (
              <Panel>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor="restore-due">새 결제 기한</label>
                    <input id="restore-due" type="date" className={INPUT} value={restoreDue} min={todayYmd} onChange={(e) => setRestoreDue(e.target.value)} />
                    <p className={HELP}>복구하면 같은 날짜·시간대에 다른 신청이 없는지 먼저 확인합니다. 겹치면 복구되지 않습니다.</p>
                  </div>
                </div>
                {error && <p role="alert" className={errorBusy ? ERR_BUSY : ERR}>{error}</p>}
                {restoreConflicts.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-rose-700">
                    {restoreConflicts.map((c, i) => (
                      <li key={`${c.requestId}-${c.date}-${i}`}>
                        {c.date} {c.startTime}~{c.endTime} · {c.reason}
                        {c.requestId ? ` · ${c.requestId}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={restore} disabled={busy} className={`${BTN_PRIMARY} flex-1 md:flex-none whitespace-nowrap break-keep`}>{busyAction === "restore" ? "복구 중…" : "승인으로 복구"}</button>
                  <button type="button" onClick={closePanel} disabled={busy} className={`${BTN_OUTLINE} flex-1 md:flex-none whitespace-nowrap`}>닫기</button>
                </div>
              </Panel>
            )}
          </div>
        )}

        <ol className="divide-y divide-slate-100">
          {/* ── 1단계 ── */}
          <Step
            n={1}
            title="결제 링크·기한"
            state={isAuto ? "off" : step1Done ? "done" : current === 1 ? "current" : "next"}
            right={
              step1Done ? (
                <>
                  <span>
                    {isAuto ? "" : "✓ "}결제 안내 저장 · 기한 {view.dueDateShort}
                    {hasLink && (
                      <>
                        {" · "}
                        <a href={view.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className={LINK}>링크 열기</a>
                      </>
                    )}
                  </span>
                  {!isAuto && (
                    <button type="button" onClick={() => (panel === "notice" ? closePanel() : openPanel("notice"))} className={LINK}>수정</button>
                  )}
                </>
              ) : null
            }
          >
            {noticeWarnings.length > 0 && panel !== "notice" && (
              <ul className="mt-1 space-y-0.5">
                {noticeWarnings.map((w) => (
                  <li key={w} className="text-xs text-amber-700">{w}</li>
                ))}
              </ul>
            )}
            {!isAuto && (panel === "notice" || (current === 1 && panel === null)) && (
              <Panel>
                <div>
                  <label className={LABEL} htmlFor="pay-link">홈페이지 결제 링크</label>
                  <input
                    id="pay-link"
                    type="url"
                    className={INPUT}
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://www.seochowomen.kr/… (홈페이지 강좌 상세 주소)"
                  />
                  <p className={HELP}>홈페이지에서 웹게시한 강좌의 주소를 붙여넣으세요. seochowomen.kr 주소만 저장됩니다.</p>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor="pay-due">결제 기한</label>
                    <input id="pay-due" ref={dueRef} type="date" className={INPUT} value={due} onChange={(e) => setDue(e.target.value)} />
                    {dueAfterUsage && (
                      <p className={HELP_WARN}>
                        결제 기한이 이용 시작일({formatShortMd(view.usageStartDate)}) 이후입니다. 이용 당일까지 결제가 없으면 현장에서 받아야 합니다. 그대로 저장하려면 저장을 누르세요.
                      </p>
                    )}
                    <p className={HELP}>
                      홈페이지 접수기간 종료일과 같게 둡니다. 기본은 승인일로부터 7일이며 더 길게 둘 수 있습니다(전시는 보통 더 깁니다). 기한 다음 날 09:00에 결제가 확인되지 않은 신청은 자동 취소됩니다.
                    </p>
                  </div>
                  <div>
                    <span className={LABEL}>홈페이지 게시</span>
                    <Checkbox
                      checked={posted}
                      onChange={(e) => setPosted(e.target.checked)}
                      label="홈페이지에 게시함(웹게시 완료)"
                      help={'체크하면 "홈페이지 게시중"으로 표시되어 마감 처리를 잊지 않게 합니다.'}
                    />
                  </div>
                </div>
                {error && <p role="alert" className={errorBusy ? ERR_BUSY : ERR}>{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={saveNotice} disabled={busy} className={`${BTN_PRIMARY} flex-1 md:flex-none whitespace-nowrap break-keep`}>{busyAction === "notice" ? "저장 중…" : "결제 안내 저장"}</button>
                  {step1Done && (
                    <button type="button" onClick={closePanel} disabled={busy} className={`${BTN_OUTLINE} flex-1 md:flex-none whitespace-nowrap`}>닫기</button>
                  )}
                </div>
              </Panel>
            )}
          </Step>

          {/* ── 2단계 ── */}
          <Step
            n={2}
            title="승인 메일"
            state={isAuto ? "off" : step2Done ? "done" : current === 2 ? "current" : "next"}
            right={
              step2Done ? (
                <span>
                  {isAuto ? "" : "✓ "}결제 안내 메일 발송 {shortDateTimeFromIso(view.noticeSentAt)}
                  {view.reminderSentAt ? ` · 기한 전날 리마인드 ${formatShortMd(view.reminderSentAt.slice(0, 10))}` : ""}
                </span>
              ) : isAuto ? (
                <span>발송 기록 없음</span>
              ) : current !== 2 ? (
                <>
                  {!hasLink && <span className="text-xs text-amber-700">링크를 저장하지 않으면 메일에 결제 안내가 빠집니다.</span>}
                  <button type="button" onClick={openEmail} className={BTN_OUTLINE_SM}>승인 메일 보내기</button>
                </>
              ) : null
            }
          >
            {!isAuto && !step2Done && current === 2 && (
              <Panel>
                {hasLink ? (
                  <p className="text-sm text-slate-600">결제 안내가 메일에 자동으로 들어갑니다. 내용을 확인하고 발송하세요.</p>
                ) : (
                  <p className="text-sm text-amber-700">링크를 저장하지 않으면 메일에 결제 안내가 빠집니다.</p>
                )}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={openEmail} className={`${BTN_PRIMARY} flex-1 md:flex-none whitespace-nowrap break-keep`}>승인 메일 보내기</button>
                </div>
              </Panel>
            )}
          </Step>

          {/* ── 3단계 ── */}
          <Step
            n={3}
            title="결제 확인"
            state={isAuto ? "off" : step3Done ? "done" : current === 3 ? "current" : "next"}
            right={
              isAuto ? (
                <span>자동 취소된 신청 · 다시 받으려면 승인으로 복구</span>
              ) : isPaid ? (
                <>
                  <span>✓ 결제완료 {formatShortMd(view.paidAt)} · {view.paymentMethod || "방식 미기재"} · {formatKRW(view.paidAmountKRW)}</span>
                  <button type="button" onClick={() => (panel === "confirm" ? closePanel() : openPanel("confirm"))} className={LINK}>결제 기록 수정</button>
                  <button type="button" onClick={() => (panel === "refund" ? closePanel() : openPanel("refund"))} className={LINK}>환불 기록</button>
                </>
              ) : isRefunded ? (
                <>
                  <span>✓ 환불 {formatShortMd(view.refundedAt)} · {formatKRW(view.refundAmountKRW)}{view.refundReason ? ` · ${view.refundReason}` : ""}</span>
                  <button type="button" onClick={() => (panel === "confirm" ? closePanel() : openPanel("confirm"))} className={LINK}>결제 기록 수정</button>
                </>
              ) : panel !== "confirm" ? (
                <button type="button" onClick={() => openPanel("confirm")} className={current === 3 ? BTN_PRIMARY_SM : BTN_OUTLINE_SM}>결제 확인</button>
              ) : null
            }
          >
            {!isAuto && panel === "confirm" && (
              <Panel>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className={LABEL} htmlFor="pay-method">결제 방식</label>
                    <select id="pay-method" className={INPUT} value={method} onChange={(e) => setMethod(e.target.value)}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="pay-date">결제일</label>
                    <input id="pay-date" type="date" className={INPUT} value={paidAt} max={todayYmd} onChange={(e) => setPaidAt(e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="pay-amount">결제 금액(원)</label>
                    <input
                      id="pay-amount"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      className={`${INPUT} text-right tabular-nums`}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    {amountDiffers ? (
                      <p className={HELP_WARN}>{PAYMENT_LABELS.approvedFee} {formatKRW(view.approvedFeeKRW)}과 다릅니다. 비고에 이유를 적어 주세요.</p>
                    ) : (
                      <p className={HELP}>{PAYMENT_LABELS.approvedFee} {formatKRW(view.approvedFeeKRW)}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <label className={LABEL} htmlFor="pay-note">
                    비고(영수증·승인번호 앞자리 등 · 선택){amountDiffers && <span className="ml-1 text-rose-600">(필수)</span>}
                  </label>
                  <textarea
                    id="pay-note"
                    rows={2}
                    maxLength={300}
                    className={`${INPUT} min-h-[64px]`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="카드번호·계좌번호 전체는 적지 마세요"
                  />
                </div>
                <p className="mt-3 text-xs text-slate-600">이 신청을 &quot;결제완료&quot;로 기록합니다. 실제 결제는 홈페이지·복지종합시스템에서 확인했는지 한 번 더 보세요.</p>
                {error && <p role="alert" className={errorBusy ? ERR_BUSY : ERR}>{error}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={savePayment} disabled={busy} className={`${BTN_PRIMARY} flex-1 md:flex-none whitespace-nowrap break-keep`}>
                    {busyAction === "payment" ? "기록 중…" : step3Done ? "결제 기록 수정" : "결제 완료로 기록"}
                  </button>
                  <button type="button" onClick={closePanel} disabled={busy} className={`${BTN_OUTLINE} flex-1 md:flex-none whitespace-nowrap`}>닫기</button>
                </div>
              </Panel>
            )}
            {!isAuto && panel === "refund" && isPaid && (
              <Panel>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className={LABEL} htmlFor="refund-date">환불일</label>
                    <input id="refund-date" type="date" className={INPUT} value={refundedAt} max={todayYmd} onChange={(e) => setRefundedAt(e.target.value)} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="refund-amount">환불 금액(원)</label>
                    <input
                      id="refund-amount"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={view.paidAmountKRW}
                      step={1}
                      className={`${INPUT} text-right tabular-nums`}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                    <p className={HELP}>결제 금액 {formatKRW(view.paidAmountKRW)}</p>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="refund-reason">환불 사유<span className="ml-1 text-rose-600">(필수)</span></label>
                    <input id="refund-reason" type="text" maxLength={300} className={INPUT} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="예: 신청자 취소(이용 7일 전)" />
                  </div>
                </div>
                {error && <p role="alert" className={errorBusy ? ERR_BUSY : ERR}>{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={saveRefund} disabled={busy} className={`${BTN_PRIMARY} flex-1 md:flex-none whitespace-nowrap break-keep`}>{busyAction === "refund" ? "기록 중…" : "환불로 기록"}</button>
                  <button type="button" onClick={closePanel} disabled={busy} className={`${BTN_OUTLINE} flex-1 md:flex-none whitespace-nowrap`}>닫기</button>
                </div>
              </Panel>
            )}
          </Step>

          {/* ── 4단계 ── */}
          <Step
            n={4}
            title="홈페이지 마감"
            state={step4Done ? (step4NotPosted ? "skip" : "done") : current === 4 ? "current" : "next"}
            right={
              closed_ ? (
                <span>✓ 홈페이지 마감·미게시 {formatShortMd(view.homepageClosedAt)}</span>
              ) : step4NotPosted ? (
                <span className="text-slate-500">홈페이지에 게시하지 않음</span>
              ) : step4Enabled ? (
                <>
                  {isAuto && !posted_ && <span className="text-xs text-slate-500">홈페이지·복지종합시스템 등록을 확인하고 닫았으면 누르세요</span>}
                  <button type="button" onClick={closeHomepage} disabled={busy} className={current === 4 ? BTN_PRIMARY_SM : BTN_OUTLINE_SM}>
                    {busyAction === "homepage" ? "기록 중…" : "홈페이지 마감·미게시 처리 완료"}
                  </button>
                  {homeError && <p role="alert" className={`w-full ${homeError.busy ? ERR_BUSY : ERR}`}>{homeError.text}</p>}
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-500">결제 확인 후 홈페이지에서 마감·미게시로 바꾼 다음 누르세요.</span>
                  <button type="button" disabled className={BTN_DISABLED_SM}>홈페이지 마감·미게시 처리 완료</button>
                </>
              )
            }
          />
        </ol>
      </SectionCard>
    </>
  );
}

/* ── 보조 컴포넌트 ── */

function SectionCard({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border-2 border-slate-200 bg-white shadow-sm" id="payment-section">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="shrink-0 break-keep text-sm font-bold text-slate-900">{title}</h2>
        {summary && <span className="text-xs text-slate-500">{summary}</span>}
      </div>
      <div className="px-5 py-3">{children}</div>
    </section>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 border-l-[3px] border-l-brand bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      {children}
    </div>
  );
}

type StepState = "done" | "current" | "next" | "off" | "skip";

function Step({ n, title, state, right, children }: { n: number; title: string; state: StepState; right?: ReactNode; children?: ReactNode }) {
  const circle =
    state === "done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : state === "current"
        ? "border-brand bg-brand text-white"
        : state === "off"
          ? "border-slate-100 bg-slate-50 text-slate-500"
          : state === "skip"
            ? "border-slate-200 bg-slate-50 text-slate-500"
            : "border-slate-200 bg-white text-slate-500";
  const titleCls =
    state === "current" ? "text-base font-bold text-slate-900 leading-[22px]" : state === "done" ? "text-sm font-semibold text-slate-700 leading-7" : "text-sm font-semibold text-slate-500 leading-7";
  return (
    <li className="grid grid-cols-[28px_1fr] gap-3 py-3.5" aria-current={state === "current" ? "step" : undefined}>
      <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${circle}`}>{state === "done" || state === "skip" ? "✓" : n}</div>
      <div className="min-w-0">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
          <div>
            {state === "current" && <div className="text-xs font-bold leading-[14px] text-brand">지금 할 일</div>}
            <div className={titleCls}>{n}. {title}</div>
          </div>
          {right && (
            <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm md:justify-end md:leading-7 ${state === "off" ? "text-slate-500" : "text-slate-600"}`}>{right}</div>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}
