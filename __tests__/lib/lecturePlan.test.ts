/**
 * audit-fix-3 3-3 — planLecture 대조 테스트
 *
 * "같은 입력에 같은 결과"를 증명한다. 비교 대상은 3-3 이전 코드를 이 파일에 그대로 옮겨 둔 사본(legacy*)이다.
 *  - 요금: 예전 신청서 화면 계산(ApplyClient bundle) · 서버 computeFeesForBundle(할인 0) ↔ planLecture
 *  - 문구: 예전 서버 POST /api/requests 검사(sessionRuleIssues·지난 날짜·일요일·같은 날 겹침·운영시간) ↔ planLecture.issues
 *  - 새 동작 1개: nowHm을 주면 오늘 이미 지난 시각 → SESSION_INVALID "이미 지난 시간입니다"
 */
import type { RentalRequest } from "@/lib/types";
import { computeBaseTotalKRW, computeFeesForBundle } from "@/lib/pricing";
import { EQUIPMENT_FEE_KRW, OPERATING_RULES, STUDIO_EQUIPMENT_FEE_KRW } from "@/lib/config";
import { TIME_CONSTANTS } from "@/lib/constants";
import { getRoom } from "@/lib/space";
import { planLecture, type LectureSessionInput } from "@/lib/rules/lecturePlan";

