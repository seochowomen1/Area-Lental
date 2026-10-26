/**
 * 복지종합시스템 등록용 복사 텍스트 — 포맷·마스킹·요일 제외 (가명 픽스처)
 */
import type { RentalRequest } from "@/lib/types";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import {
  maskNameMiddle,
  formatShortDateKo,
  formatShortRangeKo,
  weekdaysOf,
  galleryExhibitionDates,
  buildWelfareCopy,
  buildProgramName,
  displayNameFor,
} from "@/lib/welfareCopy";

// 공휴일 캐시를 테스트에서 직접 주입 (API 키 없이)
const HOLIDAYS = new Set<string>();
jest.mock("@/lib/holidays", () => ({
  isHolidayCached: (d: string) => HOLIDAYS.has(d),
  getHolidayNameCached: () => null,
  ensureHolidaysLoaded: async () => {},
}));

function base(over: Partial<RentalRequest>): RentalRequest {
  return {
    requestId: "REQ-20261020-7K3M9Q2A",
    createdAt: "2026-10-20T10:00:00.000Z",
    roomId: "gallery",
    roomName: "우리동네 갤러리",
    date: "2026-10-29",
    startTime: "09:00",
    endTime: "18:00",
    applicantName: "이가영",
    birth: "1990-01-01",
    address: "서울시 서초구 ***",
    phone: "010-0000-0000",
    email: "gallery-applicant@example.com",
    orgName: "개인",
    headcount: 1,
    equipment: { laptop: false, projector: false, audio: false },
    purpose: "테스트",
    attachments: [],
    privacyAgree: true,
    pledgeAgree: true,
    pledgeDate: "2026-10-20",
    pledgeName: "이가영",
    status: "승인",
    adminMemo: "",
    rejectReason: "",
    decidedAt: "2026-10-20T14:00:00.000Z",
    decidedBy: "시설총무",
    ...over,
  };
}

const GALLERY = base({
  startDate: "2026-10-29",
  endDate: "2026-11-03",
  galleryPrepDate: "2026-10-28",
  galleryWeekdayCount: 4,
  gallerySaturdayCount: 1,
  galleryExhibitionDayCount: 5,
});

function lectureSession(seq: number, date: string, status: RentalRequest["status"], start = "14:00", end = "16:00"): RentalRequest {
  return base({
    requestId: `REQ-20261101-B000000${seq}`,
    batchId: "BATCH-TEST-1",
    batchSeq: seq,
    batchSize: 3,
    roomId: "classroom_all",
    roomName: "모두의교실",
    date,
    startTime: start,
    endTime: end,
    applicantName: "박민수",
    pledgeName: "박민수",
    status,
    decidedAt: status === "접수" ? "" : "2026-11-01T09:00:00.000Z",
    decidedBy: status === "접수" ? "" : "시설총무",
    rejectReason: status === "반려" ? "일정 중복" : "",
  });
}

beforeEach(() => HOLIDAYS.clear());

describe("maskNameMiddle", () => {
  test("2자 → 김*", () => expect(maskNameMiddle("김구")).toBe("김*"));
  test("3자 → 이*영", () => expect(maskNameMiddle("이가영")).toBe("이*영"));
  test("4자 → 남**수", () => expect(maskNameMiddle("남궁민수")).toBe("남**수"));
  test("1자·빈값은 그대로", () => {
    expect(maskNameMiddle("김")).toBe("김");
    expect(maskNameMiddle("")).toBe("");
  });
  test("단체는 단체명 그대로 · 개인/'-'는 마스킹", () => {
    expect(displayNameFor({ orgName: "OO어린이집", applicantName: "이가영" })).toBe("OO어린이집");
    expect(displayNameFor({ orgName: "개인", applicantName: "이가영" })).toBe("이*영");
    expect(displayNameFor({ orgName: "-", applicantName: "이가영" })).toBe("이*영");
    expect(displayNameFor({ orgName: "", applicantName: "이가영" })).toBe("이*영");
  });
});

describe("formatShortDateKo", () => {
  test("yy.m.d.(요일) · 0 채우기 없음", () => {
    expect(formatShortDateKo("2026-10-29")).toBe("26.10.29.(목)");
    expect(formatShortDateKo("2026-11-03")).toBe("26.11.3.(화)");
  });
  test("시작=종료면 한 번만", () => {
    expect(formatShortRangeKo("2026-11-06", "2026-11-06")).toBe("26.11.6.(금)");
    expect(formatShortRangeKo("2026-10-29", "2026-11-03")).toBe("26.10.29.(목)~26.11.3.(화)");
  });
});

