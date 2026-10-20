import crypto from "crypto";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { auditLog } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { classroomSyncConfigured, runClassroomSync } from "@/lib/classroomSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Vercel Cron 호출 인증: Authorization: Bearer <CRON_SECRET> */
function cronAuthOk(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const a = Buffer.from(given.padEnd(128, "\0"));
  const b = Buffer.from(secret.padEnd(128, "\0"));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handle(req: Request) {
  let trigger: "cron" | "admin" = "cron";
  if (!cronAuthOk(req)) {
    const auth = assertAdminApiAuth(req);
    if (!auth.ok) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: auth.status ?? 401 });
    trigger = "admin";
  }
  if (!classroomSyncConfigured()) {
    return jsonError("업무 시스템 연동이 설정되지 않았습니다. (CLASSROOM_SYNC_URL / CLASSROOM_SYNC_TOKEN)", 503, "NOT_CONFIGURED");
  }
  try {
    const result = await runClassroomSync(getDatabase());
    auditLog({
      action: "SCHEDULE_SYNC",
      ip: getClientIp(req),
      target: `classroom:${result.quarters.join(",") || "-"}`,
      details: { trigger, received: result.received, produced: result.produced, deleted: result.deleted, added: result.added },
    });
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    return handleApiError(e, "업무 시스템 동기화");
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
