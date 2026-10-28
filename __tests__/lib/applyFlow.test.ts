/**
 * 3-4 신청 3단 — 순수 함수 테스트
 * 일정 주소(새 s= · 예전 date&start&end · 갤러리) · 생년월일 8자리 · 이어서 쓰기(화이트리스트) · 전송 데이터 형식
 */
import {
  applyHrefForSessions,
  decodeSessions,
  encodeSessions,
  fallbackHrefForInvalid,
  formatSessionLine,
  formatSessionsSummary,
  parseApplySchedule,
  spaceHrefWithSessions,
} from "@/lib/apply/schedule";
import { BIRTH8_ERROR, birthLabel, cleanBirthDigits, parseBirth8 } from "@/lib/apply/birth";
import {
  applyDraftToValues,
  DRAFT_EXCLUDED_FIELDS,
  draftHasContent,
  draftKey,
  parseDraft,
  pickDraft,
} from "@/lib/apply/draft";
import {
  buildGalleryRaw,
  buildLectureRaw,
  composeGalleryPurpose,
  defaultApplyValues,
  orderedErrorKeys,
  validateApply,
  type ApplyFormValues,
} from "@/lib/apply/form";
import { RequestInputSchema, GalleryRequestInputSchema } from "@/lib/schema";

const q = (s: string) => new URLSearchParams(s);

describe("일정 주소 해석", () => {
  test("새 주소 s= 여러 회차 → 정렬·중복 제거", () => {
    const p = parseApplySchedule(q("roomId=sangsang1&s=2026-11-14_1400-1600,2026-11-07_1400-1600,2026-11-07_1400-1600"));
    expect(p).toEqual({
      kind: "lecture",
      roomId: "sangsang1",
      legacy: false,
      sessions: [
        { date: "2026-11-07", startTime: "14:00", endTime: "16:00" },
        { date: "2026-11-14", startTime: "14:00", endTime: "16:00" },
      ],
    });
  });

  test("예전 주소 date&start&end → 1회차(수용 10)", () => {
    const p = parseApplySchedule(q("roomId=sangsang1&date=2026-11-07&start=14:00&end=16:00"));
    expect(p).toEqual({ kind: "lecture", roomId: "sangsang1", legacy: true, sessions: [{ date: "2026-11-07", startTime: "14:00", endTime: "16:00" }] });
  });

  test("E-스튜디오도 같은 해석", () => {
    const p = parseApplySchedule(q("roomId=media&s=2026-11-05_1000-1300"));
    expect(p.kind).toBe("lecture");
  });

  test("일정 없는 예전 주소 → 오류 문구 없이 2단계(3-4 검수 L-3)", () => {
    for (const s of ["roomId=sangsang1", "roomId=gallery"]) {
      const p = parseApplySchedule(q(s));
      expect(p.kind).toBe("invalid");
      if (p.kind === "invalid") expect(fallbackHrefForInvalid(p)).toBe(`/space/${s.split("=")[1]}`);
    }
  });

  test("잘못된 값 → invalid(2단계로 되돌림)", () => {
    for (const s of [
      "roomId=sangsang1&s=2026-11-31_1400-1600", // 없는 날짜
      "roomId=sangsang1&s=2026-11-07_1600-1400", // 역순
      "roomId=sangsang1&s=2026-11-07_14-16", // 형식
      "roomId=sangsang1&date=2026-11-07&start=9:00&end=10:00",
    ]) {
      const p = parseApplySchedule(q(s));
      expect(p.kind).toBe("invalid");
      if (p.kind === "invalid") expect(fallbackHrefForInvalid(p)).toBe("/space/sangsang1?err=schedule");
    }
  });

  test("21회 이상은 invalid(최대 20회)", () => {
    const tokens = Array.from({ length: 21 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}_1000-1100`).join(",");
    expect(parseApplySchedule(q(`roomId=sangsang1&s=${tokens}`)).kind).toBe("invalid");
    const ok = Array.from({ length: 20 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}_1000-1100`).join(",");
    expect(parseApplySchedule(q(`roomId=sangsang1&s=${ok}`)).kind).toBe("lecture");
  });

  test("공간 없음·모르는 공간 → 홈", () => {
    const a = parseApplySchedule(q(""));
    const b = parseApplySchedule(q("roomId=nope&s=2026-11-07_1400-1600"));
    expect(a.kind).toBe("invalid");
    expect(b.kind).toBe("invalid");
    if (a.kind === "invalid") expect(fallbackHrefForInvalid(a)).toBe("/");
    if (b.kind === "invalid") expect(fallbackHrefForInvalid(b)).toBe("/");
  });

  test("갤러리: startDate·endDate(+prepDate) · 예전 category=gallery 주소", () => {
    expect(parseApplySchedule(q("roomId=gallery&startDate=2026-11-10&endDate=2026-11-13&prepDate=2026-11-09"))).toEqual({
      kind: "gallery",
      startDate: "2026-11-10",
      endDate: "2026-11-13",
      prepDate: "2026-11-09",
    });
    expect(parseApplySchedule(q("category=gallery&startDate=2026-11-10&endDate=2026-11-13"))).toEqual({
      kind: "gallery",
      startDate: "2026-11-10",
      endDate: "2026-11-13",
      prepDate: null,
    });
    // 준비일이 시작일 이후면 버림(기본 준비일로)
    expect(parseApplySchedule(q("roomId=gallery&startDate=2026-11-10&endDate=2026-11-13&prepDate=2026-11-11"))).toMatchObject({ prepDate: null });
    // 31일 이상·역순 → invalid
    expect(parseApplySchedule(q("roomId=gallery&startDate=2026-11-01&endDate=2026-12-01")).kind).toBe("invalid");
    expect(parseApplySchedule(q("roomId=gallery&startDate=2026-11-13&endDate=2026-11-10")).kind).toBe("invalid");
  });

  test("만들기 ↔ 해석 왕복 · 2단계 주소", () => {
    const sessions = [
      { date: "2026-11-13", startTime: "14:00", endTime: "16:00" },
      { date: "2026-11-06", startTime: "10:30", endTime: "12:00" },
    ];
    const enc = encodeSessions(sessions);
    expect(enc).toBe("2026-11-06_1030-1200,2026-11-13_1400-1600");
    expect(decodeSessions(enc)).toEqual([sessions[1], sessions[0]]);
    expect(applyHrefForSessions("sangsang1", sessions)).toBe(`/apply?roomId=sangsang1&s=${encodeURIComponent(enc)}`);
    expect(spaceHrefWithSessions("sangsang1", sessions)).toBe(`/space/sangsang1?s=${encodeURIComponent(enc)}`);
    expect(spaceHrefWithSessions("sangsang1", [])).toBe("/space/sangsang1");
  });

  test("표기: 11월 6일(금) 14:00~16:00 외 2회", () => {
    const list = [
      { date: "2026-11-06", startTime: "14:00", endTime: "16:00" },
      { date: "2026-11-13", startTime: "14:00", endTime: "16:00" },
      { date: "2026-11-20", startTime: "14:00", endTime: "16:00" },
    ];
    expect(formatSessionLine(list[0])).toBe("11월 6일(금) 14:00~16:00");
    expect(formatSessionsSummary(list)).toBe("11월 6일(금) 14:00~16:00 외 2회");
    expect(formatSessionsSummary(list.slice(0, 1))).toBe("11월 6일(금) 14:00~16:00");
  });
});