describe("요일 집합", () => {
  test("월→일 순서 · 중복 제거", () => {
    expect(weekdaysOf(["2026-11-06", "2026-11-13", "2026-11-03"])).toEqual(["화", "금"]);
  });
  test("갤러리 전시일: 일요일·공휴일·준비일 제외", () => {
    HOLIDAYS.add("2026-10-30");
    const dates = galleryExhibitionDates("2026-10-28", "2026-11-03", "2026-10-28");
    expect(dates).toEqual(["2026-10-29", "2026-10-31", "2026-11-02", "2026-11-03"]);
    expect(weekdaysOf(dates)).toEqual(["월", "화", "목", "토"]);
  });
});

describe("buildWelfareCopy — 갤러리 1행형", () => {
  test("spec ③-(가)-1 원문 순서·라벨·값", () => {
    const { text, fields } = buildWelfareCopy([GALLERY], { todayYmd: "2026-10-26", nowIso: "2026-10-26T05:02:11.000Z" });
    const lines = text.split("\n");
    expect(lines[0]).toBe("■ 복지종합시스템PLUS > 유료이용자 > 프로그램관리");
    expect(lines[1]).toBe("프로그램명: [전시]26.10.29.(목)~26.11.3.(화) 우리동네갤러리(이*영)");
    expect(lines[2]).toBe("식권발행여부: 미체크");
    expect(lines[3]).toBe("년도: 2026");
    expect(lines[4]).toBe("프로그램분류: 문화나눔 (04-07)");
    expect(lines[5]).toBe("사회복지통합관리표준코드: (공란)");
    expect(lines[6]).toBe("요일: 월, 화, 목, 금, 토");
    expect(lines[7]).toBe("시간: 09:00 ~ 18:00");
    expect(lines[8]).toBe("유/무료구분: 유료");
    expect(lines[9]).toBe("P/G구분: 단기");
    expect(lines[10]).toBe("기간: 0개월 5일");
    expect(lines[11]).toBe(`금액: ${computeFeesForRequest(GALLERY).finalFeeKRW.toLocaleString("ko-KR")}`);
    expect(lines[12]).toBe("인원: 목표(년) 1명 / 마감(월) 1명 · 마감시 접수 불가능");
    expect(lines[13]).toBe("접수기간: 2026-10-20 ~ 2026-10-27");
    expect(lines[14]).toBe("개강일자: 2026-10-29");
    expect(lines[15]).toBe("입장권판매: 아님");
    expect(lines[16]).toBe("내용: [전시]26.10.29.(목)~26.11.3.(화) 우리동네갤러리(이*영)");
    expect(lines[17]).toBe("비고 / 교육장소: (공란)");
    expect(lines[18]).toBe("");
    expect(lines[19]).toBe("■ 홈페이지 관리자 > 등록대기강좌 > 등록하기");
    expect(lines[20]).toBe("카테고리: 26.기타 / 1.기타");
    expect(lines[21]).toBe("기수: 1");
    expect(lines[22]).toBe("웹게시: 게시");
    expect(lines[23]).toBe("마감여부: 진행");
    expect(lines[24]).toBe("학기구분: 3개월 접수");
    expect(lines[25]).toBe("강의기간: 2026-10-29 ~ 2026-11-03");
    expect(lines[26]).toBe("접수기간: 2026-10-20 ~ 2026-10-27");
    expect(lines[27]).toBe("접수시간: 09:00");
    expect(lines[28]).toBe("대상: 제한없음");
    expect(lines[29]).toBe("장소 / 강사: (공란)");
    expect(lines[30]).toBe("");
    expect(lines[31]).toBe("※ 대관 앱 신청번호 REQ-20261020-7K3M9Q2A · 승인 회차 기준 금액 · 복사 2026-10-26 14:02");
    expect(lines).toHaveLength(32);

    expect(fields.basis).toBe("approved");
    expect(fields.welfare.weekdays).toEqual(["월", "화", "목", "금", "토"]);
    expect(fields.welfare.periodDays).toBe(5);
    expect(fields.welfare.amountKRW).toBe(90000);
    expect(fields.homepage.courseTo).toBe("2026-11-03");
    // 개인정보 없음
    expect(JSON.stringify(fields)).not.toMatch(/example\.com|010-|서초구|1990/);
  });

  test("저장된 paymentDueDate가 있으면 접수기간 종료일로", () => {
    const { fields } = buildWelfareCopy([{ ...GALLERY, paymentDueDate: "2026-11-10" }], { todayYmd: "2026-10-26" });
    expect(fields.welfare.receiptTo).toBe("2026-11-10");
    expect(fields.homepage.receiptTo).toBe("2026-11-10");
  });

  test("공휴일이 전시 기간에 있으면 요일에서 빠진다", () => {
    HOLIDAYS.add("2026-10-30"); // 금
    const { fields } = buildWelfareCopy([GALLERY], { todayYmd: "2026-10-26" });
    expect(fields.welfare.weekdays).toEqual(["월", "화", "목", "토"]);
  });
});

