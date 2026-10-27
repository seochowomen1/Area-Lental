import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { recordAudit } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { isAllowedPaymentLinkUrl, isYmdString } from "@/lib/payment";
import type { PaymentPatch } from "@/lib/types";
import { loadBundle, MSG, readJson, asString, describeBundle, md } from "@/lib/paymentApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * PUT /api/admin/requests/{id}/payment-notice — 결제 링크·기한·게시 저장 (1단계 · 기한 연장 포함) (03_api §2)
 * body: { paymentLinkUrl?: string, paymentDueDate: string, homepagePosted?: boolean }
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: auth.status ?? 401 });

  try {
    const body = await readJson(req);
    const dueDate = asString(body.paymentDueDate);
    const hasLink = Object.prototype.hasOwnProperty.call(body, "paymentLinkUrl");
    const link = hasLink ? asString(body.paymentLinkUrl) : null;
    const hasPosted = typeof body.homepagePosted === "boolean";
    const posted = hasPosted ? (body.homepagePosted as boolean) : null;

    const db = getDatabase();
    const loaded = await loadBundle(db, params.id);
    if (!loaded) return jsonError(MSG.notFound, 404, "NOT_FOUND");
    const { view, sessions, today, target } = loaded;

    // 입력 검증
    if (!isYmdString(dueDate)) return jsonError(MSG.dueRequired, 400, "VALIDATION");
    if (dueDate < today) return jsonError(MSG.duePast, 400, "VALIDATION");
    if (link && !isAllowedPaymentLinkUrl(link)) return jsonError(MSG.linkHost, 400, "VALIDATION");

    // 상태 검증
    if (view.paymentState === "autoCancelled") return jsonError(MSG.autoCancelled, 409, "CONFLICT");
    if (view.approvedCount === 0) return jsonError(MSG.needApprovedForNotice, 409, "CONFLICT");

    const prevDue = view.paymentDueDate;
    const patch: PaymentPatch = { paymentDueDate: dueDate };
    if (link !== null) patch.paymentLinkUrl = link || null;
    if (posted === true && !view.homepagePostedAt) patch.homepagePostedAt = today;
    if (posted === false) {
      patch.homepagePostedAt = null;
      patch.homepageClosedAt = null;
    }

    const updated = await db.updateRequestPayment({ requestId: loaded.current.requestId, patch });
    const rep = updated.find((r) => r.requestId === loaded.current.requestId) ?? updated[0];

    const warnings: string[] = [];
    if (view.usageStartDate && dueDate > view.usageStartDate) {
      warnings.push(`결제 기한이 이용 시작일(${view.usageStartDate}) 이후입니다. 이용 당일까지 결제가 없으면 현장에서 받아야 합니다.`);
    }
    const dueDateChanged = prevDue && prevDue !== dueDate ? { from: prevDue, to: dueDate } : null;

    await recordAudit({
      action: "PAYMENT_NOTICE_SAVE",
      ip: getClientIp(req),
      actor: getDefaultDecidedBy(),
      target,
      summary: [
        "결제 안내 저장",
        ...describeBundle(sessions),
        dueDateChanged ? `기한 ${md(dueDateChanged.from)} → ${md(dueDateChanged.to)}` : `기한 ${md(dueDate)}`,
        rep.paymentLinkUrl ? "링크 있음" : "링크 없음",
        rep.homepageClosedAt ? "마감완료" : rep.homepagePostedAt ? "게시중" : "미게시",
      ].join(" · "),
      details: {
        batchId: (loaded.current.batchId ?? "").trim() || undefined,
        paymentDueDate: dueDate,
        prevDueDate: prevDue || undefined,
        hasLink: !!rep.paymentLinkUrl,
        homepagePostedAt: rep.homepagePostedAt ?? "",
        warnings,
      },
    });

    return NextResponse.json({
      ok: true,
      request: {
        requestId: loaded.current.requestId,
        batchId: (loaded.current.batchId ?? "").trim(),
        paymentLinkUrl: rep.paymentLinkUrl ?? "",
        paymentDueDate: rep.paymentDueDate ?? "",
        homepagePostedAt: rep.homepagePostedAt ?? "",
        homepageClosedAt: rep.homepageClosedAt ?? "",
      },
      warnings,
      dueDateChanged,
      usageStartDate: view.usageStartDate,
    });
  } catch (e: unknown) {
    return handleApiError(e, "결제 안내 저장");
  }
}
