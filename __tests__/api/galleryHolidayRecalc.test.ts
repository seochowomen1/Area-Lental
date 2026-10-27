/**
 * audit-fix-2 R2 — 공휴일 상태 응답 · 신청 저장 시 holidayCheck 기록 · 갤러리 이용료 다시 계산(서버 액션)
 * 01_spec ⑥ 6-1 · 6-3 · 6-4 · 6-5 · 6-7 · 5-1 · 5-2 · 5-3
 */
import { setupMockEnv, galleryForm, postRequest, nextIp, todayYmd } from "../helpers/routeEnv";

const jar = new Map<string, string>();
jest.mock("next/headers", () => ({
  cookies: () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined) }),
  headers: () => new Headers({ "x-forwarded-for": "10.2.2.2" }),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

let env: ReturnType<typeof setupMockEnv>;
const realFetch = global.fetch;
beforeAll(() => {
  env = setupMockEnv("recalc");
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
const actions = () => require("@/app/admin/requests/[id]/actions");

async function signIn() {
  const { createAdminSession } = require("@/lib/adminSession");
  const s = await createAdminSession();
  jar.set("admin_auth", s.token);
  jar.set("admin_last_activity", s.activity);
}

async function expectRedirect(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  throw new Error("redirect 되지 않음");
}

/** 2026-12-21(월)~26(토) 갤러리 1행 — 공휴일(12/25)을 평일로 계산해 저장된 상태(평일 5 · 토 1 = 110,000원) */
async function seedGallery(audit: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const row = await db().appendRequest({
    roomId: "gallery", date: "2026-12-21", startTime: "09:00", endTime: "18:00",
    startDate: "2026-12-21", endDate: "2026-12-26", exhibitionTitle: "테스트 전시",
    galleryWeekdayCount: 5, gallerySaturdayCount: 1, galleryExhibitionDayCount: 6, galleryPrepDate: "2026-12-19",
    galleryAuditJson: JSON.stringify({ startDate: "2026-12-21", endDate: "2026-12-26", weekdayCount: 5, saturdayCount: 1, exhibitionDayCount: 6, ...audit }),
    applicantName: "홍가명", birth: "1990-01-01", address: "서울", phone: "01000000000", email: "artist@example.com",
    orgName: "개인", headcount: 10, equipment: { laptop: false, projector: false, audio: false }, purpose: "테스트",
    attachments: [], privacyAgree: true, pledgeAgree: true, pledgeDate: "2026-10-27", pledgeName: "홍가명",
  });
  if (extra.status) await db().updateRequestStatus({ requestId: row.requestId, status: extra.status, decidedBy: "시설총무" });
  if (extra.patch) await db().updateRequestPayment({ requestId: row.requestId, patch: extra.patch });
  return row.requestId as string;
}

describe("5-1 GET /api/booked-dates — holidayStatus · today · availableDayCount", () => {
  test("6-1: 키 없음 → fallback · 12/25 포함 · 키·URL 노출 없음", async () => {
    const { GET } = require("@/app/api/booked-dates/route");
    const res: Response = await GET(new Request("http://localhost/api/booked-dates?roomId=gallery&month=2026-12", { headers: { "x-forwarded-for": nextIp() } }));
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.holidayStatus).toBe("fallback");
    expect(body.holidays).toEqual(expect.arrayContaining([{ date: "2026-12-25", name: "기독탄신일" }]));
    expect(body.today).toBe(todayYmd());
    expect(typeof body.availableDayCount).toBe("number");
    expect(text).not.toMatch(/data\.go\.kr|ServiceKey|DATA_GO_KR/);
  });

  test("availableDayCount = lib/galleryCalendar 규칙과 같은 값", async () => {
    const { countGallerySelectableDays } = require("@/lib/galleryCalendar");
    const { GET } = require("@/app/api/booked-dates/route");
    const res: Response = await GET(new Request("http://localhost/api/booked-dates?roomId=gallery&month=2027-02", { headers: { "x-forwarded-for": nextIp() } }));
    const body = await res.json();
    const expected = countGallerySelectableDays("2027-02", {
      today: body.today,
      booked: new Set(body.bookedDates),
      holidays: new Set(body.holidays.map((h: { date: string }) => h.date)),
    });
    expect(body.availableDayCount).toBe(expected);
    // 2027-02: 28일 − 일요일 4 − 공휴일(일요일 아닌) 3(2/6 토·2/8·2/9) = 21 (예약 없음 가정)
    expect(body.availableDayCount).toBe(21 - body.bookedDates.length);
  });

  test("강의실은 availableDayCount 없음 · holidayStatus·today는 있음 · 잘못된 month 400", async () => {
    const { GET } = require("@/app/api/booked-dates/route");
    const res: Response = await GET(new Request("http://localhost/api/booked-dates?roomId=sangsang1&month=2026-12", { headers: { "x-forwarded-for": nextIp() } }));
    const body = await res.json();
    expect(body.holidayStatus).toBe("fallback");
    expect(body.today).toBe(todayYmd());
    expect(body).not.toHaveProperty("availableDayCount");
    const bad: Response = await GET(new Request("http://localhost/api/booked-dates?roomId=gallery&month=2026-1", { headers: { "x-forwarded-for": nextIp() } }));
    expect(bad.status).toBe(400);
  });
});

describe("5-2 POST /api/requests (갤러리) — holidayCheck 기록", () => {
  test("6-3: 응답 holidayCheck = galleryAuditJson.holidayCheck · holidayMonths 기록 · 제출은 막지 않음", async () => {
    const r = await postRequest(galleryForm({}));
    expect(r.status).toBe(200);
    expect(["ok", "stale", "fallback", "unavailable"]).toContain(r.body.holidayCheck);
    const saved = await db().getRequestById(r.body.requestId);
    const audit = JSON.parse(saved.galleryAuditJson);
    expect(audit.holidayCheck).toBe(r.body.holidayCheck);
    expect(audit.holidayMonths[0]).toBe(saved.startDate.slice(0, 7));
    expect(audit.holidayMonths[audit.holidayMonths.length - 1]).toBe(saved.endDate.slice(0, 7));
  });
});

describe("5-3 recalcGalleryFeeAction", () => {
  test("6-4: unavailable 건 → 110,000 → 90,000 · recalcFrom·recalculatedAt · 다른 행 변경 0 · 감사 로그 1건", async () => {
    await signIn();
    require("@/lib/holidays")._primeHolidaysForTest([{ date: "2026-12-25", name: "기독탄신일" }]);
    const id = await seedGallery({ holidayCheck: "unavailable", holidayMonths: ["2026-12"] });
    const otherId = await seedGallery({ holidayCheck: "unavailable", holidayMonths: ["2026-12"] });
    const othersBefore = JSON.stringify((await db().getAllRequests()).filter((r: { requestId: string }) => r.requestId !== id));

    const { getGalleryRecalcView } = require("@/lib/galleryRecalc");
    const view = await getGalleryRecalcView(await db().getRequestById(id));
    expect(view.showBanner).toBe(true);
    expect(view.bannerLevel).toBe("strong");
    expect(view.canRecalc).toBe(true);
    expect(view.before).toEqual({ weekdayCount: 5, saturdayCount: 1, exhibitionDayCount: 6, feeKRW: 110000 });
    expect(view.after).toEqual({ weekdayCount: 4, saturdayCount: 1, exhibitionDayCount: 5, feeKRW: 90000 });
    expect(view.periodHolidays).toEqual([{ date: "2026-12-25", name: "기독탄신일", label: "12/25(금) 기독탄신일" }]);

    const audit = require("@/lib/auditLog");
    const auditSpy = jest.spyOn(audit, "recordAudit");
    const url = await expectRedirect(actions().recalcGalleryFeeAction(id, new FormData()));
    expect(url).toContain("saved=recalc");
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0][0]).toMatchObject({ action: "GALLERY_FEE_RECALC", target: id });
    auditSpy.mockRestore();

    const after = await db().getRequestById(id);
    expect(after.galleryWeekdayCount).toBe(4);
    expect(after.gallerySaturdayCount).toBe(1);
    expect(after.galleryExhibitionDayCount).toBe(5);
    const { computeFeesForRequest } = require("@/lib/pricing");
    expect(computeFeesForRequest(after).totalFeeKRW).toBe(90000);
    const a = JSON.parse(after.galleryAuditJson);
    expect(a.holidayCheck).toBe("ok");
    expect(a.recalcFrom).toEqual({ weekdayCount: 5, saturdayCount: 1, feeKRW: 110000 });
    expect(typeof a.recalculatedAt).toBe("string");
    expect(a.startDate).toBe("2026-12-21"); // 기존 감사 값 유지

    expect(JSON.stringify((await db().getAllRequests()).filter((r: { requestId: string }) => r.requestId !== id))).toBe(othersBefore);
    expect(otherId).not.toBe(id);

    // 다시 누르면(이미 ok) 조건 밖
    expect(await expectRedirect(actions().recalcGalleryFeeAction(id, new FormData()))).toContain("formError=recalcNotAllowed");
  });

  test("Q7: 승인 + 결제 안내 전이면 허용", async () => {
    await signIn();
    const id = await seedGallery({ holidayCheck: "fallback" }, { status: "승인" });
    const { getGalleryRecalcView } = require("@/lib/galleryRecalc");
    const view = await getGalleryRecalcView(await db().getRequestById(id));
    expect(view.bannerLevel).toBe("weak");
    expect(view.statusAllowed).toBe(true);
    expect(await expectRedirect(actions().recalcGalleryFeeAction(id, new FormData()))).toContain("saved=recalc");
  });

  test("6-5: 승인 + 결제 안내 발송 후 → 버튼 없음(statusAllowed=false) · 액션 직접 호출도 recalcNotAllowed · 값 그대로", async () => {
    await signIn();
    const id = await seedGallery({ holidayCheck: "unavailable" }, { status: "승인", patch: { paymentNoticeSentAt: "2026-10-27T10:00:00+09:00" } });
    const { getGalleryRecalcView } = require("@/lib/galleryRecalc");
    const view = await getGalleryRecalcView(await db().getRequestById(id));
    expect(view.showBanner).toBe(true);
    expect(view.statusAllowed).toBe(false);
    expect(view.canRecalc).toBe(false);
    expect(view.blockReason).toBe("notAllowedStatus");
    const spy = jest.spyOn(db(), "updateGalleryFee");
    expect(await expectRedirect(actions().recalcGalleryFeeAction(id, new FormData()))).toContain("formError=recalcNotAllowed");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect((await db().getRequestById(id)).galleryWeekdayCount).toBe(5);
  });

  test.each([["반려"], ["취소"]])("%s 건도 recalcNotAllowed", async (status) => {
    await signIn();
    const id = await seedGallery({ holidayCheck: "unavailable" }, { status });
    expect(await expectRedirect(actions().recalcGalleryFeeAction(id, new FormData()))).toContain("formError=recalcNotAllowed");
  });

  test("holidayCheck 값 없음(기존 행) = ok → 배너 없음 · recalcNotAllowed(소급 없음)", async () => {
    await signIn();
    const id = await seedGallery({});
    const { getGalleryRecalcView } = require("@/lib/galleryRecalc");
    const view = await getGalleryRecalcView(await db().getRequestById(id));
    expect(view.holidayCheck).toBe("ok");
    expect(view.showBanner).toBe(false);
    expect(await expectRedirect(actions().recalcGalleryFeeAction(id, new FormData()))).toContain("formError=recalcNotAllowed");
  });

  test("기간에 공휴일 없음 → noChange(버튼 없음) · 액션은 recalcNoChange", async () => {
    await signIn();
    const row = await db().appendRequest({
      roomId: "gallery", date: "2026-11-23", startTime: "09:00", endTime: "18:00",
      startDate: "2026-11-23", endDate: "2026-11-28", exhibitionTitle: "공휴일 없음",
      galleryWeekdayCount: 5, gallerySaturdayCount: 1, galleryExhibitionDayCount: 6,
      galleryAuditJson: JSON.stringify({ holidayCheck: "unavailable" }),
      applicantName: "홍가명", birth: "1990-01-01", address: "서울", phone: "01000000000", email: "a@example.com",
      orgName: "개인", headcount: 1, equipment: { laptop: false, projector: false, audio: false }, purpose: "t",
      attachments: [], privacyAgree: true, pledgeAgree: true, pledgeDate: "2026-10-27", pledgeName: "홍가명",
    });
    const { getGalleryRecalcView } = require("@/lib/galleryRecalc");
    const view = await getGalleryRecalcView(await db().getRequestById(row.requestId));
    expect(view.periodHolidays).toEqual([]);
    expect(view.blockReason).toBe("noChange");
    expect(await expectRedirect(actions().recalcGalleryFeeAction(row.requestId, new FormData()))).toContain("formError=recalcNoChange");
  });

  test("지금도 공휴일 조회 불가(표 밖 해) → holidayUnavailable", async () => {
    await signIn();
    const row = await db().appendRequest({
      roomId: "gallery", date: "2028-03-06", startTime: "09:00", endTime: "18:00",
      startDate: "2028-03-06", endDate: "2028-03-08", exhibitionTitle: "표 밖",
      galleryWeekdayCount: 3, gallerySaturdayCount: 0, galleryExhibitionDayCount: 3,
      galleryAuditJson: JSON.stringify({ holidayCheck: "unavailable" }),
      applicantName: "홍가명", birth: "1990-01-01", address: "서울", phone: "01000000000", email: "a@example.com",
      orgName: "개인", headcount: 1, equipment: { laptop: false, projector: false, audio: false }, purpose: "t",
      attachments: [], privacyAgree: true, pledgeAgree: true, pledgeDate: "2026-10-27", pledgeName: "홍가명",
    });
    const { getGalleryRecalcView } = require("@/lib/galleryRecalc");
    const view = await getGalleryRecalcView(await db().getRequestById(row.requestId));
    expect(view.nowStatus).toBe("unavailable");
    expect(view.after).toBeNull();
    expect(await expectRedirect(actions().recalcGalleryFeeAction(row.requestId, new FormData()))).toContain("formError=holidayUnavailable");
  });

  test("시트 쓰기 실패 → sheetBusy · 감사 기록 없음", async () => {
    await signIn();
    const id = await seedGallery({ holidayCheck: "unavailable" });
    const fail = jest.spyOn(db(), "updateGalleryFee").mockRejectedValue(new Error("Quota exceeded"));
    const audit = require("@/lib/auditLog");
    const auditSpy = jest.spyOn(audit, "recordAudit");
    expect(await expectRedirect(actions().recalcGalleryFeeAction(id, new FormData()))).toContain("formError=sheetBusy");
    expect(auditSpy).not.toHaveBeenCalled();
    fail.mockRestore();
    auditSpy.mockRestore();
  });

  test("무인증 → /admin/login · DB 조회 없음", async () => {
    jar.clear();
    const spy = jest.spyOn(db(), "getRequestById");
    expect(await expectRedirect(actions().recalcGalleryFeeAction("REQ-X", new FormData()))).toBe("/admin/login");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
