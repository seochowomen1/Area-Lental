import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import { cronAuthOk } from "@/lib/cronAuth";
import { getClientIp } from "@/lib/rateLimit";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { isMockMode } from "@/lib/env";
import { isYmdString } from "@/lib/payment";
import { paymentDeadlineConfig, runPaymentDeadline } from "@/lib/paymentDeadline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * GET|POST /api/admin/payment-deadline/run — 결제 기한 경과 자동 취소 + D-1 리마인드 (03_api §7)
 * - 인증(첫 줄): Bearer CRON_SECRET → 실패 시 관리자 쿠키 폴백 → 둘 다 아니면 401 (본문에 대상 정보 없음)
 * - PAYMENT_AUTO_CANCEL_SINCE 미설정 → 503 NOT_CONFIGURED (아무것도 바꾸지 않음)
 * - ?dryRun=1 판정만 · ?today=YYYY-MM-DD 는 MOCK_MODE에서만 날짜 주입(검수용)
 */
async function handle(req: Request) {
  let trigger: "cron" | "admin" = "cron";
  if (!cronAuthOk(req)) {
    const auth = await assertAdminApiAuth(req);
    if (!auth.ok) return adminApiAuthFailure(auth);
    trigger = "admin";
  }

  const cfg = paymentDeadlineConfig();
  if (!cfg.since) {
    return jsonError("PAYMENT_AUTO_CANCEL_SINCE가 설정되지 않아 자동 취소를 실행하지 않습니다.", 503, "NOT_CONFIGURED");
  }

  const { searchParams } = new URL(req.url);
  const dryRunRaw = (searchParams.get("dryRun") || "").trim().toLowerCase();
  const dryRun = dryRunRaw === "1" || dryRunRaw === "true";
  const todayParam = (searchParams.get("today") || "").trim();
  const todayYmd = isMockMode() && isYmdString(todayParam) ? todayParam : undefined;

  try {
    const result = await runPaymentDeadline(getDatabase(), { dryRun, todayYmd, ip: getClientIp(req), trigger });
    if (dryRun) {
      console.log(`[payment-deadline] dryRun · today=${result.today} · candidates=${result.candidates} · reminders=${result.reminders.candidates}`);
    }
    return NextResponse.json({ ok: true, trigger, ...result });
  } catch (e: unknown) {
    return handleApiError(e, "결제 기한 자동 취소");
  }
}

/** Vercel Cron(GET) — vercel.json crons · CRON_SECRET 검증 */
export async function GET(req: Request) {
  return handle(req);
}

/** 관리자 "지금 점검"(POST · 먼저 dryRun=1 → 건수 확인 → 실행) — 관리자 쿠키 검증 */
export async function POST(req: Request) {
  return handle(req);
}
