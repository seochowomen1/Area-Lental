import { normalizeItem, normalizeItems, roundTo30, type ClassroomItem } from "@/lib/classroomSync";

const AT = "2026-10-20T00:00:00.000Z";
const base: ClassroomItem = {
  sourceId: "2026-4:x1:d0",
  title: "자산설계와 주식투자",
  roomId: "classroom_all",
  dayOfWeek: 1,
  startTime: "10:00",
  endTime: "12:00",
  effectiveFrom: "2026-10-01",
  effectiveTo: "2026-12-31",
  kind: "regular",
};

describe("roundTo30", () => {
  test("시작은 내리고 끝은 올린다", () => {
    expect(roundTo30("09:10", "10:50")).toEqual({ start: 540, end: 660 });
    expect(roundTo30("19:00", "20:50")).toEqual({ start: 1140, end: 1260 });
  });
});

describe("normalizeItem", () => {
  test("운영시간 안 정규수업은 그대로", () => {
    const r = normalizeItem(base, AT);
    expect(r.schedules).toHaveLength(1);
    expect(r.schedules[0]).toMatchObject({
      roomId: "classroom_all",
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "12:00",
      source: "classroom",
      sourceId: base.sourceId,
      syncedAt: AT,
    });
  });
  test("운영시간 밖은 잘라낸다 — 평일 09:10~10:50 → 10:00~11:00", () => {
    const r = normalizeItem({ ...base, startTime: "09:10", endTime: "10:50" }, AT);
    expect(r.schedules[0]).toMatchObject({ startTime: "10:00", endTime: "11:00" });
  });
  test("완전히 운영시간 밖(월 19:00~20:50)은 제외", () => {
    const r = normalizeItem({ ...base, startTime: "19:00", endTime: "20:50" }, AT);
    expect(r.schedules).toHaveLength(0);
    expect(r.reason).toBe("hours");
  });
  test("화요일 저녁은 20:00까지 인정", () => {
    const r = normalizeItem({ ...base, dayOfWeek: 2, startTime: "19:00", endTime: "20:50" }, AT);
    expect(r.schedules[0]).toMatchObject({ startTime: "19:00", endTime: "20:00" });
  });
  test("토요일 종일 행사는 10:00~12:00만 · 특강 제목에 날짜", () => {
    const r = normalizeItem(
      { ...base, dayOfWeek: 6, startTime: "09:00", endTime: "18:00", effectiveFrom: "2026-10-10", effectiveTo: "2026-10-10" },
      AT
    );
    expect(r.schedules[0]).toMatchObject({ startTime: "10:00", endTime: "12:00", title: "자산설계와 주식투자 · 10/10" });
  });
  test("일요일은 제외", () => {
    expect(normalizeItem({ ...base, dayOfWeek: 0 }, AT).reason).toBe("hours");
  });
  test("대관 대상이 아닌 공간은 제외", () => {
    expect(normalizeItem({ ...base, roomId: "cooking" }, AT).reason).toBe("room");
  });
  test("형식 오류는 제외", () => {
    expect(normalizeItem({ ...base, startTime: "9:00" }, AT).reason).toBe("invalid");
    expect(normalizeItem({ ...base, effectiveFrom: "2026-12-31", effectiveTo: "2026-10-01" }, AT).reason).toBe("invalid");
  });
});

describe("normalizeItems", () => {
  test("완전 중복은 1건으로 합치고 통계를 남긴다", () => {
    const { schedules, stats } = normalizeItems([base, { ...base, sourceId: "dup" }, { ...base, roomId: "plus" }], AT);
    expect(schedules).toHaveLength(1);
    expect(stats).toMatchObject({ received: 3, produced: 1, merged: 1, skippedRoom: 1 });
  });
});