// ───────────────────────── 3-3 이전 코드 사본 ─────────────────────────

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}
function legacyOverlaps(aS: string, aE: string, bS: string, bE: string) {
  return toMin(aS) < toMin(bE) && toMin(bS) < toMin(aE);
}
function legacyDow(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 예전 app/api/requests/route.ts sessionRuleIssues */
function legacySessionRuleIssues(s: LectureSessionInput, maxHours: number): string[] {
  const label = `${s.date} ${s.startTime}-${s.endTime}`;
  if (!/^\d{2}:\d{2}$/.test(s.startTime) || !/^\d{2}:\d{2}$/.test(s.endTime)) {
    return [`${label}: 시작/종료 시간이 올바르지 않습니다.`];
  }
  const sMin = toMin(s.startTime);
  const eMin = toMin(s.endTime);
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

/** 예전 lib/operating.ts validateOperatingHours (공휴일 캐시 → 인자) */
function legacyValidateOperatingHours(date: string, st: string, en: string, hol: Map<string, string>): { ok: true } | { ok: false; message: string } {
  const dow = legacyDow(date);
  if (dow === 0) return { ok: false, message: "일요일은 대관 신청이 불가합니다." };
  if (hol.has(date)) {
    const hName = hol.get(date) || null;
    return { ok: false, message: hName ? `공휴일(${hName})은 대관 신청이 불가합니다.` : "공휴일은 대관 신청이 불가합니다." };
  }
  const s = toMin(st);
  const e = toMin(en);
  if (!(s < e)) return { ok: false, message: "종료 시간이 시작 시간보다 빠를 수 없습니다." };
  const r = dow === 6 ? OPERATING_RULES.saturday : dow === 2 ? OPERATING_RULES.tuesday : OPERATING_RULES.weekday;
  if (toMin(r.start) <= s && e <= toMin(r.end)) return { ok: true };
  if (dow === 6) return { ok: false, message: "토요일 운영시간(10:00~12:00) 내에서만 신청 가능합니다." };
  if (dow === 2) return { ok: false, message: "화요일 운영시간(10:00~20:00) 내에서만 신청 가능합니다." };
  return { ok: false, message: "평일 운영시간(10:00~17:00) 내에서만 신청 가능합니다." };
}

type LegacyOutcome =
  | { stage: "pass" }
  | { stage: "400"; code: string; message: string; issues?: string[] }
  | { stage: "409-hours"; messages: string[] };

/** 예전 POST /api/requests의 강의실·스튜디오 검사(DB 겹침 전 단계까지) — sessions는 정렬된 상태 */
function legacyRouteChecks(roomId: string, sessions: LectureSessionInput[], today: string, hol: Map<string, string>): LegacyOutcome {
  const maxHours = getRoom(roomId)!.durationLimitHours;
  const ruleIssues: string[] = [];
  for (const s of sessions) ruleIssues.push(...legacySessionRuleIssues(s, maxHours));
  if (ruleIssues.length) return { stage: "400", code: "SESSION_INVALID", message: ruleIssues[0], issues: ruleIssues };
  const past = sessions.find((s) => s.date < today);
  if (past) return { stage: "400", code: "VALIDATION_ERROR", message: `지난 날짜(${past.date})는 신청할 수 없습니다.` };
  if (sessions.find((s) => legacyDow(s.date) === 0)) return { stage: "400", code: "VALIDATION_ERROR", message: "일요일은 휴관일로 신청할 수 없습니다." };
  const byDate = new Map<string, LectureSessionInput[]>();
  for (const s of sessions) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  for (const [date, arr] of byDate.entries()) {
    const sorted = arr.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (legacyOverlaps(sorted[i - 1].startTime, sorted[i - 1].endTime, sorted[i].startTime, sorted[i].endTime)) {
        return { stage: "400", code: "VALIDATION_ERROR", message: `같은 날짜(${date})에 겹치는 시간이 포함되어 있습니다.` };
      }
    }
  }
  const messages: string[] = [];
  for (const s of sessions) {
    const op = legacyValidateOperatingHours(s.date, s.startTime, s.endTime, hol);
    if (!op.ok) messages.push(op.message);
  }
  return messages.length ? { stage: "409-hours", messages } : { stage: "pass" };
}

/** 같은 순서·같은 응답 규칙을 planLecture 결과로 재구성(route.ts 3-3 매핑과 같음) */
function newRouteChecks(roomId: string, sessions: LectureSessionInput[], today: string, hol: Map<string, string>, nowHm?: string): LegacyOutcome {
  const plan = planLecture({ roomId, sessions, holidays: new Set(hol.keys()), holidayNames: hol, todayYmd: today, nowHm });
  const of = (c: string) => plan.issues.filter((i) => i.code === c);
  const rule = of("SESSION_INVALID");
  if (rule.length) return { stage: "400", code: "SESSION_INVALID", message: rule[0].message, issues: rule.map((i) => i.message) };
  const past = of("PAST_DATE")[0];
  if (past) return { stage: "400", code: "VALIDATION_ERROR", message: past.message };
  if (sessions.find((s) => legacyDow(s.date) === 0)) return { stage: "400", code: "VALIDATION_ERROR", message: "일요일은 휴관일로 신청할 수 없습니다." };
  const ov = of("OVERLAP")[0];
  if (ov) return { stage: "400", code: "VALIDATION_ERROR", message: ov.message };
  const messages = sessions
    .map((_s, idx) => plan.issues.find((i) => i.index === idx && (i.code === "CLOSED_DAY" || i.code === "OUT_OF_HOURS"))?.message)
    .filter((m): m is string => !!m);
  return messages.length ? { stage: "409-hours", messages } : { stage: "pass" };
}

type Eq = Partial<RentalRequest["equipment"]>;

/** 예전 ApplyClient bundle(useMemo) 계산 */
function legacyClientBundle(roomId: string, sessions: LectureSessionInput[], eq: Eq, headcountNum: number) {
  const room = getRoom(roomId);
  const isStudioRoom = room?.category === "studio";
  const equipmentFee = isStudioRoom
    ? (eq.mirrorless ? STUDIO_EQUIPMENT_FEE_KRW.mirrorless : 0) +
      (eq.camcorder ? STUDIO_EQUIPMENT_FEE_KRW.camcorder : 0) +
      (eq.wirelessMic ? STUDIO_EQUIPMENT_FEE_KRW.wirelessMic : 0) +
      (eq.pinMic ? STUDIO_EQUIPMENT_FEE_KRW.pinMic : 0) +
      (eq.rodeMic ? STUDIO_EQUIPMENT_FEE_KRW.rodeMic : 0) +
      (eq.electronicBoard ? STUDIO_EQUIPMENT_FEE_KRW.electronicBoard : 0)
    : (eq.laptop ? EQUIPMENT_FEE_KRW.laptop : 0) + (eq.projector ? EQUIPMENT_FEE_KRW.projector : 0) + (eq.audio ? EQUIPMENT_FEE_KRW.audio : 0);
  let totalDurationMin = 0;
  let rentalSum = 0;
  let extraHeadcountSum = 0;
  const hc = isStudioRoom && Number.isFinite(headcountNum) ? headcountNum : undefined;
  for (const s of sessions) {
    const dur = toMin(s.endTime) - toMin(s.startTime);
    if (!Number.isFinite(dur) || dur <= 0) continue;
    totalDurationMin += dur;
    const fee = computeBaseTotalKRW({ roomId, date: s.date, startTime: s.startTime, endTime: s.endTime, equipment: { laptop: false, projector: false, audio: false }, headcount: hc });
    rentalSum += fee.rentalFeeKRW;
    extraHeadcountSum += fee.extraHeadcountFeeKRW;
  }
  const equipmentSum = equipmentFee * sessions.length;
  return { totalDurationMin, rentalSum, extraHeadcountSum, equipmentSum, total: rentalSum + equipmentSum };
}

/** 서버 저장 행 모양 → computeFeesForBundle(할인 0) */
function serverBundleTotal(roomId: string, sessions: LectureSessionInput[], eq: Eq, headcount: number): number {
  const batchId = sessions.length > 1 ? "BAT-test" : undefined;
  const rows = sessions.map((s, i) => ({
    requestId: `REQ-${i}`,
    roomId,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    batchId,
    headcount,
    equipment: { laptop: false, projector: false, audio: false, ...eq },
  })) as unknown as RentalRequest[];
  return computeFeesForBundle(rows).totalFeeKRW;
}

// ───────────────────────── 고정 입력 ─────────────────────────
// 2026-12-01(화) · 12-02(수) · 12-03(목) · 12-04(금) · 12-05(토) · 12-06(일) · 12-25(금, 기독탄신일)
const TODAY = "2026-11-02";
const HOL = new Map<string, string>([["2026-12-25", "기독탄신일"], ["2026-12-31", ""]]);
const S = (date: string, startTime: string, endTime: string): LectureSessionInput => ({ date, startTime, endTime });
const NO_EQ: Eq = {};
const LECT_ALL: Eq = { laptop: true, projector: true, audio: true };
const STUDIO_ALL: Eq = { mirrorless: true, camcorder: true, wirelessMic: true, pinMic: true, rodeMic: true, electronicBoard: true };
const seven = (start: string, end: string) =>
  ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-08", "2026-12-09", "2026-12-10"].map((d) => S(d, start, end));

type Fixture = [name: string, roomId: string, sessions: LectureSessionInput[], eq: Eq, headcount: number];
const FIXTURES: Fixture[] = [
  ["강의실 평일 2시간", "sangsang1", [S("2026-12-02", "10:00", "12:00")], NO_EQ, 10],
  ["강의실(5만) 평일 3시간 장비 전부", "sangsang2", [S("2026-12-03", "13:00", "16:00")], LECT_ALL, 15],
  ["강의실(10만) 평일 6시간(최대)", "it", [S("2026-12-04", "10:00", "16:00")], { projector: true }, 18],
  ["강의실 평일 7시간(최대 초과)", "sangsang1", [S("2026-12-02", "10:00", "17:00")], NO_EQ, 10],
  ["화요일 야간 17~20", "sangsang3", [S("2026-12-01", "17:00", "20:00")], { audio: true }, 5],
  ["화요일 19~21(운영시간 밖)", "sangsang1", [S("2026-12-01", "19:00", "21:00")], NO_EQ, 5],
  ["평일 16~18(운영시간 밖)", "art", [S("2026-12-02", "16:00", "18:00")], NO_EQ, 5],
  ["토요일 10~12", "healing", [S("2026-12-05", "10:00", "12:00")], { laptop: true }, 8],
  ["토요일 11~13(운영시간 밖)", "healing", [S("2026-12-05", "11:00", "13:00")], NO_EQ, 8],
  ["일요일", "sangsang1", [S("2026-12-06", "10:00", "12:00")], NO_EQ, 5],
  ["공휴일(이름 있음)", "maru", [S("2026-12-25", "10:00", "12:00")], NO_EQ, 5],
  ["공휴일(이름 없음)", "maru", [S("2026-12-31", "10:00", "12:00")], NO_EQ, 5],
  ["30분 단위 위반(10:10)", "sangsang1", [S("2026-12-02", "10:10", "12:00")], NO_EQ, 5],
  ["30분짜리(최소 미만)", "sangsang1", [S("2026-12-02", "10:00", "10:30")], NO_EQ, 5],
  ["10분 + 최소 미만 동시", "sangsang1", [S("2026-12-02", "10:00", "10:20")], NO_EQ, 5],
  ["시작=종료", "sangsang1", [S("2026-12-02", "12:00", "12:00")], NO_EQ, 5],
  ["시작>종료", "sangsang1", [S("2026-12-02", "14:00", "12:00")], NO_EQ, 5],
  ["시간 형식 오류", "sangsang1", [S("2026-12-02", "9:00", "12:00")], NO_EQ, 5],
  ["1시간 30분", "sangsang2", [S("2026-12-03", "10:00", "11:30")], LECT_ALL, 5],
  ["스튜디오 1명 2시간", "media", [S("2026-12-02", "10:00", "12:00")], NO_EQ, 1],
  ["스튜디오 2명(기본) 3시간", "media", [S("2026-12-02", "10:00", "13:00")], NO_EQ, 2],
  ["스튜디오 4명 3시간 = 120,000", "media", [S("2026-12-02", "10:00", "13:00")], NO_EQ, 4],
  ["스튜디오 12명 1시간 장비 전부", "media", [S("2026-12-03", "14:00", "15:00")], STUDIO_ALL, 12],
  ["스튜디오 3명 1.5시간 핀마이크", "media", [S("2026-12-03", "10:00", "11:30")], { pinMic: true }, 3],
  ["스튜디오 강의실 장비 키(무시됨)", "media", [S("2026-12-03", "10:00", "12:00")], LECT_ALL, 2],
  ["강의실 스튜디오 장비 키(무시됨)", "sangsang1", [S("2026-12-03", "10:00", "12:00")], STUDIO_ALL, 5],
  ["묶음 7회 강의실", "sangsang1", seven("10:00", "12:00"), LECT_ALL, 10],
  ["묶음 7회 스튜디오 5명", "media", seven("13:00", "15:30"), { electronicBoard: true, camcorder: true }, 5],
  ["묶음 7회 중 화요일만 야간", "sangsang3", [...seven("10:00", "12:00").slice(1), S("2026-12-01", "18:00", "20:00")], NO_EQ, 5],
  ["묶음 중 한 회차 30분 단위 위반", "sangsang1", [S("2026-12-02", "10:00", "12:00"), S("2026-12-03", "10:15", "12:00")], NO_EQ, 5],
  ["묶음 중 두 회차 규칙 위반(문구 순서)", "sangsang1", [S("2026-12-02", "10:00", "10:30"), S("2026-12-03", "09:00", "17:00")], NO_EQ, 5],
  ["묶음 중 일요일", "sangsang1", [S("2026-12-05", "10:00", "12:00"), S("2026-12-06", "10:00", "12:00")], NO_EQ, 5],
  ["묶음 중 공휴일", "sangsang1", [S("2026-12-24", "10:00", "12:00"), S("2026-12-25", "10:00", "12:00")], NO_EQ, 5],
  ["같은 날 겹침", "sangsang1", [S("2026-12-02", "10:00", "12:00"), S("2026-12-02", "11:00", "13:00")], NO_EQ, 5],
  ["같은 날 붙어 있음(겹침 아님)", "sangsang1", [S("2026-12-02", "10:00", "12:00"), S("2026-12-02", "12:00", "14:00")], NO_EQ, 5],
  ["두 날짜 모두 겹침(첫 날짜 문구)", "sangsang1", [S("2026-12-02", "10:00", "12:00"), S("2026-12-02", "11:00", "13:00"), S("2026-12-03", "10:00", "12:00"), S("2026-12-03", "11:00", "13:00")], NO_EQ, 5],
  ["지난 날짜", "sangsang1", [S("2026-10-28", "10:00", "12:00")], NO_EQ, 5],
  ["지난 날짜 + 일요일(지난 날짜 먼저)", "sangsang1", [S("2026-10-25", "10:00", "12:00"), S("2026-12-06", "10:00", "12:00")], NO_EQ, 5],
  ["북카페 평일", "bookcafe", [S("2026-12-02", "13:00", "15:00")], { laptop: true }, 5],
  ["전체 강의실(classroom_all)", "classroom_all", [S("2026-12-02", "10:00", "12:00")], NO_EQ, 30],
  ["운영시간 밖 + 공휴일 묶음(회차별 문구 2개)", "sangsang1", [S("2026-12-02", "16:00", "18:00"), S("2026-12-25", "10:00", "12:00")], NO_EQ, 5],
];

// ───────────────────────── 대조 ─────────────────────────

describe("planLecture 대조 — 요금 (예전 화면 계산·서버 computeFeesForBundle과 같은 값)", () => {
  test(`고정 입력 ${FIXTURES.length}건 이상(수용 기준 30건)`, () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(30);
  });

  test.each(FIXTURES)("%s", (_n, roomId, sessions, eq, hc) => {
    const plan = planLecture({ roomId, sessions, headcount: hc, equipment: eq, holidays: new Set(HOL.keys()), todayYmd: TODAY });
    const legacy = legacyClientBundle(roomId, sessions, eq, hc);
    expect(plan.totalFeeKRW).toBe(legacy.total);
    expect(plan.rentalFeeKRW).toBe(legacy.rentalSum);
    expect(plan.extraHeadcountFeeKRW).toBe(legacy.extraHeadcountSum);
    expect(plan.equipmentFeeKRW).toBe(legacy.equipmentSum);
    expect(plan.totalDurationMin).toBe(legacy.totalDurationMin);
    expect(plan.totalFeeKRW).toBe(serverBundleTotal(roomId, sessions, eq, hc));
    // 회차별 요금 = computeBaseTotalKRW(회차)
    plan.sessions.forEach((ps, i) => {
      const b = computeBaseTotalKRW({ roomId, ...sessions[i], equipment: { laptop: false, projector: false, audio: false, ...eq }, headcount: hc });
      expect(ps.feeKRW).toBe(b.totalFeeKRW);
      expect(ps.durationHours).toBe(b.durationHours);
    });
  });

  test("스튜디오 4명 3시간 = 120,000원 (수용 기준 5 금액)", () => {
    const plan = planLecture({ roomId: "media", sessions: [S("2026-12-02", "10:00", "13:00")], headcount: 4, holidays: new Set(), todayYmd: TODAY });
    expect(plan.totalFeeKRW).toBe(120_000);
    expect(plan.sessions[0]).toMatchObject({ durationMin: 180, durationHours: 3, rentalFeeKRW: 120_000, extraHeadcountFeeKRW: 60_000, feeKRW: 120_000, issues: [] });
  });

  // 전수 조합: 공간 11 × 요일 4 × 시간 6 × 장비 3 × 인원 4 = 3,168가지
  test("전수 조합 — 공간·요일·시간·장비·인원 3,168가지 모두 같은 값", () => {
    const rooms = ["bookcafe", "classroom_all", "sangsang1", "sangsang2", "sangsang3", "media", "it", "art", "healing", "maru", "nope"];
    const days = ["2026-12-01", "2026-12-02", "2026-12-05", "2026-12-25"];
    const times: Array<[string, string]> = [["10:00", "11:00"], ["10:00", "11:30"], ["10:30", "16:30"], ["17:00", "20:00"], ["10:10", "10:40"], ["15:00", "12:00"]];
    const eqs: Eq[] = [NO_EQ, LECT_ALL, STUDIO_ALL];
    const hcs = [1, 2, 3, 12];
    let n = 0;
    for (const roomId of rooms) for (const d of days) for (const [st, en] of times) for (const eq of eqs) for (const hc of hcs) {
      const sessions = [S(d, st, en)];
      const plan = planLecture({ roomId, sessions, headcount: hc, equipment: eq, holidays: new Set(HOL.keys()), todayYmd: TODAY });
      const legacy = legacyClientBundle(roomId, sessions, eq, hc);
      expect([roomId, d, st, en, hc, plan.totalFeeKRW]).toEqual([roomId, d, st, en, hc, legacy.total]);
      expect(plan.totalFeeKRW).toBe(serverBundleTotal(roomId, sessions, eq, hc));
      n++;
    }
    expect(n).toBe(3168);
  });
});

