import type { RentalRequest, RequestStatus } from "@/lib/types";

export type BundleStatusKind =
  | "allApproved"
  | "allRejected"
  | "inProgress"
  | "partialFinal"
  | "allPending"
  | "other";

export type BundleDisplay = {
  /** 화면에 그대로 노출할 상태 문자열(부분처리 포함) */
  displayStatus: string;
  /** 필터/라벨(기존 호환)용 대표 상태 */
  statusForFilter: RequestStatus;
  kind: BundleStatusKind;
  isPartial: boolean;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  totalCount: number;
};

const PENDING: RequestStatus[] = ["접수"];

export function analyzeBundle(list: RentalRequest[]): BundleDisplay {
  const items = Array.isArray(list) ? list.filter(Boolean) : [];
  const totalCount = items.length;
  const approvedCount = items.filter((r) => r.status === "승인").length;
  const rejectedCount = items.filter((r) => r.status === "반려").length;
  const pendingCount = items.filter((r) => PENDING.includes(r.status)).length;
  const unique = new Set(items.map((r) => r.status));
  const isPartial = unique.size > 1;

  let kind: BundleStatusKind = "allPending";
  if (totalCount === 0) kind = "allPending";
  else if (approvedCount === totalCount) kind = "allApproved";
  else if (rejectedCount === totalCount) kind = "allRejected";
  else if (pendingCount > 0 && approvedCount === 0 && rejectedCount === 0) kind = "allPending";
  else if (pendingCount > 0) kind = "inProgress";
  else if (approvedCount > 0 && rejectedCount > 0) kind = "partialFinal";
  else kind = "other";

  let displayStatus: string = items[0]?.status ?? "접수";
  if (kind === "allApproved") displayStatus = "승인";
  else if (kind === "allRejected") displayStatus = "반려";
  else if (kind === "partialFinal") displayStatus = "부분처리";
  else if (kind === "inProgress") displayStatus = "접수";
  else if (kind === "allPending") displayStatus = unique.size === 1 ? items[0]?.status ?? "접수" : "접수";

  let statusForFilter: RequestStatus = items[0]?.status ?? "접수";
  if (totalCount === 0) statusForFilter = "접수";
  else if (unique.size === 1) statusForFilter = items[0].status;
  else if (rejectedCount > 0) statusForFilter = "반려";
  else statusForFilter = "접수";

  return {
    displayStatus,
    statusForFilter,
    kind,
    isPartial,
    approvedCount,
    rejectedCount,
    pendingCount,
    totalCount
  };
}

export function pickFeeBasisSessions(list: RentalRequest[], mode: "approvedIfAny" | "all" = "approvedIfAny") {
  const items = Array.isArray(list) ? list.filter(Boolean) : [];
  if (mode === "all") return items;
  const approved = items.filter((r) => r.status === "승인");
  return approved.length ? approved : items;
}
