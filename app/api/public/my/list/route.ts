import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { ROOMS } from "@/lib/space";
import { handleApiError } from "@/lib/apiResponse";
import { toMinutes, todayYmdSeoul } from "@/lib/datetime";
import type { RentalRequest } from "@/lib/types";
import { TOKEN_MESSAGES, verifyApplicantLinkToken } from "@/lib/publicLinkToken";
import { bundleKey } from "@/lib/payment";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sortSessions } from "@/lib/requestUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 내 예약 목록: IP당 1분 내 10회 제한 */
const LIST_MAX_PER_MIN = 10;
const LIST_WINDOW_MS = 60 * 1000;

function nowMinutesSeoul() {
  const now = new Date();
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return k.getUTCHours() * 60 + k.getUTCMinutes();
}

function isPast(r: RentalRequest, nowYmd: string, nowMin: number) {
  if (r.date < nowYmd) return true;
  if (r.date > nowYmd) return false;
  return toMinutes(r.endTime) <= nowMin;
}

function roomMeta(roomId: string) {
  return ROOMS.find((r) => r.id === roomId);
}

export async function GET(req: Request) {
  try {
  // Rate Limiting
  const ip = getClientIp(req);
  const rl = rateLimit("my-list", ip, LIST_MAX_PER_MIN, LIST_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `요청이 너무 많습니다. ${rl.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  // ★ audit-fix-1 [1][결2]: 조회는 메일로 받은 링크(토큰)로만. 이메일·생년월일 직접 조회는 폐지.
  //   - s=email 토큰 → 그 이메일의 신청 전체 / s=req 토큰 → 그 신청(묶음) 1건만
  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") ?? "").toString().trim();
  if (!token) {
    return NextResponse.json({ ok: false, code: "LINK_REQUIRED", message: TOKEN_MESSAGES.LINK_REQUIRED }, { status: 400 });
  }
  const verified = verifyApplicantLinkToken(token);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, code: verified.code, message: verified.message }, { status: 403 });
  }
  const email = verified.email;

  const db = getDatabase();
  const all = await db.getAllRequests();
  const mine = all.filter(
    (r) => (r.email ?? "").toLowerCase().trim() === email && (verified.scope === "email" || bundleKey(r) === verified.group)
  );

  const map = new Map<string, RentalRequest[]>();
  for (const r of mine) {
    const key = (r.batchId ?? "").trim() || r.requestId;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }

  const nowYmd = todayYmdSeoul();
  const nowMin = nowMinutesSeoul();

  const groups = [...map.entries()]
    .map(([key, list]) => {
      const sessions = sortSessions(list);
      const rep = sessions[0];
      const isBatch = !!rep.batchId;
      const bundle = isBatch ? analyzeBundle(sessions) : null;

      const displayStatus = isBatch ? bundle!.displayStatus : rep.status;
      const approvedSessions = sessions.filter((s) => s.status === "승인");
      const feeAvailable = isBatch ? approvedSessions.length > 0 : rep.status === "승인";
      const fee = feeAvailable
        ? isBatch
          ? computeFeesForBundle(pickFeeBasisSessions(sessions))
          : computeFeesForRequest(rep)
        : isBatch
          ? computeFeesForBundle(sessions)
          : computeFeesForRequest(rep);

      const meta = roomMeta(rep.roomId);
      const isGallery = rep.roomId === "gallery";
      const galleryDays = isGallery ? (rep.galleryExhibitionDayCount ?? sessions.length) : 0;
      const firstDateTime = isGallery
        ? (rep.startDate && rep.endDate
            ? `${rep.startDate} ~ ${rep.endDate} (${galleryDays}일)`
            : `${rep.date} (일 단위)`)
        : `${rep.date} ${rep.startTime}-${rep.endTime}`;
      // 갤러리 1행 형식: endDate 기준으로 과거 판단
      const past = isGallery && !isBatch && rep.endDate
        ? rep.endDate < nowYmd
        : sessions.every((s) => isPast(s, nowYmd, nowMin));
      const cancelable = !["취소", "반려"].includes(displayStatus) && sessions.every((s) => s.status !== "취소" && s.status !== "반려");

      return {
        key,
        isBatch,
        requestId: rep.requestId,
        batchId: rep.batchId ?? "",
        roomId: rep.roomId,
        roomName: rep.roomName,
        roomFloor: meta?.floor ?? "",
        dateTime: firstDateTime,
        createdAt: rep.createdAt ?? "",
        status: displayStatus,
        payableFeeKRW: fee.finalFeeKRW,
        feeIsEstimated: !feeAvailable,
        past,
        cancelable,
        sessions: sessions.map((s) => ({
          requestId: s.requestId,
          seq: s.batchSeq ?? 0,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status,
        })),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const current = groups.filter((g) => !g.past && !["취소", "반려"].includes(g.status));
  const past = groups.filter((g) => g.past && !["취소", "반려"].includes(g.status));
  const cancelled = groups.filter((g) => ["취소", "반려"].includes(g.status));

  return NextResponse.json({ ok: true, scope: verified.scope, email, current, past, cancelled });
  } catch (e: unknown) {
    return handleApiError(e, "내 예약 조회");
  }
}
