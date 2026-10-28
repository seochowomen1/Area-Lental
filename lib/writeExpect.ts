/**
 * 조건부 쓰기(저장 직전 상태 재확인) — audit-fix-3 3-1
 *
 * 일괄 쓰기 함수(updateRequestsStatusBatch · updateRequestPayment)가 시트를 읽은 직후,
 * 쓰기 전에 "호출자가 기대한 상태"와 같은지 확인한다. 하나라도 다르면 아무것도 쓰지 않고 StaleWriteError.
 * 예) 크론 자동 취소가 읽은 뒤 관리자가 결제 확인을 먼저 저장했으면 → 크론은 그 묶음을 쓰지 않는다.
 *
 * 검사 대상 행
 * - status · statusById : 상태를 바꾸는 행(updates). updates가 없으면 묶음 전 행.
 * - paymentStatus · autoCancelledAtEmpty · paymentDueDate · draftedAtEmpty : 묶음 전 행(결제 필드는 묶음 동일 값).
 * 서버 전용 · 순수 함수(시트·mock 공용).
 */
import type { PaymentStatus, RentalRequest, RequestStatus } from "@/lib/types";

export type WriteExpect = {
  /** 상태를 바꾸는 행의 현재 상태가 이 중 하나여야 한다 */
  status?: RequestStatus[];
  /** 행별 기대 상태(화면을 연 시점의 상태) — 목록에 있는 행만 검사 */
  statusById?: Record<string, RequestStatus>;
  /** 묶음 결제 상태(빈값 = "")가 이 중 하나여야 한다 */
  paymentStatus?: PaymentStatus[];
  /** 묶음 autoCancelledAt이 비어 있어야 한다 */
  autoCancelledAtEmpty?: boolean;
  /** 묶음 결제 기한이 이 값과 같아야 한다(크론이 읽은 뒤 기한 연장된 경우 보호) */
  paymentDueDate?: string;
  /** 3-2용 예약 — 묶음 draftedAt이 비어 있어야 한다(지금은 열이 없어 항상 빈값) */
  draftedAtEmpty?: boolean;
};

export const STALE_WRITE_CODE = "STALE_WRITE";
export const STALE_WRITE_MESSAGE =
  "방금 다른 처리(자동 취소 또는 다른 창)가 먼저 저장되어 아무것도 바꾸지 않았습니다. 화면을 새로고침해 지금 상태를 확인한 뒤 다시 눌러 주세요.";

export class StaleWriteError extends Error {
  readonly code = STALE_WRITE_CODE;
  /** 어긋난 항목(서버 로그용 · 개인정보 없음: 신청번호·필드명·값) */
  readonly mismatches: string[];
  constructor(mismatches: string[]) {
    super(`STALE_WRITE: ${mismatches.slice(0, 5).join(" / ")}`);
    this.name = "StaleWriteError";
    this.mismatches = mismatches;
  }
}

export function isStaleWriteError(e: unknown): e is StaleWriteError {
  return e instanceof StaleWriteError || (typeof e === "object" && e !== null && (e as { code?: unknown }).code === STALE_WRITE_CODE);
}

function bundleRowsOf(all: RentalRequest[], anchor: RentalRequest | undefined): RentalRequest[] {
  if (!anchor) return [];
  const bid = (anchor.batchId ?? "").trim();
  return bid ? all.filter((r) => (r.batchId ?? "").trim() === bid) : [anchor];
}

/**
 * 기대 상태 검사 — 어긋난 항목 목록(빈 배열이면 통과)
 * @param all       방금 읽은 신청 행 전체
 * @param updateIds 상태를 바꿀 행
 * @param anchorId  묶음 기준 행(결제 patch 대상 또는 첫 update)
 */
export function findExpectMismatches(
  all: RentalRequest[],
  updateIds: string[],
  anchorId: string | undefined,
  expect: WriteExpect | undefined
): string[] {
  if (!expect) return [];
  const byId = new Map(all.map((r) => [r.requestId, r]));
  const anchor = anchorId ? byId.get(anchorId) : undefined;
  const bundle = bundleRowsOf(all, anchor);
  const statusRows = updateIds.length ? updateIds.map((id) => byId.get(id)).filter((r): r is RentalRequest => !!r) : bundle;
  const out: string[] = [];

  if (expect.status && expect.status.length) {
    for (const r of statusRows) {
      if (!expect.status.includes(r.status)) out.push(`${r.requestId}.status=${r.status}`);
    }
  }
  if (expect.statusById) {
    for (const [id, want] of Object.entries(expect.statusById)) {
      const r = byId.get(id);
      if (!r) out.push(`${id}.missing`);
      else if (r.status !== want) out.push(`${id}.status=${r.status}(기대 ${want})`);
    }
  }
  if (expect.paymentStatus && expect.paymentStatus.length) {
    for (const r of bundle) {
      const ps = (r.paymentStatus ?? "") as PaymentStatus;
      if (!expect.paymentStatus.includes(ps)) out.push(`${r.requestId}.paymentStatus=${ps || "(빈값)"}`);
    }
  }
  if (expect.autoCancelledAtEmpty) {
    for (const r of bundle) {
      if ((r.autoCancelledAt ?? "").trim()) out.push(`${r.requestId}.autoCancelledAt`);
    }
  }
  if (typeof expect.paymentDueDate === "string") {
    for (const r of bundle) {
      if ((r.paymentDueDate ?? "") !== expect.paymentDueDate) out.push(`${r.requestId}.paymentDueDate=${r.paymentDueDate ?? ""}`);
    }
  }
  if (expect.draftedAtEmpty) {
    for (const r of bundle) {
      const v = (r as RentalRequest & { draftedAt?: string }).draftedAt;
      if ((v ?? "").trim()) out.push(`${r.requestId}.draftedAt`);
    }
  }
  return out;
}

/** 어긋나면 throw */
export function assertWriteExpect(
  all: RentalRequest[],
  updateIds: string[],
  anchorId: string | undefined,
  expect: WriteExpect | undefined
): void {
  const m = findExpectMismatches(all, updateIds, anchorId, expect);
  if (m.length) throw new StaleWriteError(m);
}

/**
 * 폼 hidden 값 `viewedStatuses`(화면을 연 시점의 회차별 상태) 해석
 * 형식: JSON `{"REQ-…":"접수", …}` — 형식이 틀리면 null(호출부가 액션 시작 때 읽은 상태로 대신한다)
 */
export function parseViewedStatuses(raw: unknown): Record<string, RequestStatus> | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 20000) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: Record<string, RequestStatus> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v !== "string" || !["접수", "승인", "반려", "취소"].includes(v)) return null;
      out[k] = v as RequestStatus;
    }
    return out;
  } catch {
    return null;
  }
}
