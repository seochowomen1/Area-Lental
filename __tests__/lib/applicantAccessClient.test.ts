/**
 * audit-fix-1 프론트 공용 함수 — 조회 권한 보관(sessionStorage)·신청 응답 처리·갤러리 달 계산
 * (testEnvironment=node → sessionStorage·localStorage는 간단한 메모리 구현으로 대신한다)
 */
import { parseApplyError, handleApplySuccess } from "@/lib/applySubmit";
import { readApplicantAccess, saveApplicantAccess, clearApplicantAccess, APPLICANT_ACCESS_KEY } from "@/lib/applicantAccess";
import { galleryMonthsForRange, formatExcludedHolidays } from "@/lib/useGalleryMonthData";
import { planGallery } from "@/lib/galleryPlan";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

function b64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

beforeEach(() => {
  (globalThis as unknown as { sessionStorage: MemStorage }).sessionStorage = new MemStorage();
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe("applicantAccess (sessionStorage 60분)", () => {
  test("신청 응답 토큰은 sessionStorage에만 저장되고 URL에는 들어가지 않는다", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${b64url({ v: 2, s: "req", e: "a@b.com", g: "R:REQ-1", exp })}.sig`;
    const url = handleApplySuccess(
      { ok: true, requestId: "REQ-1", batchId: "", count: 1, token, tokenExpiresAt: exp, estimatedFeeKRW: 100000 },
      { screenFeeKRW: 100000 }
    );
    expect(url).toBe("/success?requestId=REQ-1&fee=100000");
    expect(url).not.toContain("token");
    const access = readApplicantAccess();
    expect(access?.token).toBe(token);
    expect(access?.s).toBe("req");
    expect(access?.exp).toBe(exp);
    expect(localStorage.getItem("applicantToken")).toBeNull();
  });

  test("만료된 권한은 읽지 않고 지운다", () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    saveApplicantAccess(`${b64url({ v: 2, s: "email", e: "a@b.com", exp })}.sig`, exp);
    expect(readApplicantAccess()).toBeNull();
    expect(sessionStorage.getItem(APPLICANT_ACCESS_KEY)).toBeNull();
  });

  test("이 기기에서 조회 기록 지우기 = sessionStorage + 구형 localStorage 삭제", () => {
    localStorage.setItem("applicantToken", "old");
    saveApplicantAccess(`${b64url({ v: 2, s: "email", e: "a@b.com", exp: Math.floor(Date.now() / 1000) + 600 })}.sig`);
    clearApplicantAccess();
    expect(readApplicantAccess()).toBeNull();
    expect(localStorage.getItem("applicantToken")).toBeNull();
  });

  test("갤러리 완료 주소에는 category=gallery와 서버 금액이 붙는다", () => {
    const url = handleApplySuccess({ ok: true, requestId: "REQ-2", batchId: "BAT-1", count: 6, token: "", estimatedFeeKRW: 90000 }, { category: "gallery", screenFeeKRW: 90000 });
    expect(url).toBe("/success?requestId=REQ-2&batchId=BAT-1&count=6&category=gallery&fee=90000");
  });
});

describe("parseApplyError (신청 오류 표시)", () => {
  test("409 SLOT_TAKEN은 '신청이 접수되지 않았습니다' + 서버 원문", () => {
    const v = parseApplyError({ ok: false, code: "SLOT_TAKEN", message: "방금 다른 분이 같은 기간을 먼저 신청했습니다. 신청은 접수되지 않았습니다. 달력에서 다른 기간을 골라 주세요." }, true);
    expect(v.title).toBe("신청이 접수되지 않았습니다");
    expect(v.message).toContain("같은 기간");
    expect(v.issueLines).toEqual([]);
  });

  test("409 SLOT_TAKEN 서버 문구가 비면 spec 원문(시간/기간)", () => {
    expect(parseApplyError({ code: "SLOT_TAKEN" }, false).message).toBe(
      "방금 다른 분이 같은 시간을 먼저 신청했습니다. 신청은 접수되지 않았습니다. 달력에서 다른 시간을 골라 주세요."
    );
  });

  test("400 SESSION_INVALID는 회차별 issue를 한 줄씩", () => {
    const v = parseApplyError(
      {
        ok: false,
        code: "SESSION_INVALID",
        message: "2026-11-04 10:00-10:10: 시간은 30분 단위로만 선택할 수 있습니다.",
        issues: [
          { date: "2026-11-04", startTime: "10:00", endTime: "10:10", message: "2026-11-04 10:00-10:10: 시간은 30분 단위로만 선택할 수 있습니다." },
          { date: "2026-11-04", startTime: "10:00", endTime: "10:10", message: "2026-11-04 10:00-10:10: 최소 1시간 이상 선택해야 합니다." },
        ],
      },
      false
    );
    expect(v.issueLines).toHaveLength(2);
    expect(v.issueLines[1]).toBe("• 2026-11-04 10:00-10:10: 최소 1시간 이상 선택해야 합니다.");
  });

  test("409 BATCH_CONFLICT는 기존 형식(• 날짜 시간: 사유)", () => {
    const v = parseApplyError({ code: "BATCH_CONFLICT", message: "x", issues: [{ date: "2026-11-04", startTime: "10:00", endTime: "12:00", message: "이미 신청됨" }] }, false);
    expect(v.issueLines).toEqual(["• 2026-11-04 10:00-12:00: 이미 신청됨"]);
  });
});

describe("갤러리 달 계산·공휴일 표시", () => {
  test("12/21~26 → 11~12월 조회(준비일 후보 포함), 최대 3달", () => {
    expect(galleryMonthsForRange("2026-12-21", "2026-12-26")).toEqual(["2026-12"]);
    expect(galleryMonthsForRange("2026-12-05", "2026-12-26")).toEqual(["2026-11", "2026-12"]);
    expect(galleryMonthsForRange("2026-12-05", "2027-01-03")).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(galleryMonthsForRange("", "")).toEqual([]);
  });

  test("planGallery 결과의 빠진 공휴일 → spec ③-F 문구", () => {
    const plan = planGallery({ startDate: "2026-12-21", endDate: "2026-12-26", prepDate: null, holidays: new Set(["2026-12-25"]) });
    expect(plan.totalFeeKRW).toBe(90000);
    expect(formatExcludedHolidays(plan.excludedHolidays, new Map([["2026-12-25", "기독탄신일"]]))).toBe(
      "선택한 기간의 일요일·공휴일은 휴관이라 빠집니다: 12/25(금) 기독탄신일"
    );
    expect(formatExcludedHolidays([], new Map())).toBe("");
  });
});
