/**
 * audit-fix-3 3-4 (⑧ Q6) — 서면 등록을 강의실·E-스튜디오까지
 *  - 관리자 쿠키 + intake=offline → 강의실 지난 날짜도 200 · 행에 intakeChannel·appliedAt·intakeNote 저장
 *  - 무인증 → 401 · 온라인 신청은 지난 날짜 400 그대로
 */
import { setupMockEnv, lectureForm, postRequest, addDays, todayYmd } from "../helpers/routeEnv";

let env: ReturnType<typeof setupMockEnv>;
const realFetch = global.fetch;

beforeAll(() => {
  env = setupMockEnv("offlec");
  delete process.env.HOLIDAY_API_KEY;
  delete process.env.DATA_GO_KR_API_KEY;
  global.fetch = (async () => {
    throw new Error("network disabled in test");
  }) as typeof fetch;
});
afterAll(() => {
  global.fetch = realFetch;
  env.restore();
});

const db = () => require("@/lib/database").getDatabase();

async function adminCookie(): Promise<string> {
  const { createAdminSession } = require("@/lib/adminSession");
  const s = await createAdminSession();
  return `admin_auth=${encodeURIComponent(s.token)}; admin_last_activity=${encodeURIComponent(s.activity)}`;
}

/** 오늘보다 앞선 평일(월~금, 화 제외 아님) */
function pastWeekday(): string {
  let d = addDays(todayYmd(), -7);
  for (let i = 0; i < 7; i++) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5) return d;
    d = addDays(d, -1);
  }
  return d;
}

describe("서면 등록 — 강의실·E-스튜디오", () => {
  test("관리자 + 강의실 지난 날짜 → 200 · 서면 메타 저장", async () => {
    const date = pastWeekday();
    const res = await postRequest(
      lectureForm({ roomId: "sangsang2", date, startTime: "10:00", endTime: "12:00", intake: "offline", intakeChannel: "email", appliedAt: addDays(date, -3), intakeNote: "메일 접수" }),
      { cookie: await adminCookie() }
    );
    expect(res.status).toBe(200);
    const rows = (await db().getAllRequests()).filter((r: { roomId: string; date: string }) => r.roomId === "sangsang2" && r.date === date);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ intakeChannel: "email", appliedAt: addDays(date, -3), intakeNote: "메일 접수" });
  });

  test("관리자 + E-스튜디오 2회차 → 200 · 묶음 행 모두 서면 메타", async () => {
    const d1 = addDays(todayYmd(), 21);
    const d2 = addDays(d1, 7);
    const fix = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? addDays(d, 1) : d);
    const sessions = JSON.stringify([
      { date: fix(d1), startTime: "10:00", endTime: "12:00" },
      { date: fix(d2), startTime: "10:00", endTime: "12:00" },
    ]);
    const res = await postRequest(
      lectureForm({ roomId: "media", date: fix(d1), headcount: "2", sessions, intake: "offline", intakeChannel: "visit", appliedAt: todayYmd() }),
      { cookie: await adminCookie() }
    );
    expect(res.status).toBe(200);
    const rows = (await db().getAllRequests()).filter((r: { roomId: string }) => r.roomId === "media");
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.intakeChannel).toBe("visit");
  });

  test("무인증 강의실 서면 등록 → 401", async () => {
    const res = await postRequest(lectureForm({ roomId: "sangsang1", intake: "offline", intakeChannel: "visit", appliedAt: todayYmd() }));
    expect(res.status).toBe(401);
  });

  test("온라인 신청은 지난 날짜 그대로 400", async () => {
    const res = await postRequest(lectureForm({ roomId: "sangsang3", date: pastWeekday() }));
    expect(res.status).toBe(400);
  });
});
