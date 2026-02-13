import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { ROOMS } from "@/lib/space";
import { toMinutes, todayYmdSeoul } from "@/lib/datetime";
import type { RentalRequest } from "@/lib/types";
import { verifyApplicantLinkToken } from "@/lib/publicLinkToken";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 내 예약 목록: IP당 1분 내 10회 제한 */
const LIST_MAX_PER_MIN = 10;
const LIST_WINDOW_MS = 60 * 1000;

/** 이메일 직접 조회 제한: 이메일당 15분 내 5회 */
const EMAIL_DIRECT_MAX = 5;
const EMAIL_DIRECT_WINDOW_MS = 15 * 60 * 1000;

function sortSessions(list: RentalRequest[]) {
  return list
    .slice()
    .sort((a, b) => {
      const sa = a.batchSeq ?? 0;
      const sb = b.batchSeq ?? 0;
      if (sa !== sb) return sa - sb;
      return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
    });
}

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

  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") ?? "").toString().trim();
  const emailParam = (searchParams.get("email") ?? "").toString().trim().toLowerCase();

  let email = "";

  // 토큰 인증 우선, 이메일 직접 조회는 추가 Rate Limit 적용
  if (token) {
    const verified = verifyApplicantLinkToken(token);
    if (!verified.ok) {
      return NextResponse.json({ ok: false, message: verified.message }, { status: 403 });
    }
    email = verified.email;
  } else if (emailParam && emailParam.includes("@")) {
    // 이메일 직접 조회: 이메일 기반 추가 Rate Limit (열거 공격 방지)
    const rlEmail = rateLimit("my-list-email", emailParam, EMAIL_DIRECT_MAX, EMAIL_DIRECT_WINDOW_MS);
    if (!rlEmail.allowed) {
      // 이메일 존재 여부 노출 방지: 동일 응답 반환
      return NextResponse.json({ ok: true, email: emailParam, current: [], past: [], cancelled: [] });
    }
    email = emailParam;
  } else {
    return NextResponse.json(
      { ok: false, message: "토큰 또는 이메일이 필요합니다." },
      { status: 400 }
    );
  }
  const db = getDatabase();
  const all = await db.getAllRequests();
  const mine = all.filter((r) => (r.email ?? "").toLowerCase() === email);

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

  return NextResponse.json({ ok: true, email, current, past, cancelled });
  } catch {
    return NextResponse.json({ ok: false, message: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
