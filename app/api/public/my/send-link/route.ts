import { NextResponse } from "next/server";
import { getBaseEnv } from "@/lib/env";
import { createApplicantLinkToken } from "@/lib/publicLinkToken";
import { sendApplicantMyReservationsLinkEmail } from "@/lib/mail";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 이메일 발송: IP당 1시간 3회 + 이메일당 1시간 3회 */
const EMAIL_MAX_ATTEMPTS = 3;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;

function normalizeEmail(email: string) {
  return (email ?? "").toString().trim().toLowerCase();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, message: "이메일을 입력해주세요." }, { status: 400 });
  }

  // Rate limit: IP 기준
  const ip = getClientIp(req);
  const rlIp = rateLimit("send-link-ip", ip, EMAIL_MAX_ATTEMPTS, EMAIL_WINDOW_MS);
  if (!rlIp.allowed) {
    return NextResponse.json(
      { ok: false, message: `요청이 너무 많습니다. ${rlIp.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  // Rate limit: 이메일 기준
  const rlEmail = rateLimit("send-link-email", email, EMAIL_MAX_ATTEMPTS, EMAIL_WINDOW_MS);
  if (!rlEmail.allowed) {
    // 동일 메시지로 응답하여 이메일 존재 여부 노출 방지
    return NextResponse.json({ ok: true, message: "조회 링크를 이메일로 발송했습니다." });
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
