"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/database";
import type { RequestStatus, RentalRequest } from "@/lib/types";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { normalizeDiscount, computeBaseTotalKRW } from "@/lib/pricing";
import { sendApplicantDecisionEmail, sendApplicantDecisionEmailBatch } from "@/lib/mail";

function sortSessions(list: RentalRequest[]) {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
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

  // 최종 결정 상태로 변경된 경우에만 메일 발송
  if ((status === "승인" || status === "반려") && status !== current.status) {
    if (updated.batchId) {
      const latest = sortSessions(await db.getRequestsByBatchId(updated.batchId));
      await sendApplicantDecisionEmailBatch(latest);
    } else {
      await sendApplicantDecisionEmail(updated);
    }
  }

  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?saved=1`);
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

  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?saved=1`);
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

  const effectiveSelected = selectAll ? latest.map((s) => s.requestId) : selectedIds;
  if (effectiveSelected.length === 0) redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?saved=1`);

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

  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?saved=1`);
}

/** 현재 상태 메일 발송(단일/묶음 자동 분기) */
export async function sendCurrentStatusEmailAction(requestId: string) {
  const db = getDatabase();
  const current = await db.getRequestById(requestId);
  if (!current) redirect("/admin");

  if (current.batchId) {
    const latest = sortSessions(await db.getRequestsByBatchId(current.batchId));
    await sendApplicantDecisionEmailBatch(latest);
  } else {
    const latest = await db.getRequestById(current.requestId);
    if (latest) await sendApplicantDecisionEmail(latest);
  }

  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?mailed=1`);
}
