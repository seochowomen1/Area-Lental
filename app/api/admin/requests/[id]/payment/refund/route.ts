import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { recordAudit } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { isYmdString, collectedKRWOf } from "@/lib/payment";
import { loadBundle, MSG, readJson, asString, asInt, describeBundle, krw } from "@/lib/paymentApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/admin/requests/{id}/payment/refund — 환불 기록 (03_api §4)
 * body: { refundedAt, refundAmountKRW, refundReason }
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: auth.status ?? 401 });

  try {
    const body = await readJson(req);
    const refundedAt = asString(body.refundedAt);
    const amount = asInt(body.refundAmountKRW);
    const reason = asString(body.refundReason);

    const db = getDatabase();
    const loaded = await loadBundle(db, params.id);
    if (!loaded) return jsonError(MSG.notFound, 404, "NOT_FOUND");
    const { view, sessions, today, target } = loaded;

    if (!isYmdString(refundedAt)) return jsonError(MSG.refundedAtRequired, 400, "VALIDATION");
    if (refundedAt > today) return jsonError(MSG.refundedAtFuture, 400, "VALIDATION");
    if (!reason) return jsonError(MSG.refundReasonRequired, 400, "VALIDATION");
    if (reason.length > 300) return jsonError(MSG.refundReasonTooLong, 400, "VALIDATION");
    if (view.paymentStatus !== "결제완료") return jsonError(MSG.refundOnlyPaid, 409, "CONFLICT");
    if (amount === null || amount < 0 || amount > view.paidAmountKRW) return jsonError(MSG.refundAmountInvalid, 400, "VALIDATION");

    const updated = await db.updateRequestPayment({
      requestId: loaded.current.requestId,
      patch: { paymentStatus: "환불", refundedAt, refundAmountKRW: amount, refundReason: reason },
    });
    const rep = updated.find((r) => r.requestId === loaded.current.requestId) ?? updated[0];

    await recordAudit({
      action: "PAYMENT_REFUND",
      ip: getClientIp(req),
      actor: getDefaultDecidedBy(),
      target,
      summary: ["환불", refundedAt, krw(amount), `결제 ${krw(view.paidAmountKRW)}`, `사유: ${reason}`, ...describeBundle(sessions)].join(" · "),
      details: {
        batchId: (loaded.current.batchId ?? "").trim() || undefined,
        paidAmountKRW: view.paidAmountKRW,
        refundAmountKRW: amount,
        refundedAt,
        refundReason: reason,
      },
    });

    return NextResponse.json({
      ok: true,
      request: {
        requestId: loaded.current.requestId,
        batchId: (loaded.current.batchId ?? "").trim(),
        paymentStatus: rep.paymentStatus ?? "",
        refundedAt: rep.refundedAt ?? "",
        refundAmountKRW: rep.refundAmountKRW ?? 0,
        refundReason: rep.refundReason ?? "",
        paidAmountKRW: rep.paidAmountKRW ?? 0,
      },
      collectedKRW: collectedKRWOf(rep) ?? 0,
    });
  } catch (e: unknown) {
    return handleApiError(e, "환불 기록");
  }
}
