import { NextResponse } from "next/server";
import { Readable } from "stream";
import { GalleryRequestInputSchema, RequestInputSchema, type GalleryRequestInput } from "@/lib/schema";
import { UPLOAD, ROOMS, validateFileMagicBytes } from "@/lib/config";
import { getDatabase } from "@/lib/database";
import { dayOfWeek, inRangeYmd, nowIsoSeoul, overlaps, todayYmdSeoul } from "@/lib/datetime";
import { ensureHolidaysLoaded, ensureHolidaysForRange, type HolidayStatus } from "@/lib/holidays";
import { validateOperatingHours as validateOperatingHoursShared } from "@/lib/operating";
import { buildGallerySessionsFromPeriod, buildGalleryOccupancy, galleryDateConflicts, isPrepAfterExhibition, validateGalleryOperatingHours } from "@/lib/gallery";
import { getDriveUploadClient, ensureUploadFolderId } from "@/lib/google";
import { isMockMode } from "@/lib/env";
import {
  sendAdminNewRequestEmail,
  sendApplicantReceivedEmail,
  sendAdminNewRequestEmailBatch,
  sendApplicantReceivedEmailBatch
} from "@/lib/mail";
import { logger } from "@/lib/logger";
import { APPLICANT_TOKEN_TTL, createApplicantLinkToken } from "@/lib/publicLinkToken";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { assertAdminApiAuth, adminApiAuthFailure } from "@/lib/adminApiAuth";
import type { IntakeChannel, RentalRequest } from "@/lib/types";
import type { RequestStatus } from "@/lib/types";
import { REQUEST_LIMITS, TIME_CONSTANTS } from "@/lib/constants";
import { getRoom } from "@/lib/space";
import { bundleKey } from "@/lib/payment";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { recordAudit } from "@/lib/auditLog";

type SessionInput = { date: string; startTime: string; endTime: string; isPrepDay?: boolean };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function roomName(roomId: string) {
  return ROOMS.find(r => r.id === roomId)?.name ?? roomId;
}

function validateOperatingHours(date: string, startTime: string, endTime: string) {
  // ✅ 운영시간 규칙을 한 곳(lib/operating.ts)에서 관리하여
  //    (시간 옵션 / 슬롯 생성 / 서버 검증) 모두 동일한 기준을 사용하도록 합니다.
  return validateOperatingHoursShared(date, startTime, endTime);
}

function validateOperatingHoursForRoom(roomId: string, date: string, startTime: string, endTime: string) {
  return roomId === "gallery" ? validateGalleryOperatingHours(date, startTime, endTime) : validateOperatingHours(date, startTime, endTime);
}

function conflictMessage(roomId: string, date: string, startTime: string, endTime: string) {
  return `해당 공간(${roomName(roomId)})은 ${date} ${startTime}-${endTime} 시간대에 신청이 불가합니다(일정 충돌).`;
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** YYYY-MM-DD 모양인데 달력에 없는 날짜(2026-11-31 등) */
function isNonexistentYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return !(dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d);
}

function nonexistentDateMessage(s: string) {
  return `존재하지 않는 날짜입니다(${s}). 날짜를 다시 선택해 주세요.`;
}

const UNKNOWN_ROOM_MESSAGE = "신청할 수 없는 공간입니다. 공간 목록에서 다시 선택해 주세요.";
/** [2] 동시 신청 중복 자동 취소 */
const DUPLICATE_DECIDED_BY = "시스템";
const DUPLICATE_REASON = "동시 신청 중복 — 먼저 접수된 신청이 있어 자동 취소";
const SLOT_TAKEN_MESSAGE = {
  time: "방금 다른 분이 같은 시간을 먼저 신청했습니다. 신청은 접수되지 않았습니다. 달력에서 다른 시간을 골라 주세요.",
  period: "방금 다른 분이 같은 기간을 먼저 신청했습니다. 신청은 접수되지 않았습니다. 달력에서 다른 기간을 골라 주세요.",
} as const;

/** [6] 강의실·스튜디오 회차 시간 규칙 (RequestInputSchema와 같은 규칙을 회차마다 적용) */
function sessionRuleIssues(s: { date: string; startTime: string; endTime: string }, maxHours: number): string[] {
  const label = `${s.date} ${s.startTime}-${s.endTime}`;
  if (!/^\d{2}:\d{2}$/.test(s.startTime) || !/^\d{2}:\d{2}$/.test(s.endTime)) {
    return [`${label}: 시작/종료 시간이 올바르지 않습니다.`];
  }
  const sMin = toMinutesSafe(s.startTime);
  const eMin = toMinutesSafe(s.endTime);
  if (sMin >= eMin) return [`${label}: 종료 시간은 시작 시간보다 늦어야 합니다.`];
  const out: string[] = [];
  const step = TIME_CONSTANTS.TIME_SLOT_INTERVAL;
  if (sMin % step !== 0 || eMin % step !== 0) out.push(`${label}: 시간은 30분 단위로만 선택할 수 있습니다.`);
  const diff = eMin - sMin;
  if (diff < TIME_CONSTANTS.MIN_RENTAL_MINUTES) out.push(`${label}: 최소 1시간 이상 선택해야 합니다.`);
  const limitHours = maxHours > 0 ? maxHours : TIME_CONSTANTS.MAX_RENTAL_MINUTES / 60;
  if (diff > limitHours * 60) out.push(`${label}: 한 회차는 최대 ${limitHours}시간까지 신청할 수 있습니다.`);
  return out;
}

