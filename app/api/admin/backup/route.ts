import { NextResponse } from "next/server";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import { jsonError } from "@/lib/apiResponse";
import { recordAudit } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { BACKUP_MSG, getBackupStore, validateBackupDeletion } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * DELETE /api/admin/backup — 30일 지난 백업 정리 (audit-fix-3 3-1 · 03_api)
 * body { fileIds: string[], confirmCount: number }
 * - 관리자가 목록·건수를 확인한 파일만 · 서버가 폴더·이름 형식·30일을 다시 검사 · 하나라도 어긋나면 아무것도 지우지 않음
 * - 자동 삭제 없음(이 라우트가 백업 파일을 지우는 유일한 경로)
 */
export async function DELETE(req: Request) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) return adminApiAuthFailure(auth);

  const body = (await req.json().catch(() => null)) as { fileIds?: unknown; confirmCount?: unknown } | null;
  if (!body || typeof body !== "object") return jsonError(BACKUP_MSG.invalid, 400, "VALIDATION");

  const store = await getBackupStore().catch(() => null);
  if (!store) return jsonError(BACKUP_MSG.notConfigured, 503, "BACKUP_DRIVE_NOT_CONFIGURED");

  let folderFiles;
  try {
    folderFiles = await store.list();
  } catch (e) {
    console.error("[backup] 삭제 전 목록 조회 실패", e instanceof Error ? e.name : typeof e);
    return jsonError("백업 목록을 읽지 못해 아무것도 지우지 않았습니다. 잠시 뒤 다시 눌러 주세요.", 503, "BACKUP_LIST_FAILED");
  }

  const check = validateBackupDeletion(folderFiles, body.fileIds, body.confirmCount, Date.now());
  if (!check.ok) return jsonError(check.message, check.status, check.code);

  const deleted: string[] = [];
  let failedAt: string | null = null;
  for (const f of check.targets) {
    try {
      await store.remove(f.fileId);
      deleted.push(f.name);
    } catch (e) {
      failedAt = f.name;
      console.error("[backup] 파일 삭제 실패", e instanceof Error ? e.name : typeof e);
      break;
    }
  }

  if (deleted.length) {
    await recordAudit({
      action: "SHEET_BACKUP_DELETE",
      ip: getClientIp(req),
      actor: getDefaultDecidedBy(),
      target: `백업 ${deleted.length}개`,
      summary: `30일 지난 백업 ${deleted.length}개 삭제 · ${deleted.join(", ")}`,
      details: { names: deleted, requested: check.targets.length, ...(failedAt ? { failedAt } : {}) },
    });
  }

  if (failedAt) {
    return NextResponse.json(
      { ok: false, code: "BACKUP_DELETE_PARTIAL", message: `${deleted.length}개를 지운 뒤 멈췄습니다. 목록을 다시 열어 남은 파일을 확인해 주세요.`, deleted: deleted.length },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, deleted: deleted.length });
}
