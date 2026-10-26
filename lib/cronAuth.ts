import crypto from "crypto";

/**
 * Vercel Cron 호출 인증: `Authorization: Bearer <CRON_SECRET>` (timing-safe 비교)
 * - 업무 시스템 동기화 크론(class-schedules/sync)과 결제 기한 자동 취소 크론(payment-deadline/run)이 함께 쓴다.
 * - CRON_SECRET이 비어 있으면 항상 false (라우트는 관리자 쿠키 검사로 넘어간다).
 */
export function cronAuthOk(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const a = Buffer.from(given.padEnd(128, "\0"));
  const b = Buffer.from(secret.padEnd(128, "\0"));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