describe("planLecture 대조 — 문제 문구 (예전 서버 POST /api/requests 검사와 글자 하나까지 같음)", () => {
  test.each(FIXTURES)("%s", (_n, roomId, sessions0) => {
    // 서버는 정렬·중복 제거 후 검사한다
    const sessions = sessions0.slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    expect(newRouteChecks(roomId, sessions, TODAY, HOL)).toEqual(legacyRouteChecks(roomId, sessions, TODAY, HOL));
  });

  test("문구 원문 예시", () => {
    const plan = planLecture({
      roomId: "sangsang1",
      sessions: [S("2026-12-02", "10:10", "10:30"), S("2026-12-25", "10:00", "12:00"), S("2026-12-03", "16:00", "18:00")],
      holidays: new Set(HOL.keys()),
      holidayNames: HOL,
      todayYmd: TODAY,
    });
    expect(plan.sessions.map((s) => s.issues)).toEqual([
      ["2026-12-02 10:10-10:30: 시간은 30분 단위로만 선택할 수 있습니다.", "2026-12-02 10:10-10:30: 최소 1시간 이상 선택해야 합니다."],
      ["공휴일(기독탄신일)은 대관 신청이 불가합니다."],
      ["평일 운영시간(10:00~17:00) 내에서만 신청 가능합니다."],
    ]);
    expect(plan.issues.map((i) => i.code)).toEqual(["SESSION_INVALID", "SESSION_INVALID", "CLOSED_DAY", "OUT_OF_HOURS"]);
  });

  test("달력에 없는 날짜·형식 오류 → INVALID_DATE (요금 계산은 계속)", () => {
    const plan = planLecture({ roomId: "sangsang1", sessions: [S("2026-11-31", "10:00", "12:00"), S("2026/12/01", "10:00", "12:00")], holidays: new Set(), todayYmd: TODAY });
    expect(plan.issues.map((i) => [i.code, i.message])).toEqual([
      ["INVALID_DATE", "존재하지 않는 날짜입니다(2026-11-31). 날짜를 다시 선택해 주세요."],
      ["INVALID_DATE", "이용일자 형식이 올바르지 않습니다."],
    ]);
  });
});

