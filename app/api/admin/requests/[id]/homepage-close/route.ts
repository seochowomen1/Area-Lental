import { NextResponse } from "next/server";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { recordAudit } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { isYmdString } from "@/lib/payment";
import { loadBundle, MSG, readJson, asString, describeBundle } from "@/lib/paymentApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/admin/requests/{id}/homepage-close — 홈페이지 마감·미게시 기록 (4단계) (03_api §5)
 * body: {} | { homepageClosedAt }
 * - 게시 기록이 없으면 409 — 단 자동 취소 건은 허용(복지종합시스템 쪽 정리 확인용)
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) return adminApiAuthFailure(auth);

  try {
    const body = await readJson(req);
    const raw = asString(body.homepageClosedAt);

    const db = getDatabase();
    const loaded = await loadBundle(db, params.id);
    if (!loaded) return jsonError(MSG.notFound, 404, "NOT_FOUND");
    const { view, sessions, today, target } = loaded;

    const closedAt = raw || today;
    if (!isYmdString(closedAt)) return jsonError(MSG.closedAtInvalid, 400, "VALIDATION");
    if (closedAt > today) return jsonError(MSG.closedAtFuture, 400, "VALIDATION");
    if (!view.homepagePostedAt && view.paymentState !== "autoCancelled") return jsonError(MSG.notPosted, 409, "CONFLICT");

    const updated = await db.updateRequestPayment({ requestId: loaded.current.requestId, patch: { homepageClosedAt: closedAt } });
    const rep = updated.find((r) => r.requestId === loaded.current.requestId) ?? updated[0];

    await recordAudit({
      action: "HOMEPAGE_LISTING_CLOSE",
      ip: getClientIp(req),
      actor: getDefaultDecidedBy(),
      target,
      summary: [
        "홈페이지 마감·미게시",
        closedAt,
        view.homepagePostedAt ? `게시 ${view.homepagePostedAt}` : "게시 기록 없음(자동 취소 건)",
        ...describeBundle(sessions),
      ].join(" · "),
      details: {
        batchId: (loaded.current.batchId ?? "").trim() || undefined,
        homepagePostedAt: view.homepagePostedAt,
        homepageClosedAt: closedAt,
        paymentState: view.paymentState,
      },
    });

    return NextResponse.json({
      ok: true,
      request: {
        requestId: loaded.current.requestId,
        batchId: (loaded.current.batchId ?? "").trim(),
        homepagePostedAt: rep.homepagePostedAt ?? "",
        homepageClosedAt: rep.homepageClosedAt ?? "",
      },
    });
  } catch (e: unknown) {
    return handleApiError(e, "홈페이지 마감 기록");
  }
}
