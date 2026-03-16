import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { RETENTION_YEARS } from "@/lib/config";
import { getDatabase } from "@/lib/database";
import { auditLog } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isExpired(createdAt: string): boolean {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  return created < cutoff;
}

/**
 * GET: 보존기한(3년) 경과 건 조회
 *
 * 응답: { ok, expiredCount, expiredIds, cutoffDate }
 */
export async function GET(req: Request) {
  const auth = assertAdminApiAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDatabase();
    const all = await db.getAllRequests();
    const expired = all.filter((r) => isExpired(r.createdAt));

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

    auditLog({
      action: "DATA_RETENTION_CHECK",
      ip: getClientIp(req),
      details: { expiredCount: expired.length },
    });

    return NextResponse.json({
      ok: true,
      expiredCount: expired.length,
      cutoffDate: cutoff.toISOString().slice(0, 10),
      expired: expired.map((r) => ({
        requestId: r.requestId,
        createdAt: r.createdAt,
        status: r.status,
        roomName: r.roomName,
        date: r.date,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

/**
 * DELETE: 보존기한 경과 건 파기
 *
 * Body: { requestIds: string[] }
 * - 전달된 ID 중 실제로 보존기한이 경과된 건만 삭제
 * - 경과되지 않은 건은 무시 (안전장치)
 */
export async function DELETE(req: Request) {
  const auth = assertAdminApiAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { requestIds?: string[] };
    const requestIds = body.requestIds;

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return NextResponse.json({ ok: false, message: "파기할 항목을 선택해주세요." }, { status: 400 });
    }

    if (requestIds.length > 500) {
      return NextResponse.json({ ok: false, message: "한 번에 최대 500건까지 파기할 수 있습니다." }, { status: 400 });
    }

    if (!requestIds.every((id) => typeof id === "string" && id.trim())) {
      return NextResponse.json({ ok: false, message: "유효하지 않은 항목이 포함되어 있습니다." }, { status: 400 });
    }

    const db = getDatabase();
    const all = await db.getAllRequests();

    // 안전장치: 실제로 보존기한이 경과된 건만 삭제 대상으로 필터링
    const expiredIdSet = new Set(
      all.filter((r) => isExpired(r.createdAt)).map((r) => r.requestId)
    );
    const validIds = requestIds.filter((id) => expiredIdSet.has(id));

    if (validIds.length === 0) {
      return NextResponse.json({ ok: false, message: "파기 대상에 해당하는 건이 없습니다." }, { status: 400 });
    }

    await db.deleteRequests(validIds);

    auditLog({
      action: "DATA_RETENTION_PURGE",
      ip: getClientIp(req),
      details: {
        requestedCount: requestIds.length,
        purgedCount: validIds.length,
        purgedIds: validIds,
      },
    });

    return NextResponse.json({
      ok: true,
      purgedCount: validIds.length,
      message: `${validIds.length}건의 개인정보가 파기되었습니다.`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "파기 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