describe("새 동작 — 오늘(KST) 이미 지난 시각 (⑧ Q9)", () => {
  const today = "2026-11-04"; // 수
  const plan = (st: string, en: string, nowHm?: string, date = today) =>
    planLecture({ roomId: "sangsang1", sessions: [S(date, st, en)], holidays: new Set(), todayYmd: today, nowHm });

  test("15:00에 오늘 10:00~12:00 → SESSION_INVALID '이미 지난 시간'", () => {
    const p = plan("10:00", "12:00", "15:00");
    expect(p.issues).toEqual([
      { index: 0, date: today, startTime: "10:00", endTime: "12:00", code: "SESSION_INVALID", message: "2026-11-04 10:00-12:00: 이미 지난 시간입니다. 다른 시간을 골라 주세요." },
    ]);
  });
  test("15:00에 오늘 16:00~17:00 → 통과 · 15:00 시작(같은 분)도 통과", () => {
    expect(plan("16:00", "17:00", "15:00").issues).toEqual([]);
    expect(plan("15:00", "17:00", "15:00").issues).toEqual([]);
  });
  test("15:00에 오늘 14:30~16:30(이미 시작) → 지난 시간", () => {
    expect(plan("14:30", "16:30", "15:00").issues.map((i) => i.code)).toEqual(["SESSION_INVALID"]);
  });
  test("nowHm 없으면 검사 안 함 · 내일은 대상 아님", () => {
    expect(plan("10:00", "12:00").issues).toEqual([]);
    expect(plan("10:00", "12:00", "15:00", "2026-11-05").issues).toEqual([]);
  });
  test("규칙 위반이 함께 있으면 규칙 문구 뒤에 붙음 · 시작≥종료면 지난 시각 검사 안 함", () => {
    expect(plan("10:10", "12:00", "15:00").sessions[0].issues).toEqual([
      "2026-11-04 10:10-12:00: 시간은 30분 단위로만 선택할 수 있습니다.",
      "2026-11-04 10:10-12:00: 이미 지난 시간입니다. 다른 시간을 골라 주세요.",
    ]);
    expect(plan("12:00", "10:00", "15:00").sessions[0].issues).toEqual(["2026-11-04 12:00-10:00: 종료 시간은 시작 시간보다 늦어야 합니다."]);
  });
});
