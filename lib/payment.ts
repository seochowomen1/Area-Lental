/**
 * 결제 링크·결제 확인 기록 — 파생 상태 헬퍼 (2026-10-26)
 *
 * DB 접근 없음. 서버 컴포넌트(page.tsx)·API 라우트·클라이언트가 공용으로 쓴다.
 * "결제 1건 = 묶음(batchId 없으면 단건)의 승인 회차 전체" 원칙(01_spec ①)을 그대로 따른다.
 */

import type { RentalRequest, PaymentMethod, PaymentStatus } from "@/lib/types";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { dayOfWeek, todayYmdSeoul } from "@/lib/datetime";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["홈페이지 온라인", "현장 카드", "현장 현금", "계좌이체"];

/** 자동 취소 시 decidedBy 고정 문구 */
export const AUTO_CANCEL_DECIDED_BY = "시스템(결제 기한 경과)";

/** 자동 취소 사유 고정 문구 */
export function autoCancelReason(dueDate: string): string {
  return `결제 기한(${dueDate}) 경과로 자동 취소`;
}

/** 결제 기한 기본값: 승인일 + 7일 */
export const PAYMENT_DUE_DEFAULT_DAYS = 7;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/** "2026-10-27" → "2026-10-27(화)" */
export function formatDueDateKo(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "";
  return `${ymd}(${WEEKDAY_KO[dayOfWeek(ymd)]})`;
}

