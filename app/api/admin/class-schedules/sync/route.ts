import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import { cronAuthOk } from "@/lib/cronAuth";
import { recordAudit } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { acquireSyncSlot, classroomSyncConfigured, runClassroomSync, SYNC_RUNNING_MESSAGE } from "@/lib/classroomSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function handle(req: Request) {
  let trigger: "cron" | "admin" = "cron";
  if (!cronAuthOk(req)) {
    const auth = await assertAdminApiAuth(req);
    if (!auth.ok) return adminApiAuthFailure(auth);
    trigger = "admin";
  }
  if (!classroomSyncConfigured()) {
    return jsonError("업무 시스템 연동이 설정되지 않았습니다. (CLASSROOM_SYNC_URL / CLASSROOM_SYNC_TOKEN)", 503, "NOT_CONFIGURED");
  }
  const ip = getClientIp(req);

  // ★ audit-fix-3 3-1: 동시 실행 방지 — 60초 안 재실행 거부(409 SYNC_RUNNING)
  const slot = await acquireSyncSlot({
    recordStart: () =>
      recordAudit({ action: "SCHEDULE_SYNC_START", ip, actor: trigger === "cron" ? "시스템" : undefined, target: "classroom", details: { trigger } }),
  });
  if (!slot.ok) return jsonError(SYNC_RUNNING_MESSAGE, 409, "SYNC_RUNNING");

  try {
    const result = await runClassroomSync(getDatabase());
    await recordAudit({
      action: "SCHEDULE_SYNC",
      ip,
      actor: trigger === "cron" ? "시스템" : undefined,
      target: `classroom:${result.quarters.join(",") || "-"}`,
      details: { trigger, received: result.received, produced: result.produced, deleted: result.deleted, added: result.added },
    });
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    return handleApiError(e, "업무 시스템 동기화");
  } finally {
    slot.release();
  }
}

/** Vercel Cron(GET) — vercel.json crons · CRON_SECRET 검증 */
export async function GET(req: Request) {
  return handle(req);
}

/** 관리자 화면 "업무 시스템 가져오기" 버튼(POST) — 관리자 쿠키 검증 */
export async function POST(req: Request) {
  return handle(req);
}
