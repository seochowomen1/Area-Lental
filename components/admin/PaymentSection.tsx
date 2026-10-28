"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

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

/**
 * 결제 안내·확인 (payment-link-record · 2026-10-26) → audit-fix-3 3-2 간소화안 v2로 재구성
 *
 * - 입력 폼(결제 안내 저장·결제 확인·환불·자동 취소 되돌리기)은 화면 맨 위 "다음 할 일" 카드 안에서만 열린다
 *   (`PaymentForms` — 카드가 그림). 같은 폼이 한 화면에 두 번 생기지 않게 상태는 이 Provider 한 곳에 둔다.
 * - 아래 "처리 기록"(`PaymentRecord`)은 4단계 완료 표시·날짜만 보여 주고, 각 줄의 `고치기`가 위 카드의 폼을 연다.
 * - 결제 섹션 위 경고 띠 3종(기한 지남·결제 후 게시중·자동 취소 게시중)은 카드와 겹쳐 지웠다(02_ui §0).
 * - 처리 성공 → 같은 상세에 머물며 주소에 `done=…`을 붙여 서버가 초록 알림 1줄 + 다음 단계 카드를 그린다.
 */

export type PaymentPanel = "notice" | "confirm" | "refund" | "restore" | null;
type BusyAction = null | "notice" | "payment" | "refund" | "homepage" | "restore";

/** 성공 알림 종류 — 상세 page.tsx가 문구로 바꾼다 */
export type DoneKind = "approve" | "reject" | "notice" | "mail" | "paid" | "close";

/* ── 스타일 토큰 (02_ui §1) ── */
const DISABLED = "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500";
export const BTN_MAIN =
  `inline-flex min-h-[48px] w-full items-center justify-center whitespace-nowrap rounded-xl bg-brand px-[22px] text-base font-bold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 sm:w-auto ${DISABLED}`;
export const BTN_SUB =
  `inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-[18px] text-[15px] font-semibold text-ink transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 sm:w-auto ${DISABLED}`;
const BTN_PRIMARY =
  `inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl bg-brand px-5 py-2 text-[15px] font-semibold text-white hover:bg-brand-hover ${DISABLED}`;
const BTN_OUTLINE =
  `inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2 text-[15px] font-semibold text-ink hover:bg-slate-50 ${DISABLED}`;
const INPUT =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-sky/40 min-h-[44px] sm:text-[15px]";
const LABEL = "block text-sm font-semibold text-slate-700 mb-1.5";
const HELP = "mt-1 text-[13px] text-slate-500 leading-5";
const HELP_WARN = "mt-1 text-[13px] text-amber-800 leading-5";
const ERR = "mt-1 text-[13px] font-semibold text-red-700";
const ERR_BUSY = "mt-1 text-[13px] font-semibold text-amber-800";
const LINK = "inline-flex min-h-[44px] items-center text-[15px] font-semibold text-brand underline underline-offset-2 hover:opacity-80";

/** ③-D 실패 문구(네트워크·서버 오류) */
const SAVE_FAIL = "저장하지 못했습니다. 잠시 후 다시 눌러 주세요.";

/** 다음 할 일 카드 DOM id — 처리 기록 `고치기`가 이곳으로 스크롤한다 */
export const NEXT_STEP_CARD_ID = "next-step-card";

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
 * 그 밖 4xx는 서버 message를 그대로 보여 주고(409 STALE_WRITE 포함), 네트워크·5xx는 ③-D 실패 문구.
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

/** 같은 상세 주소에 done=… 을 붙여 다시 그리기(초록 알림 + 다음 단계 카드) */
export function useGoDone() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (kind: DoneKind) => {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      ["saved", "mailed", "formError", "done", "emailError"].forEach((k) => params.delete(k));
      params.set("done", kind);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      router.refresh();
    },
    [router, pathname]
  );
}

/* ── 상태 ── */

type Ctx = ReturnType<typeof useWorkflowState>;
const PaymentWorkflowContext = createContext<Ctx | null>(null);