/** "2026-10-27" → "10/27" */
export function formatShortMd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [, m, d] = ymd.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function isYmdString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** 결제 링크 허용 호스트 (PAYMENT_LINK_HOSTS · 기본 seochowomen.kr,www.seochowomen.kr) */
export function allowedPaymentLinkHosts(): string[] {
  const raw = (process.env.PAYMENT_LINK_HOSTS || "seochowomen.kr,www.seochowomen.kr").trim();
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** https + 허용 호스트만 */
export function isAllowedPaymentLinkUrl(url: string): boolean {
  if (typeof url !== "string" || !url.trim() || url.length > 500) return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    return allowedPaymentLinkHosts().includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** 묶음 그룹 키: B:<batchId> / R:<requestId> */
export function bundleKey(r: RentalRequest): string {
  const b = (r.batchId ?? "").trim();
  return b ? `B:${b}` : `R:${r.requestId}`;
}

/** 전체 신청 → 묶음 단위 그룹 (키 순서 = 첫 등장 순) */
export function groupBundles(all: RentalRequest[]): Map<string, RentalRequest[]> {
  const groups = new Map<string, RentalRequest[]>();
  for (const r of all) {
    const key = bundleKey(r);
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return groups;
}

/** 결제 필드를 읽을 대표 행: 결제 필드가 하나라도 있는 행 → 없으면 첫 행 */
export function paymentRep(sessions: RentalRequest[]): RentalRequest | null {
  if (!sessions.length) return null;
  return (
    sessions.find(
      (s) =>
        !!(s.paymentStatus || s.paymentLinkUrl || s.paymentDueDate || s.autoCancelledAt || s.homepagePostedAt || s.homepageClosedAt)
    ) ?? sessions[0]
  );
}

/** 승인 회차 기준 금액 (0건이면 전체 회차 기준) */
export function approvedFee(sessions: RentalRequest[]): { feeKRW: number; basis: "approved" | "all"; approved: RentalRequest[] } {
  const approved = sessions.filter((s) => s.status === "승인");
  const basis = approved.length ? "approved" : "all";
  const list = approved.length ? approved : sessions;
  if (!list.length) return { feeKRW: 0, basis, approved };
  const isBatch = !!(list[0].batchId ?? "").trim();
  const feeKRW = isBatch ? computeFeesForBundle(list).finalFeeKRW : computeFeesForRequest(list[0]).finalFeeKRW;
  return { feeKRW, basis, approved };
}

/** 승인일 = 승인 회차 decidedAt 중 가장 늦은 날짜 (없으면 "") */
export function latestApprovedDate(sessions: RentalRequest[]): string {
  const dates = sessions
    .filter((s) => s.status === "승인" && s.decidedAt)
    .map((s) => s.decidedAt.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return dates.length ? dates[dates.length - 1] : "";
}

/** 이용 시작일 — 갤러리는 준비일이 있으면 준비일, 그 외 승인(없으면 전체) 회차 첫 날짜 */
export function usageStartDateOf(sessions: RentalRequest[]): string {
  if (!sessions.length) return "";
  const first = sessions[0];
  if (first.roomId === "gallery") {
    if (first.galleryPrepDate) return first.galleryPrepDate;
    if (first.startDate) return first.startDate;
  }
  const approved = sessions.filter((s) => s.status === "승인");
  const list = approved.length ? approved : sessions;
  return list.map((s) => s.date).filter(Boolean).sort()[0] ?? "";
}

export function isAutoCancelledBundle(sessions: RentalRequest[]): boolean {
  const rep = paymentRep(sessions);
  if (!rep?.autoCancelledAt) return false;
  // 자동 취소 뒤 복구되면 autoCancelledAt을 비우므로, 값이 남아 있으면 자동 취소 상태
  return sessions.some((s) => s.status === "취소" && s.decidedBy === AUTO_CANCEL_DECIDED_BY);
}

/** 결제 확인 금액: 결제완료 → paidAmount · 환불 → paid − refund · 그 외 null(미확인) */
export function collectedKRWOf(rep: Pick<RentalRequest, "paymentStatus" | "paidAmountKRW" | "refundAmountKRW"> | null): number | null {
  if (!rep) return null;
  if (rep.paymentStatus === "결제완료") return Math.max(0, Number(rep.paidAmountKRW ?? 0));
  if (rep.paymentStatus === "환불") return Math.max(0, Number(rep.paidAmountKRW ?? 0) - Number(rep.refundAmountKRW ?? 0));
  return null;
}

export type PaymentState =
  | "none"
  | "unnoticed"
  | "waiting"
  | "dueTomorrow"
  | "overdue"
  | "autoCancelled"
  | "paid"
  | "refunded";

export type HomepageState = "notPosted" | "posted" | "closed";

export type PaymentView = {
  approvedCount: number;
  approvedFeeKRW: number;
  feeBasis: "approved" | "all";
  rep: RentalRequest | null;
  paymentStatus: PaymentStatus;
  paymentState: PaymentState;
  homepageState: HomepageState;
  paymentLinkUrl: string;
  paymentDueDate: string;
  paymentDueDateKo: string;
  dueDateShort: string;
  defaultDueDate: string;
  usageStartDate: string;
  paidAmountKRW: number;
  amountDiffKRW: number;
  collectedKRW: number | null;
  closeNeeded: boolean;
  closeNeededDays: number;
  noticeSentAt: string;
  reminderSentAt: string;
  autoCancelledAt: string;
  paymentMethod: string;
  paidAt: string;
  refundedAt: string;
  refundAmountKRW: number;
  refundReason: string;
  paymentNote: string;
  paymentConfirmedAt: string;
  homepagePostedAt: string;
  homepageClosedAt: string;
};

function daysBetween(fromYmd: string, toYmd: string): number {
  if (!isYmdString(fromYmd) || !isYmdString(toYmd)) return 0;
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.floor((b - a) / 86400000);
}

/** 묶음(또는 단건) 회차 배열 → 결제·홈페이지 파생 상태 (01_spec ② 상태 모델) */
export function derivePaymentView(sessions: RentalRequest[], todayYmd: string = todayYmdSeoul()): PaymentView {
  const rep = paymentRep(sessions);
  const { feeKRW, basis, approved } = approvedFee(sessions);
  const approvedCount = approved.length;
  const paymentStatus: PaymentStatus = (rep?.paymentStatus ?? "") as PaymentStatus;
  const link = rep?.paymentLinkUrl ?? "";
  const due = rep?.paymentDueDate ?? "";
  const autoCancelled = isAutoCancelledBundle(sessions);
  const paidAmount = Number(rep?.paidAmountKRW ?? 0);

  let paymentState: PaymentState = "none";
  if (paymentStatus === "결제완료") paymentState = "paid";
  else if (paymentStatus === "환불") paymentState = "refunded";
  else if (autoCancelled) paymentState = "autoCancelled";
  else if (approvedCount === 0) paymentState = "none";
  else if (!due && !link) paymentState = "unnoticed";
  else if (!due) paymentState = "unnoticed"; // 링크만 있고 기한이 없는 비정상 → 안내 전으로 취급
  else if (todayYmd > due) paymentState = "overdue";
  else if (addDaysYmd(todayYmd, 1) === due) paymentState = "dueTomorrow";
  else paymentState = "waiting";

  const posted = !!rep?.homepagePostedAt;
  const closed = !!rep?.homepageClosedAt;
  const homepageState: HomepageState = closed ? "closed" : posted ? "posted" : "notPosted";

  const closeNeeded = homepageState === "posted" && (paymentState === "paid" || paymentState === "autoCancelled");
  let closeNeededDays = 0;
  if (closeNeeded) {
    const since = paymentState === "paid" ? (rep?.paidAt || (rep?.paymentConfirmedAt ?? "").slice(0, 10)) : (rep?.autoCancelledAt ?? "").slice(0, 10);
    closeNeededDays = Math.max(0, daysBetween(since, todayYmd));
  }

  const approvedDate = latestApprovedDate(sessions);
  const defaultDueDate = addDaysYmd(approvedDate || todayYmd, PAYMENT_DUE_DEFAULT_DAYS);

  return {
    approvedCount,
    approvedFeeKRW: feeKRW,
    feeBasis: basis,
    rep,
    paymentStatus,
    paymentState,
    homepageState,
    paymentLinkUrl: link,
    paymentDueDate: due,
    paymentDueDateKo: due ? formatDueDateKo(due) : "",
    dueDateShort: due ? formatShortMd(due) : "",
    defaultDueDate,
    usageStartDate: usageStartDateOf(sessions),
    paidAmountKRW: paidAmount,
    amountDiffKRW: paymentStatus === "결제완료" ? feeKRW - paidAmount : 0,
    collectedKRW: collectedKRWOf(rep),
    closeNeeded,
    closeNeededDays,
    noticeSentAt: rep?.paymentNoticeSentAt ?? "",
    reminderSentAt: rep?.paymentReminderSentAt ?? "",
    autoCancelledAt: rep?.autoCancelledAt ?? "",
    paymentMethod: rep?.paymentMethod ?? "",
    paidAt: rep?.paidAt ?? "",
    refundedAt: rep?.refundedAt ?? "",
    refundAmountKRW: Number(rep?.refundAmountKRW ?? 0),
    refundReason: rep?.refundReason ?? "",
    paymentNote: rep?.paymentNote ?? "",
    paymentConfirmedAt: rep?.paymentConfirmedAt ?? "",
    homepagePostedAt: rep?.homepagePostedAt ?? "",
    homepageClosedAt: rep?.homepageClosedAt ?? "",
  };
}

/** 목록 "결제" 열 칩 */
export function paymentListChip(view: PaymentView): { text: string; tone: "none" | "gray" | "red" | "green"; posted: boolean } {
  const posted = view.homepageState === "posted";
  switch (view.paymentState) {
    case "paid":
      return { text: "결제완료", tone: "green", posted };
    case "refunded":
      return { text: "환불", tone: "gray", posted };
    case "autoCancelled":
      return { text: "자동 취소", tone: "gray", posted };
    case "overdue":
      return { text: "기한 지남", tone: "red", posted };
    case "waiting":
    case "dueTomorrow":
    case "unnoticed":
      return { text: "미결제", tone: "gray", posted };
    default:
      return { text: "-", tone: "none", posted: false };
  }
}

/** 관리자 홈·목록 칩 집계 */
export function summarizePaymentChips(all: RentalRequest[], todayYmd: string = todayYmdSeoul()): {
  paymentWaiting: number;
  closeNeeded: number;
  closeNeededOverdue3d: number;
  autoCancelled: number;
  autoCancelledOverdue3d: number;
} {
  const out = { paymentWaiting: 0, closeNeeded: 0, closeNeededOverdue3d: 0, autoCancelled: 0, autoCancelledOverdue3d: 0 };
  for (const sessions of groupBundles(all).values()) {
    const v = derivePaymentView(sessions, todayYmd);
    if ((v.paymentState === "waiting" || v.paymentState === "dueTomorrow") && v.paymentLinkUrl) out.paymentWaiting++;
    if (v.closeNeeded) {
      out.closeNeeded++;
      if (v.closeNeededDays >= 3) out.closeNeededOverdue3d++;
    }
    if (v.paymentState === "autoCancelled" && !v.homepageClosedAt) {
      out.autoCancelled++;
      const days = daysBetween(v.autoCancelledAt.slice(0, 10), todayYmd);
      if (days >= 3) out.autoCancelledOverdue3d++;
    }
  }
  return out;
}

/** 신청자 결과 화면 결제 열 문구 (01_spec ③-(마)) */
export function publicPaymentText(view: PaymentView): string {
  switch (view.paymentState) {
    case "paid":
      return "결제 완료";
    case "refunded":
      return "환불 완료";
    case "autoCancelled":
      return "기한 경과 자동 취소";
    case "overdue":
      return "결제 기한 지남";
    case "waiting":
    case "dueTomorrow":
      return view.paymentLinkUrl ? "결제 대기" : "결제 안내 예정";
    case "unnoticed":
      return "결제 안내 예정";
    default:
      return "-";
  }
}

/* ── 목록 삭제 보호 (audit-fix-1 [8]) ── */

export type DeletionBlockReason = "payment" | "homepage";

/** 삭제 차단 사유 표시 문구 (01_spec ③-I) */
export const DELETION_BLOCK_LABEL: Record<DeletionBlockReason, string> = {
  payment: "결제·환불 기록",
  homepage: "홈페이지 마감 전",
};

/**
 * 반려·취소 건이라도 목록에서 지우면 안 되는 사유
 * - payment: 결제완료·환불 상태이거나 결제일·환불일 기록이 있음(결제 증빙)
 * - homepage: 홈페이지에 게시했는데 마감 기록이 없음
 * 화면(RequestTable 체크박스 잠금)과 서버(DELETE /api/admin/requests 409)가 같은 함수를 쓴다.
 */
export function deletionBlockReason(r: Pick<RentalRequest, "paymentStatus" | "paidAt" | "refundedAt" | "homepagePostedAt" | "homepageClosedAt">): DeletionBlockReason | null {
  const ps = r.paymentStatus ?? "";
  if (ps === "결제완료" || ps === "환불" || (r.paidAt ?? "").trim() || (r.refundedAt ?? "").trim()) return "payment";
  if ((r.homepagePostedAt ?? "").trim() && !(r.homepageClosedAt ?? "").trim()) return "homepage";
  return null;
}
