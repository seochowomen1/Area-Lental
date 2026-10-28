import { NextResponse } from "next/server";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { getBackupOverview } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/backup/list — 백업 폴더 목록 + 상태 (audit-fix-3 3-1 · 03_api)
 * 앱이 만든 "대관앱 백업" 폴더 안, 이름 형식이 맞는 파일만.
 */
export async function GET(req: Request) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) return adminApiAuthFailure(auth);

  try {
    const o = await getBackupOverview();
    return NextResponse.json(
      {
        ok: true,
        configured: o.configured,
        lastSuccessAt: o.lastSuccessAt ? new Date(o.lastSuccessAt).toISOString() : null,
        lastFailureAt: o.lastFailureAt ? new Date(o.lastFailureAt).toISOString() : null,
        failedSinceSuccess: o.failedSinceSuccess,
        count: o.count,
        folderUrl: o.folderUrl,
        listError: o.listError,
        items: o.items,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: unknown) {
    return handleApiError(e, "백업 목록 조회");
  }
}
