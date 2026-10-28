/**
 * 갤러리 온라인 신청 — 준비일 필수(2026-10-28 사용자 "무조건 최소 전날")
 */
import { setupMockEnv, galleryForm, postRequest, todayYmd, futureDate, addDays } from "../helpers/routeEnv";

jest.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
  headers: () => new Headers({ "x-forwarded-for": "10.3.3.3" }),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

let env: ReturnType<typeof setupMockEnv>;
const realFetch = global.fetch;
beforeAll(() => {
  env = setupMockEnv("preprequired");
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

describe("갤러리 준비일 필수", () => {
  test("준비일을 비워 보내도 전날 준비일이 자동으로 잡힌다", async () => {
    const start = futureDate(3, 6); // 수요일
    const r = await postRequest(galleryForm({ startDate: start, endDate: addDays(start, 2), galleryPrepDate: "" }));
    expect(r.status).toBe(200);
    const saved = await db().getRequestById(r.body.requestId);
    expect(saved.galleryPrepDate).toBe(addDays(start, -1));
  });

  test("내일 시작(준비일이 오늘)은 400", async () => {
    const start = addDays(todayYmd(), 1);
    const r = await postRequest(galleryForm({ startDate: start, endDate: addDays(start, 2) }));
    expect(r.status).toBe(400);
  });
});
