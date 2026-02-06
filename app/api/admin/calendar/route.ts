import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { dayOfWeek, inRangeYmd } from "@/lib/datetime";
import { ROOMS_BY_ID, getRoomsByCategory, normalizeRoomCategory, type FloorId } from "@/lib/space";
import type { BlockedSlot, ClassSchedule, RentalRequest, RequestStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CalendarKind = "request" | "block" | "schedule";

export type CalendarItem = {
  kind: CalendarKind;
  id: string;
  roomId: string;
  roomName: string;
  floorId: FloorId | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  title: string;

  // request 전용
  status?: RequestStatus;
  applicantName?: string;
  phone?: string;
  batchId?: string;
  batchSeq?: number;
  batchSize?: number;
  /** 우리동네 갤러리: 준비(세팅)일 여부 */
  isPrepDay?: boolean;

  // block/schedule 전용
  reason?: string;
};

type CalendarResponse = {
  ok: boolean;
  from: string;
  to: string;
  roomId: string;
  floorId: string;
  status: string;
  blocks: boolean;
  schedules: boolean;
  items: CalendarItem[];
};

function isYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDateToYmd(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

function eachYmd(from: string, to: string): string[] {
  const start = ymdToUtcDate(from);
  const end = ymdToUtcDate(to);
  const out: string[] = [];
  for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
    out.push(utcDateToYmd(cur));
  }
  return out;
}

function roomFloor(roomId: string): FloorId | null {
  const meta = (ROOMS_BY_ID as any)[roomId] as { floor?: FloorId } | undefined;
  return meta?.floor ?? null;
}

function roomName(roomId: string, fallback?: string): string {
  const meta = (ROOMS_BY_ID as any)[roomId] as { name?: string } | undefined;
  if (meta?.name) return meta.name;
  if (roomId === "all") return "전체";
  return fallback ?? roomId;
}

function filterByRoomAndFloor(
  inputRoomId: string,
  inputFloorId: string,
  itemRoomId: string,
  fallbackRoomName?: string
): { ok: boolean; floorId: FloorId | null; roomName: string } {
  const fId = itemRoomId === "all" ? null : roomFloor(itemRoomId);
  const rName = roomName(itemRoomId, fallbackRoomName);

  // roomId 필터(특정 room이면, all 적용 항목도 포함)
  if (inputRoomId !== "all") {
    if (!(itemRoomId === inputRoomId || itemRoomId === "all")) {
      return { ok: false, floorId: fId, roomName: rName };
    }
  }

  // floor 필터(특정 floor면 해당 floor room + all 항목 포함)
  if (inputFloorId !== "all") {
    const wanted = inputFloorId as FloorId;
    if (itemRoomId !== "all" && fId !== wanted) {
      return { ok: false, floorId: fId, roomName: rName };
    }
  }

  return { ok: true, floorId: fId, roomName: rName };
}

function filterStatus(statusParam: string, r: RentalRequest): boolean {
  if (statusParam === "all") return true;
  if (statusParam === "active") {
    const active: RequestStatus[] = ["접수", "검토중", "승인"];
    return active.includes(r.status);
  }
  return r.status === (statusParam as RequestStatus);
}

function kindWeight(k: CalendarKind): number {
  // 기본은 예약(신청) 우선, 그 다음 정규수업, 마지막 차단
  if (k === "request") return 0;
  if (k === "schedule") return 1;
  return 2;
}

export async function GET(req: Request) {
  const auth = assertAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawCategory = searchParams.get("category");
  const category = normalizeRoomCategory(rawCategory);
  const allowedRoomIds = new Set(getRoomsByCategory(category).map((r) => r.id));
  const isAllowedRoom = (rid: string) => rid === "all" || allowedRoomIds.has(rid);

  const from = String(searchParams.get("from") ?? "").trim();
  const to = String(searchParams.get("to") ?? "").trim();
  const roomId = String(searchParams.get("roomId") ?? "all").trim() || "all";
  const floorId = String(searchParams.get("floorId") ?? "all").trim() || "all";
  const status = String(searchParams.get("status") ?? "active").trim() || "active";
  const includeBlocks = String(searchParams.get("blocks") ?? "1") !== "0";
  const includeSchedules = String(searchParams.get("schedules") ?? "1") !== "0";

  if (!isYmd(from) || !isYmd(to) || from > to) {
    return NextResponse.json(
      { ok: false, message: "잘못된 기간(from/to)입니다." },
      { status: 400 }
    );
  }

  const db = getDatabase();
  const [requests, blocks, schedules] = await Promise.all([
    db.getAllRequests(),
    includeBlocks ? db.getBlocks() : Promise.resolve([] as BlockedSlot[]),
    includeSchedules ? db.getClassSchedules() : Promise.resolve([] as ClassSchedule[])
  ]);

  const items: CalendarItem[] = [];

  // 1) Requests
  for (const r of requests) {
    if (!inRangeYmd(r.date, from, to)) continue;
    if (!filterStatus(status, r)) continue;
    if (!isAllowedRoom(r.roomId)) continue;

    // room/floor filter
    const rf = filterByRoomAndFloor(roomId, floorId, r.roomId, r.roomName);
    if (!rf.ok) continue;

    items.push({
      kind: "request",
      id: r.requestId,
      roomId: r.roomId,
      roomName: rf.roomName,
      floorId: rf.floorId,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      title: `${rf.roomName}`,
      status: r.status,
      applicantName: r.applicantName,
      phone: r.phone,
      batchId: r.batchId,
      batchSeq: r.batchSeq,
      batchSize: r.batchSize,
      isPrepDay: r.isPrepDay
    });
  }

  // 2) Blocks
  if (includeBlocks) {
    for (const b of blocks) {
      if (!inRangeYmd(b.date, from, to)) continue;

      if (!isAllowedRoom(b.roomId)) continue;

      const rf = filterByRoomAndFloor(roomId, floorId, b.roomId, b.roomId === "all" ? "전체" : undefined);
      if (!rf.ok) continue;

      items.push({
        kind: "block",
        id: `block:${b.id}`,
        roomId: b.roomId,
        roomName: rf.roomName,
        floorId: rf.floorId,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        title: "차단시간",
        reason: b.reason
      });
    }
  }

  // 3) Schedules (expand)
  if (includeSchedules) {
    const dates = eachYmd(from, to);
    for (const dt of dates) {
      const dow = dayOfWeek(dt);

      for (const sc of schedules) {
        if (sc.dayOfWeek !== dow) continue;
        if (!inRangeYmd(dt, sc.effectiveFrom || undefined, sc.effectiveTo || undefined)) continue;

        if (!isAllowedRoom(sc.roomId)) continue;

        const rf = filterByRoomAndFloor(roomId, floorId, sc.roomId, sc.roomId === "all" ? "전체" : undefined);
        if (!rf.ok) continue;

        items.push({
          kind: "schedule",
          id: `schedule:${sc.id}:${dt}`,
          roomId: sc.roomId,
          roomName: rf.roomName,
          floorId: rf.floorId,
          date: dt,
          startTime: sc.startTime,
          endTime: sc.endTime,
          title: sc.title || "정규수업"
        });
      }
    }
  }

  items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    const kw = kindWeight(a.kind) - kindWeight(b.kind);
    if (kw !== 0) return kw;
    return `${a.roomName} ${a.id}`.localeCompare(`${b.roomName} ${b.id}`);
  });

  const payload: CalendarResponse = {
    ok: true,
    from,
    to,
    roomId,
    floorId,
    status,
    blocks: includeBlocks,
    schedules: includeSchedules,
    items
  };

  return NextResponse.json(payload, { status: 200 });
}
