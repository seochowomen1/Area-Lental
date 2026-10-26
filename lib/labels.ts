import type { RequestStatus } from "@/lib/types";

/**
 * 화면 표기 용어 통일(접수/신청/제출 -> '신청')
 * - 내부 데이터(status 값 등)는 기존 문자열을 유지하되, 화면에서만 표기 라벨을 통일합니다.
 */
export function statusLabel(status: RequestStatus): string {
  if (status === "접수") return "신청";
  return status;
}

export const REQUEST_ID_LABEL = "신청번호";
export const APPLY_NOUN = "신청";
export const APPLY_VERB = "신청";

/** 접수 경로 표시 (서면 접수 등록 · 2026-10-19) */
export const INTAKE_CHANNEL_OPTIONS: { value: "visit" | "email" | "fax"; label: string }[] = [
  { value: "visit", label: "방문 제출(서면)" },
  { value: "email", label: "이메일 제출(서면)" },
  { value: "fax", label: "팩스·우편 제출(서면)" },
];

export function intakeChannelLabel(ch?: string): string {
  if (!ch || ch === "online") return "온라인 신청";
  return INTAKE_CHANNEL_OPTIONS.find((o) => o.value === ch)?.label ?? ch;
}

export function isOfflineIntake(ch?: string): boolean {
  return Boolean(ch && ch !== "online");
}

/**
 * 결제 기록 용어 — 단일 출처 (2026-10-26 사용자 지시: "징수액·징수·청구액" 금지)
 * - 수입: 기존 라벨 그대로(승인된 대관료 합계)
 * - 결제 확인 금액: 실제 받은 돈(결제완료 금액 − 환불 금액)
 * - 승인 금액: 할인 후 승인 요금
 * 화면·엑셀 헤더·메일·설명 문구는 전부 이 상수를 쓴다. 영문 필드명(collectedKRW 등)은 spec 그대로.
 */
export const PAYMENT_LABELS = {
  /** 승인된 대관료 합계(기존 "수입") */
  revenue: "수입",
  /** 실제 받은 돈 */
  collected: "결제 확인 금액",
  /** 좁은 칸용 */
  collectedShort: "결제 확인",
  /** 할인 후 승인 요금 */
  approvedFee: "승인 금액",
  /** 결제 미확인 건수 문구 */
  unconfirmed: (n: number) => `결제 미확인 ${n}건`,
  /** 수입 엑셀 열 이름 */
  excel: {
    approvedFee: "승인 금액",
    paymentStatus: "결제 상태",
    paidAt: "결제일",
    paymentMethod: "결제 방법",
    collected: "결제 확인 금액",
    refund: "환불 금액",
    homepageClosed: "홈페이지 마감",
  },
  /** 엑셀 비고 줄 설명 */
  excelNote: "결제 확인 금액 = 결제완료 건의 결제 금액 − 환불 금액 · 결제 미확인 건은 공란",
} as const;
