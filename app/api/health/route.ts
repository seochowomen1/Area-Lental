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

  // 필수 환경변수 확인 (앱이 실제로 사용하는 변수 기준)
  const missingVars: string[] = [];
  // 관리자 인증: 해시(권장) 또는 평문(레거시) 중 최소 하나
  if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) {
    missingVars.push("ADMIN_PASSWORD_HASH(또는 ADMIN_PASSWORD)");
  }
  // 매직링크 서명 시크릿 (운영 필수)
  if (!process.env.PUBLIC_LINK_SECRET) {
    missingVars.push("PUBLIC_LINK_SECRET");
  }
  // Google Sheets(운영 DB) — MOCK_MODE가 아닐 때만 필수
  if (process.env.MOCK_MODE !== "true") {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) missingVars.push("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!process.env.GOOGLE_SHEET_ID) missingVars.push("GOOGLE_SHEET_ID");
  }

  const warnings: string[] = [];
  // 평문 비밀번호 운영 경고 (해시 미설정 시)
  if (!process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_PASSWORD) {
    warnings.push("ADMIN_PASSWORD(평문) 사용 중 — ADMIN_PASSWORD_HASH(bcrypt) 전환 권장");
  }

  checks.env = missingVars.length === 0
    ? (warnings.length ? { ok: true, message: `경고: ${warnings.join("; ")}` } : { ok: true })
    : { ok: false, message: `누락: ${missingVars.join(", ")}` };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { ok: allOk, timestamp: new Date().toISOString(), checks },
    { status: allOk ? 200 : 503 }
  );
}
