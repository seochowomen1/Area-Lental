import { resolveGalleryPrep } from "@/lib/galleryPlan";

// 준비일 필수 규칙(2026-10-28 사용자 "무조건 최소 전날")
const empty = new Set<string>();
const base = { holidays: empty, booked: empty, exhibitionEnds: empty, today: "2026-10-28" };

describe("resolveGalleryPrep", () => {
  it("전날이 비어 있으면 전날이 준비일", () => {
    expect(resolveGalleryPrep("2026-10-30", base)).toEqual({ date: "2026-10-29", afterExhibition: false });
  });
  it("내일 시작이면 준비일이 오늘이라 고를 수 없음", () => {
    expect(resolveGalleryPrep("2026-10-29", base)).toBeNull();
  });
  it("월요일 시작이면 일요일을 건너 토요일이 준비일", () => {
    expect(resolveGalleryPrep("2026-11-02", base)?.date).toBe("2026-10-31");
  });
  it("전날이 앞 전시 중간이면 고를 수 없음", () => {
    expect(resolveGalleryPrep("2026-11-05", { ...base, booked: new Set(["2026-11-04"]) })).toBeNull();
  });
  it("전날이 앞 전시 마지막 날이면 철거 후 준비", () => {
    const r = resolveGalleryPrep("2026-11-05", { ...base, booked: new Set(["2026-11-04"]), exhibitionEnds: new Set(["2026-11-04"]) });
    expect(r).toEqual({ date: "2026-11-04", afterExhibition: true });
  });
  it("전날이 다른 신청의 준비일이면 고를 수 없음", () => {
    expect(resolveGalleryPrep("2026-11-05", { ...base, prepOnly: new Set(["2026-11-04"]) })).toBeNull();
  });
});
