import { NextResponse } from "next/server";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 반려/취소된 신청건 삭제 */
export async function DELETE(req: Request) {
  const auth = assertAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { requestIds?: string[] };
    const requestIds = body.requestIds;

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return NextResponse.json({ ok: false, message: "삭제할 항목을 선택해주세요." }, { status: 400 });
    }

    if (requestIds.length > 200) {
      return NextResponse.json({ ok: false, message: "한 번에 최대 200건까지 삭제할 수 있습니다." }, { status: 400 });
    }

    // 모든 요청이 문자열인지 확인
    if (!requestIds.every((id) => typeof id === "string" && id.trim())) {
      return NextResponse.json({ ok: false, message: "잘못된 신청번호가 포함되어 있습니다." }, { status: 400 });
    }

    const db = getDatabase();

    // 삭제 대상이 실제로 반려/취소 상태인지 확인
    const allRequests = await db.getAllRequests();
    const targetMap = new Map(allRequests.map((r) => [r.requestId, r]));
    const DELETABLE_STATUSES = new Set(["반려", "취소"]);

    for (const id of requestIds) {
      const req = targetMap.get(id);
      if (!req) {
        return NextResponse.json(
          { ok: false, message: `신청번호 ${id}를 찾을 수 없습니다.` },
          { status: 404 },
        );
      }
      if (!DELETABLE_STATUSES.has(req.status)) {
        return NextResponse.json(
          { ok: false, message: `${id}은(는) ${req.status} 상태이므로 삭제할 수 없습니다. 반려 또는 취소된 건만 삭제 가능합니다.` },
          { status: 400 },
        );
      }
    }

    await db.deleteRequests(requestIds);

    return NextResponse.json({ ok: true, deletedCount: requestIds.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
