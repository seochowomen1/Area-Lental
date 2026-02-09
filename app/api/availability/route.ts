import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { dayOfWeek, inRangeYmd, overlaps, todayYmdSeoul } from "@/lib/datetime";
import { buildHourSlotsForDate, explainNoAvailability } from "@/lib/operating";
import { logger } from "@/lib/logger";
import type { RequestStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Slot = { start: string; end: string; available: boolean };

type AvailabilityResponse = {
  ok: boolean;
  roomId: string;
  date: string;
  slots: Slot[];
  reasonCode: string | null;
  reasonMessage: string | null;
  totalSlots: number;
  availableSlots: number;
  message?: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = String(searchParams.get("roomId") ?? "").trim();
    const date = String(searchParams.get("date") ?? "").trim();

    if (!roomId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, message: "잘못된 요청입니다." },
        { status: 400 }
      );
    }

    // 1) 날짜 자체가 불가한 경우(과거/일요일 등)
    const today = todayYmdSeoul();
    const baseSlots = buildHourSlotsForDate(date);
    if (date < today || baseSlots.length === 0) {
      const reason = explainNoAvailability(date, { todayYmd: today });
      const payload: AvailabilityResponse = {
        ok: true,
        roomId,
        date,
        slots: [],
        reasonCode: reason.code,
        reasonMessage: reason.message,
        totalSlots: 0,
        availableSlots: 0
      };
      return NextResponse.json(payload, { status: 200 });
    }

    // 2) 운영시간 슬롯을 기준으로 충돌 여부(신청/정규수업/블록)를 반영
    const db = getDatabase();
    const [requests, blocks, schedules] = await Promise.all([
      db.getAllRequests(),
      db.getBlocks(),
      db.getClassSchedules()
    ]);

    const conflictStatuses: RequestStatus[] = ["접수", "검토중", "승인"];

    const sameRoomSameDate = requests.filter(
      (r) => r.roomId === roomId && r.date === date && conflictStatuses.includes(r.status)
    );

    // ✅ "전체(all)"로 등록된 차단/정규수업은 모든 강의실에 적용
    // endDate가 있는 블록(갤러리 날짜 범위)은 date가 [b.date, b.endDate] 범위인지 확인
    const sameRoomBlocks = blocks.filter((b) => {
      if (b.roomId !== roomId && b.roomId !== "all") return false;
      const blockStart = b.date;
      const blockEnd = b.endDate || b.date;
      return date >= blockStart && date <= blockEnd;
    });

    const dow = dayOfWeek(date);
    const sameRoomSchedules = schedules
      .filter((s) => (s.roomId === roomId || s.roomId === "all") && s.dayOfWeek === dow)
      .filter((s) => inRangeYmd(date, s.effectiveFrom || undefined, s.effectiveTo || undefined));

    const slots: Slot[] = baseSlots.map((s) => {
      const byRequest = sameRoomSameDate.some((r) => overlaps(r.startTime, r.endTime, s.start, s.end));
      const byBlock = sameRoomBlocks.some((b) => overlaps(b.startTime, b.endTime, s.start, s.end));
      const bySchedule = sameRoomSchedules.some((sc) => overlaps(sc.startTime, sc.endTime, s.start, s.end));

      return {
        start: s.start,
        end: s.end,
        available: !(byRequest || byBlock || bySchedule)
      };
    });

    const available = slots.filter((s) => s.available).length;
    const fullyBooked = slots.length > 0 && available === 0;
    const reason = fullyBooked ? explainNoAvailability(date, { todayYmd: today, fullyBooked: true }) : null;

    const payload: AvailabilityResponse = {
      ok: true,
      roomId,
      date,
      slots,
      reasonCode: reason?.code ?? null,
      reasonMessage: reason?.message ?? null,
      totalSlots: slots.length,
      availableSlots: available
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    logger.error("가용 시간 조회 중 오류 발생", {
      error: e?.message ?? String(e),
      stack: process.env.NODE_ENV === "development" ? e?.stack : undefined
    });

    // UX: /space 화면에서 "서버 오류"로 끝나지 않도록 200 + 안내 메시지로 흡수
    let roomId = "";
    let date = "";
    try {
      const { searchParams } = new URL(req.url);
      roomId = String(searchParams.get("roomId") ?? "").trim();
      date = String(searchParams.get("date") ?? "").trim();
    } catch {
      // ignore
    }
    const payload: AvailabilityResponse = {
      ok: false,
      roomId,
      date,
      slots: [],
      reasonCode: "SERVER_ERROR",
      reasonMessage: "예약 가능 시간을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      totalSlots: 0,
      availableSlots: 0,
      message: "SERVER_ERROR"
    };

    return NextResponse.json(payload, { status: 200 });
  }
}
