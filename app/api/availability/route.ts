import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { dayOfWeek, inRangeYmd, overlaps, todayYmdSeoul } from "@/lib/datetime";
import { buildHourSlotsForDate, explainNoAvailability } from "@/lib/operating";
import { logger } from "@/lib/logger";
import type { RequestStatus } from "@/lib/types";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 가용시간 조회: IP당 1분 내 60회 제한 */
const AVAIL_MAX_PER_MIN = 60;
const AVAIL_WINDOW_MS = 60 * 1000;

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
    // Rate Limiting
    const ip = getClientIp(req);
    const rl = rateLimit("availability", ip, AVAIL_MAX_PER_MIN, AVAIL_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: `요청이 너무 많습니다. ${rl.retryAfterSeconds}초 후 다시 시도해주세요.`, slots: [], totalSlots: 0, availableSlots: 0, roomId: "", date: "", reasonCode: "RATE_LIMIT", reasonMessage: "요청이 너무 많습니다." },
        { status: 429 }
      );
    }

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

    const conflictStatuses: RequestStatus[] = ["접수", "승인"];

    const sameRoomSameDate = requests.filter((r) => {
      if (r.roomId !== roomId) return false;
      if (!conflictStatuses.includes(r.status)) return false;
      // 갤러리 1행 형식: 날짜 범위 체크
      if (r.roomId === "gallery" && !r.batchId && r.startDate && r.endDate) {
        if (date >= r.startDate && date <= r.endDate && dayOfWeek(date) !== 0) return true;
        if (r.galleryPrepDate && date === r.galleryPrepDate) return true;
        return false;
      }
      // 기존 형식: 개별 날짜 매칭
      return r.date === date;
    });

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
      const byRequest = sameRoomSameDate.some((r) => {
        // 갤러리 1행 형식: 날짜 범위 내이면 전일 차단
        if (r.roomId === "gallery" && !r.batchId && r.startDate && r.endDate) return true;
        return overlaps(r.startTime, r.endTime, s.start, s.end);
      });
      // 갤러리 블록(내부 대관 등 날짜 범위)은 전일 차단으로 처리
      const byBlock = sameRoomBlocks.some((b) => {
        if (roomId === "gallery" && b.endDate) return true;
        return overlaps(b.startTime, b.endTime, s.start, s.end);
      });
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
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("가용 시간 조회 중 오류 발생", {
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
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
