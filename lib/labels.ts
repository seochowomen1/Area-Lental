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