function toMinutesSafe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

function diffDaysInclusive(startYmd: string, endYmd: string) {
  const s = new Date(`${startYmd}T00:00:00+09:00`).getTime();
  const e = new Date(`${endYmd}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

// buildGallerySessionsFromPeriod는 lib/gallery.ts에서 단일 기준으로 관리합니다.

function BufferToStream(buffer: Buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

/** 대관 신청: IP당 1분 내 5건, 1시간 내 20건 제한 */
const REQUEST_MAX_PER_MIN = 5;
const REQUEST_WINDOW_MIN_MS = 60 * 1000;
const REQUEST_MAX_PER_HOUR = 20;
const REQUEST_WINDOW_HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    // ✅ Rate Limiting: 악의적 대량 예약 방지
    const ip = getClientIp(req);
    const rlMin = rateLimit("request-min", ip, REQUEST_MAX_PER_MIN, REQUEST_WINDOW_MIN_MS);
    if (!rlMin.allowed) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMIT", message: `요청이 너무 많습니다. ${rlMin.retryAfterSeconds}초 후 다시 시도해주세요.` },
        { status: 429 }
      );
    }
    const rlHour = rateLimit("request-hour", ip, REQUEST_MAX_PER_HOUR, REQUEST_WINDOW_HOUR_MS);
    if (!rlHour.allowed) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMIT", message: `시간당 신청 횟수를 초과했습니다. ${rlHour.retryAfterSeconds}초 후 다시 시도해주세요.` },
        { status: 429 }
      );
    }

    const isMock = isMockMode();
    const db = getDatabase();

    const form = await req.formData();

    const raw = {
      roomId: String(form.get("roomId") ?? ""),
      // 관리자 서면 접수 등록(2026-10-19): intake=offline + 관리자 쿠키 필수
      intake: String(form.get("intake") ?? "online") === "offline" ? "offline" : "online",
      date: String(form.get("date") ?? ""),
      startTime: String(form.get("startTime") ?? ""),
      endTime: String(form.get("endTime") ?? ""),

      applicantName: String(form.get("applicantName") ?? ""),
      birth: String(form.get("birth") ?? ""),
      address: String(form.get("address") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),

      orgName: String(form.get("orgName") ?? ""),
      headcount: String(form.get("headcount") ?? ""),

      laptop: String(form.get("laptop") ?? "false"),
      projector: String(form.get("projector") ?? "false"),
      audio: String(form.get("audio") ?? "false"),

      mirrorless: String(form.get("mirrorless") ?? "false"),
      camcorder: String(form.get("camcorder") ?? "false"),
      wirelessMic: String(form.get("wirelessMic") ?? "false"),
      pinMic: String(form.get("pinMic") ?? "false"),
      rodeMic: String(form.get("rodeMic") ?? "false"),
      electronicBoard: String(form.get("electronicBoard") ?? "false"),

      // gallery 전용 필드(추가 데이터로 전달되며, 저장 확장은 추후 진행)
      startDate: String(form.get("startDate") ?? ""),
      endDate: String(form.get("endDate") ?? ""),
      exhibitionTitle: String(form.get("exhibitionTitle") ?? ""),
      exhibitionPurpose: String(form.get("exhibitionPurpose") ?? ""),
      genreContent: String(form.get("genreContent") ?? ""),
      awarenessPath: String(form.get("awarenessPath") ?? ""),
      specialNotes: String(form.get("specialNotes") ?? ""),
      galleryRemovalTime: String(form.get("galleryRemovalTime") ?? ""),
      galleryPrepDate: String(form.get("galleryPrepDate") ?? ""),

      purpose: String(form.get("purpose") ?? ""),

      privacyAgree: String(form.get("privacyAgree") ?? "false"),
      pledgeAgree: String(form.get("pledgeAgree") ?? "false"),
      pledgeDate: String(form.get("pledgeDate") ?? ""),
      pledgeName: String(form.get("pledgeName") ?? "")
    };

    // ★ 서면 접수 등록(관리자) — 방문·이메일·팩스로 받은 종이 신청서를 관리자가 대신 등록
    //   - 관리자 인증을 입력 검증보다 먼저 수행 · 접수 경로/신청일/메모 기록 · 신청자 메일·토큰 발급 없음 · 당일/과거 시작일 허용
    const isOffline = raw.intake === "offline";
    let offlineMeta: { intakeChannel: IntakeChannel; appliedAt: string; intakeNote?: string } | null = null;
    if (isOffline) {
      const auth = await assertAdminApiAuth(req);
      if (!auth.ok) return adminApiAuthFailure(auth, { unauthorizedMessage: "서면 접수 등록은 관리자만 할 수 있습니다." });
      if (raw.roomId !== "gallery") {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "서면 접수 등록은 현재 우리동네 갤러리만 지원합니다." },
          { status: 400 }
        );
      }
      const ch = String(form.get("intakeChannel") ?? "").trim();
      const appliedAt = String(form.get("appliedAt") ?? "").trim();
      const intakeNote = String(form.get("intakeNote") ?? "").trim().slice(0, 500);
      if (!["visit", "email", "fax"].includes(ch)) {
        return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "접수 경로를 선택해 주세요." }, { status: 400 });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(appliedAt) || appliedAt > todayYmdSeoul()) {
        return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "신청(접수)일은 오늘 이전 날짜로 입력해 주세요." }, { status: 400 });
      }
      offlineMeta = { intakeChannel: ch as IntakeChannel, appliedAt, intakeNote: intakeNote || undefined };
    }

    // ★ [6] 없는 공간(·"all") 거부 — 0원 행 저장 방지 (북카페는 10/7 결정대로 신청 가능)
    const roomMeta = getRoom(raw.roomId);
    if (!roomMeta) {
      return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: UNKNOWN_ROOM_MESSAGE }, { status: 400 });
    }
    // ★ [6] 달력에 없는 날짜(2026-11-31 등) 거부
    for (const v of [raw.date, raw.startDate, raw.endDate, raw.galleryPrepDate]) {
      if (v && isNonexistentYmd(v.trim())) {
        return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: nonexistentDateMessage(v.trim()) }, { status: 400 });
      }
    }

    const schema = raw.roomId === "gallery" ? GalleryRequestInputSchema : RequestInputSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
          issues: parsed.error.issues
        },
        { status: 400 }
      );
    }
    const input = parsed.data;

    // ★ [6] 정원 초과(강의실·스튜디오) — 갤러리는 관람 인원이라 제외
    if (input.roomId !== "gallery" && roomMeta.capacity > 0 && input.headcount > roomMeta.capacity) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: `${roomMeta.name}의 최대 인원은 ${roomMeta.capacity}명입니다. 인원을 줄이거나 더 넓은 공간을 선택해 주세요.`,
        },
        { status: 400 }
      );
    }

    // ★ [2] 겹침 검증은 캐시를 거치지 않은 최신 목록으로 (한 요청 안에서는 1회만 읽음)
    let freshAll: RentalRequest[] | null = null;
    const loadFresh = async () => (freshAll ??= await db.getAllRequestsFresh());


    // ✅ 여러 회차(날짜별로 시간 다르게) 묶음 신청 지원
    const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

    let sessions: SessionInput[] = [];
    /** 갤러리: 전시 기간에 걸친 달의 공휴일 조회 상태(가장 나쁜 값) — galleryAuditJson·응답에 기록 (audit-fix-2 R2) */
    let galleryHolidayCheck: { status: HolidayStatus; months: string[] } | null = null;

    // 갤러리 입력일 경우 타입 안전하게 접근
    const galleryInput = input.roomId === "gallery" ? (input as GalleryRequestInput) : null;

    if (galleryInput) {
      // ✅ 보안: gallery는 client sessions를 무시하고 서버가 startDate~endDate로 회차를 재생성합니다.
      const startDate = String(galleryInput.startDate ?? "").trim();
      const endDate = String(galleryInput.endDate ?? "").trim();

      if (!isYmd(startDate) || !isYmd(endDate)) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "전시 시작/종료일 형식이 올바르지 않습니다." },
          { status: 400 }
        );
      }
      // 갤러리 당일 전시 신청 차단: 준비일이 과거가 되므로 최소 익일부터 신청 가능
      const todayStr = todayYmdSeoul();
      if (!isOffline && startDate <= todayStr) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "갤러리 전시는 최소 1일 전에 신청해야 합니다. (당일 신청 불가)" },
          { status: 400 }
        );
      }

      if (endDate < startDate) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "종료일은 시작일보다 빠를 수 없습니다." },
          { status: 400 }
        );
      }

      // ✅ 갤러리: 전시 기간 최대 30일(포함)
      const rangeDays = diffDaysInclusive(startDate, endDate);
      if (rangeDays > REQUEST_LIMITS.GALLERY_MAX_EXHIBITION_DAYS) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: `전시 기간은 최대 ${REQUEST_LIMITS.GALLERY_MAX_EXHIBITION_DAYS}일까지 신청할 수 있습니다.` },
          { status: 400 }
        );
      }

      // 사용자가 선택한 준비일 사용 (빈 문자열이면 준비일 없음, 미전송 시 자동 계산)
      const customPrepDate = galleryInput?.galleryPrepDate;
      const prepDateParam = customPrepDate !== undefined ? (customPrepDate || null) : undefined;
      // ★ 회차 생성(공휴일 제외 판정)보다 먼저 공휴일을 로딩한다 (2026-10-07 진단 #3 — 콜드 인스턴스 409)
      //   준비일이 시작일 이전 달일 수 있으므로 시작 전월부터 종료월까지 로딩
      {
        const months = new Set<string>();
        const cur = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
        cur.setUTCMonth(cur.getUTCMonth() - 1);
        const endYm = endDate.slice(0, 7);
        while (true) {
          const ym = cur.toISOString().slice(0, 7);
          months.add(ym);
          if (ym >= endYm) break;
          cur.setUTCMonth(cur.getUTCMonth() + 1);
        }
        await Promise.all(
          Array.from(months).map((ym) => ensureHolidaysLoaded(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5, 7), 10)))
        );
        // 금액(전시일 수)에 영향을 주는 달 = 시작월~종료월 (위에서 이미 로딩 → 캐시)
        galleryHolidayCheck = await ensureHolidaysForRange(startDate, endDate);
      }
      // ★ 준비·철거 규정(2026-10-19): 준비일이 앞 전시의 마지막 날이면 17:00(토 11:00) 이후 회차로 생성
      const occForPrep = buildGalleryOccupancy(await loadFresh(), await db.getBlocks());
      const prepProbe = buildGallerySessionsFromPeriod(startDate, endDate, prepDateParam).find((s) => s.isPrepDay)?.date;
      const prepAfterExhibition = prepProbe ? isPrepAfterExhibition(occForPrep, prepProbe) : false;
      sessions = buildGallerySessionsFromPeriod(startDate, endDate, prepDateParam, { prepAfterExhibition });
    } else {
      const rawSessions = String(form.get("sessions") ?? "").trim();
      if (rawSessions) {
        try {
          const parsedSessions = JSON.parse(rawSessions);
          if (!Array.isArray(parsedSessions)) throw new Error("sessions must be array");
          sessions = parsedSessions
            .map((s: any) => ({
              date: String(s?.date ?? "").trim(),
              startTime: String(s?.startTime ?? "").trim(),
              endTime: String(s?.endTime ?? "").trim()
            }))
            .filter((s) => s.date && s.startTime && s.endTime);
        } catch {
          return NextResponse.json(
            { ok: false, code: "VALIDATION_ERROR", message: "회차 정보(sessions) 형식이 올바르지 않습니다." },
            { status: 400 }
          );
        }
      } else {
        // (레거시) 같은 시간으로 여러 날짜 신청
        const rawDates = String(form.get("dates") ?? "").trim();
        const dates0 = (rawDates ? rawDates.split(",") : [input.date]).map((d) => d.trim()).filter(Boolean);
        const dates = Array.from(new Set(dates0));
        sessions = dates.map((date) => ({ date, startTime: input.startTime, endTime: input.endTime }));
      }
    }

// basic validation
    if (!sessions.length) {
      return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "이용일시를 확인해주세요." }, { status: 400 });
    }
    const maxBatch = input.roomId === "gallery" ? REQUEST_LIMITS.GALLERY_MAX_SESSIONS : REQUEST_LIMITS.BATCH_MAX_SESSIONS;
    if (sessions.length > maxBatch) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: `묶음 신청은 최대 ${maxBatch}회차까지 가능합니다.`
        },
        { status: 400 }
      );
    }

    // de-dup & sort
    const uniq = new Map<string, SessionInput>();
    for (const s of sessions) {
      const key = `${s.date}|${s.startTime}|${s.endTime}`;
      uniq.set(key, s);
    }
    sessions = Array.from(uniq.values()).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

    const invalidDate = sessions.find((s) => !isYmd(s.date));
    if (invalidDate) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "이용일자 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }
    const nonexistent = sessions.find((s) => isNonexistentYmd(s.date));
    if (nonexistent) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: nonexistentDateMessage(nonexistent.date) },
        { status: 400 }
      );
    }
    // ★ [6] 회차별 시간 규칙(30분 단위·최소 1시간·공간 최대 시간) — sessions JSON 우회 차단
    if (input.roomId !== "gallery") {
      const ruleIssues: Array<{ date: string; startTime: string; endTime: string; code: string; message: string }> = [];
      for (const s of sessions) {
        for (const message of sessionRuleIssues(s, roomMeta.durationLimitHours)) {
          ruleIssues.push({ date: s.date, startTime: s.startTime, endTime: s.endTime, code: "SESSION_INVALID", message });
        }
      }
      if (ruleIssues.length) {
        return NextResponse.json(
          { ok: false, code: "SESSION_INVALID", message: ruleIssues[0].message, issues: ruleIssues },
          { status: 400 }
        );
      }
    }
    // 강의실·E-스튜디오: 오늘 이전 날짜 신청 차단 (갤러리는 위에서 익일 이후로 별도 검증) — 진단 #2
    if (input.roomId !== "gallery") {
      const today = todayYmdSeoul();
      const past = sessions.find((s) => s.date < today);
      if (past) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: `지난 날짜(${past.date})는 신청할 수 없습니다.` },
          { status: 400 }
        );
      }
    }
    const sunday = sessions.find((s) => dayOfWeek(s.date) === 0);
    if (sunday) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "일요일은 휴관일로 신청할 수 없습니다." },
        { status: 400 }
      );
    }

    // 같은 날짜 내 회차끼리 겹침 방지
    const byDate = new Map<string, SessionInput[]>();
    for (const s of sessions) {
      const arr = byDate.get(s.date) ?? [];
      arr.push(s);
      byDate.set(s.date, arr);
    }
    for (const [date, arr] of byDate.entries()) {
      const sorted = arr.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        if (overlaps(prev.startTime, prev.endTime, cur.startTime, cur.endTime)) {
          return NextResponse.json(
            { ok: false, code: "VALIDATION_ERROR", message: `같은 날짜(${date})에 겹치는 시간이 포함되어 있습니다.` },
            { status: 400 }
          );
        }
      }
    }

    // 공휴일 데이터 사전 로딩 (회차별 운영시간 검증 전)
    const uniqueMonths = new Set(sessions.map((s) => s.date.slice(0, 7)));
    await Promise.all(
      Array.from(uniqueMonths).map((ym) => {
        const [y, mo] = ym.split("-");
        return ensureHolidaysLoaded(parseInt(y, 10), parseInt(mo, 10));
      })
    );

    // 운영시간/충돌 검증은 회차별로 수행 (캐시 우회 최신 목록)
    const all = await loadFresh();
    const conflictStatuses: RequestStatus[] = ["접수", "승인"];
    const schedules = await db.getClassSchedules();
    const blocks = await db.getBlocks();
    const galleryOcc = buildGalleryOccupancy(all, blocks);

    const issues: Array<{ date: string; startTime: string; endTime: string; code: string; message: string }> = [];
    for (const sess of sessions) {
      const op = validateOperatingHoursForRoom(input.roomId, sess.date, sess.startTime, sess.endTime);
      if (!op.ok) {
        issues.push({ date: sess.date, startTime: sess.startTime, endTime: sess.endTime, code: "OUT_OF_HOURS", message: op.message });
        continue;
      }

      let hasRequestConflict: boolean;
      if (input.roomId === "gallery") {
        // ★ 갤러리는 준비·철거 규정(2026-10-19)에 따라 날짜 단위로 판정
        //   - 준비일은 앞 전시의 마지막 날(철거일)과 겹쳐도 허용(17:00/토 11:00 이후)
        //   - 전시일은 다른 신청의 준비일과 우리 마지막 날에서만 겹침 허용
        hasRequestConflict = galleryDateConflicts(
          galleryOcc,
          sess.date,
          sess.isPrepDay ? "prep" : "exhibition",
          galleryInput?.endDate
        );
      } else {
        const sameRoomSameDate = all.filter((r) => {
          if (r.roomId !== input.roomId) return false;
          if (!conflictStatuses.includes(r.status)) return false;
          return r.date === sess.date;
        });
        hasRequestConflict = sameRoomSameDate.some((r) => overlaps(r.startTime, r.endTime, sess.startTime, sess.endTime));
      }
      if (hasRequestConflict) {
        issues.push({ date: sess.date, startTime: sess.startTime, endTime: sess.endTime, code: "CONFLICT", message: conflictMessage(input.roomId, sess.date, sess.startTime, sess.endTime) });
        continue;
      }

      const dow = dayOfWeek(sess.date);
      const scheduleConf = schedules
        .filter((sc) => (sc.roomId === input.roomId || sc.roomId === "all") && sc.dayOfWeek === dow)
        .filter((sc) => inRangeYmd(sess.date, sc.effectiveFrom || undefined, sc.effectiveTo || undefined))
        .some((sc) => overlaps(sc.startTime, sc.endTime, sess.startTime, sess.endTime));
      if (scheduleConf) {
        issues.push({ date: sess.date, startTime: sess.startTime, endTime: sess.endTime, code: "CLASS_CONFLICT", message: "해당 시간대는 정규 수업으로 인해 신청이 불가합니다." });
        continue;
      }

      const blockConf = blocks
        .filter((b) => {
          if (b.roomId !== input.roomId && b.roomId !== "all") return false;
          const bStart = b.date;
          const bEnd = b.endDate || b.date;
          // ★ 갤러리 준비일은 날짜 범위 차단(내부 전시)의 마지막 날(철거일)과 겹쳐도 허용
          if (input.roomId === "gallery" && sess.isPrepDay && b.endDate && sess.date === b.endDate) return false;
          return sess.date >= bStart && sess.date <= bEnd;
        })
        .some((b) => overlaps(b.startTime, b.endTime, sess.startTime, sess.endTime));
      if (blockConf) {
        issues.push({ date: sess.date, startTime: sess.startTime, endTime: sess.endTime, code: "BLOCKED", message: "해당 시간대는 센터 운영 사정으로 신청이 불가합니다." });
        continue;
      }
    }

    if (issues.length) {
      return NextResponse.json(
        { ok: false, code: "BATCH_CONFLICT", message: issues[0].message, issues },
        { status: 409 }
      );
    }

    const files = form.getAll("attachments").filter(Boolean) as File[];
    if (files.length > UPLOAD.maxFiles) {
      return NextResponse.json(
        { ok: false, code: "TOO_MANY_FILES", message: `첨부파일은 최대 ${UPLOAD.maxFiles}개까지 가능합니다.` },
        { status: 400 }
      );
    }

    for (const f of files) {
      if (f.size > UPLOAD.maxBytesPerFile) {
        return NextResponse.json(
          { ok: false, code: "FILE_TOO_LARGE", message: `파일 용량은 건당 10MB 이하만 가능합니다. (${f.name})` },
          { status: 400 }
        );
      }
      if (!UPLOAD.allowedMime.includes(f.type)) {
        return NextResponse.json(
          { ok: false, code: "FILE_TYPE", message: `허용되지 않는 파일 형식입니다(PDF/JPG/PNG만 가능). (${f.name})` },
          { status: 400 }
        );
      }
      // 매직 바이트 검증: MIME 타입 스푸핑 방지
      const magicCheck = validateFileMagicBytes(await f.arrayBuffer());
      if (!magicCheck.ok) {
        return NextResponse.json(
          { ok: false, code: "FILE_TYPE", message: `파일 내용이 허용된 형식(PDF/JPG/PNG)과 일치하지 않습니다. (${f.name})` },
          { status: 400 }
        );
      }
    }

    // (단건 검증 로직은 위 날짜별 검증 루프로 대체)

    const uploadedUrls: string[] = [];

    if (isMock) {
      // 로컬 테스트에서는 Google Drive 업로드 생략(링크는 mock:// 로 저장)
      for (const f of files) {
        uploadedUrls.push(`mock://${encodeURIComponent(f.name)}`);
      }
    } else {
      // ★ 2026-10-19: OAuth env가 있으면 소유자 토큰으로 업로드(앱 전용 폴더), 없으면 서비스 계정(My Drive에선 403)
      const { drive, mode: uploadMode } = getDriveUploadClient();
      let uploadFolderId: string | null = null;
      try {
        uploadFolderId = await ensureUploadFolderId(drive, uploadMode);
      } catch (folderErr) {
        logger.error("업로드 폴더 확인 실패", { error: folderErr instanceof Error ? folderErr.message : String(folderErr) });
      }

      for (const f of files) {
        const ab = await f.arrayBuffer();
        const buf = Buffer.from(ab);

        const first = sessions.find((s) => !s.isPrepDay) ?? sessions[0];
        const safeName = f.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_").slice(0, 100);
        const fileName = `${first.date}_${first.startTime.replace(":", "")}-${first.endTime.replace(":", "")}_${input.roomId}_${safeName}`;

        // ★ 2026-10-19: 서비스 계정은 My Drive 저장 용량이 없어 files.create가 403(storageQuotaExceeded)으로 실패한다.
        //   첨부 실패가 신청 자체를 잃게 하지 않도록 비치명 처리 — 신청은 저장하고 첨부 칸에 실패 표식을 남긴다.
        //   (근본 해결: Drive 업로드를 소유자 OAuth 토큰으로 전환 — drive-check 진단 참조)
        try {
          if (!uploadFolderId) throw new Error("업로드 폴더 없음");
          const createRes = await drive.files.create({
            requestBody: { name: fileName, parents: [uploadFolderId] },
            media: { mimeType: f.type, body: BufferToStream(buf) },
            fields: "id"
          });

          const id = createRes.data.id!;
          const getRes = await drive.files.get({ fileId: id, fields: "webViewLink" });
          uploadedUrls.push(getRes.data.webViewLink ?? `https://drive.google.com/file/d/${id}/view`);
        } catch (uploadErr) {
          const ue = uploadErr as { code?: unknown; message?: string };
          logger.error("첨부 업로드 실패 — 신청은 계속 저장", { fileName, mode: uploadMode, code: ue?.code, error: ue?.message ?? String(uploadErr) });
          uploadedUrls.push(`[업로드 실패] ${safeName} — 신청자에게 메일로 재요청 필요`);
        }
      }
    }

    const isGallery = input.roomId === "gallery";
    const equipment = isGallery
      ? { laptop: false, projector: false, audio: false, mirrorless: false, camcorder: false, wirelessMic: false, pinMic: false, rodeMic: false, electronicBoard: false }
      : {
          laptop: input.laptop, projector: input.projector, audio: input.audio,
          mirrorless: input.mirrorless, camcorder: input.camcorder, wirelessMic: input.wirelessMic,
          pinMic: input.pinMic, rodeMic: input.rodeMic, electronicBoard: input.electronicBoard,
        };

    // ✅ 갤러리: 감사 로그 + 일수 통계
    const galleryGeneratedAt = isGallery ? nowIsoSeoul() : undefined;
    const galleryGenerationVersion = isGallery ? "gallery-gen-v2" : undefined;
    const exhibitionSessions = isGallery ? sessions.filter((s) => !s.isPrepDay) : [];
    const galleryWeekdayCount = isGallery
      ? exhibitionSessions.filter((s) => { const dow = dayOfWeek(s.date); return dow >= 1 && dow <= 5; }).length
      : undefined;
    const gallerySaturdayCount = isGallery
      ? exhibitionSessions.filter((s) => dayOfWeek(s.date) === 6).length
      : undefined;
    const galleryExhibitionDayCount = isGallery ? exhibitionSessions.length : undefined;
    const galleryPrepDate = isGallery ? (sessions.find((s) => s.isPrepDay)?.date || undefined) : undefined;
    const galleryAuditJson = isGallery
      ? JSON.stringify({
          startDate: galleryInput?.startDate,
          endDate: galleryInput?.endDate,
          prepDate: galleryPrepDate,
          removalTime: galleryInput?.galleryRemovalTime,
          weekdayCount: galleryWeekdayCount ?? 0,
          saturdayCount: gallerySaturdayCount ?? 0,
          exhibitionDayCount: galleryExhibitionDayCount ?? 0,
          generatedAt: galleryGeneratedAt,
          version: galleryGenerationVersion,
          // audit-fix-2 R2: 신청 당시 공휴일 조회 상태(ok|stale|fallback|unavailable) — 관리자 상세 배너·다시 계산 판단
          holidayCheck: galleryHolidayCheck?.status ?? "unavailable",
          holidayMonths: galleryHolidayCheck?.months ?? [],
        })
      : undefined;

    let savedList: Awaited<ReturnType<typeof db.appendRequestsBatch>>;
    let batchId: string | undefined;

    if (isGallery) {
      // ✅ 갤러리: 1행으로 저장 (startDate~endDate + 일수 통계)
      const firstExhibition = exhibitionSessions[0] ?? sessions[0];
      const singleRow = await db.appendRequest({
        roomId: input.roomId,
        date: galleryInput!.startDate,                  // 대표 날짜 = 전시 시작일
        startTime: firstExhibition.startTime,           // 대표 시간
        endTime: firstExhibition.endTime,

        // batchId 없음 (1행 형식)
        startDate: galleryInput!.startDate,
        endDate: galleryInput!.endDate,
        exhibitionTitle: galleryInput!.exhibitionTitle,
        exhibitionPurpose: galleryInput!.exhibitionPurpose,
        genreContent: galleryInput!.genreContent,
        awarenessPath: galleryInput!.awarenessPath,
        specialNotes: galleryInput!.specialNotes,

        galleryGeneratedAt,
        galleryGenerationVersion,
        galleryWeekdayCount,
        gallerySaturdayCount,
        galleryExhibitionDayCount,
        galleryPrepDate,
        galleryAuditJson,
        galleryRemovalTime: isGallery ? (galleryInput?.galleryRemovalTime || undefined) : undefined,

        // 서면 접수 등록 메타(온라인 신청은 undefined)
        intakeChannel: offlineMeta?.intakeChannel,
        appliedAt: offlineMeta?.appliedAt,
        intakeNote: offlineMeta?.intakeNote,

        applicantName: input.applicantName,
        birth: input.birth,
        address: input.address,
        phone: input.phone,
        email: input.email,
        orgName: input.orgName,
        headcount: input.headcount,
        equipment,
        purpose: input.purpose,
        attachments: uploadedUrls,
        privacyAgree: input.privacyAgree,
        pledgeAgree: input.pledgeAgree,
        pledgeDate: input.pledgeDate,
        pledgeName: input.pledgeName,
      });
      savedList = [singleRow];
    } else {
      // ✅ 강의실/스튜디오: 기존 묶음 저장
      batchId = sessions.length > 1 ? `BAT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` : undefined;

      const appendInputs = sessions.map((s, i) => ({
        roomId: input.roomId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        batchId,
        batchSeq: batchId ? i + 1 : undefined,
        batchSize: batchId ? sessions.length : undefined,
        applicantName: input.applicantName,
        birth: input.birth,
        address: input.address,
        phone: input.phone,
        email: input.email,
        orgName: input.orgName,
        headcount: input.headcount,
        equipment,
        purpose: input.purpose,
        attachments: uploadedUrls,
        privacyAgree: input.privacyAgree,
        pledgeAgree: input.pledgeAgree,
        pledgeDate: input.pledgeDate,
        pledgeName: input.pledgeName,
      }));
      savedList = await db.appendRequestsBatch(appendInputs);
    }

    // ★ [2] 저장 직후 재확인 — 시트 행 순서가 나보다 앞선 접수·승인 건과 겹치면 내 행(묶음 전체)을 "취소(시스템)"로 바꾸고 409
    //   두 요청이 동시에 재확인해도 "행 순서가 앞선 쪽이 이긴다"로 같은 결론이 난다. 행 삭제가 아니라 상태 변경(감사 추적 유지).
    {
      const myIds = new Set(savedList.map((r) => r.requestId));
      const latest = await db.getAllRequestsFresh();
      const myIdx = latest.findIndex((r) => myIds.has(r.requestId));
      if (myIdx < 0) {
        logger.warn("저장 직후 재확인: 방금 저장한 행을 찾지 못함(재확인 생략)", { requestId: savedList[0]?.requestId });
      } else {
        const earlier = latest.slice(0, myIdx).filter((r) => !myIds.has(r.requestId) && conflictStatuses.includes(r.status));
        let taken = false;
        if (isGallery) {
          const occEarlier = buildGalleryOccupancy(earlier, []);
          taken = sessions.some((s) => galleryDateConflicts(occEarlier, s.date, s.isPrepDay ? "prep" : "exhibition", galleryInput?.endDate));
        } else {
          taken = sessions.some((s) =>
            earlier.some((r) => r.roomId === input.roomId && r.date === s.date && overlaps(r.startTime, r.endTime, s.startTime, s.endTime))
          );
        }
        if (taken) {
          try {
            await db.updateRequestsStatusBatch(
              savedList.map((r) => ({
                requestId: r.requestId,
                status: "취소" as const,
                decidedBy: DUPLICATE_DECIDED_BY,
                rejectReason: DUPLICATE_REASON,
                adminMemo: r.adminMemo ?? "",
              }))
            );
          } catch (cancelErr) {
            logger.error("동시 신청 중복 자동 취소 실패 — 관리자 확인 필요", {
              requestIds: savedList.map((r) => r.requestId),
              error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
            });
          }
          await recordAudit({
            action: "REQUEST_DUPLICATE_AUTO_CANCEL",
            ip,
            actor: DUPLICATE_DECIDED_BY,
            target: (batchId ?? "").trim() || savedList[0].requestId,
            summary: [
              "접수 → 취소(동시 신청 중복)",
              roomName(input.roomId),
              isGallery ? `${galleryInput?.startDate}~${galleryInput?.endDate}` : sessions.map((s) => `${s.date} ${s.startTime}-${s.endTime}`).join(", "),
            ].join(" · "),
            details: { requestIds: savedList.map((r) => r.requestId), count: savedList.length },
          });
          return NextResponse.json(
            { ok: false, code: "SLOT_TAKEN", message: isGallery ? SLOT_TAKEN_MESSAGE.period : SLOT_TAKEN_MESSAGE.time },
            { status: 409 }
          );
        }
      }
    }

    try {
      if (isOffline) {
        // 서면 접수 등록: 신청자 접수 메일·관리자 알림 메일 모두 발송하지 않음(관리자가 직접 등록한 건)
      } else if (savedList.length > 1) {
        await sendAdminNewRequestEmailBatch(savedList);
        await sendApplicantReceivedEmailBatch(savedList);
      } else {
        await sendAdminNewRequestEmail(savedList[0]);
        await sendApplicantReceivedEmail(savedList[0]);
      }
    } catch (emailErr) {
      // 메일 발송 실패해도 신청 자체는 성공 처리
      logger.error("메일 발송 실패 (신청은 정상 저장됨)", {
        requestId: savedList[0]?.requestId,
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }

    logger.info(isOffline ? '서면 접수 등록 완료(관리자)' : '대관 신청 생성 완료', {
      requestId: savedList[0]?.requestId,
      intakeChannel: offlineMeta?.intakeChannel,
      batchId,
      count: savedList.length,
      roomId: input.roomId,
      date: isGallery ? galleryInput?.startDate : (sessions.find((s) => !s.isPrepDay) ?? sessions[0])?.date
    });

    // ★ [1] 응답 토큰은 방금 만든 신청(묶음)에만 유효 · 60분 (이메일 전체 조회는 메일 링크로만)
    let applicantToken = "";
    let tokenExpiresAt = 0;
    try {
      if (!isOffline && savedList[0]) {
        const t = createApplicantLinkToken({
          email: input.email,
          scope: "req",
          group: bundleKey(savedList[0]),
          ttlSeconds: APPLICANT_TOKEN_TTL.APPLY,
        });
        applicantToken = t.token;
        tokenExpiresAt = t.exp;
      }
    } catch {
      // 토큰 발급 실패해도 신청 자체는 성공 처리
    }

    // 서버 공용 계산 금액(갤러리 공휴일·스튜디오 인원 가산 반영) — 화면 금액 검수용
    const estimatedFeeKRW = savedList.length > 1
      ? computeFeesForBundle(savedList).totalFeeKRW
      : savedList[0] ? computeFeesForRequest(savedList[0]).totalFeeKRW : 0;

    return NextResponse.json(
      {
        ok: true,
        requestId: savedList[0]?.requestId,
        batchId: batchId ?? "",
        count: savedList.length,
        requestIds: savedList.map((r) => r.requestId),
        token: applicantToken,
        tokenExpiresAt,
        estimatedFeeKRW,
        // 갤러리만: 신청 당시 공휴일 조회 상태 — unavailable이면 완료 화면 금액 옆 "(공휴일 미확인 · 승인 때 확정)"
        ...(isGallery ? { holidayCheck: galleryHolidayCheck?.status ?? "unavailable" } : {}),
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    const errWithCode = e as { code?: string };
    logger.error('대관 신청 처리 중 오류 발생', {
      error: err.message,
      code: errWithCode.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Google API 관련 에러
    if (err.message?.includes('Google') || errWithCode.code === 'EAUTH') {
      return NextResponse.json(
        { ok: false, code: "GOOGLE_API_ERROR", message: "Google API 연동 오류가 발생했습니다." },
        { status: 503 }
      );
    }

    // 네트워크 연결 에러
    if (errWithCode.code === 'ECONNREFUSED' || errWithCode.code === 'ETIMEDOUT') {
      return NextResponse.json(
        { ok: false, code: "NETWORK_ERROR", message: "네트워크 연결 오류가 발생했습니다." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        code: "SERVER_ERROR",
        message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 500 }
    );
  }
}
