import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { verifyApplicantLinkToken } from "@/lib/publicLinkToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeEmail(email: string) {
  return (email ?? "").toString().trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
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
  if (!found) {
    return NextResponse.json({ ok: false, message: "해당 신청을 찾을 수 없습니다." }, { status: 404 });
  }
  if (normalizeEmail(found.email) !== email) {
    return NextResponse.json({ ok: false, message: "인증 정보가 일치하지 않습니다." }, { status: 403 });
  }

  const all = await db.getAllRequests();
  const group = (found.batchId ? all.filter((r) => r.batchId === found.batchId) : [found])
    .filter((r) => normalizeEmail(r.email) === email);
  if (group.length === 0) {
    return NextResponse.json({ ok: false, message: "해당 신청을 찾을 수 없습니다." }, { status: 404 });
  }

  // 완료(결제/종결) 상태는 사용자 취소를 막습니다.
  if (group.some((r) => r.status === "완료")) {
    return NextResponse.json({ ok: false, message: "이미 처리 완료된 신청은 취소할 수 없습니다." }, { status: 400 });
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
