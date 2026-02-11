"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/database";
import type { RequestStatus, RentalRequest } from "@/lib/types";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { normalizeDiscount, computeBaseTotalKRW } from "@/lib/pricing";
import { sendCustomDecisionEmail } from "@/lib/mail";

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

  // 승인/반려/취소 시 이메일 발송 팝업을 표시하기 위해 상태 전달 (자동 발송 안 함)
  const isDecision = (status === "승인" || status === "반려" || status === "취소") && status !== current.status;
  const emailParam = isDecision ? `&emailPending=${encodeURIComponent(status)}` : "";
  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?saved=1${emailParam}`);
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

  // 승인/반려 시 이메일 발송 팝업 표시를 위해 상태 전달
  redirect(`/admin/requests/${encodeURIComponent(current.requestId)}?saved=1&emailPending=${encodeURIComponent(actionStatus)}`);
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
