import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { verifyApplicantLinkToken } from "@/lib/publicLinkToken";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 취소: IP당 15분 내 10회 제한 */
const CANCEL_MAX_ATTEMPTS = 10;
const CANCEL_WINDOW_MS = 15 * 60 * 1000;

function normalizeEmail(email: string) {
  return (email ?? "").toString().trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
  // Rate Limiting
  const ip = getClientIp(req);
  const rl = rateLimit("cancel", ip, CANCEL_MAX_ATTEMPTS, CANCEL_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `요청이 너무 많습니다. ${rl.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const requestId = (body?.requestId ?? "").toString().trim();
  const token = (body?.token ?? "").toString().trim();
  const emailInput = normalizeEmail(body?.email ?? "");

  if (!requestId) {
    return NextResponse.json({ ok: false, message: "신청번호가 필요합니다." }, { status: 400 });
  }

  let email = emailInput;
  if (token) {
    const verified = verifyApplicantLinkToken(token);
    if (!verified.ok) {
      return NextResponse.json({ ok: false, message: verified.message }, { status: 403 });
    }
    email = verified.email;
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, message: "이메일을 확인해주세요." }, { status: 400 });
  }

  const db = getDatabase();
  const found = await db.getRequestById(requestId);

  // 신청번호 미존재 또는 이메일 불일치 시 동일 메시지 반환 (이메일 열거 방지)
  if (!found || normalizeEmail(found.email) !== email) {
    return NextResponse.json(
      { ok: false, message: "신청번호 또는 이메일을 확인해주세요." },
      { status: 400 },
    );
  }

  const all = await db.getAllRequests();
  const group = (found.batchId ? all.filter((r) => r.batchId === found.batchId) : [found])
    .filter((r) => normalizeEmail(r.email) === email);
  if (group.length === 0) {
    return NextResponse.json({ ok: false, message: "해당 신청을 찾을 수 없습니다." }, { status: 404 });
  }

  // 이미 전부 취소인 경우는 멱등 처리
  if (group.every((r) => r.status === "취소")) {
    return NextResponse.json({ ok: true, message: "이미 취소된 신청입니다." });
  }

  for (const r of group) {
    await db.updateRequestStatus({
      requestId: r.requestId,
      status: "취소",
      decidedBy: "사용자",
      rejectReason: "사용자 취소",
      adminMemo: r.adminMemo ?? "",
    });
  }

  return NextResponse.json({ ok: true, message: "예약이 취소되었습니다." });
  } catch {
    return NextResponse.json({ ok: false, message: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
