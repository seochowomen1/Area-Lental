/**
 * 서초센터 업무 시스템(강의실 일정표) → 대관 앱 정규수업 동기화
 *
 * - 업무 시스템이 GET /api/sync/rental 로 내보내는 강좌 일정을 받아
 *   대관 앱의 운영 규칙(30분 단위 · 운영시간 안)으로 맞춘 뒤 class_schedule(source=classroom)을 통째로 갈아끼운다.
 * - 수동 등록 항목(source 없음)은 건드리지 않는다.
 * - 환경변수: CLASSROOM_SYNC_URL, CLASSROOM_SYNC_TOKEN
 */
import type { ClassSchedule } from "@/lib/types";
import type { Database } from "@/lib/database";
import { operatingRangesForDayOfWeek } from "@/lib/operating";
import { toMinutes } from "@/lib/datetime";
import { ROOMS_BY_ID } from "@/lib/space";

export const CLASSROOM_SOURCE = "classroom";

export type ClassroomItem = {
  sourceId: string;
  title: string;
  roomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
  kind?: "regular" | "special";
};

export type NormalizeStats = {
  received: number;
  produced: number;
  skippedRoom: number;
  skippedHours: number;
  skippedInvalid: number;
  merged: number;
};

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function fromMinutes(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** 시작은 30분 단위로 내리고, 끝은 30분 단위로 올린다(차단은 넉넉하게) */
export function roundTo30(startTime: string, endTime: string): { start: number; end: number } {
  const s = Math.floor(toMinutes(startTime) / 30) * 30;
  const e = Math.ceil(toMinutes(endTime) / 30) * 30;
  return { start: s, end: e };
}

/** 업무 시스템 항목 1건 → 대관 앱 정규수업 0~n건(운영시간으로 잘라냄) */
export function normalizeItem(
  item: ClassroomItem,
  syncedAt: string
): { schedules: Omit<ClassSchedule, "id">[]; reason?: "room" | "hours" | "invalid" } {
  if (!item || typeof item !== "object") return { schedules: [], reason: "invalid" };
  const roomId = String(item.roomId || "");
  if (!ROOMS_BY_ID[roomId]) return { schedules: [], reason: "room" };
  const dow = Number(item.dayOfWeek);
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) return { schedules: [], reason: "invalid" };
  if (!HHMM.test(item.startTime) || !HHMM.test(item.endTime)) return { schedules: [], reason: "invalid" };
  if (!YMD.test(item.effectiveFrom) || !YMD.test(item.effectiveTo) || item.effectiveFrom > item.effectiveTo) {
    return { schedules: [], reason: "invalid" };
  }

  const { start, end } = roundTo30(item.startTime, item.endTime);
  if (start >= end) return { schedules: [], reason: "invalid" };

  const ranges = operatingRangesForDayOfWeek(dow);
  if (!ranges.length) return { schedules: [], reason: "hours" };

  const isSpecial = item.effectiveFrom === item.effectiveTo;
  const baseTitle = String(item.title || "").trim() || "정규수업";
  const title = isSpecial ? `${baseTitle} · ${item.effectiveFrom.slice(5).replace("-", "/")}` : baseTitle;

  const schedules: Omit<ClassSchedule, "id">[] = [];
  for (const r of ranges) {
    const s = Math.max(start, toMinutes(r.start));
    const e = Math.min(end, toMinutes(r.end));
    if (s >= e) continue;
    schedules.push({
      roomId,
      dayOfWeek: dow,
      startTime: fromMinutes(s),
      endTime: fromMinutes(e),
      title,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
      source: CLASSROOM_SOURCE,
      sourceId: String(item.sourceId || ""),
      syncedAt,
    });
  }
  if (!schedules.length) return { schedules: [], reason: "hours" };
  return { schedules };
}

/** 전체 변환 + 완전 중복(같은 공간·요일·시간·기간) 제거 */
export function normalizeItems(
  items: ClassroomItem[],
  syncedAt: string
): { schedules: Omit<ClassSchedule, "id">[]; stats: NormalizeStats } {
  const stats: NormalizeStats = { received: items.length, produced: 0, skippedRoom: 0, skippedHours: 0, skippedInvalid: 0, merged: 0 };
  const seen = new Map<string, Omit<ClassSchedule, "id">>();
  for (const item of items) {
    const { schedules, reason } = normalizeItem(item, syncedAt);
    if (reason === "room") stats.skippedRoom += 1;
    else if (reason === "hours") stats.skippedHours += 1;
    else if (reason === "invalid") stats.skippedInvalid += 1;
    for (const s of schedules) {
      const key = `${s.roomId}|${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.effectiveFrom}|${s.effectiveTo}`;
      if (seen.has(key)) {
        stats.merged += 1;
        continue;
      }
      seen.set(key, s);
    }
  }
  const schedules = [...seen.values()].sort((a, b) =>
    `${a.roomId}|${a.dayOfWeek}|${a.startTime}|${a.effectiveFrom}`.localeCompare(
      `${b.roomId}|${b.dayOfWeek}|${b.startTime}|${b.effectiveFrom}`
    )
  );
  stats.produced = schedules.length;
  return { schedules, stats };
}

