import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { dayOfWeek, overlaps } from "@/lib/datetime";
import { validateOperatingHours } from "@/lib/operating";
import type { ClassSchedule } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Block = {
  id: string;
  roomId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  reason: string;
};

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code: code ?? "ERROR", message }, { status });
}

function isYmd(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isHHMM(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function is30Min(v: string) {
  const mm = parseInt(v.split(":")[1] ?? "-1", 10);
  return mm === 0 || mm === 30;
}

function galleryHoursForDate(date: string) {
  const dow = dayOfWeek(date);
  if (dow === 0) return null;
  if (dow === 6) return { startTime: "09:00", endTime: "13:00" };
  return { startTime: "10:00", endTime: "18:00" };
}



export async function GET() {
  try {
    const db = getDatabase();
    const blocks = await db.getBlocks();
    return NextResponse.json({ ok: true, blocks });
  } catch {
    return NextResponse.json({ ok: true, blocks: [], warning: "DB_ERROR" });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Block>;
    const roomId = String(body.roomId ?? "").trim();
    const date = body.date;
    let startTime = body.startTime;
    let endTime = body.endTime;
    const isGallery = roomId === "gallery";
    const reason = String(body.reason ?? "").trim() || "차단";

    if (!roomId) return jsonError("대상을 선택해 주세요.", 400, "VALIDATION");
    if (!isYmd(date)) return jsonError("날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)", 400, "VALIDATION");
    if (isGallery) {
      const hours = galleryHoursForDate(date);
      if (!hours) return jsonError("일요일은 차단할 수 없습니다.", 400, "VALIDATION");
      startTime = hours.startTime;
      endTime = hours.endTime;
    } else {
      if (!isHHMM(startTime) || !isHHMM(endTime))
        return jsonError("시간 형식이 올바르지 않습니다. (HH:MM)", 400, "VALIDATION");
      if (!is30Min(startTime) || !is30Min(endTime))
        return jsonError("시간은 30분 단위(00/30)로만 등록할 수 있습니다.", 400, "VALIDATION");
      if (startTime >= endTime) return jsonError("종료 시간은 시작 시간보다 늦어야 합니다.", 400, "VALIDATION");
    }

    // 운영시간 검증(날짜 기준)
    // - gallery는 별도 운영시간(평일 10~18 / 토 09~13)을 사용하므로,
    //   일반 운영시간(평일 10~17 등) 검증을 적용하면 false negative가 발생할 수 있습니다.
    if (!isGallery) {
      const op = validateOperatingHours(date, startTime, endTime);
      if (!op.ok) return jsonError(op.message, 400, "OUT_OF_HOURS");
    }

    const db = getDatabase();
    const [existingBlocks, existingSchedules] = await Promise.all([
      db.getBlocks(),
      db.getClassSchedules(),
    ]);

    // 1) 수동 차단끼리 겹침 방지
    const blockConflict = existingBlocks.some((b) => {
      if (b.date !== date) return false;
      const roomOverlap = b.roomId === "all" || roomId === "all" || b.roomId === roomId;
      if (!roomOverlap) return false;
      return overlaps(b.startTime, b.endTime, startTime, endTime);
    });
    if (blockConflict) {
      return jsonError("이미 등록된 수동 차단 시간과 겹칩니다.", 409, "CONFLICT");
    }

    // 2) 정규수업과 겹침 방지(적용 기간 포함)
    const dow = dayOfWeek(date);
    const scheduleConflict = (existingSchedules as ClassSchedule[]).some((s) => {
      if (s.dayOfWeek !== dow) return false;
      const effectiveOverlap = s.effectiveFrom <= date && s.effectiveTo >= date;
      if (!effectiveOverlap) return false;
      const roomOverlap = s.roomId === "all" || roomId === "all" || s.roomId === roomId;
      if (!roomOverlap) return false;
      return overlaps(s.startTime, s.endTime, startTime, endTime);
    });
    if (scheduleConflict) {
      return jsonError("이미 등록된 정규수업 시간과 겹칩니다.", 409, "CONFLICT");
    }

    const item = { roomId, date, startTime, endTime, reason };
    const result = await db.addBlock(item);
    return NextResponse.json({ ok: true, created: result });
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : "요청 처리 중 오류가 발생했습니다.";
    return jsonError(msg, 500, "SERVER_ERROR");
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonError("삭제할 항목(id)이 필요합니다.", 400, "VALIDATION");

    const db = getDatabase();
    await db.deleteBlock(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : "요청 처리 중 오류가 발생했습니다.";
    return jsonError(msg, 500, "SERVER_ERROR");
  }
}
