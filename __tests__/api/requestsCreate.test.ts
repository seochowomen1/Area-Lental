/**
 * audit-fix-1 — 신청 생성 API(/api/requests) 회귀 테스트
 *  [1] 응답 토큰 범위(피해자 시나리오) · [2] 동시 신청 · [6] 서버 검증 4종 · [결3] 인원 가산 · ⑧-2 만 14세 미만
 */
import { setupMockEnv, lectureForm, galleryForm, postRequest, postJson, futureDate, addDays, todayYmd } from "../helpers/routeEnv";

let env: ReturnType<typeof setupMockEnv>;
const realFetch = global.fetch;

beforeAll(() => {
  env = setupMockEnv("create");
  delete process.env.HOLIDAY_API_KEY;
  delete process.env.DATA_GO_KR_API_KEY;
  // 공휴일 API 등 외부 호출 차단
  global.fetch = (async () => { throw new Error("network disabled in test"); }) as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
  env.restore();
});

function db() {
  return require("@/lib/database").getDatabase();
}

describe("[1] 신청 응답 토큰은 그 신청(묶음) 전용", () => {
  test("피해자 시나리오: 공격자가 피해자 이메일로 신청 → 받은 토큰으로 피해자 신청 조회·취소·목록 불가(403)", async () => {
    const victimMail = "victim@example.com";
    const v = await postRequest(lectureForm({ email: victimMail, date: futureDate(3, 3), startTime: "10:00", endTime: "12:00" }));
    expect(v.status).toBe(200);
    const victimId = v.body.requestId as string;

    const a = await postRequest(lectureForm({ email: victimMail, date: futureDate(4, 3), startTime: "14:00", endTime: "16:00" }));
    expect(a.status).toBe(200);
    expect(a.body.token).toBeTruthy();
    expect(a.body.tokenExpiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3500);
    expect(a.body.tokenExpiresAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 3600);

    // 조회
    const r = await postJson("@/app/api/public/result/route", "http://localhost/api/public/result", { requestId: victimId, token: a.body.token });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("TOKEN_SCOPE");
    // 취소
    const c = await postJson("@/app/api/public/cancel/route", "http://localhost/api/public/cancel", { requestId: victimId, token: a.body.token });
    expect(c.status).toBe(403);
    expect(c.body.code).toBe("TOKEN_SCOPE");
    expect((await db().getRequestById(victimId)).status).toBe("접수");
    // 목록: 공격자 자신의 신청만
    const { GET } = require("@/app/api/public/my/list/route");
    const lres: Response = await GET(new Request(`http://localhost/api/public/my/list?token=${encodeURIComponent(a.body.token)}`, { headers: { "x-forwarded-for": "10.9.9.1" } }));
    const lbody = await lres.json();
    expect(lres.status).toBe(200);
    expect(lbody.scope).toBe("req");
    const ids = JSON.stringify(lbody);
    expect(ids).toContain(a.body.requestId);
    expect(ids).not.toContain(victimId);

    // 자기 신청은 조회 가능
    const own = await postJson("@/app/api/public/result/route", "http://localhost/api/public/result", { requestId: a.body.requestId, token: a.body.token });
    expect(own.status).toBe(200);
  });

  test("토큰 없이 조회·취소·목록 → 400 LINK_REQUIRED (생년월일·이메일 지식 인증 없음)", async () => {
    const r = await postJson("@/app/api/public/result/route", "http://localhost/api/public/result", { requestId: "REQ-X", email: "a@b.com", birth: "1990-01-01" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("LINK_REQUIRED");
    const c = await postJson("@/app/api/public/cancel/route", "http://localhost/api/public/cancel", { requestId: "REQ-X", email: "a@b.com" });
    expect(c.status).toBe(400);
    expect(c.body.code).toBe("LINK_REQUIRED");
    const { GET } = require("@/app/api/public/my/list/route");
    const lres: Response = await GET(new Request("http://localhost/api/public/my/list?email=a@b.com&birth=1990-01-01", { headers: { "x-forwarded-for": "10.9.9.2" } }));
    expect(lres.status).toBe(400);
    expect((await lres.json()).code).toBe("LINK_REQUIRED");
  });

  test("위조·변조 토큰 → 403 TOKEN_INVALID", async () => {
    const r = await postJson("@/app/api/public/result/route", "http://localhost/api/public/result", { requestId: "REQ-X", token: "v2.forged.sig" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("TOKEN_INVALID");
  });

  test("send-link: 존재 여부와 무관하게 같은 200 응답", async () => {
    const a = await postJson("@/app/api/public/my/send-link/route", "http://localhost/api/public/my/send-link", { email: "nobody@example.com" });
    const b = await postJson("@/app/api/public/my/send-link/route", "http://localhost/api/public/my/send-link", { email: "victim@example.com", requestId: "REQ-NOPE" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
  });
});

/** 대표 회차는 정상, 둘째 회차만 규칙 위반인 묶음(sessions[] 조작) */
function sess2(st: string, et: string) {
  const d1 = futureDate(3, 3);
  return JSON.stringify([
    { date: d1, startTime: "10:00", endTime: "12:00" },
    { date: addDays(d1, 7), startTime: st, endTime: et },
  ]);
}

describe("[6] 서버 검증", () => {
  test.each([
    ["없는 공간", { roomId: "nope" }, "VALIDATION_ERROR"],
    ["공간 all", { roomId: "all" }, "VALIDATION_ERROR"],
    ["대표 회차 10시간(스키마)", { startTime: "09:00", endTime: "19:00" }, "VALIDATION_ERROR"],
    ["대표 회차 10분 단위(스키마)", { startTime: "10:10", endTime: "12:00" }, "VALIDATION_ERROR"],
    ["sessions[] 둘째 회차 10시간", { sessions: sess2("09:00", "19:00") }, "SESSION_INVALID"],
    ["sessions[] 둘째 회차 10분 단위", { sessions: sess2("10:10", "12:00") }, "SESSION_INVALID"],
    ["sessions[] 둘째 회차 30분짜리", { sessions: sess2("10:00", "10:30") }, "SESSION_INVALID"],
    ["정원 초과(상상1 20명)", { headcount: "21" }, "VALIDATION_ERROR"],
    ["없는 날짜 2026-11-31", { date: "2026-11-31" }, "VALIDATION_ERROR"],
  ])("%s → 400", async (_n, over, code) => {
    const res = await postRequest(lectureForm(over as Record<string, string>));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    if (code === "SESSION_INVALID") {
      expect(res.body.issues[0]).toMatchObject({ code: "SESSION_INVALID" });
      expect(res.body.message).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}-\d{2}:\d{2}: /);
    }
  });

  test("만 14세 미만 → 400 + 보호자 신청 안내", async () => {
    const t = todayYmd();
    // 만 14세 생일 하루 전(= 만 13세)
    const res2 = await postRequest(lectureForm({ birth: addDays(`${Number(t.slice(0, 4)) - 14}${t.slice(4)}`, 1) }));
    expect(res2.status).toBe(400);
    expect(res2.body.message).toContain("만 14세 미만");
    // 만 14세 생일 당일은 통과
    const ok = await postRequest(lectureForm({ birth: `${Number(t.slice(0, 4)) - 14}${t.slice(4)}`, date: futureDate(5, 5) }));
    expect(ok.status).toBe(200);
  });

  test("북카페는 신청 가능(200)", async () => {
    const res = await postRequest(lectureForm({ roomId: "bookcafe", date: futureDate(2, 6), headcount: "5" }));
    expect(res.status).toBe(200);
  });
});

describe("[결3] E-스튜디오 인원", () => {
  test("4명 3시간 → estimatedFeeKRW 120,000", async () => {
    const res = await postRequest(lectureForm({ roomId: "media", date: futureDate(2, 7), startTime: "10:00", endTime: "13:00", headcount: "4" }));
    expect(res.status).toBe(200);
    expect(res.body.estimatedFeeKRW).toBe(120_000);
  });
  test("정원 12명 초과(13명) → 400", async () => {
    const res = await postRequest(lectureForm({ roomId: "media", date: futureDate(2, 7), startTime: "14:00", endTime: "16:00", headcount: "13" }));
    expect(res.status).toBe(400);
  });
});

describe("[2] 이중 예약", () => {
  test("순차: 이미 접수된 시간 → 409 BATCH_CONFLICT", async () => {
    const date = futureDate(4, 8);
    const first = await postRequest(lectureForm({ date, startTime: "10:00", endTime: "12:00" }));
    expect(first.status).toBe(200);
    const second = await postRequest(lectureForm({ date, startTime: "11:00", endTime: "13:00", email: "other@example.com" }));
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("BATCH_CONFLICT");
  });

  test("동시: 두 요청이 사전 검사를 모두 통과해도 늦은 쪽은 409 SLOT_TAKEN · 행은 취소(시스템) · 메일 0건", async () => {
    const d = db();
    const mail = require("@/lib/mail");
    const spies = [
      jest.spyOn(mail, "sendApplicantReceivedEmail"),
      jest.spyOn(mail, "sendApplicantReceivedEmailBatch"),
      jest.spyOn(mail, "sendAdminNewRequestEmail"),
      jest.spyOn(mail, "sendAdminNewRequestEmailBatch"),
    ];
    // 두 요청 모두 "저장 직전"까지 온 뒤에 저장하도록 장벽
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const origBatch = d.appendRequestsBatch.bind(d);
    d.appendRequestsBatch = async (...args: unknown[]) => {
      arrived += 1;
      if (arrived >= 2) release();
      await gate;
      return origBatch(...args);
    };
    try {
      const date = futureDate(4, 9);
      const [x, y] = await Promise.all([
        postRequest(lectureForm({ date, startTime: "10:00", endTime: "12:00", email: "x@example.com" })),
        postRequest(lectureForm({ date, startTime: "10:00", endTime: "12:00", email: "y@example.com" })),
      ]);
      const statuses = [x.status, y.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = x.status === 409 ? x : y;
      expect(loser.body.code).toBe("SLOT_TAKEN");
      expect(loser.body.token).toBeUndefined();

      const rows = (await d.getAllRequestsFresh()).filter((r: { date: string; startTime: string }) => r.date === date && r.startTime === "10:00");
      expect(rows).toHaveLength(2);
      const cancelled = rows.filter((r: { status: string }) => r.status === "취소");
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].decidedBy).toBe("시스템");
      expect(rows.filter((r: { status: string }) => r.status === "접수")).toHaveLength(1);

      // 메일: 이긴 쪽 1건(신청자·관리자 각 1회)만 — 늦은 쪽에는 접수 메일이 가지 않음
      expect(spies[0].mock.calls.length + spies[1].mock.calls.length).toBe(1);
      expect(spies[2].mock.calls.length + spies[3].mock.calls.length).toBe(1);
    } finally {
      d.appendRequestsBatch = origBatch;
      spies.forEach((s) => s.mockRestore());
    }
  });

  test("동시: 갤러리 같은 기간 → 한쪽만 200", async () => {
    const d = db();
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const orig = d.appendRequest.bind(d);
    d.appendRequest = async (...args: unknown[]) => {
      arrived += 1;
      if (arrived >= 2) release();
      await gate;
      return orig(...args);
    };
    try {
      const start = futureDate(1, 10);
      const [x, y] = await Promise.all([
        postRequest(galleryForm({ startDate: start, endDate: addDays(start, 4), email: "g1@example.com" })),
        postRequest(galleryForm({ startDate: start, endDate: addDays(start, 4), email: "g2@example.com" })),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      expect((x.status === 409 ? x : y).body.code).toBe("SLOT_TAKEN");
    } finally {
      d.appendRequest = orig;
    }
  });
});
