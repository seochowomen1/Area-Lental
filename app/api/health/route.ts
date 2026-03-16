import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 헬스체크 엔드포인트
 * - DB 연결 상태 확인
 * - 환경변수 필수 항목 존재 여부
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; message?: string }> = {};

  // DB 연결 확인
  try {
    const db = getDatabase();
    const rows = await db.getAllRequests();
    checks.database = { ok: true, message: `${rows.length}건 조회 성공` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    checks.database = { ok: false, message: msg };
  }

  // 필수 환경변수 확인
  const requiredEnvVars = ["ADMIN_PASSWORD_HASH", "SECRET_HMAC_KEY"];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  checks.env = missingVars.length === 0
    ? { ok: true }
    : { ok: false, message: `누락: ${missingVars.join(", ")}` };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { ok: allOk, timestamp: new Date().toISOString(), checks },
    { status: allOk ? 200 : 503 }
  );
}
