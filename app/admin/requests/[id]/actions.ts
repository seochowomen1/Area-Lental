"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { nowIsoSeoul } from "@/lib/datetime";

import { getDatabase } from "@/lib/database";
import type { RequestStatus, RentalRequest } from "@/lib/types";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { normalizeDiscount, computeBaseTotalKRW } from "@/lib/pricing";
import { sendCustomDecisionEmail } from "@/lib/mail";
import { ROOMS_BY_ID, normalizeRoomCategory } from "@/lib/space";
import { recordAudit } from "@/lib/auditLog";
import { sortSessions } from "@/lib/requestUtils";

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

/** 단일 처리(승인/반려/취소 등) */
export async function decideSingleAction(requestId: string, formData: FormData) {
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

  await db.updateRequestStatus({
    requestId: current.requestId,
    status,
    adminMemo,
    rejectReason: status === "반려" ? rejectReason : "",
    decidedBy: getDefaultDecidedBy(),
    discountRatePct: nextRate,
    discountAmountKRW: nextAmount,
    discountReason: nextReason,
  });

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
  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(cat)}&saved=1`);
}

/** 묶음 공통 메타(할인/메모) 저장 */
export async function saveBundleMetaAction(requestId: string, formData: FormData) {
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

  await Promise.all(
    latest.map((s, i) =>
      db.updateRequestStatus({
        requestId: s.requestId,
        status: s.status,
        decidedBy: getDefaultDecidedBy(),
        rejectReason: s.rejectReason ?? "",
        adminMemo: bundleMemo || (s.adminMemo ?? ""),
        ...(i === 0
          ? {
              discountRatePct: isGallery ? 0 : normalized.discountRatePct,
              discountAmountKRW: isGallery ? 0 : normalized.discountAmountKRW,
              discountReason: isGallery ? "" : discountReason,
            }
          : {}),
      })
    )
  );

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
  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(catB)}&saved=1`);
}

/** 묶음: 선택 회차 승인/반려 */
export async function decideSelectedSessionsAction(requestId: string, formData: FormData) {
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
  if (effectiveSelected.length === 0) redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(catS)}&saved=1`);

  await Promise.all(
    latest.map((s) => {
      const isSelected = effectiveSelected.includes(s.requestId);
      const nextStatus = isSelected ? actionStatus : s.status;
      const nextRejectReason = isSelected ? (actionStatus === "반려" ? rejectReason : "") : (s.rejectReason ?? "");
      const nextMemo = isSelected ? (adminMemo || (s.adminMemo ?? "")) : (s.adminMemo ?? "");

      return db.updateRequestStatus({
        requestId: s.requestId,
        status: nextStatus,
        decidedBy: getDefaultDecidedBy(),
        rejectReason: nextRejectReason,
        adminMemo: nextMemo,
      });
    })
  );

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

  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?category=${encodeURIComponent(catS)}&saved=1`);
}

/** 메일 발송: 관리자가 확인한 내용으로 발송 */
export async function sendConfirmedEmailAction(requestId: string, formData: FormData) {
  const to = String(formData.get("to") || "").trim();
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

  redirect(`/admin/requests/${encodeURIComponent(requestId)}?mailed=1`);
}
