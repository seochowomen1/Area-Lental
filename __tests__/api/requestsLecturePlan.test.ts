/**
 * audit-fix-3 3-3 — POST /api/requests가 planLecture를 쓴 뒤의 회귀 테스트
 *  - 수용 기준 3: 15:00(KST) 기준 오늘 10:00~12:00 → 400 SESSION_INVALID "이미 지난 시간" · 오늘 16:00~18:00 → 200
 *  - estimatedFeeKRW = planLecture 합계 = 저장 행 computeFeesForBundle(할인 0)
 *  - 검증 4종: 정상 200 · 무인증 서면 등록 401 · 위조 쿠키 401 · 잘못된 입력 400
 * 시계는 Date만 가짜로 고정한다(타이머·마이크로태스크는 실제).
 */
import { setupMockEnv, lectureForm, postRequest } from "../helpers/routeEnv";
import { computeFeesForBundle } from "@/lib/pricing";
import type { RentalRequest } from "@/lib/types";

let env: ReturnType<typeof setupMockEnv>;
const realFetch = global.fetch;

// 2026-11-03(화) 15:00 KST
const NOW = new Date("2026-11-03T06:00:00Z");
const TODAY = "2026-11-03";

beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
      "requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate", "setInterval", "clearInterval",
      "setTimeout", "clearTimeout",
    ],
  });
  env = setupMockEnv("lplan");
  delete process.env.HOLIDAY_API_KEY;
  delete process.env.DATA_GO_KR_API_KEY;
  global.fetch = (async () => { throw new Error("network disabled in test"); }) as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
  env.restore();
  jest.useRealTimers();
});

function db() {
  return require("@/lib/database").getDatabase();
}

describe("오늘(KST) 이미 지난 시각 — 서버 차단 (⑧ Q9)", () => {
  test("15:00에 오늘 10:00~12:00 → 400 SESSION_INVALID", async () => {
    const res = await postRequest(lectureForm({ roomId: "sangsang1", date: TODAY, startTime: "10:00", endTime: "12:00" }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SESSION_INVALID");
    expect(res.body.message).toBe("2026-11-03 10:00-12:00: 이미 지난 시간입니다. 다른 시간을 골라 주세요.");
    expect(res.body.issues).toEqual([
      { date: TODAY, startTime: "10:00", endTime: "12:00", code: "SESSION_INVALID", message: "2026-11-03 10:00-12:00: 이미 지난 시간입니다. 다른 시간을 골라 주세요." },
    ]);
    expect(await db().getAllRequests()).toHaveLength(0);
  });

  test("15:00에 오늘 16:00~18:00(화요일 야간) → 200", async () => {
    const res = await postRequest(lectureForm({ roomId: "sangsang1", date: TODAY, startTime: "16:00", endTime: "18:00" }));
    expect(res.status).toBe(200);
    expect(res.body.estimatedFeeKRW).toBe(140_000);
  });

  test("묶음 중 하나만 지난 시각이어도 묶음 전체 400 · 그 회차만 issue", async () => {
    const sessions = JSON.stringify([
      { date: TODAY, startTime: "13:00", endTime: "15:00" },
      { date: "2026-11-04", startTime: "10:00", endTime: "12:00" },
    ]);
    const res = await postRequest(lectureForm({ roomId: "sangsang2", date: TODAY, startTime: "13:00", endTime: "15:00", sessions }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SESSION_INVALID");
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0].date).toBe(TODAY);
  });

  test("지난 날짜는 예전 문구 그대로(VALIDATION_ERROR)", async () => {
    const res = await postRequest(lectureForm({ roomId: "sangsang1", date: "2026-11-02", startTime: "10:00", endTime: "12:00" }));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR", message: "지난 날짜(2026-11-02)는 신청할 수 없습니다." });
  });
});

describe("estimatedFeeKRW = planLecture 합계 = computeFeesForBundle(저장 행)", () => {
  test("E-스튜디오 5명 · 7회 · 장비 2종", async () => {
    const dates = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-08", "2026-12-09", "2026-12-10"];
    const sessions = JSON.stringify(dates.map((date) => ({ date, startTime: "13:00", endTime: "15:30" })));
    const res = await postRequest(
      lectureForm({ roomId: "media", date: dates[0], startTime: "13:00", endTime: "15:30", headcount: "5", sessions, electronicBoard: "true", camcorder: "true" })
    );
    expect(res.status).toBe(200);
    const rows = (await db().getAllRequests()).filter((r: RentalRequest) => r.batchId && r.batchId === res.body.batchId);
    expect(rows).toHaveLength(7);
    // 회차당: 20,000×2.5 + 3명×10,000×2.5 + 장비 30,000 = 155,000 → 7회 1,085,000
    expect(res.body.estimatedFeeKRW).toBe(1_085_000);
    expect(computeFeesForBundle(rows).totalFeeKRW).toBe(res.body.estimatedFeeKRW);
  });

  test("강의실 2건(묶음) · 장비 전부", async () => {
    const sessions = JSON.stringify([
      { date: "2026-12-15", startTime: "10:00", endTime: "12:00" },
      { date: "2026-12-15", startTime: "18:00", endTime: "20:00" },
    ]);
    const res = await postRequest(
      lectureForm({ roomId: "it", date: "2026-12-15", startTime: "10:00", endTime: "12:00", sessions, laptop: "true", projector: "true", audio: "true" })
    );
    expect(res.status).toBe(200);
    expect(res.body.estimatedFeeKRW).toBe(2 * (200_000 + 30_000));
  });
});

describe("검증 4종", () => {
  test("① 정상 → 200", async () => {
    const res = await postRequest(lectureForm({ roomId: "sangsang3", date: "2026-11-05", startTime: "10:00", endTime: "12:00" }));
    expect(res.status).toBe(200);
  });
  test("② 무인증 서면 등록(intake=offline) → 401 UNAUTHORIZED", async () => {
    const res = await postRequest(lectureForm({ roomId: "gallery", intake: "offline" }));
    expect(res.status).toBe(401);
  });
  test("③ 위조 관리자 쿠키 서면 등록 → 401", async () => {
    const res = await postRequest(lectureForm({ roomId: "gallery", intake: "offline" }), {
      cookie: `admin_auth=v2.forged.sig; admin_last_activity=${Date.now()}`,
    });
    expect(res.status).toBe(401);
  });
  test("④ 잘못된 입력(일요일·운영시간 밖·겹침) → 400/409 예전 문구", async () => {
    const sun = await postRequest(lectureForm({ roomId: "sangsang3", date: "2026-11-08", startTime: "10:00", endTime: "12:00" }));
    expect(sun.status).toBe(400);
    expect(sun.body.message).toBe("일요일은 휴관일로 신청할 수 없습니다.");
    const late = await postRequest(lectureForm({ roomId: "sangsang3", date: "2026-11-05", startTime: "16:00", endTime: "18:00" }));
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({ code: "BATCH_CONFLICT", message: "평일 운영시간(10:00~17:00) 내에서만 신청 가능합니다." });
    expect(late.body.issues[0].code).toBe("OUT_OF_HOURS");
    const ov = JSON.stringify([
      { date: "2026-11-06", startTime: "10:00", endTime: "12:00" },
      { date: "2026-11-06", startTime: "11:00", endTime: "13:00" },
    ]);
    const overlap = await postRequest(lectureForm({ roomId: "sangsang3", date: "2026-11-06", sessions: ov }));
    expect(overlap.status).toBe(400);
    expect(overlap.body.message).toBe("같은 날짜(2026-11-06)에 겹치는 시간이 포함되어 있습니다.");
  });
});