export function usePaymentWorkflow(): Ctx {
  const ctx = useContext(PaymentWorkflowContext);
  if (!ctx) throw new Error("PaymentWorkflowProvider 밖에서 usePaymentWorkflow를 불렀습니다.");
  return ctx;
}

function useWorkflowState(requestId: string, view: PaymentViewDTO, todayYmd: string) {
  const router = useRouter();
  const goDone = useGoDone();
  const base = `/api/admin/requests/${encodeURIComponent(requestId)}`;

  const [panel, setPanel] = useState<PaymentPanel>(null);
  /** 처리 중인 버튼 — 그 버튼만 라벨을 처리 중 문구로 바꾼다(③-D) */
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const busy = busyAction !== null;
  const [error, setError] = useState<string | null>(null);
  /** 503 지연이면 오류색 대신 접수톤 */
  const [errorBusy, setErrorBusy] = useState(false);
  /** 홈페이지 마감 버튼 아래 실패 문구 */
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

  // 서버 데이터가 바뀌면(router.refresh) 폼 기본값 동기화 + 열린 폼 닫기(카드가 다음 단계로 바뀜)
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

  /** 폼 열기 — 카드로 스크롤하고 첫 입력칸에 초점 */
  const openPanel = useCallback((p: PaymentPanel, opts?: { focusDue?: boolean }) => {
    setError(null);
    setErrorBusy(false);
    setRestoreConflicts([]);
    setPanel(p);
    window.setTimeout(() => {
      const card = document.getElementById(NEXT_STEP_CARD_ID);
      if (opts?.focusDue && dueRef.current) {
        dueRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        dueRef.current.focus();
        return;
      }
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
      const first = card?.querySelector<HTMLElement>("[data-panel] input, [data-panel] select, [data-panel] textarea");
      first?.focus({ preventScroll: true });
    }, 50);
  }, []);

  const closePanel = useCallback(() => {
    setError(null);
    setErrorBusy(false);
    setPanel(null);
  }, []);

  const openEmail = useCallback(() => {
    const sec = document.getElementById(EMAIL_SECTION_ID);
    sec?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent(OPEN_EMAIL_MODAL_EVENT));
  }, []);

  const flow = hasPaymentFlow(view);
  const isPaid = view.paymentState === "paid";
  const isRefunded = view.paymentState === "refunded";
  const step3Done = isPaid || isRefunded;

  async function saveNotice() {
    setError(null);
    setErrorBusy(false);
    if (!due) return setError("결제 기한을 입력해 주세요.");
    if (due < todayYmd)
      return setError("결제 기한은 오늘 이전으로 저장할 수 없습니다. 이미 지난 기한으로 두려면 그대로 두고, 취소하려면 처리 상태에서 취소하세요.");
    if (!isAllowedLinkClient(link)) return setError("결제 링크는 https://www.seochowomen.kr 로 시작하는 주소만 저장할 수 있습니다.");
    if (busy) return;
    const firstSave = !view.paymentDueDate;
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
      setPanel(null);
      if (firstSave) {
        goDone("notice");
      } else {
        // 고치기·기한 연장 — 단계가 그대로이므로 기존 토스트
        setToast(changed && changed.from ? `결제 기한을 ${formatShortMd(changed.to ?? due)}로 바꿨습니다. 자동 취소 대상에서 제외됩니다.` : "결제 안내를 저장했습니다.");
        router.refresh();
      }
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
    setBusyAction("payment");
    try {
      const { data } = await callApi(`${base}/payment`, "POST", {
        paymentMethod: method,
        paidAt,
        paidAmountKRW: amountNum,
        paymentNote: note.trim(),
      });
      if (!data.ok) return setError(String(data.message || "기록에 실패했습니다."));
      setPanel(null);
      if (data.action === "update") {
        setToast("결제 기록을 수정했습니다.");
        router.refresh();
      } else {
        goDone("paid");
      }
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
      goDone("close");
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

  return {
    requestId,
    view,
    todayYmd,
    flow,
    step3Done,
    panel,
    openPanel,
    closePanel,
    openEmail,
    busy,
    busyAction,
    error,
    errorBusy,
    homeError,
    toast,
    noticeWarnings,
    restoreConflicts,
    form: {
      link, setLink, due, setDue, posted, setPosted, dueRef,
      method, setMethod, paidAt, setPaidAt, amount, setAmount, note, setNote, amountDiffers,
      refundedAt, setRefundedAt, refundAmount, setRefundAmount, refundReason, setRefundReason,
      restoreDue, setRestoreDue,
    },
    saveNotice,
    savePayment,
    saveRefund,
    closeHomepage,
    restore,
  };
}

export function PaymentWorkflowProvider({ requestId, view, todayYmd, children }: { requestId: string; view: PaymentViewDTO; todayYmd: string; children: ReactNode }) {
  const state = useWorkflowState(requestId, view, todayYmd);
  return (
    <PaymentWorkflowContext.Provider value={state}>
      {children}
      {state.toast && (
        <div aria-live="polite" className="fixed bottom-6 right-6 z-[60] rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {state.toast}
        </div>
      )}
    </PaymentWorkflowContext.Provider>
  );
}

/* ── 카드 안 폼 (기존 1단계·3단계·환불·복구 폼을 그대로 꺼냄 · payment-link-record ③(가)-3 문구) ── */

export function PaymentForms() {
  const w = usePaymentWorkflow();
  const { view, todayYmd, panel, form: f, busy, busyAction, error, errorBusy, closePanel } = w;
  if (!panel) return null;

  const errLine = error ? <p role="alert" className={errorBusy ? ERR_BUSY : ERR}>{error}</p> : null;
  const dueAfterUsage = !!(f.due && view.usageStartDate && f.due > view.usageStartDate);

  if (panel === "notice") {
    return (
      <div data-panel className="mt-3">
        <div>
          <label className={LABEL} htmlFor="pay-link">홈페이지 결제 링크</label>
          <input
            id="pay-link"
            type="url"
            className={INPUT}
            value={f.link}
            onChange={(e) => f.setLink(e.target.value)}
            placeholder="https://www.seochowomen.kr/… (홈페이지 강좌 상세 주소)"
          />
          <p className={HELP}>홈페이지에서 웹게시한 강좌의 주소를 붙여넣으세요. seochowomen.kr 주소만 저장됩니다.</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="pay-due">결제 기한</label>
            <input id="pay-due" ref={f.dueRef} type="date" className={INPUT} value={f.due} onChange={(e) => f.setDue(e.target.value)} />
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
              checked={f.posted}
              onChange={(e) => f.setPosted(e.target.checked)}
              label="홈페이지에 게시함(웹게시 완료)"
              help={'체크하면 "홈페이지 게시중"으로 표시되어 마감 처리를 잊지 않게 합니다.'}
            />
          </div>
        </div>
        {errLine}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={w.saveNotice} disabled={busy} className={BTN_MAIN}>{busyAction === "notice" ? "저장 중…" : "결제 안내 저장"}</button>
          <button type="button" onClick={closePanel} disabled={busy} className={BTN_SUB}>닫기</button>
        </div>
      </div>
    );
  }

  if (panel === "confirm") {
    return (
      <div data-panel className="mt-3">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="pay-method">결제 방식</label>
            <select id="pay-method" className={INPUT} value={f.method} onChange={(e) => f.setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="pay-date">결제일</label>
            <input id="pay-date" type="date" className={INPUT} value={f.paidAt} max={todayYmd} onChange={(e) => f.setPaidAt(e.target.value)} />
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
              value={f.amount}
              onChange={(e) => f.setAmount(e.target.value)}
            />
            {f.amountDiffers ? (
              <p className={HELP_WARN}>{PAYMENT_LABELS.approvedFee} {formatKRW(view.approvedFeeKRW)}과 다릅니다. 비고에 이유를 적어 주세요.</p>
            ) : (
              <p className={HELP}>{PAYMENT_LABELS.approvedFee} {formatKRW(view.approvedFeeKRW)}</p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <label className={LABEL} htmlFor="pay-note">
            비고(영수증·승인번호 앞자리 등 · 선택){f.amountDiffers && <span className="ml-1 text-rose-600">(필수)</span>}
          </label>
          <textarea
            id="pay-note"
            rows={2}
            maxLength={300}
            className={`${INPUT} min-h-[64px]`}
            value={f.note}
            onChange={(e) => f.setNote(e.target.value)}
            placeholder="카드번호·계좌번호 전체는 적지 마세요"
          />
        </div>
        <p className="mt-3 text-[13px] text-slate-600">이 신청을 &quot;결제완료&quot;로 기록합니다. 실제 결제는 홈페이지·복지종합시스템에서 확인했는지 한 번 더 보세요.</p>
        {errLine}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={w.savePayment} disabled={busy} className={BTN_MAIN}>
            {busyAction === "payment" ? "기록 중…" : w.step3Done ? "결제 기록 수정" : "결제 완료로 기록"}
          </button>
          <button type="button" onClick={closePanel} disabled={busy} className={BTN_SUB}>닫기</button>
        </div>
      </div>
    );
  }

  if (panel === "refund") {
    return (
      <div data-panel className="mt-3">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="refund-date">환불일</label>
            <input id="refund-date" type="date" className={INPUT} value={f.refundedAt} max={todayYmd} onChange={(e) => f.setRefundedAt(e.target.value)} />
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
              value={f.refundAmount}
              onChange={(e) => f.setRefundAmount(e.target.value)}
            />
            <p className={HELP}>결제 금액 {formatKRW(view.paidAmountKRW)}</p>
          </div>
          <div>
            <label className={LABEL} htmlFor="refund-reason">환불 사유<span className="ml-1 text-rose-600">(필수)</span></label>
            <input id="refund-reason" type="text" maxLength={300} className={INPUT} value={f.refundReason} onChange={(e) => f.setRefundReason(e.target.value)} placeholder="예: 신청자 취소(이용 7일 전)" />
          </div>
        </div>
        {errLine}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={w.saveRefund} disabled={busy} className={BTN_MAIN}>{busyAction === "refund" ? "기록 중…" : "환불로 기록"}</button>
          <button type="button" onClick={closePanel} disabled={busy} className={BTN_SUB}>닫기</button>
        </div>
      </div>
    );
  }

  // restore
  return (
    <div data-panel className="mt-3">
      <p className="text-[15px] text-ink-2">
        {fullDateTimeFromIso(view.autoCancelledAt)} 자동 취소 · 사유: {autoCancelReason(view.paymentDueDate)}
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="restore-due">새 결제 기한</label>
          <input id="restore-due" type="date" className={INPUT} value={f.restoreDue} min={todayYmd} onChange={(e) => f.setRestoreDue(e.target.value)} />
          <p className={HELP}>복구하면 같은 날짜·시간대에 다른 신청이 없는지 먼저 확인합니다. 겹치면 복구되지 않습니다.</p>
        </div>
      </div>
      {errLine}
      {w.restoreConflicts.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px] text-red-700">
          {w.restoreConflicts.map((c, i) => (
            <li key={`${c.requestId}-${c.date}-${i}`}>
              {c.date} {c.startTime}~{c.endTime} · {c.reason}
              {c.requestId ? ` · ${c.requestId}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={w.restore} disabled={busy} className={BTN_MAIN}>{busyAction === "restore" ? "복구 중…" : "승인으로 복구"}</button>
        <button type="button" onClick={closePanel} disabled={busy} className={BTN_SUB}>닫기</button>
      </div>
    </div>
  );
}

/* ── 처리 기록 (결제 4단계 완료 표시 · `고치기`는 위 카드 폼을 연다) ── */

export function PaymentRecord() {
  const w = usePaymentWorkflow();
  const { view, flow, openPanel } = w;

  const rows = useMemo(() => {
    const isAuto = view.paymentState === "autoCancelled";
    const isPaid = view.paymentState === "paid";
    const isRefunded = view.paymentState === "refunded";
    const hasLink = !!view.paymentLinkUrl;
    const out: Array<{ n: number; title: string; done: boolean; text: ReactNode; fix?: ReactNode }> = [];

    out.push({
      n: 1,
      title: "결제 링크·기한",
      done: !!view.paymentDueDate,
      text: view.paymentDueDate ? (
        <>
          결제 안내 저장 · 기한 {view.dueDateShort}
          {hasLink && (
            <>
              {" · "}
              <a href={view.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className={LINK}>링크 열기</a>
            </>
          )}
        </>
      ) : (
        "아직 저장하지 않음"
      ),
      fix: view.paymentDueDate && !isAuto ? <button type="button" onClick={() => openPanel("notice")} className={LINK}>고치기</button> : undefined,
    });
    out.push({
      n: 2,
      title: "결제 안내 메일",
      done: !!view.noticeSentAt,
      text: view.noticeSentAt
        ? `발송 ${shortDateTimeFromIso(view.noticeSentAt)}${view.reminderSentAt ? ` · 기한 전날 리마인드 ${formatShortMd(view.reminderSentAt.slice(0, 10))}` : ""}`
        : "아직 보내지 않음",
    });
    out.push({
      n: 3,
      title: "결제 확인",
      done: isPaid || isRefunded,
      text: isAuto
        ? `자동 취소 ${fullDateTimeFromIso(view.autoCancelledAt)}`
        : isPaid
          ? `결제완료 ${formatShortMd(view.paidAt)} · ${view.paymentMethod || "방식 미기재"} · ${formatKRW(view.paidAmountKRW)}`
          : isRefunded
            ? `환불 ${formatShortMd(view.refundedAt)} · ${formatKRW(view.refundAmountKRW)}${view.refundReason ? ` · ${view.refundReason}` : ""}`
            : "아직 결제 기록 없음",
      fix: isAuto ? (
        <button type="button" onClick={() => openPanel("restore")} className={LINK}>자동 취소 되돌리기</button>
      ) : isPaid ? (
        <>
          <button type="button" onClick={() => openPanel("confirm")} className={LINK}>고치기</button>
          <button type="button" onClick={() => openPanel("refund")} className={LINK}>환불 기록</button>
        </>
      ) : isRefunded ? (
        <button type="button" onClick={() => openPanel("confirm")} className={LINK}>고치기</button>
      ) : undefined,
    });
    out.push({
      n: 4,
      title: "홈페이지 마감",
      done: view.homepageState === "closed",
      text:
        view.homepageState === "closed"
          ? `마감·미게시 ${formatShortMd(view.homepageClosedAt)}`
          : view.homepageState === "posted"
            ? "홈페이지 게시중"
            : "홈페이지에 게시하지 않음",
    });
    return out;
  }, [view, openPanel]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" id="payment-section">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-900">처리 기록 · 결제</h2>
      </div>
      <div className="px-5 py-3">
        {!flow ? (
          <p className="text-[15px] text-slate-500">승인 후에 결제 안내를 진행할 수 있습니다.</p>
        ) : (
          <>
            <ol className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.n} className="flex flex-col gap-1 py-2.5 md:flex-row md:items-center md:justify-between md:gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold " +
                        (r.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500")
                      }
                      aria-hidden="true"
                    >
                      {r.done ? "✓" : r.n}
                    </span>
                    <span className="text-[15px] font-semibold text-ink">
                      <span className="sr-only">{r.done ? "완료 " : ""}</span>
                      {r.n}. {r.title}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0 pl-[38px] text-[15px] text-ink-2 md:justify-end md:pl-0">
                    <span>{r.text}</span>
                    {r.fix}
                  </div>
                </li>
              ))}
            </ol>
            {w.noticeWarnings.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {w.noticeWarnings.map((x) => (
                  <li key={x} className="text-[13px] text-amber-800">{x}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