describe("생년월일 8자리(Q7)", () => {
  const now = new Date("2026-10-28T03:00:00Z");
  test("19650312 → 1965년 3월 12일 · 저장 형식 1965-03-12(수용 8)", () => {
    expect(parseBirth8("19650312", now)).toEqual({ ok: true, ymd: "1965-03-12", label: "1965년 3월 12일" });
  });
  test("7자리·없는 날짜·1900 이전·미래 → 오류", () => {
    for (const v of ["1965031", "19650231", "18991231", "20271231", "", "abcdefgh"]) {
      expect(parseBirth8(v, now).ok).toBe(false);
    }
  });
  test("숫자만 남김(하이픈·점·공백) · 8자리까지", () => {
    expect(cleanBirthDigits("1965-03-12")).toBe("19650312");
    expect(cleanBirthDigits("1965.03.12 9")).toBe("19650312");
    expect(parseBirth8("1965.03.12", now)).toMatchObject({ ok: true, ymd: "1965-03-12" });
  });
  test("문구 원문", () => {
    expect(BIRTH8_ERROR).toBe("생년월일 8자리를 입력해 주세요. 예: 19650312");
    expect(birthLabel("2001-11-05")).toBe("2001년 11월 5일");
  });
});

function filled(roomId: string): ApplyFormValues {
  const v = defaultApplyValues(roomId);
  return {
    ...v,
    applicantName: "한미숙",
    birthDigits: "19650312",
    phone: "010-1234-5678",
    email: "sample@example.com",
    address: "서울시 서초구 서운로 00",
    orgName: "서초 노래사랑 모임",
    headcount: "15",
    purpose: "합창 연습 모임",
    exhibitionTitle: "가을 수채화 소품전",
    galleryRemovalTime: "15:00",
    genreContent: "수채화 20점",
    equipment: { ...v.equipment, audio: true, mirrorless: true },
    privacyAgree: true,
    pledgeAgree: true,
  };
}