export type ClassroomExport = {
  ok: boolean;
  generatedAt?: string;
  quarters?: string[];
  counts?: Record<string, unknown>;
  items?: ClassroomItem[];
  error?: string;
};

export function classroomSyncConfigured(): boolean {
  return Boolean((process.env.CLASSROOM_SYNC_URL || "").trim() && (process.env.CLASSROOM_SYNC_TOKEN || "").trim());
}

export async function fetchClassroomExport(): Promise<ClassroomExport> {
  const url = (process.env.CLASSROOM_SYNC_URL || "").trim();
  const token = (process.env.CLASSROOM_SYNC_TOKEN || "").trim();
  if (!url || !token) throw new Error("CLASSROOM_SYNC_URL / CLASSROOM_SYNC_TOKEN 환경변수가 필요합니다.");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as ClassroomExport;
  if (!res.ok || data.ok === false) {
    throw new Error(`업무 시스템 응답 오류 (${res.status})${data?.error ? `: ${data.error}` : ""}`);
  }
  if (!Array.isArray(data.items)) throw new Error("업무 시스템 응답에 items가 없습니다.");
  return data;
}

export type SyncResult = {
  syncedAt: string;
  generatedAt?: string;
  quarters: string[];
  received: number;
  produced: number;
  deleted: number;
  added: number;
  stats: NormalizeStats;
};

export async function runClassroomSync(db: Database): Promise<SyncResult> {
  const data = await fetchClassroomExport();
  const syncedAt = new Date().toISOString();
  const { schedules, stats } = normalizeItems(data.items ?? [], syncedAt);
  const { deleted, added } = await db.replaceClassSchedulesBySource(CLASSROOM_SOURCE, schedules);
  return {
    syncedAt,
    generatedAt: data.generatedAt,
    quarters: data.quarters ?? [],
    received: stats.received,
    produced: stats.produced,
    deleted,
    added,
    stats,
  };
}

/* ───────── 동시 실행 방지 (audit-fix-3 3-1) ─────────
 * - 같은 인스턴스: 메모리 표식으로 즉시 거부
 * - 다른 인스턴스(크론과 관리자 버튼이 동시에): 감사로그의 마지막 "수업시간 동기화 시작" 시각이 60초 안이면 거부
 * - 감사로그를 읽지 못하면 메모리 표식만으로 진행(동기화를 막지 않음) — "추가하고 지움" 순서라 겹쳐도 수업이 빠지지 않는다
 */
export const SYNC_LOCK_MS = 60_000;
export const SYNC_RUNNING_MESSAGE = "업무 시스템 가져오기가 방금 시작되었습니다. 1분 뒤 다시 눌러 주세요.";
let inProcessStartedAt = 0;

export type SyncSlot = { ok: true; release: () => void } | { ok: false; lastStartedAt: number };

export async function acquireSyncSlot(opts: {
  /** 이 실행의 시작을 감사로그에 남긴다(await) */
  recordStart: () => Promise<void>;
  /** 감사로그 끝부분 읽기 (기본: lib/auditQuery.readAuditTail) */
  readTail?: () => Promise<Array<{ timestamp: string; action: string; target: string }>>;
  now?: number;
}): Promise<SyncSlot> {
  const now = opts.now ?? Date.now();
  if (inProcessStartedAt && now - inProcessStartedAt < SYNC_LOCK_MS) {
    return { ok: false, lastStartedAt: inProcessStartedAt };
  }
  const prev = inProcessStartedAt;
  inProcessStartedAt = now; // await 전에 먼저 표시(같은 인스턴스 동시 호출 차단)

  try {
    const { readAuditTail, lastOf } = await import("@/lib/auditQuery");
    const tail = await (opts.readTail ?? (() => readAuditTail(500)))();
    const last = lastOf(tail, "SCHEDULE_SYNC_START");
    if (last && now - last.at >= 0 && now - last.at < SYNC_LOCK_MS) {
      inProcessStartedAt = prev;
      return { ok: false, lastStartedAt: last.at };
    }
  } catch (e) {
    console.warn("[classroom-sync] 감사로그를 읽지 못해 메모리 표식만으로 진행", e instanceof Error ? e.message : String(e));
  }

  await opts.recordStart();
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      if (inProcessStartedAt === now) inProcessStartedAt = 0;
    },
  };
}

/** 테스트 전용 — 메모리 표식 초기화 */
export function __resetSyncSlotForTest() {
  inProcessStartedAt = 0;
}
