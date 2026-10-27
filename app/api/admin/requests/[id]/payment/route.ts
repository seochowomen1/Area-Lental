import { NextResponse } from "next/server";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { recordAudit } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { nowIsoSeoul } from "@/lib/datetime";
import { PAYMENT_METHODS, isYmdString } from "@/lib/payment";
import type { PaymentMethod, PaymentPatch } from "@/lib/types";
import { PAYMENT_LABELS } from "@/lib/labels";
import { loadBundle, MSG, readJson, asString, asInt, describeBundle, krw } from "@/lib/paymentApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/admin/requests/{id}/payment — 결제 확인(처음) / 결제 기록 수정(이미 결제완료·환불) (03_api §3)
 * body: { paymentMethod, paidAt, paidAmountKRW, paymentNote? }
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) return adminApiAuthFailure(auth);

  try {
    const body = await readJson(req);
    const method = asString(body.paymentMethod) as PaymentMethod;
    const paidAt = asString(body.paidAt);
    const amount = asInt(body.paidAmountKRW);
    const note = asString(body.paymentNote);

    const db = getDatabase();
    const loaded = await loadBundle(db, params.id);
    if (!loaded) return jsonError(MSG.notFound, 404, "NOT_FOUND");
    const { view, sessions, today, target } = loaded;

    if (!PAYMENT_METHODS.includes(method)) return jsonError(MSG.methodRequired, 400, "VALIDATION");
    if (!isYmdString(paidAt)) return jsonError(MSG.paidAtRequired, 400, "VALIDATION");
    if (paidAt > today) return jsonError(MSG.paidAtFuture, 400, "VALIDATION");
    if (amount === null || amount < 0) return jsonError(MSG.amountInvalid, 400, "VALIDATION");
    if (note.length > 300) return jsonError(MSG.noteTooLong, 400, "VALIDATION");

    if (view.paymentState === "autoCancelled") return jsonError(MSG.autoCancelled, 409, "CONFLICT");
    if (view.approvedCount === 0) return jsonError(MSG.needApprovedForPayment, 409, "CONFLICT");

    const approvedFeeKRW = view.approvedFeeKRW;
    if (amount !== approvedFeeKRW && !note) return jsonError(MSG.noteRequired, 400, "VALIDATION");

    const isUpdate = view.paymentStatus === "결제완료" || view.paymentStatus === "환불";
    const now = nowIsoSeoul();
    const actor = getDefaultDecidedBy();
    const before = isUpdate
      ? {
          paymentStatus: view.paymentStatus,
          paymentMethod: view.paymentMethod,
          paidAt: view.paidAt,
          paidAmountKRW: view.paidAmountKRW,
          paymentNote: view.paymentNote,
          ...(view.paymentStatus === "환불"
            ? { refundedAt: view.refundedAt, refundAmountKRW: view.refundAmountKRW, refundReason: view.refundReason }
            : {}),
        }
      : null;

    const patch: PaymentPatch = {
      paymentStatus: "결제완료",
      paymentMethod: method,
      paidAt,
      paidAmountKRW: amount,
      paymentNote: note || null,
      paymentConfirmedAt: now,
      paymentConfirmedBy: actor,
      // 환불 → 재결제: 환불 필드는 비우고 감사 before에 보존
      refundedAt: null,
      refundAmountKRW: null,
      refundReason: null,
    };
    const updated = await db.updateRequestPayment({ requestId: loaded.current.requestId, patch });
    const rep = updated.find((r) => r.requestId === loaded.current.requestId) ?? updated[0];

    const amountDiffKRW = approvedFeeKRW - amount;
    const homepageStillPosted = !!rep.homepagePostedAt && !rep.homepageClosedAt;

    await recordAudit({
      action: isUpdate ? "PAYMENT_UPDATE" : "PAYMENT_CONFIRM",
      ip: getClientIp(req),
      actor,
      target,
      summary: [
        isUpdate ? "결제 기록 수정" : "결제완료",
        method,
        paidAt,
        krw(amount),
        `${PAYMENT_LABELS.approvedFee} ${krw(approvedFeeKRW)}`,
        amountDiffKRW !== 0 ? `차이 ${amountDiffKRW > 0 ? "-" : "+"}${krw(Math.abs(amountDiffKRW))}` : "",
        note ? `비고: ${note}` : "",
        ...describeBundle(sessions),
      ].filter(Boolean).join(" · "),
      details: {
        batchId: (loaded.current.batchId ?? "").trim() || undefined,
        approvedFeeKRW,
        amountDiffKRW,
        ...(before ? { before } : {}),
        after: { paymentStatus: "결제완료", paymentMethod: method, paidAt, paidAmountKRW: amount, paymentNote: note },
      },
    });

    return NextResponse.json({
      ok: true,
      action: isUpdate ? "update" : "confirm",
      request: {
        requestId: loaded.current.requestId,
        batchId: (loaded.current.batchId ?? "").trim(),
        paymentStatus: rep.paymentStatus ?? "",
        paymentMethod: rep.paymentMethod ?? "",
        paidAt: rep.paidAt ?? "",
        paidAmountKRW: rep.paidAmountKRW ?? 0,
        paymentNote: rep.paymentNote ?? "",
        paymentConfirmedAt: rep.paymentConfirmedAt ?? "",
        paymentConfirmedBy: rep.paymentConfirmedBy ?? "",
      },
      approvedFeeKRW,
      amountDiffKRW,
      homepageStillPosted,
    });
  } catch (e: unknown) {
    return handleApiError(e, "결제 확인 기록");
  }
}
