import { NextResponse } from "next/server";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";
import { handleApiError, jsonError } from "@/lib/apiResponse";
import { recordAudit } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { getDefaultDecidedBy } from "@/lib/adminAuth";
import { dayOfWeek, inRangeYmd, overlaps } from "@/lib/datetime";
import { buildGalleryOccupancy, galleryDateConflicts } from "@/lib/gallery";
import { AUTO_CANCEL_DECIDED_BY, isYmdString } from "@/lib/payment";
import type { RentalRequest, RequestStatus } from "@/lib/types";
import { loadBundle, MSG, readJson, asString, describeBundle, md } from "@/lib/paymentApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Conflict = { requestId: string; date: string; startTime: string; endTime: string; reason: string };

const ACTIVE: RequestStatus[] = ["접수", "승인"];

/**
 * POST /api/admin/requests/{id}/restore — 자동 취소 건 "승인으로 복구" (⑧-B-2 · 03_api §6)
 * body: { paymentDueDate } (필수 · 오늘 이상)
 * - 복구 대상 = status "취소" + decidedBy "시스템(결제 기한 경과)" 회차
 * - 겹침 재검증: 다른 신청(접수·승인) · 차단 · 정규 수업 · 갤러리 점유(준비일 포함)
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await assertAdminApiAuth(req);
  if (!auth.ok) return adminApiAuthFailure(auth);

  try {
    const body = await readJson(req);
    const dueDate = asString(body.paymentDueDate);

    const db = getDatabase();
    const loaded = await loadBundle(db, params.id);
    if (!loaded) return jsonError(MSG.notFound, 404, "NOT_FOUND");
    const { view, sessions, today, target } = loaded;

    if (!isYmdString(dueDate)) return jsonError(MSG.restoreDueRequired, 400, "VALIDATION");
    if (dueDate < today) return jsonError(MSG.duePast, 400, "VALIDATION");

    const toRestore = sessions.filter((s) => s.status === "취소" && s.decidedBy === AUTO_CANCEL_DECIDED_BY);
    if (view.paymentState !== "autoCancelled" || toRestore.length === 0) return jsonError(MSG.restoreOnlyAuto, 409, "CONFLICT");

    // 겹침 재검증
    const all = await db.getAllRequestsFresh();
    const ownIds = new Set(sessions.map((s) => s.requestId));
    const others = all.filter((r) => !ownIds.has(r.requestId));
    const blocks = await db.getBlocks();
    const schedules = await db.getClassSchedules();
    const conflicts: Conflict[] = [];
    const first = sessions[0];

    if (first.roomId === "gallery") {
      const occ = buildGalleryOccupancy(others, blocks);
      const ourEnd = first.endDate ?? toRestore.map((s) => s.date).sort().pop();
      // 1행형: 준비일 + startDate~endDate 전개 · 레거시: 회차별
      const dates: Array<{ date: string; kind: "prep" | "exhibition"; r: RentalRequest }> = [];
      if (!first.batchId && first.startDate && first.endDate) {
        if (first.galleryPrepDate) dates.push({ date: first.galleryPrepDate, kind: "prep", r: first });
        let cur = first.startDate;
        let guard = 0;
        while (cur <= first.endDate && guard++ < 400) {
          if (dayOfWeek(cur) !== 0) dates.push({ date: cur, kind: "exhibition", r: first });
          const [y, m, d] = cur.split("-").map((v) => parseInt(v, 10));
          cur = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
        }
      } else {
        for (const s of toRestore) dates.push({ date: s.date, kind: s.isPrepDay ? "prep" : "exhibition", r: s });
      }
      for (const d of dates) {
        if (galleryDateConflicts(occ, d.date, d.kind, ourEnd)) {
          conflicts.push({ requestId: d.r.requestId, date: d.date, startTime: d.r.startTime, endTime: d.r.endTime, reason: "전시 일정 겹침" });
        }
      }
    } else {
      for (const s of toRestore) {
        const reqConf = others.some(
          (r) => r.roomId === s.roomId && ACTIVE.includes(r.status) && r.date === s.date && overlaps(r.startTime, r.endTime, s.startTime, s.endTime)
        );
        if (reqConf) {
          conflicts.push({ requestId: s.requestId, date: s.date, startTime: s.startTime, endTime: s.endTime, reason: "신청 겹침" });
          continue;
        }
        const dow = dayOfWeek(s.date);
        const classConf = schedules
          .filter((sc) => (sc.roomId === s.roomId || sc.roomId === "all") && sc.dayOfWeek === dow)
          .filter((sc) => inRangeYmd(s.date, sc.effectiveFrom || undefined, sc.effectiveTo || undefined))
          .some((sc) => overlaps(sc.startTime, sc.endTime, s.startTime, s.endTime));
        if (classConf) {
          conflicts.push({ requestId: s.requestId, date: s.date, startTime: s.startTime, endTime: s.endTime, reason: "정규 수업" });
          continue;
        }
        const blockConf = blocks
          .filter((b) => (b.roomId === s.roomId || b.roomId === "all") && s.date >= b.date && s.date <= (b.endDate || b.date))
          .some((b) => overlaps(b.startTime, b.endTime, s.startTime, s.endTime));
        if (blockConf) {
          conflicts.push({ requestId: s.requestId, date: s.date, startTime: s.startTime, endTime: s.endTime, reason: "운영 차단" });
        }
      }
    }

    if (conflicts.length) {
      return NextResponse.json({ ok: false, code: "CONFLICT", message: MSG.restoreConflict, conflicts }, { status: 409 });
    }

    // 복구: 승인으로 되돌리고 결제 기한 재설정 · autoCancelledAt·리마인드 기록 비움
    const actor = getDefaultDecidedBy();
    // 묶음 전 회차를 시트 쓰기 1회로 복구 (audit-fix-1 [9])
    await db.updateRequestsStatusBatch(
      toRestore.map((s) => ({
        requestId: s.requestId,
        status: "승인" as const,
        adminMemo: s.adminMemo ?? "",
        rejectReason: "",
        decidedBy: actor,
      }))
    );
    const updated = await db.updateRequestPayment({
      requestId: loaded.current.requestId,
      patch: { autoCancelledAt: null, paymentDueDate: dueDate, paymentReminderSentAt: null },
    });
    const rep = updated.find((r) => r.requestId === loaded.current.requestId) ?? updated[0];

    await recordAudit({
      action: "PAYMENT_AUTO_CANCEL_RESTORE",
      ip: getClientIp(req),
      actor,
      target,
      summary: ["취소(자동) → 승인 복구", `${toRestore.length}회`, `새 기한 ${md(dueDate)}`, ...describeBundle(sessions)].join(" · "),
      details: {
        batchId: (loaded.current.batchId ?? "").trim() || undefined,
        restoredIds: toRestore.map((s) => s.requestId),
        prevAutoCancelledAt: view.autoCancelledAt,
        prevDueDate: view.paymentDueDate,
        paymentDueDate: dueDate,
      },
    });

    return NextResponse.json({
      ok: true,
      restored: toRestore.map((s) => s.requestId),
      request: {
        requestId: loaded.current.requestId,
        batchId: (loaded.current.batchId ?? "").trim(),
        status: "승인",
        paymentDueDate: rep.paymentDueDate ?? "",
        autoCancelledAt: rep.autoCancelledAt ?? "",
      },
    });
  } catch (e: unknown) {
    return handleApiError(e, "자동 취소 복구");
  }
}
