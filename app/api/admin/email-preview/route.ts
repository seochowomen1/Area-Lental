import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { generateDecisionEmailContent, generateBatchDecisionEmailContent } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = assertAdminApiAuth();
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

  let content: { to: string; subject: string; body: string } | null = null;

  if (current.batchId) {
    const sessions = await db.getRequestsByBatchId(current.batchId);
    const sorted = sessions.slice().sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0));
    content = generateBatchDecisionEmailContent(sorted);
  } else {
    content = generateDecisionEmailContent(current);
  }

  if (!content) {
    return NextResponse.json({ ok: false, message: "이메일 내용을 생성할 수 없습니다." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...content });
}
