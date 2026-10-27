import { NextResponse } from "next/server";
import { Readable } from "stream";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { getGoogleClient, getDriveUploadClient, ensureUploadFolderId } from "@/lib/google";
import { isMockMode } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 첨부 업로드(Google Drive) 진단 — 관리자 전용 (2026-10-19)
 * - 폴더 메타(이름·소유자·공유드라이브 여부·쓰기 권한) 조회
 * - 1바이트 텍스트 파일 생성 → 즉시 삭제 (실제 업로드 경로와 동일한 호출)
 * - 실패 시 Google API 오류 코드·메시지를 그대로 반환해 원인을 특정한다
 */
type Step = { step: string; ok: boolean; detail?: unknown; error?: { code?: unknown; message: string; reasons?: unknown } };

function describeError(e: unknown) {
  const err = e as { code?: unknown; message?: string; errors?: unknown; response?: { data?: unknown } };
  return {
    code: err?.code,
    message: err?.message ?? String(e),
    reasons: err?.errors ?? err?.response?.data,
  };
}

export async function GET(req: Request) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, reason: auth.reason }, { status: auth.status ?? 401 });
  if (isMockMode()) return NextResponse.json({ ok: true, mock: true, steps: [] });

  const steps: Step[] = [];
  let createdId: string | null = null;
  try {
    const { drive, mode } = getDriveUploadClient();
    steps.push({ step: "mode", ok: true, detail: { mode, serviceFolderId: getGoogleClient().env.GOOGLE_DRIVE_FOLDER_ID } });
    let folderId = "";
    try {
      folderId = await ensureUploadFolderId(drive, mode);
      steps.push({ step: "uploadFolder", ok: true, detail: { folderId } });
    } catch (e) {
      steps.push({ step: "uploadFolder", ok: false, error: describeError(e) });
    }

    try {
      const about = await drive.about.get({ fields: "user(emailAddress),storageQuota(limit,usage)" });
      steps.push({ step: "about(service account)", ok: true, detail: about.data });
    } catch (e) {
      steps.push({ step: "about(service account)", ok: false, error: describeError(e) });
    }

    try {
      const folder = await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType,driveId,owners(emailAddress),capabilities(canAddChildren,canEdit),trashed",
        supportsAllDrives: true,
      });
      steps.push({ step: "folder.get", ok: true, detail: folder.data });
    } catch (e) {
      steps.push({ step: "folder.get", ok: false, error: describeError(e) });
    }

    try {
      const body = new Readable();
      body.push("x");
      body.push(null);
      const created = await drive.files.create({
        requestBody: { name: `_drive-check_${Date.now()}.txt`, parents: [folderId] },
        media: { mimeType: "text/plain", body },
        fields: "id,webViewLink",
        supportsAllDrives: true,
      });
      createdId = created.data.id ?? null;
      steps.push({ step: "files.create(1 byte)", ok: true, detail: created.data });
    } catch (e) {
      steps.push({ step: "files.create(1 byte)", ok: false, error: describeError(e) });
    }

    if (createdId) {
      try {
        await drive.files.delete({ fileId: createdId, supportsAllDrives: true });
        steps.push({ step: "files.delete", ok: true });
      } catch (e) {
        steps.push({ step: "files.delete", ok: false, error: describeError(e) });
      }
    }
  } catch (e) {
    steps.push({ step: "client", ok: false, error: describeError(e) });
  }

  return NextResponse.json({ ok: steps.every((s) => s.ok), steps });
}
