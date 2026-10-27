import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";
import { getClientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/lib/auditLog";
import { jsonError, handleApiError } from "@/lib/apiResponse";
import { ADMIN_LIMITS } from "@/lib/constants";
import { deletionBlockReason, type DeletionBlockReason } from "@/lib/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 반려/취소된 신청건 삭제
 * ★ audit-fix-1 [8]: 결제·환불 기록이 있거나 홈페이지 마감 전인 건이 1건이라도 섞이면 아무것도 지우지 않고 409
 *   (화면 RequestTable과 같은 lib/payment.ts deletionBlockReason 사용 · 부분 삭제 없음)
 */
export async function DELETE(req: Request) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) {
    return jsonError("Unauthorized", auth.status ?? 401, "UNAUTHORIZED");
  }

  try {
    const body = (await req.json()) as { requestIds?: string[] };
    const requestIds = body.requestIds;

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return jsonError("삭제할 항목을 선택해주세요.", 400, "VALIDATION");
    }

    if (requestIds.length > ADMIN_LIMITS.DELETE_MAX_REQUESTS) {
      return jsonError(`한 번에 최대 ${ADMIN_LIMITS.DELETE_MAX_REQUESTS}건까지 삭제할 수 있습니다.`, 400, "VALIDATION");
    }

    // 모든 요청이 문자열인지 확인
    if (!requestIds.every((id) => typeof id === "string" && id.trim())) {
      return jsonError("잘못된 신청번호가 포함되어 있습니다.", 400, "VALIDATION");
    }

    const db = getDatabase();

    // 삭제 판정은 캐시를 거치지 않은 최신 데이터로 (다른 화면에서 방금 결제 기록을 남긴 경우 대비)
    const allRequests = await db.getAllRequestsFresh();
    const targetMap = new Map(allRequests.map((r) => [r.requestId, r]));
    const DELETABLE_STATUSES = new Set(["반려", "취소"]);

    // 스프레드시트에 존재하는 것만 필터 (이미 삭제된 건은 무시)
    const existingIds: string[] = [];
    const protectedList: Array<{ requestId: string; reason: DeletionBlockReason }> = [];
    for (const id of requestIds) {
      const r = targetMap.get(id);
      if (!r) continue; // 이미 스프레드시트에서 삭제됨 → 무시
      if (!DELETABLE_STATUSES.has(r.status)) {
        return jsonError(
          `${id}은(는) ${r.status} 상태이므로 삭제할 수 없습니다. 반려 또는 취소된 건만 삭제 가능합니다.`,
          400,
          "VALIDATION",
        );
      }
      const reason = deletionBlockReason(r);
      if (reason) protectedList.push({ requestId: id, reason });
      existingIds.push(id);
    }

    if (protectedList.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "PROTECTED_RECORDS",
          message: `결제·환불 기록이 있거나 홈페이지 마감 전인 신청이 ${protectedList.length}건 섞여 있어 아무것도 삭제하지 않았습니다: ${protectedList.map((p) => p.requestId).join(", ")}. 화면을 새로고침한 뒤 다시 골라 주세요.`,
          protected: protectedList,
        },
        { status: 409 },
      );
    }

    if (existingIds.length > 0) {
      await db.deleteRequests(existingIds);
      await recordAudit({
        action: "REQUEST_DELETE",
        ip: getClientIp(req),
        target: existingIds.length === 1 ? existingIds[0] : `${existingIds.length}건`,
        summary: `반려·취소 건 ${existingIds.length}건 삭제`,
        details: { deletedIds: existingIds, count: existingIds.length },
      });
    }

    return NextResponse.json({ ok: true, deletedCount: existingIds.length, skippedCount: requestIds.length - existingIds.length });
  } catch (e: unknown) {
    return handleApiError(e, "신청건 삭제");
  }
}
