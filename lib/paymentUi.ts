/**
 * 결제 안내·확인 화면용 DTO·배지 문구 (2026-10-26 · payment-link-record)
 *
 * - `derivePaymentView()` 결과에서 개인정보가 든 `rep`(RentalRequest)를 떼고 클라이언트로 내려보내는 직렬화 형태.
 * - 상태 스트립 배지 문구는 01_spec ③-(가)-2 원문. 서버 컴포넌트(page.tsx)·클라이언트 컴포넌트 공용.
 */

import type { PaymentView, PaymentState, HomepageState } from "@/lib/payment";
import { formatShortMd } from "@/lib/payment";
import { formatKRW } from "@/lib/pricing";

export type PaymentViewDTO = Omit<PaymentView, "rep">;

/** 메일 발송 섹션(EmailConfirmModal)에 "모달 열기"를 요청하는 커스텀 이벤트 이름 */
export const OPEN_EMAIL_MODAL_EVENT = "area-lental:open-email-modal";
/** 메일 발송 섹션 DOM id (2단계 "승인 메일 보내기" 스크롤 대상) */
export const EMAIL_SECTION_ID = "email-send-section";

export function toPaymentViewDTO(view: PaymentView): PaymentViewDTO {
  // rep에는 전화·이메일 등 개인정보가 있으므로 클라이언트 props에서 제외한다.
  const { rep: _rep, ...rest } = view;
  void _rep;
  return rest;
}

export type BadgeTone = "gray" | "amber" | "red" | "green";

export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  gray: "border-slate-200 bg-slate-50 text-slate-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  red: "border-red-200 bg-red-50 text-red-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
};

export type Badge = { text: string; tone: BadgeTone; title?: string };

/** "2026-10-28T09:00:03.000Z"(Seoul ISO) → "10/28" */
export function shortMdFromIso(iso: string): string {
  return formatShortMd((iso ?? "").slice(0, 10));
}

/** "2026-10-20T14:05:11.000Z"(Seoul ISO) → "10/20 14:05" */
export function shortDateTimeFromIso(iso: string): string {
  if (!iso) return "";
  const md = formatShortMd(iso.slice(0, 10));
  const hm = iso.length >= 16 ? iso.slice(11, 16) : "";
  return hm ? `${md} ${hm}` : md;
}

/** "2026-10-28T09:00:03.000Z" → "2026-10-28 09:00" */
export function fullDateTimeFromIso(iso: string): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  const hm = iso.length >= 16 ? iso.slice(11, 16) : "";
  return hm ? `${d} ${hm}` : d;
}

/** +20,000원 / -5,000원 */
export function signedKRW(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(n)).toLocaleString("ko-KR")}원`;
}

export const AMOUNT_DIFF_TOOLTIP = '결제 후 승인 회차가 바뀌었습니다. 차액은 현장 수납 후 "결제 기록 수정"으로 금액을 맞추세요.';

/** 결제 묶음 배지(주 배지 + 보조 배지) — paymentState "none"이면 빈 배열 */
export function paymentBadges(v: Pick<PaymentViewDTO, "paymentState" | "dueDateShort" | "autoCancelledAt" | "paidAt" | "paymentMethod" | "refundedAt" | "refundAmountKRW" | "amountDiffKRW">): Badge[] {
  const s: PaymentState = v.paymentState;
  switch (s) {
    case "none":
      return [];
    case "unnoticed":
      return [{ text: "미결제 · 안내 전", tone: "gray" }];
    case "waiting":
      return [{ text: `미결제 · 기한 ${v.dueDateShort}`, tone: "amber" }];
    case "dueTomorrow":
      return [{ text: `미결제 · 내일 자동 취소(${v.dueDateShort})`, tone: "amber" }];
    case "overdue":
      return [{ text: `기한 지남 ${v.dueDateShort} · 다음 09:00 자동 취소`, tone: "red" }];
    case "autoCancelled":
      return [{ text: `자동 취소됨 ${shortMdFromIso(v.autoCancelledAt)}`, tone: "gray" }];
    case "paid": {
      const out: Badge[] = [{ text: `결제완료 ${formatShortMd(v.paidAt)} · ${v.paymentMethod || "방식 미기재"}`, tone: "green" }];
      if (v.amountDiffKRW !== 0) {
        out.push({ text: `결제액 차이 ${signedKRW(v.amountDiffKRW)}`, tone: "amber", title: AMOUNT_DIFF_TOOLTIP });
      }
      return out;
    }
    case "refunded":
      return [{ text: `환불 ${formatShortMd(v.refundedAt)} · ${formatKRW(v.refundAmountKRW)}`, tone: "gray" }];
    default:
      return [];
  }
}

/** 홈페이지 배지 */
export function homepageBadge(state: HomepageState): Badge {
  if (state === "closed") return { text: "홈페이지 마감완료", tone: "green" };
  if (state === "posted") return { text: "홈페이지 게시중", tone: "amber" };
  return { text: "홈페이지 미게시", tone: "gray" };
}

/** 결제 안내 섹션에 띠·체크리스트를 그릴지(승인 0건이고 자동 취소도 아니면 안내문 한 줄) */
export function hasPaymentFlow(v: Pick<PaymentViewDTO, "paymentState">): boolean {
  return v.paymentState !== "none";
}
