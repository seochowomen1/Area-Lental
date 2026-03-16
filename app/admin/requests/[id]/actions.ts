"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getDatabase } from "@/lib/database";
import type { RequestStatus, RentalRequest } from "@/lib/types";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { normalizeDiscount, computeBaseTotalKRW } from "@/lib/pricing";
import { sendCustomDecisionEmail } from "@/lib/mail";
import { ROOMS_BY_ID, normalizeRoomCategory } from "@/lib/space";
import { auditLog } from "@/lib/auditLog";

function getIpFromHeaders(): string {
  const h = headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

function sortSessions(list: RentalRequest[]) {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
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

  const updated = await db.updateRequestStatus({
    requestId: current.requestId,
    status,
    adminMemo,
    rejectReason: status === "반려" ? rejectReason : "",
    decidedBy: getDefaultDecidedBy(),
    discountRatePct: isGallery ? 0 : normalized.discountRatePct,
    discountAmountKRW: isGallery ? 0 : normalized.discountAmountKRW,
    discountReason: isGallery ? "" : discountReason,
  });

  if (status === "승인" || status === "반려") {
    auditLog({
      action: status === "승인" ? "REQUEST_APPROVE" : "REQUEST_REJECT",
      ip: getIpFromHeaders(),
      target: current.requestId,
      details: {
        decidedAt: new Date().toISOString(),
        ...(status === "반려" ? { rejectReason } : {}),
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

  auditLog({
    action: actionStatus === "승인" ? "REQUEST_APPROVE" : "REQUEST_REJECT",
    ip: getIpFromHeaders(),
    target: current.batchId ?? current.requestId,
    details: {
      decidedAt: new Date().toISOString(),
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
  redirect(`/admin/requests/${encodeURIComponent(requestId)}?mailed=1`);
}