describe("buildWelfareCopy — 강의실 묶음", () => {
  const sessions = [
    lectureSession(1, "2026-11-06", "승인"),
    lectureSession(2, "2026-11-13", "반려"),
    lectureSession(3, "2026-11-27", "승인"),
  ];

  test("승인 회차 기준 · [대관] · 기간 0개월 2일 · 금액 = 승인 2회 할인 반영", () => {
    const { text, fields } = buildWelfareCopy(sessions, { todayYmd: "2026-11-02" });
    expect(fields.basis).toBe("approved");
    expect(fields.approvedCount).toBe(2);
    expect(fields.totalCount).toBe(3);
    expect(fields.welfare.programName).toBe("[대관]26.11.6.(금)~26.11.27.(금) 모두의교실(박*수)");
    expect(fields.welfare.weekdays).toEqual(["금"]);
    expect(fields.welfare.startTime).toBe("14:00");
    expect(fields.welfare.endTime).toBe("16:00");
    expect(fields.welfare.periodDays).toBe(2);
    const approved = sessions.filter((s) => s.status === "승인");
    expect(fields.welfare.amountKRW).toBe(computeFeesForBundle(approved).finalFeeKRW);
    expect(text).toContain("기간: 0개월 2일");
    expect(text).toContain("개강일자: 2026-11-06");
    expect(text).toContain("강의기간: 2026-11-06 ~ 2026-11-27");
    expect(text).toContain("접수기간: 2026-11-01 ~ 2026-11-08");
    expect(text).not.toContain("※ 승인 전 복사");
  });

  test("단체 신청은 단체명 그대로", () => {
    const org = sessions.map((s) => ({ ...s, orgName: "OO어린이집" }));
    expect(buildProgramName(org.filter((s) => s.status === "승인"))).toBe("[대관]26.11.6.(금)~26.11.27.(금) 모두의교실(OO어린이집)");
  });

  test("회차별 시간이 다르면 가장 이른 시작~가장 늦은 종료 + 상이 주석", () => {
    const mixed = [lectureSession(1, "2026-11-06", "승인"), lectureSession(2, "2026-11-13", "승인", "15:00", "17:00")];
    const { text, fields } = buildWelfareCopy(mixed, { todayYmd: "2026-11-02" });
    expect(fields.welfare.startTime).toBe("14:00");
    expect(fields.welfare.endTime).toBe("17:00");
    expect(fields.welfare.timeNote).toBe("※ 회차별 시간 상이: 26.11.6.(금) 14:00~16:00 · 26.11.13.(금) 15:00~17:00");
    const lines = text.split("\n");
    expect(lines[lines.indexOf("시간: 14:00 ~ 17:00") + 1]).toBe(fields.welfare.timeNote);
  });

  test("승인 전(접수) 복사: 첫 줄 주석 · 전체 기준 · 접수 시작=오늘", () => {
    const pending = sessions.map((s) => ({ ...s, status: "접수" as const, decidedAt: "", decidedBy: "" }));
    const { text, fields } = buildWelfareCopy(pending, { todayYmd: "2026-11-02" });
    expect(text.split("\n")[0]).toBe("※ 승인 전 복사: 전체 3회 기준 금액입니다. 승인 후 다시 복사하세요.");
    expect(fields.basis).toBe("all");
    expect(fields.welfare.periodDays).toBe(3);
    expect(fields.welfare.receiptFrom).toBe("2026-11-02");
    expect(text).toContain("전체 3회 기준 금액 · 복사");
  });

  test("0원이면 무료", () => {
    const free = [{ ...GALLERY, galleryWeekdayCount: 0, gallerySaturdayCount: 0, galleryExhibitionDayCount: 1, startDate: "2026-11-01", endDate: "2026-11-01" }];
    const { text, fields } = buildWelfareCopy(free, { todayYmd: "2026-10-26" });
    expect(fields.welfare.paid).toBe(false);
    expect(text).toContain("유/무료구분: 무료");
  });
});
