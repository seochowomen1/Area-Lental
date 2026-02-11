import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { dayOfWeek, overlaps, inRangeYmd } from "@/lib/datetime";
import { buildHourSlotsForDate } from "@/lib/operating";
import type { RequestStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 특정 room/month에 대해 예약이 꽉 찬 날짜 목록을 반환합니다.
 * 사용자 캘린더에서 선택 불가 표시에 사용됩니다.
 *
 * GET /api/booked-dates?roomId=xxx&month=YYYY-MM
 * → { ok, bookedDates: string[] }  // ["2026-02-23", "2026-02-24", ...]
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = String(searchParams.get("roomId") ?? "").trim();
    const month = String(searchParams.get("month") ?? "").trim();

    if (!roomId || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();

    const db = getDatabase();
    const [requests, blocks, schedules] = await Promise.all([
      db.getAllRequests(),
      db.getBlocks(),
      db.getClassSchedules(),
    ]);

    const conflictStatuses: RequestStatus[] = ["접수", "승인"];
    const bookedDates: string[] = [];

    for (let d = 1; d <= lastDay; d++) {
      const date = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
      const dow = dayOfWeek(date);

      // 일요일은 스킵 (이미 휴관으로 처리됨)
      if (dow === 0) continue;

      const baseSlots = buildHourSlotsForDate(date);
      if (baseSlots.length === 0) continue;

      // 해당 날짜에 대한 기존 예약 필터
      const sameRoomRequests = requests.filter((r) => {
        if (r.roomId !== roomId) return false;
        if (!conflictStatuses.includes(r.status)) return false;
        // 갤러리 1행 형식
        if (r.roomId === "gallery" && !r.batchId && r.startDate && r.endDate) {
          if (date >= r.startDate && date <= r.endDate && dayOfWeek(date) !== 0) return true;
          if (r.galleryPrepDate && date === r.galleryPrepDate) return true;
          return false;
        }
        return r.date === date;
      });

      const sameRoomBlocks = blocks.filter((b) => {
        if (b.roomId !== roomId && b.roomId !== "all") return false;
        const bEnd = b.endDate || b.date;
        return date >= b.date && date <= bEnd;
      });

      const sameRoomSchedules = schedules
        .filter((s) => (s.roomId === roomId || s.roomId === "all") && s.dayOfWeek === dow)
        .filter((s) => inRangeYmd(date, s.effectiveFrom || undefined, s.effectiveTo || undefined));

      // 모든 슬롯이 차단되었는지 확인
      const allSlotsTaken = baseSlots.every((slot) => {
        const byReq = sameRoomRequests.some((r) => {
          if (r.roomId === "gallery" && !r.batchId && r.startDate && r.endDate) return true;
          return overlaps(r.startTime, r.endTime, slot.start, slot.end);
        });
        const byBlock = sameRoomBlocks.some((b) => overlaps(b.startTime, b.endTime, slot.start, slot.end));
        const bySched = sameRoomSchedules.some((sc) => overlaps(sc.startTime, sc.endTime, slot.start, slot.end));
        return byReq || byBlock || bySched;
      });

      if (allSlotsTaken) {
        bookedDates.push(date);
      }
    }

    return NextResponse.json({ ok: true, bookedDates });
  } catch (e: unknown) {
    return NextResponse.json({ ok: true, bookedDates: [] });
  }
}
