import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { isMockMode } from "@/lib/env";
import { overlaps } from "@/lib/datetime";
import { validateOperatingHoursByDayOfWeek } from "@/lib/operating";
import type { ClassSchedule } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// NOTE: 실제 타입은 lib/types의 ClassSchedule을 따릅니다.
// (effectiveFrom/effectiveTo는 선택 값이므로, 엄격한 로컬 타입 정의로 인해 빌드 단계에서 타입 불일치가
// 발생하지 않도록 별도의 로컬 타입을 두지 않습니다.)

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

export async function GET() {
  const auth = assertAdminApiAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  try {
    const db = getDatabase();
    const schedules = await db.getClassSchedules();
    return NextResponse.json({ ok: true, schedules });
  } catch (e) {
    // MOCK_MODE에서는 db 초기화가 항상 성공해야 함. 그래도 예외는 200으로 흡수.
    return NextResponse.json({ ok: true, schedules: [], warning: isMockMode() ? "MOCK_DB_ERROR" : "DB_ERROR" });
  }
}

export async function POST(req: Request) {
  const auth = assertAdminApiAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as Partial<ClassSchedule>;
    // UI에서 제목은 선택 입력일 수 있으므로, 서버에서 기본값을 부여하여 저장 안정성을 높입니다.
    let title = String(body.title ?? "").trim();
    const roomId = String(body.roomId ?? "").trim();
    const dayOfWeek = Number(body.dayOfWeek);
    const startTime = body.startTime;
    const endTime = body.endTime;
    const effectiveFrom = body.effectiveFrom;
    const effectiveTo = body.effectiveTo;

    if (!title) title = "정규수업";
    if (!roomId) return jsonError("대상을 선택해 주세요.", 400, "VALIDATION");
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)
      return jsonError("요일 값이 올바르지 않습니다.", 400, "VALIDATION");
    if (!isHHMM(startTime) || !isHHMM(endTime))
      return jsonError("시간 형식이 올바르지 않습니다. (HH:MM)", 400, "VALIDATION");
    if (!is30Min(startTime) || !is30Min(endTime))
      return jsonError("시간은 30분 단위(00/30)로만 등록할 수 있습니다.", 400, "VALIDATION");
    if (startTime >= endTime) return jsonError("종료 시간은 시작 시간보다 늦어야 합니다.", 400, "VALIDATION");
    if (!isYmd(effectiveFrom) || !isYmd(effectiveTo))
      return jsonError("적용 기간 형식이 올바르지 않습니다. (YYYY-MM-DD)", 400, "VALIDATION");
    if (effectiveFrom > effectiveTo) return jsonError("적용 기간(시작/종료)이 올바르지 않습니다.", 400, "VALIDATION");

    // 운영시간 검증(요일 기준)
    const op = validateOperatingHoursByDayOfWeek(dayOfWeek, startTime, endTime);
    if (!op.ok) return jsonError(op.message, 400, "OUT_OF_HOURS");

    const db = getDatabase();
    const existing = await db.getClassSchedules();

    // 중복/겹침 방지
    const hasConflict = existing.some((s) => {
      if (s.dayOfWeek !== dayOfWeek) return false;
      // 적용 기간이 겹치는 경우만 체크
      const effectiveOverlap = s.effectiveFrom <= effectiveTo && s.effectiveTo >= effectiveFrom;
      if (!effectiveOverlap) return false;
      // 'all'은 모든 공간에 적용
      const roomOverlap = s.roomId === "all" || roomId === "all" || s.roomId === roomId;
      if (!roomOverlap) return false;
      // overlaps(aStart, aEnd, bStart, bEnd)
      return overlaps(s.startTime, s.endTime, startTime, endTime);
    });

    if (hasConflict) {
      return jsonError("이미 등록된 정규수업 시간과 겹칩니다.", 409, "CONFLICT");
    }

    const item = {
      title,
      roomId,
      dayOfWeek,
      startTime,
      endTime,
      effectiveFrom,
      effectiveTo,
    };

    const result = await db.addClassSchedule(item);
    return NextResponse.json({ ok: true, created: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
    return jsonError(msg, 500, "SERVER_ERROR");
  }
}

export async function DELETE(req: Request) {
  const auth = assertAdminApiAuth();
  if (!auth.ok) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonError("삭제할 항목(id)이 필요합니다.", 400, "VALIDATION");

    const db = getDatabase();
    await db.deleteClassSchedule(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
    return jsonError(msg, 500, "SERVER_ERROR");
  }
}
