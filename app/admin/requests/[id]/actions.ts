"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { nowIsoSeoul } from "@/lib/datetime";

import { getDatabase } from "@/lib/database";
import type { RequestStatus, RentalRequest } from "@/lib/types";
import { assertAdminAuth, getDefaultDecidedBy } from "@/lib/adminAuth";
import { normalizeDiscount, computeBaseTotalKRW } from "@/lib/pricing";
import { sendCustomDecisionEmail } from "@/lib/mail";
import { ROOMS_BY_ID, normalizeRoomCategory } from "@/lib/space";
import { recordAudit } from "@/lib/auditLog";
import { sortSessions } from "@/lib/requestUtils";
import { logger } from "@/lib/logger";
import { getGalleryRecalcView, parseGalleryAudit } from "@/lib/galleryRecalc";
import { isStaleWriteError, parseViewedStatuses } from "@/lib/writeExpect";

function getIpFromHeaders(): string {
  const h = headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

const VALID_STATUSES: ReadonlySet<string> = new Set(["접수", "승인", "반려", "취소"]);

function fmtDiscount(rate?: number, amount?: number): string {
  const r = Number(rate ?? 0);
  const a = Number(amount ?? 0);
  if (!(a > 0)) return "없음";
  return `${Number.isInteger(r) ? r : r.toFixed(2)}% (${a.toLocaleString()}원)`;
}

function describeWhen(r: RentalRequest): string {
  if (r.startDate && r.endDate) return `${r.startDate}~${r.endDate}`;
  return `${r.date} ${r.startTime}-${r.endTime}`;
}

function categoryOf(r: RentalRequest) {
  const room = (ROOMS_BY_ID as Record<string, { category?: string }>)[r.roomId];
  return normalizeRoomCategory(room?.category);
}

/** 시트 일괄 저장 실패 → 배너 (01_spec ③-K) */
function sheetBusyUrl(r: RentalRequest) {
  return `/admin/requests/${encodeURIComponent(r.requestId)}?category=${encodeURIComponent(categoryOf(r))}&formError=sheetBusy`;
}

/** 저장 직전 상태가 화면을 연 시점과 달라 쓰지 않음 → 배너 (audit-fix-3 3-1 · ③ STALE_WRITE) */
function staleUrl(r: RentalRequest) {
  return `/admin/requests/${encodeURIComponent(r.requestId)}?category=${encodeURIComponent(categoryOf(r))}&formError=stale`;
}

/** 저장 실패 종류 → 돌아갈 주소 (조건 불일치=stale · 그 밖=sheetBusy) */
function writeFailUrl(r: RentalRequest, e: unknown) {
  return isStaleWriteError(e) ? staleUrl(r) : sheetBusyUrl(r);
}

/**
 * 화면을 연 시점의 회차별 상태(hidden `viewedStatuses`) — 없거나 형식이 틀리면 액션 시작 때 읽은 상태로 대신한다.
 * 대신하는 경우에도 "읽은 뒤 ~ 쓰기 직전" 사이에 다른 처리가 끼면 막힌다.
 */
function expectedStatuses(formData: FormData, rows: RentalRequest[]): Record<string, RequestStatus> {
  const viewed = parseViewedStatuses(formData.get("viewedStatuses"));
  const out: Record<string, RequestStatus> = {};
  for (const r of rows) out[r.requestId] = viewed?.[r.requestId] ?? r.status;
  return out;
}

/** 단일 처리(승인/반려/취소 등) */
/**
 * 저장 성공 후 같은 상세 화면으로 redirect할 때, 브라우저 라우터 캐시에 남은 옛 화면을 버리게 한다.
 * (2026-10-27: 승인 저장 후 '결제 안내·확인' 칸이 새로고침 전까지 "승인 후에…"로 남던 문제)
 */
function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

export async function decideSingleAction(requestId: string, formData: FormData) {
  // ★ audit-fix-1 [7]: 서버 액션도 첫 줄에서 인증 (미들웨어 matcher가 바뀌어도 안전)
  await assertAdminAuth();
  const db = getDatabase();
  const current = await db.getRequestById(requestId);
  if (!current) redirect("/admin");

  const status = String(formData.get("status") || "").trim() as RequestStatus;
  const rejectReason = String(formData.get("rejectReason") || "").trim();
  const adminMemo = String(formData.get("adminMemo") || "").trim();
  const backUrl = `/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(categoryOf(current))}`;
  if (!VALID_STATUSES.has(status)) redirect(`${backUrl}&formError=status`);
  if (status === "반려" && !rejectReason) redirect(`${backUrl}&formError=rejectReason`);

  const discountModeRaw = String(formData.get("discountMode") || "rate").trim();
  const discountMode = discountModeRaw === "amount" ? "amount" : "rate";
  const discountRatePctIn = parseFloat(String(formData.get("discountRatePct") || "0").trim());
  const discountAmountKRWIn = parseInt(String(formData.get("discountAmountKRW") || "0").trim(), 10);
  const discountReason = String(formData.get("discountReason") || "").trim();

  const baseTotal = computeBaseTotalKRW(current).totalFeeKRW;
  const isGallery = current.roomId === "gallery";
  const normalized = normalizeDiscount(baseTotal, {
    ratePct: Number.isFinite(discountRatePctIn) ? discountRatePctIn : 0,
    amountKRW: Number.isFinite(discountAmountKRWIn) ? discountAmountKRWIn : 0,
    mode: discountMode,
  });

  const nextRate = isGallery ? 0 : normalized.discountRatePct;
  const nextAmount = isGallery ? 0 : normalized.discountAmountKRW;
  const nextReason = isGallery ? "" : discountReason;
  if (nextAmount > 0 && !nextReason) redirect(`${backUrl}&formError=discountReason`);

  const prevAmount = Number(current.discountAmountKRW ?? 0);
  const prevReason = String(current.discountReason ?? "");
  const discountChanged = prevAmount !== nextAmount || prevReason !== nextReason;

  // ★ audit-fix-3 3-1: 단건도 일괄 함수 1회 쓰기 + 조건부 쓰기(화면을 연 시점의 상태와 같을 때만)
  //   메모 칸이 폼에 없으면 기존 메모 유지(예전 단건 함수는 빈칸으로 덮었다)
  let savedOne = true;
  let failErr: unknown = null;
  try {
    await db.updateRequestsStatusBatch(
      [{
        requestId: current.requestId,
        status,
        ...(formData.has("adminMemo") ? { adminMemo } : {}),
        rejectReason: status === "반려" ? rejectReason : "",
        decidedBy: getDefaultDecidedBy(),
      }],
      {
        batchId: (current.batchId ?? "").trim(),
        requestId: current.requestId,
        discountRatePct: nextRate,
        discountAmountKRW: nextAmount,
        discountReason: nextReason,
      },
      undefined,
      { statusById: expectedStatuses(formData, [current]) }
    );
  } catch (e) {
    savedOne = false;
    failErr = e;
    logger[isStaleWriteError(e) ? "warn" : "error"]("단건 처리 저장 실패", { requestId: current.requestId, stale: isStaleWriteError(e), error: e instanceof Error ? e.message : String(e) });
  }
  if (!savedOne) redirect(writeFailUrl(current, failErr));

  const ip = getIpFromHeaders();
  const actor = getDefaultDecidedBy();
  const room = current.roomName || current.roomId;
  const who = current.orgName || current.applicantName;
  const fee = computeBaseTotalKRW(current).totalFeeKRW;

  if (status !== current.status) {
    const actionMap: Record<string, "REQUEST_APPROVE" | "REQUEST_REJECT" | "REQUEST_CANCEL" | "REQUEST_STATUS_UPDATE"> = {
      "승인": "REQUEST_APPROVE",
      "반려": "REQUEST_REJECT",
      "취소": "REQUEST_CANCEL",
      "접수": "REQUEST_STATUS_UPDATE",
    };
    await recordAudit({
      action: actionMap[status],
      ip,
      actor,
      target: current.requestId,
      summary: [
        `${current.status} → ${status}`,
        room,
        describeWhen(current),
        who,
        `정가 ${fee.toLocaleString()}원`,
        `할인 ${fmtDiscount(nextRate, nextAmount)}`,
        status === "반려" ? `사유: ${rejectReason}` : "",
      ].filter(Boolean).join(" · "),
      details: {
        decidedAt: nowIsoSeoul(),
        prevStatus: current.status,
        status,
        finalFeeKRW: Math.max(0, fee - nextAmount),
        ...(nextAmount > 0 ? { discountReason: nextReason } : {}),
        ...(status === "반려" ? { rejectReason } : {}),
      },
    });
  }

  if (discountChanged) {
    await recordAudit({
      action: "DISCOUNT_UPDATE",
      ip,
      actor,
      target: current.requestId,
      summary: [
        `할인 ${fmtDiscount(current.discountRatePct, prevAmount)} → ${fmtDiscount(nextRate, nextAmount)}`,
        nextReason ? `근거: ${nextReason}` : "",
        room,
        who,
      ].filter(Boolean).join(" · "),
      details: {
        before: { rate: current.discountRatePct ?? 0, amount: prevAmount, reason: prevReason },
        after: { rate: nextRate, amount: nextAmount, reason: nextReason },
      },
    });
  }

  const cat = categoryOf(current);
  revalidateAdmin();
  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(cat)}&saved=1`);
}

/** 묶음 공통 메타(할인/메모) 저장 */
export async function saveBundleMetaAction(requestId: string, formData: FormData) {
  await assertAdminAuth();
  const db = getDatabase();
  const current = await db.getRequestById(requestId);
  if (!current) redirect("/admin");
  if (!current.batchId) redirect(`/admin/requests/${encodeURIComponent(requestId)}`);

  const discountModeRaw = String(formData.get("discountMode") || "rate").trim();
  const discountMode = discountModeRaw === "amount" ? "amount" : "rate";
  const discountRatePctIn = parseFloat(String(formData.get("discountRatePct") || "0").trim());
  const discountAmountKRWIn = parseInt(String(formData.get("discountAmountKRW") || "0").trim(), 10);
  const discountReason = String(formData.get("discountReason") || "").trim();
  const bundleMemo = String(formData.get("adminMemo") || "").trim();

  const latest = sortSessions(await db.getRequestsByBatchId(current.batchId));
  const isGallery = current.roomId === "gallery";
  const baseTotalFeeKRW = latest.reduce((acc, s) => acc + computeBaseTotalKRW(s).totalFeeKRW, 0);
  const normalized = normalizeDiscount(baseTotalFeeKRW, {
    ratePct: Number.isFinite(discountRatePctIn) ? discountRatePctIn : 0,
    amountKRW: Number.isFinite(discountAmountKRWIn) ? discountAmountKRWIn : 0,
    mode: discountMode,
  });

  const backUrlB = `/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(categoryOf(current))}`;
  const nextAmountB = isGallery ? 0 : normalized.discountAmountKRW;
  const nextReasonB = isGallery ? "" : discountReason;
  if (nextAmountB > 0 && !nextReasonB) redirect(`${backUrlB}&formError=discountReason`);

  const src =
    latest.find((r) => (r.discountAmountKRW ?? 0) > 0 || String(r.discountReason ?? "").trim() !== "") ?? latest[0];
  const prevAmountB = Number(src?.discountAmountKRW ?? 0);
  const prevReasonB = String(src?.discountReason ?? "");
  const prevMemoB = String(latest[0]?.adminMemo ?? "");

  // ★ audit-fix-1 [9]: 묶음 전 회차 메모 + 할인을 시트 쓰기 1회로 (부분 반영 없음)
  // ★ audit-fix-3 3-1: 상태 열도 다시 쓰므로, 읽은 뒤 자동 취소 등으로 상태가 바뀌었으면 쓰지 않는다
  let savedB = true;
  let failB: unknown = null;
  try {
    await db.updateRequestsStatusBatch(
      latest.map((s) => ({
        requestId: s.requestId,
        status: s.status,
        decidedBy: getDefaultDecidedBy(),
        rejectReason: s.rejectReason ?? "",
        adminMemo: bundleMemo || (s.adminMemo ?? ""),
      })),
      {
        batchId: current.batchId,
        discountRatePct: isGallery ? 0 : normalized.discountRatePct,
        discountAmountKRW: isGallery ? 0 : normalized.discountAmountKRW,
        discountReason: isGallery ? "" : discountReason,
      },
      undefined,
      { statusById: Object.fromEntries(latest.map((s) => [s.requestId, s.status])) }
    );
  } catch (e) {
    savedB = false;
    failB = e;
    logger[isStaleWriteError(e) ? "warn" : "error"]("묶음 메타 일괄 저장 실패", { batchId: current.batchId, stale: isStaleWriteError(e), error: e instanceof Error ? e.message : String(e) });
  }
  if (!savedB) redirect(writeFailUrl(current, failB));

  const discountChangedB = prevAmountB !== nextAmountB || prevReasonB !== nextReasonB;
  const memoChangedB = !!bundleMemo && bundleMemo !== prevMemoB;
  if (discountChangedB || memoChangedB) {
    await recordAudit({
      action: discountChangedB ? "DISCOUNT_UPDATE" : "BUNDLE_META_UPDATE",
      ip: getIpFromHeaders(),
      actor: getDefaultDecidedBy(),
      target: current.batchId ?? current.requestId,
      summary: [
        `묶음 ${latest.length}회`,
        current.roomName || current.roomId,
        current.orgName || current.applicantName,
        `정가 합계 ${baseTotalFeeKRW.toLocaleString()}원`,
        discountChangedB
          ? `할인 ${fmtDiscount(src?.discountRatePct, prevAmountB)} → ${fmtDiscount(normalized.discountRatePct, nextAmountB)}`
          : "",
        discountChangedB && nextReasonB ? `근거: ${nextReasonB}` : "",
        memoChangedB ? "메모 변경" : "",
      ].filter(Boolean).join(" · "),
      details: {
        batchId: current.batchId,
        before: { amount: prevAmountB, reason: prevReasonB, memo: prevMemoB },
        after: { rate: normalized.discountRatePct, amount: nextAmountB, reason: nextReasonB, memo: bundleMemo },
      },
    });
  }

  const catB = categoryOf(current);
  revalidateAdmin();
  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(catB)}&saved=1`);
}

