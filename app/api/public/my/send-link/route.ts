import { NextResponse } from "next/server";
import { getBaseEnv } from "@/lib/env";
import { APPLICANT_TOKEN_TTL, createApplicantLinkToken } from "@/lib/publicLinkToken";
import { sendApplicantMyReservationsLinkEmail } from "@/lib/mail";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { normalizeEmail } from "@/lib/apiResponse";
import { getDatabase } from "@/lib/database";
import { bundleKey } from "@/lib/payment";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 이메일 발송: IP당 1시간 3회 + 이메일당 1시간 3회 */
const EMAIL_MAX_ATTEMPTS = 3;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;

const SENT_MESSAGE = "조회 링크를 이메일로 발송했습니다.";

/**
 * POST /api/public/my/send-link (audit-fix-1 [1][결2])
 * - { email }            → 이메일 토큰(30분) → /my?token=…
 * - { email, requestId } → 그 신청 이메일과 같을 때만 신청 전용 토큰(30분) → /result?requestId=…&token=…
 * - 존재 여부를 숨기기 위해 응답은 항상 같다(불일치면 메일만 보내지 않음).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email ?? "");
  const requestId = String(body?.requestId ?? "").trim().slice(0, 64);

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
    return NextResponse.json({ ok: true, message: SENT_MESSAGE });
  }

  const base = getBaseEnv();

  if (requestId) {
    // 신청번호 + 이메일 → 그 신청(묶음) 전용 조회 링크
    try {
      const found = await getDatabase().getRequestById(requestId);
      if (found && normalizeEmail(found.email) === email) {
        const { token } = createApplicantLinkToken({
          email,
          scope: "req",
          group: bundleKey(found),
          ttlSeconds: APPLICANT_TOKEN_TTL.RESULT_LINK,
        });
        const linkUrl = `${base.APP_BASE_URL}/result?requestId=${encodeURIComponent(found.requestId)}&token=${encodeURIComponent(token)}`;
        await sendApplicantMyReservationsLinkEmail({ to: email, linkUrl, expiresMinutes: APPLICANT_TOKEN_TTL.RESULT_LINK / 60 });
      }
    } catch (e) {
      logger.error("신청 조회 링크 발송 실패", { error: e instanceof Error ? e.message : String(e) });
    }
    return NextResponse.json({ ok: true, message: SENT_MESSAGE });
  }

  // 이메일만 → 이메일 소유 증명 링크(그 이메일의 신청 전체)
  const { token } = createApplicantLinkToken({ email, scope: "email", ttlSeconds: APPLICANT_TOKEN_TTL.EMAIL_LINK });
  const linkUrl = `${base.APP_BASE_URL}/my?token=${encodeURIComponent(token)}`;

  // 존재 여부를 응답으로 노출하지 않기 위해 항상 동일 메시지
  await sendApplicantMyReservationsLinkEmail({ to: email, linkUrl, expiresMinutes: APPLICANT_TOKEN_TTL.EMAIL_LINK / 60 });
  return NextResponse.json({ ok: true, message: SENT_MESSAGE });
}
