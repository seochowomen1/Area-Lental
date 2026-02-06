import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { ROOMS } from "@/lib/space";
import { toMinutes, todayYmdSeoul } from "@/lib/datetime";
import type { RentalRequest } from "@/lib/types";
import { verifyApplicantLinkToken } from "@/lib/publicLinkToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") ?? "").toString().trim();

  const verified = verifyApplicantLinkToken(token);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, message: verified.message }, { status: 403 });
  }

  const email = verified.email;
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
      const firstDateTime = isGallery
        ? (isBatch && sessions.length > 0 && rep.startDate && rep.endDate
            ? `${rep.startDate} ~ ${rep.endDate} (일 단위)`
            : `${rep.date} (일 단위)`)
        : `${rep.date} ${rep.startTime}-${rep.endTime}`;
      const past = sessions.every((s) => isPast(s, nowYmd, nowMin));
      const cancelable = sessions.every((s) => !["취소", "완료"].includes(s.status));

      return {
        key,
        isBatch,
        requestId: rep.requestId,
        batchId: rep.batchId ?? "",
        roomId: rep.roomId,
        roomName: rep.roomName,
        roomFloor: meta?.floor ?? "",
        dateTime: firstDateTime,
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
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  const current = groups.filter((g) => !g.past);
  const past = groups.filter((g) => g.past);

  return NextResponse.json({ ok: true, email, current, past });
}
