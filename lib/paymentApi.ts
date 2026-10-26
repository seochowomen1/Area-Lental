/**
 * 결제 기록 관리자 API 공통 — 신청 묶음 로드 · 입력 검증 · 감사 요약 (2026-10-26)
 * 라우트 핸들러는 첫 줄 assertAdminApiAuth 뒤에 loadBundle → 검증 → db.updateRequestPayment → recordAudit 순서.
 */

import type { Database } from "@/lib/database";
import type { RentalRequest } from "@/lib/types";
import { sortSessions } from "@/lib/requestUtils";
import { maskName } from "@/lib/mask";
import { derivePaymentView, isYmdString, type PaymentView } from "@/lib/payment";
import { todayYmdSeoul } from "@/lib/datetime";

export const MSG = {
  notFound: "신청을 찾을 수 없습니다.",
  needApprovedForNotice: "승인 후에 결제 안내를 저장할 수 있습니다.",
  needApprovedForPayment: "승인 후에 결제를 기록할 수 있습니다.",
  autoCancelled: '자동 취소된 신청입니다. 다시 받으려면 "승인으로 복구"를 먼저 눌러 주세요.',
  dueRequired: "결제 기한을 입력해 주세요.",
  duePast: "결제 기한은 오늘 이전으로 저장할 수 없습니다. 이미 지난 기한으로 두려면 그대로 두고, 취소하려면 처리 상태에서 취소하세요.",
  linkHost: "결제 링크는 https://www.seochowomen.kr 로 시작하는 주소만 저장할 수 있습니다.",
  methodRequired: "결제 방식을 선택해 주세요.",
  paidAtRequired: "결제일을 입력해 주세요.",
  paidAtFuture: "결제일은 오늘 이후로 입력할 수 없습니다.",
  amountInvalid: "결제 금액은 0원 이상이어야 합니다.",
  noteRequired: "승인 금액과 다른 금액은 비고가 필요합니다.",
  noteTooLong: "비고는 300자 이내로 입력해 주세요.",
  refundOnlyPaid: "결제완료 상태에서만 환불을 기록할 수 있습니다.",
  refundedAtRequired: "환불일을 입력해 주세요.",
  refundedAtFuture: "환불일은 오늘 이후로 입력할 수 없습니다.",
  refundAmountInvalid: "환불 금액은 0원 이상, 결제 금액 이하여야 합니다.",
  refundReasonRequired: "환불 사유를 입력해 주세요.",
  refundReasonTooLong: "환불 사유는 300자 이내로 입력해 주세요.",
  closedAtInvalid: "마감일 형식이 올바르지 않습니다.",
  closedAtFuture: "마감일은 오늘 이후로 입력할 수 없습니다.",
  notPosted: "홈페이지에 게시한 기록이 없습니다.",
  restoreOnlyAuto: "자동 취소된 신청만 복구할 수 있습니다.",
  restoreDueRequired: "새 결제 기한을 입력해 주세요.",
  restoreConflict: "같은 시간대에 다른 신청(접수·승인)이 있어 복구할 수 없습니다.",
} as const;

export type LoadedBundle = {
  current: RentalRequest;
  sessions: RentalRequest[];
  view: PaymentView;
  target: string;
  today: string;
};

/** {id}로 묶음 전체 로드 (어느 회차 번호든 됨) */
export async function loadBundle(db: Database, requestId: string): Promise<LoadedBundle | null> {
  const current = await db.getRequestById(requestId);
  if (!current) return null;
  const batch = current.batchId ? await db.getRequestsByBatchId(current.batchId) : [];
  const sessions = sortSessions(batch.length ? batch : [current]);
  const today = todayYmdSeoul();
  return {
    current,
    sessions,
    view: derivePaymentView(sessions, today),
    target: (current.batchId ?? "").trim() || current.requestId,
    today,
  };
}

/** 감사 summary용 공통 조각: 공간 · 기간 · 이름(마스킹) */
export function describeBundle(sessions: RentalRequest[]): string[] {
  const first = sessions[0];
  const who = first.orgName && first.orgName !== "개인" && first.orgName !== "-" ? first.orgName : first.applicantName;
  let when = "";
  if (first.roomId === "gallery" && first.startDate && first.endDate) when = `${first.startDate}~${first.endDate}`;
  else {
    const approved = sessions.filter((s) => s.status === "승인");
    const dates = (approved.length ? approved : sessions).map((s) => s.date).filter(Boolean).sort();
    when = dates.length <= 1 ? dates[0] ?? "" : `${dates[0]}~${dates[dates.length - 1]}`;
  }
  return [first.roomName || first.roomId, when, maskName(who)].filter(Boolean);
}

export function krw(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

export function md(ymd: string): string {
  if (!isYmdString(ymd)) return ymd;
  return `${parseInt(ymd.slice(5, 7), 10)}/${parseInt(ymd.slice(8, 10), 10)}`;
}

/** JSON 본문 파싱 (실패 시 빈 객체) */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "" && /^-?\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return null;
}
