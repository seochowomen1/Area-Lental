import { NextResponse } from "next/server";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import { cronAuthOk } from "@/lib/cronAuth";
import { getClientIp } from "@/lib/rateLimit";
import { jsonError } from "@/lib/apiResponse";
import { BackupError, runSheetBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * GET|POST /api/admin/backup/run — 시트 전체 백업 1회 (audit-fix-3 3-1 · 03_api)
 * - 인증(첫 줄): Bearer CRON_SECRET → 실패 시 관리자 쿠키 → 둘 다 아니면 401
 * - 200 { ok, fileName, tabs:{탭:데이터 행 수}, durationMs }
 * - 503 BACKUP_DRIVE_NOT_CONFIGURED · 503 SHEET_BUSY · 500 BACKUP_FAILED (원인 상세는 서버 로그만)
 * - 실패는 감사 SHEET_BACKUP_FAIL, 크론 실패는 관리자 알림 메일 1통(lib/backup)
 */
async function handle(req: Request) {
  let trigger: "cron" | "admin" = "cron";
  if (!cronAuthOk(req)) {
    const auth = await assertAdminApiAuth(req);
    if (!auth.ok) return adminApiAuthFailure(auth);
    trigger = "admin";
  }

  try {
    const result = await runSheetBackup({ trigger, ip: getClientIp(req) });
    return NextResponse.json({ ok: true, trigger, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    if (e instanceof BackupError) return jsonError(e.message, e.status, e.code);
    console.error("[backup] 예상하지 못한 오류", e instanceof Error ? e.name : typeof e);
    return jsonError("백업하지 못했습니다.", 500, "BACKUP_FAILED");
  }
}

/** Vercel Cron(GET) — vercel.json crons · CRON_SECRET 검증 */
export async function GET(req: Request) {
  return handle(req);
}

/** 관리자 설정 화면 [지금 백업](POST) — 관리자 쿠키 검증 */
export async function POST(req: Request) {
  return handle(req);
}
