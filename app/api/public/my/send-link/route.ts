import { NextResponse } from "next/server";
import { getBaseEnv } from "@/lib/env";
import { createApplicantLinkToken } from "@/lib/publicLinkToken";
import { sendApplicantMyReservationsLinkEmail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeEmail(email: string) {
  return (email ?? "").toString().trim().toLowerCase();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, message: "이메일을 입력해주세요." }, { status: 400 });
  }

  // 운영에서는 별도 PUBLIC_LINK_SECRET 설정 권장
  const expiresMinutes = 30;
  const token = createApplicantLinkToken({ email, ttlSeconds: expiresMinutes * 60 });

  const base = getBaseEnv();
  const linkUrl = `${base.APP_BASE_URL}/my?token=${encodeURIComponent(token)}`;

  // 존재 여부를 응답으로 노출하지 않기 위해 항상 동일 메시지
  await sendApplicantMyReservationsLinkEmail({ to: email, linkUrl, expiresMinutes });
  return NextResponse.json({ ok: true, message: "조회 링크를 이메일로 발송했습니다." });
}
