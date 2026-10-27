import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { generateDecisionEmailContent, generateBatchDecisionEmailContent, type DecisionEmailContent } from "@/lib/mail";
import { analyzeBundle } from "@/lib/bundle";
import { derivePaymentView } from "@/lib/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/email-preview?requestId=
 * 응답: { ok, to, subject, body, status, paymentGuideIncluded, paymentDueDate, paymentLinkUrl } (03_api §8-1)
 */
export async function GET(req: Request) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const requestId = searchParams.get("requestId") ?? "";

  if (!requestId) {
    return NextResponse.json({ ok: false, message: "requestId 필수" }, { status: 400 });
  }

  const db = getDatabase();
  const current = await db.getRequestById(requestId);
  if (!current) {
    return NextResponse.json({ ok: false, message: "신청을 찾을 수 없습니다." }, { status: 404 });
  }

  let content: DecisionEmailContent | null = null;
  let sessions = [current];

  if (current.batchId) {
    const batch = await db.getRequestsByBatchId(current.batchId);
    sessions = (batch.length ? batch : [current]).slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
    content = generateBatchDecisionEmailContent(sessions);
  } else {
    content = await generateDecisionEmailContent(current);
  }

  if (!content) {
    return NextResponse.json({ ok: false, message: "이메일 내용을 생성할 수 없습니다." }, { status: 400 });
  }

  const view = derivePaymentView(sessions);
  const status = current.batchId ? analyzeBundle(sessions).displayStatus : current.status;

  return NextResponse.json({
    ok: true,
    to: content.to,
    subject: content.subject,
    body: content.body,
    status,
    paymentGuideIncluded: content.paymentGuideIncluded,
    paymentDueDate: view.paymentDueDate,
    paymentLinkUrl: view.paymentLinkUrl,
  });
}
