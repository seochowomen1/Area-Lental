import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { sendCustomDecisionEmail } from "@/lib/mail";
import { getClientIp } from "@/lib/rateLimit";
import { auditLog } from "@/lib/auditLog";
import { handleApiError } from "@/lib/apiResponse";
import { getDatabase } from "@/lib/database";
import { nowIsoSeoul } from "@/lib/datetime";
import { maskEmail } from "@/lib/mask";
import { paymentRep } from "@/lib/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/send-email (FormData: to, subject, body, requestId?)
 * - requestId가 있으면 감사 target=신청번호(details.to는 마스킹)
 * - 본문에 그 건의 paymentLinkUrl이 포함돼 있으면 paymentNoticeSentAt 기록(묶음 전 행) → 2단계 완료 표시 (03_api §8-2)
 */
export async function POST(req: Request) {
  const auth = assertAdminApiAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const to = String(form.get("to") || "").trim();
    const subject = String(form.get("subject") || "").trim();
    const body = String(form.get("body") || "").trim();
    const requestId = String(form.get("requestId") || "").trim();

    if (!to || !subject || !body) {
      return NextResponse.json({ ok: false, message: "받는 사람, 제목, 본문은 필수입니다." }, { status: 400 });
    }

    await sendCustomDecisionEmail(to, subject, body);

    let paymentNoticeRecorded = false;
    if (requestId) {
      try {
        const db = getDatabase();
        const current = await db.getRequestById(requestId);
        if (current) {
          const sessions = current.batchId ? await db.getRequestsByBatchId(current.batchId) : [current];
          const rep = paymentRep(sessions.length ? sessions : [current]);
          const link = rep?.paymentLinkUrl ?? "";
          if (link && body.includes(link)) {
            await db.updateRequestPayment({ requestId: current.requestId, patch: { paymentNoticeSentAt: nowIsoSeoul() } });
            paymentNoticeRecorded = true;
          }
        }
      } catch (e) {
        // 발송은 끝났으므로 기록 실패는 흐름을 막지 않는다
        console.warn("[send-email] paymentNoticeSentAt 기록 실패", e instanceof Error ? e.message : e);
      }
      auditLog({
        action: "EMAIL_SEND",
        ip: getClientIp(req),
        target: requestId,
        details: { to: maskEmail(to), subject, paymentNoticeRecorded },
      });
    } else {
      auditLog({ action: "EMAIL_SEND", ip: getClientIp(req), target: to, details: { subject } });
    }
    return NextResponse.json({ ok: true, paymentNoticeRecorded });
  } catch (e: unknown) {
    return handleApiError(e, "메일 발송");
  }
}