describe("이어서 쓰기 — 개인정보 제외(수용 7 · ⑦)", () => {
  test("저장 값에 이름·전화·이메일·생년월일·주소·단체 이름·동의가 없다", () => {
    const d = pickDraft("sangsang1", filled("sangsang1"), { sessions: [{ date: "2026-11-06", startTime: "14:00", endTime: "16:00" }] });
    const text = JSON.stringify(d);
    for (const s of ["한미숙", "19650312", "1965-03-12", "010-1234-5678", "sample@example.com", "서운로", "노래사랑"]) {
      expect(text).not.toContain(s);
    }
    for (const k of DRAFT_EXCLUDED_FIELDS) expect(Object.keys(d.fields)).not.toContain(k);
    expect(d.fields.purpose).toBe("합창 연습 모임");
    expect(d.fields.headcount).toBe("15");
    expect(d.equipment.audio).toBe(true);
    expect(draftKey("sangsang1")).toBe("applyDraft:v1:sangsang1");
  });

  test("복원하면 목적·전시 이름은 있고 개인정보 칸은 빈칸", () => {
    const d = pickDraft("gallery", filled("gallery"));
    const back = parseDraft(JSON.stringify(d), "gallery")!;
    const v = applyDraftToValues(defaultApplyValues("gallery"), back);
    expect(v.exhibitionTitle).toBe("가을 수채화 소품전");
    expect(v.galleryRemovalTime).toBe("15:00");
    expect(v.applicantName).toBe("");
    expect(v.phone).toBe("");
    expect(v.email).toBe("");
    expect(v.birthDigits).toBe("");
    expect(v.orgName).toBe("");
    expect(v.privacyAgree).toBe(false);
  });

  test("다른 공간·다른 버전·이상한 키는 버림", () => {
    const d = pickDraft("sangsang1", filled("sangsang1"));
    expect(parseDraft(JSON.stringify(d), "sangsang2")).toBeNull();
    expect(parseDraft(JSON.stringify({ ...d, v: "v0" }), "sangsang1")).toBeNull();
    expect(parseDraft("{not json", "sangsang1")).toBeNull();
    const injected = parseDraft(JSON.stringify({ ...d, fields: { ...d.fields, applicantName: "홍길동", phone: "010" } }), "sangsang1")!;
    expect(JSON.stringify(injected)).not.toContain("홍길동");
  });

  test("기본값만 있으면 '작성하던 내용' 아님(스튜디오 기본 인원 2)", () => {
    const def = defaultApplyValues("media");
    expect(draftHasContent(pickDraft("media", def), def)).toBe(false);
    expect(draftHasContent(pickDraft("media", { ...def, purpose: "촬영" }), def)).toBe(true);
    expect(draftHasContent(null, def)).toBe(false);
  });
});

