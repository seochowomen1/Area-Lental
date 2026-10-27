/**
 * 신청서 제출 응답 처리 — 클라이언트 공용 (audit-fix-1 [1][2][6][10])
 * ApplyClient(강의실·E-스튜디오)·ApplyGalleryClient(갤러리)가 같이 쓴다.
 */
import { saveApplicantAccess } from "@/lib/applicantAccess";

/** 01_spec ③-G — 서버 message가 비었을 때만 쓰는 예비 문구(서버와 같은 원문) */
const SLOT_TAKEN_FALLBACK = {
  time: "방금 다른 분이 같은 시간을 먼저 신청했습니다. 신청은 접수되지 않았습니다. 달력에서 다른 시간을 골라 주세요.",
  period: "방금 다른 분이 같은 기간을 먼저 신청했습니다. 신청은 접수되지 않았습니다. 달력에서 다른 기간을 골라 주세요.",
} as const;

export type ApplyErrorView = {
  /** 빨간 Notice 제목 */
  title: string;
  /** 빨간 Notice 본문 */
  message: string;
  /** 회차별 사유(BATCH_CONFLICT · SESSION_INVALID) — 노란 Notice에 한 줄씩 */
  issueLines: string[];
};

type Issue = { date?: string; startTime?: string; endTime?: string; message?: string };

export function parseApplyError(data: unknown, isGallery: boolean): ApplyErrorView {
  const d = (data ?? {}) as { code?: string; message?: string; issues?: Issue[] };
  const code = String(d.code ?? "");
  const issues = Array.isArray(d.issues) ? d.issues : [];

  if (code === "SLOT_TAKEN") {
    return {
      title: "신청이 접수되지 않았습니다",
      message: d.message || (isGallery ? SLOT_TAKEN_FALLBACK.period : SLOT_TAKEN_FALLBACK.time),
      issueLines: [],
    };
  }
  if (code === "BATCH_CONFLICT") {
    return {
      title: "처리 중 오류가 발생했습니다",
      message: d.message || "신청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      issueLines: issues.map(
        (it) => `• ${it.date ?? ""}${it.startTime && it.endTime ? ` ${it.startTime}-${it.endTime}` : ""}: ${it.message ?? ""}`
      ),
    };
  }
  if (code === "SESSION_INVALID") {
    // issue.message 자체가 "{날짜} {시작}-{종료}: …" 형식
    return {
      title: "처리 중 오류가 발생했습니다",
      message: d.message || "신청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      issueLines: issues.map((it) => `• ${it.message ?? ""}`),
    };
  }
  return {
    title: "처리 중 오류가 발생했습니다",
    message: d.message || "신청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    issueLines: [],
  };
}

/**
 * 200 응답 처리 → 완료 화면 주소
 * - token은 sessionStorage["applicantAccess"]에만 저장(60분) · URL에 넣지 않는다.
 * - estimatedFeeKRW(서버 공용 계산)를 완료 화면에 넘긴다. 화면 금액과 다르면 로그 1줄.
 */
export function handleApplySuccess(
  data: unknown,
  opts: { category?: "gallery"; screenFeeKRW?: number | null }
): string {
  const d = (data ?? {}) as {
    requestId?: string;
    batchId?: string;
    count?: number;
    token?: string;
    tokenExpiresAt?: number;
    estimatedFeeKRW?: number;
    /** 갤러리만 — 신청 당시 공휴일 확인 상태(03_api 1-3) */
    holidayCheck?: string;
  };
  const token = String(d.token ?? "");
  if (token) saveApplicantAccess(token, Number(d.tokenExpiresAt ?? 0) || undefined);

  const fee = Number(d.estimatedFeeKRW);
  if (Number.isFinite(fee) && opts.screenFeeKRW != null && fee !== opts.screenFeeKRW) {
    console.info(`[신청] 서버 예상 금액(${fee})이 화면 금액(${opts.screenFeeKRW})과 달라 서버 금액을 표시합니다.`);
  }

  const qp = new URLSearchParams();
  if (d.requestId) qp.set("requestId", String(d.requestId));
  if (d.batchId) qp.set("batchId", String(d.batchId));
  const count = Number(d.count ?? 1);
  if (Number.isFinite(count) && count > 1) qp.set("count", String(count));
  if (opts.category) qp.set("category", opts.category);
  if (Number.isFinite(fee)) qp.set("fee", String(fee));
  // 공휴일 미확인으로 접수된 갤러리 건 — 완료 화면 금액 옆 안내(5-2)
  if (d.holidayCheck === "unavailable") qp.set("hc", "unavailable");
  return `/success?${qp.toString()}`;
}