/** 묶음: 선택 회차 승인/반려 */
export async function decideSelectedSessionsAction(requestId: string, formData: FormData) {
  await assertAdminAuth();
  const db = getDatabase();
  const current = await db.getRequestById(requestId);
  if (!current) redirect("/admin");
  if (!current.batchId) redirect(`/admin/requests/${encodeURIComponent(requestId)}`);

  const actionStatus = String(formData.get("actionStatus") || "").trim() as RequestStatus;
  if (actionStatus !== "승인" && actionStatus !== "반려") redirect(`/admin/requests/${encodeURIComponent(requestId)}`);

  const selectAll = String(formData.get("selectAll") || "").trim() === "1";

  const selectedIds = selectAll
    ? []
    : (formData.getAll("selectedIds") as string[]).map(String).filter(Boolean);

  const rejectReason = String(formData.get("rejectReason") || "").trim();
  const adminMemo = String(formData.get("adminMemo") || "").trim();

  const latest = sortSessions(await db.getRequestsByBatchId(current.batchId));

  const catS = categoryOf(current);
  if (actionStatus === "반려" && !rejectReason) {
    redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(catS)}&formError=rejectReason`);
  }
  const effectiveSelected = selectAll ? latest.map((s) => s.requestId) : selectedIds;
  if (effectiveSelected.length === 0) redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(catS)}&formError=noSelection`);

  // ★ audit-fix-1 [9]: 선택 회차만 시트 쓰기 1회로 (Promise.all 동시 쓰기 → 쿼터 초과·부분 반영 방지)
  // ★ audit-fix-3 3-1: 선택 회차가 화면을 연 시점의 상태 그대로일 때만 쓴다(다른 창·자동 취소가 먼저 저장했으면 stale)
  const selectedRows = latest.filter((s) => effectiveSelected.includes(s.requestId));
  let savedS = true;
  let failS: unknown = null;
  try {
    await db.updateRequestsStatusBatch(
      selectedRows.map((s) => ({
        requestId: s.requestId,
        status: actionStatus,
        decidedBy: getDefaultDecidedBy(),
        rejectReason: actionStatus === "반려" ? rejectReason : "",
        adminMemo: adminMemo || (s.adminMemo ?? ""),
      })),
      undefined,
      undefined,
      { statusById: expectedStatuses(formData, selectedRows) }
    );
  } catch (e) {
    savedS = false;
    failS = e;
    logger[isStaleWriteError(e) ? "warn" : "error"]("묶음 선택 회차 일괄 처리 실패", { batchId: current.batchId, stale: isStaleWriteError(e), error: e instanceof Error ? e.message : String(e) });
  }
  if (!savedS) redirect(writeFailUrl(current, failS));

  const selectedDates = latest.filter((s) => effectiveSelected.includes(s.requestId)).map((s) => s.date);
  await recordAudit({
    action: actionStatus === "승인" ? "REQUEST_APPROVE" : "REQUEST_REJECT",
    ip: getIpFromHeaders(),
    actor: getDefaultDecidedBy(),
    target: current.batchId ?? current.requestId,
    summary: [
      `묶음 ${effectiveSelected.length}/${latest.length}회 ${actionStatus}`,
      current.roomName || current.roomId,
      current.orgName || current.applicantName,
      selectedDates.join(", "),
      actionStatus === "반려" ? `사유: ${rejectReason}` : "",
    ].filter(Boolean).join(" · "),
    details: {
      decidedAt: nowIsoSeoul(),
      batchId: current.batchId,
      selectedIds: effectiveSelected,
      ...(actionStatus === "반려" ? { rejectReason } : {}),
    },
  });

  revalidateAdmin();
  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(catS)}&saved=1`);
}

/** 메일 발송: 관리자가 확인한 내용으로 발송 */
export async function sendConfirmedEmailAction(requestId: string, formData: FormData) {
  await assertAdminAuth();
  // ★ audit-fix-1 [7]: 수신자는 폼 값이 아니라 그 신청의 저장된 이메일로 고정(임의 수신자 발송 차단)
  const target = await getDatabase().getRequestById(requestId);
  const to = String(target?.email ?? "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();

  if (!to || !subject || !body) {
    redirect(`/admin/requests/${encodeURIComponent(requestId)}?emailError=1`);
  }

  await sendCustomDecisionEmail(to, subject, body);

  await recordAudit({
    action: "EMAIL_SEND",
    actor: getDefaultDecidedBy(),
    ip: getIpFromHeaders(),
    target: requestId,
    details: { to, subject },
  });

  revalidateAdmin();
  redirect(`/admin/requests/${encodeURIComponent(requestId)}?mailed=1`);
}

/**
 * 갤러리 이용료 다시 계산 (audit-fix-2 R2 · 01_spec 5-3 · ⑧ Q7)
 * - 사용: `<form action={recalcGalleryFeeAction.bind(null, requestId)}>` (다른 액션과 같은 시그니처)
 * - 이 1건만: 일수 3열 + galleryAuditJson(holidayCheck:"ok" · recalculatedAt · recalcFrom · recalcHolidayStatus) 갱신 + 감사 로그 1건
 * - 결과 redirect: 성공 `saved=recalc` · 조건 밖 `formError=recalcNotAllowed` · 공휴일 여전히 조회 불가 `formError=holidayUnavailable`
 *   · 바뀔 것 없음 `formError=recalcNoChange` · 시트 쓰기 실패 `formError=sheetBusy`
 */
export async function recalcGalleryFeeAction(requestId: string, _formData?: FormData) {
  void _formData;
  await assertAdminAuth();
  const db = getDatabase();
  const current = await db.getRequestById(requestId);
  if (!current) redirect("/admin");
  const backUrl = `/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(categoryOf(current))}`;


  const view = await getGalleryRecalcView(current);
  if (!view || !view.showBanner || !view.statusAllowed) redirect(`${backUrl}&formError=recalcNotAllowed`);
  if (!view.after) redirect(`${backUrl}&formError=holidayUnavailable`);
  if (view.blockReason === "noChange") redirect(`${backUrl}&formError=recalcNoChange`);
  const after = view.after;
  const before = view.before;

  const recalculatedAt = nowIsoSeoul();
  const audit = parseGalleryAudit(current.galleryAuditJson);
  const nextAudit = {
    ...audit,
    weekdayCount: after.weekdayCount,
    saturdayCount: after.saturdayCount,
    exhibitionDayCount: after.exhibitionDayCount,
    holidayCheck: "ok",
    recalcHolidayStatus: view.nowStatus,
    recalculatedAt,
    recalcFrom: { weekdayCount: before.weekdayCount, saturdayCount: before.saturdayCount, feeKRW: before.feeKRW },
  };

  let saved = false;
  try {
    await db.updateGalleryFee({
      requestId: current.requestId,
      weekdayCount: after.weekdayCount,
      saturdayCount: after.saturdayCount,
      exhibitionDayCount: after.exhibitionDayCount,
      galleryAuditJson: JSON.stringify(nextAudit),
    });
    saved = true;
  } catch (e) {
    logger.error("갤러리 이용료 다시 계산 저장 실패", { requestId: current.requestId, error: e instanceof Error ? e.message : String(e) });
  }
  if (!saved) redirect(sheetBusyUrl(current));

  await recordAudit({
    action: "GALLERY_FEE_RECALC",
    ip: getIpFromHeaders(),
    actor: getDefaultDecidedBy(),
    target: current.requestId,
    summary: [
      `이용료 ${before.feeKRW.toLocaleString()}원 → ${after.feeKRW.toLocaleString()}원`,
      `평일 ${before.weekdayCount}→${after.weekdayCount}일 · 토요일 ${before.saturdayCount}→${after.saturdayCount}일`,
      `${view.startDate}~${view.endDate}`,
      view.periodHolidays.length ? `공휴일 ${view.periodHolidays.map((h) => h.label).join(", ")}` : "",
    ].filter(Boolean).join(" · "),
    details: {
      before,
      after,
      holidayCheckAtApply: view.holidayCheck,
      holidayStatusNow: view.nowStatus,
      recalculatedAt,
    },
  });

  revalidateAdmin();
  redirect(`${backUrl}&saved=recalc`);
}