describe("전송 데이터 형식(3-4 전과 같은 키 · 수용 1)", () => {
  const LEGACY_LECTURE_KEYS = [
    "roomId", "date", "startTime", "endTime", "orgName", "headcount", "purpose",
    "laptop", "projector", "audio", "mirrorless", "camcorder", "wirelessMic", "pinMic", "rodeMic", "electronicBoard",
    "privacyAgree", "pledgeAgree", "applicantName", "birth", "address", "phone", "email", "pledgeDate", "pledgeName",
  ].sort();

  test("강의실: 키 목록 = 3-4 전 ApplyClient defaultValues 키 · 스키마 통과", () => {
    const raw = buildLectureRaw(filled("sangsang1"), {
      roomId: "sangsang1",
      sessions: [
        { date: "2027-01-15", startTime: "14:00", endTime: "16:00" },
        { date: "2027-01-08", startTime: "14:00", endTime: "16:00" },
      ],
      pledgeDate: "2026-10-28",
    });
    expect(Object.keys(raw).sort()).toEqual(LEGACY_LECTURE_KEYS);
    expect(raw.date).toBe("2027-01-08"); // 대표 회차 = 가장 이른 회차
    expect(raw.birth).toBe("1965-03-12");
    expect(raw.pledgeName).toBe("한미숙");
    expect(raw.audio).toBe("true");
    expect(raw.mirrorless).toBe("false"); // 강의실에는 스튜디오 장비 키를 보내지 않음(false)
    expect(RequestInputSchema.safeParse(raw).success).toBe(true);
  });

  test("E-스튜디오: 강의실 장비는 false", () => {
    const raw = buildLectureRaw(filled("media"), {
      roomId: "media",
      sessions: [{ date: "2027-01-08", startTime: "10:00", endTime: "13:00" }],
      pledgeDate: "2026-10-28",
    });
    expect(raw.audio).toBe("false");
    expect(raw.mirrorless).toBe("true");
  });

  test("갤러리: purpose 합치기 형식 그대로 · 스키마 통과", () => {
    const raw = buildGalleryRaw(filled("gallery"), {
      startDate: "2027-01-12",
      endDate: "2027-01-15",
      prepDate: "2027-01-11",
      sessions: [],
      pledgeDate: "2026-10-28",
    });
    expect(raw.purpose).toBe(composeGalleryPurpose({ genreContent: "수채화 20점", galleryRemovalTime: "15:00", galleryPrepDate: "2027-01-11" }));
    expect(raw.purpose).toBe("장르·내용: 수채화 20점\n준비일: 2027-01-11\n철수 예정: 종료일 15:00");
    expect(raw.endTime).toBe("20:00"); // 2027-01-12 = 화요일(기존 화요일 09:00~20:00 규칙)
    expect(GalleryRequestInputSchema.safeParse(raw).success).toBe(true);
  });
});

describe("칸 검증 문구", () => {
  test("빈 신청서 → 화면 순서대로 · 칸 이름 문구", () => {
    const v = defaultApplyValues("sangsang1");
    const raw = buildLectureRaw(v, { roomId: "sangsang1", sessions: [{ date: "2027-01-08", startTime: "14:00", endTime: "16:00" }], pledgeDate: "2026-10-28" });
    const e = validateApply("lecture", v, raw);
    expect(orderedErrorKeys(e)).toEqual(["applicantName", "birthDigits", "phone", "email", "address", "orgName", "headcount", "purpose", "privacyAgree", "pledgeAgree"]);
    expect(e.applicantName).toBe("이름을 입력해 주세요.");
    expect(e.phone).toBe("휴대폰 번호를 입력해 주세요.");
    expect(e.birthDigits).toBe(BIRTH8_ERROR);
  });

  test("짧은 휴대폰 번호 → 휴대폰 번호를 다시 확인해 주세요.", () => {
    const v = { ...filled("sangsang1"), phone: "010-12" };
    const raw = buildLectureRaw(v, { roomId: "sangsang1", sessions: [{ date: "2027-01-08", startTime: "14:00", endTime: "16:00" }], pledgeDate: "2026-10-28" });
    expect(validateApply("lecture", v, raw).phone).toBe("휴대폰 번호를 다시 확인해 주세요.");
  });

  test("만 14세 미만은 1차 문구 그대로", () => {
    const v = { ...filled("sangsang1"), birthDigits: "20200101" };
    const raw = buildLectureRaw(v, { roomId: "sangsang1", sessions: [{ date: "2027-01-08", startTime: "14:00", endTime: "16:00" }], pledgeDate: "2026-10-28" });
    expect(validateApply("lecture", v, raw).birthDigits).toMatch(/14세/);
  });

  test("스튜디오 13명 → 최대 인원 문구", () => {
    const v = { ...filled("media"), headcount: "13" };
    const raw = buildLectureRaw(v, { roomId: "media", sessions: [{ date: "2027-01-08", startTime: "10:00", endTime: "12:00" }], pledgeDate: "2026-10-28" });
    expect(validateApply("studio", v, raw).headcount).toBe("E-스튜디오 최대 인원은 12명입니다.");
  });

  test("갤러리 전시 이름·철수 시간 빈칸", () => {
    const v = { ...filled("gallery"), exhibitionTitle: "", galleryRemovalTime: "" };
    const raw = buildGalleryRaw(v, { startDate: "2027-01-12", endDate: "2027-01-15", prepDate: "", sessions: [], pledgeDate: "2026-10-28" });
    const e = validateApply("gallery", v, raw);
    expect(e.exhibitionTitle).toBe("전시 이름을 입력해 주세요.");
    expect(e.galleryRemovalTime).toBe("철수 시간을 골라 주세요.");
  });
});
