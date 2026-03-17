import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { sendCustomDecisionEmail } from "@/lib/mail";
import { getClientIp } from "@/lib/rateLimit";
import { auditLog } from "@/lib/auditLog";
import { handleApiError } from "@/lib/apiResponse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    if (!to || !subject || !body) {
      return NextResponse.json({ ok: false, message: "받는 사람, 제목, 본문은 필수입니다." }, { status: 400 });
    }

    await sendCustomDecisionEmail(to, subject, body);
    auditLog({ action: "EMAIL_SEND", ip: getClientIp(req), target: to, details: { subject } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return handleApiError(e, "메일 발송");
  }
}
