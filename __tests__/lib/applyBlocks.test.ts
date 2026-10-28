/**
 * audit-fix-3 3-4 — 신청 화면 블록의 순수 함수
 *  - 2단계 시간 후보(P-11 지난 시각 비활성 · 연속 60분 · 최대 시간)
 *  - 철수 시간 후보(평일 16:00 · 토 11:00)
 *  - 예상 이용료 내역 줄(planLecture/planGallery 결과 그대로 · 갤러리 "대관" 0건)
 *  - 409·400 응답 → 일정 카드 상태로 분류 · 회차 줄 문제 문구
 *  - 완료 요약은 같은 신청번호일 때만
 */
import { endOptionsFor, startOptionsFor, type Slot } from "@/lib/apply/times";
import { removalTimeOptions, teardownDeadline } from "@/lib/apply/gallery";
import { galleryFeeLines, lectureFeeLines } from "@/lib/apply/fee";
import { classifyApplyResponse, issueForSession, requestIdFromHref } from "@/lib/apply/submit";
import { defaultApplyValues, LECTURE_EQUIP_KEYS, STUDIO_EQUIP_KEYS } from "@/lib/apply/form";
import { planLecture } from "@/lib/rules/lecturePlan";
import { planGallery } from "@/lib/galleryPlan";

function slots(from: string, to: string, busy: string[] = []): Slot[] {
  const out: Slot[] = [];
  const toMin = (t: string) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10);
  const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  for (let t = toMin(from); t < toMin(to); t += 30) out.push({ start: fmt(t), end: fmt(t + 30), available: !busy.includes(fmt(t)) });
  return out;
}

describe("2단계 시간 후보", () => {
  const day = slots("10:00", "17:00");
  test("끝 30분 전·60분 미만 연속은 시작 불가", () => {
    const opts = startOptionsFor(day, 360, null);
    expect(opts.find((o) => o.value === "16:00")?.disabled).toBe(false);
    expect(opts.find((o) => o.value === "16:30")?.disabled).toBe(true);
  });
  test("P-11: 오늘 지금 시각(14:10) 이전 시작은 '지난 시간'으로 비활성", () => {
    const opts = startOptionsFor(day, 360, 14 * 60 + 10);
    expect(opts.find((o) => o.value === "14:00")).toMatchObject({ disabled: true, past: true });
    expect(opts.find((o) => o.value === "14:30")).toMatchObject({ disabled: false, past: false });
  });
  test("예약된 칸이 끼면 그 앞에서 끝남 · 최대 시간 제한", () => {
    const busy = slots("10:00", "17:00", ["12:00", "12:30"]);
    expect(endOptionsFor(busy, "10:00", 360)).toEqual(["11:00", "11:30", "12:00"]);
    expect(startOptionsFor(busy, 360, null).find((o) => o.value === "11:30")?.disabled).toBe(true);
    expect(endOptionsFor(day, "10:00", 120)).toEqual(["11:00", "11:30", "12:00"]);
  });
});

describe("갤러리 철수 시간", () => {
  test("평일 16:00 · 토 11:00까지 30분 간격", () => {
    expect(teardownDeadline("2026-11-13")).toBe("16:00"); // 금
    expect(teardownDeadline("2026-11-14")).toBe("11:00"); // 토
    expect(removalTimeOptions("2026-11-14")).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
    expect(removalTimeOptions("2026-11-13").at(-1)).toBe("16:00");
    expect(removalTimeOptions("")).toEqual([]);
  });
});

describe("예상 이용료 내역 줄", () => {
  const sessions = [
    { date: "2026-11-06", startTime: "14:00", endTime: "16:00" },
    { date: "2026-11-13", startTime: "14:00", endTime: "16:00" },
    { date: "2026-11-20", startTime: "14:00", endTime: "16:00" },
  ];
  test("강의실 3회 · 6시간 + 장비 n회 — 합이 planLecture 합계와 같다", () => {
    const v = defaultApplyValues("sangsang1");
    v.equipment.audio = true;
    const plan = planLecture({ roomId: "sangsang1", sessions, equipment: { audio: true }, holidays: new Set(), todayYmd: "2026-10-28" });
    const lines = lectureFeeLines("sangsang1", plan, v, LECTURE_EQUIP_KEYS);
    expect(lines[0]).toEqual({ label: "강의실 3회 · 6시간", amount: 420_000 });
    expect(lines[1]).toEqual({ label: "음향 3회", amount: 30_000 });
    expect(lines.reduce((a, l) => a + (l.amount ?? 0), 0)).toBe(plan.totalFeeKRW);
  });
  test("E-스튜디오 추가 인원 줄", () => {
    const v = defaultApplyValues("media");
    v.headcount = "4";
    const one = [{ date: "2026-11-06", startTime: "14:00", endTime: "17:00" }];
    const plan = planLecture({ roomId: "media", sessions: one, headcount: 4, holidays: new Set(), todayYmd: "2026-10-28" });
    const lines = lectureFeeLines("media", plan, v, STUDIO_EQUIP_KEYS);
    expect(lines[0].label).toBe("3시간 · 2명");
    expect(lines[1].label).toBe("추가 인원 2명 × 3시간");
    expect(lines.reduce((a, l) => a + (l.amount ?? 0), 0)).toBe(plan.totalFeeKRW);
  });
  test("갤러리: 평일·토 · 준비일 무료 · '대관' 글자 없음", () => {
    const plan = planGallery({ startDate: "2026-11-10", endDate: "2026-11-14", holidays: new Set() });
    const lines = galleryFeeLines(plan);
    expect(lines.map((l) => l.label)).toEqual(["평일 4일 × 20,000원", "토요일 1일 × 10,000원", "준비일 11월 9일(월)"]);
    expect(lines.at(-1)?.amount).toBeNull();
    expect(JSON.stringify(lines)).not.toContain("대관");
  });
});

describe("신청 응답 분류(S3)", () => {
  test("409 SLOT_TAKEN·BATCH_CONFLICT · 400 SESSION_INVALID → schedule", () => {
    expect(classifyApplyResponse(409, { code: "SLOT_TAKEN", message: "방금 다른 분이…" }, false)).toEqual({ kind: "schedule", message: "방금 다른 분이…", issues: [] });
    const bc = classifyApplyResponse(409, { code: "BATCH_CONFLICT", message: "m", issues: [{ date: "2026-11-06", startTime: "14:00", endTime: "16:00", message: "겹침" }] }, false);
    expect(bc.kind).toBe("schedule");
    expect(classifyApplyResponse(400, { code: "SESSION_INVALID", message: "x", issues: [] }, false).kind).toBe("schedule");
  });
  test("빈 message면 예비 문구 · 그 밖 오류는 error", () => {
    const g = classifyApplyResponse(409, { code: "SLOT_TAKEN" }, true);
    expect(g.message).toContain("같은 기간을 먼저 신청");
    expect(classifyApplyResponse(400, { code: "VALIDATION_ERROR", message: "이름" }, false)).toEqual({ kind: "error", message: "이름" });
  });
  test("회차 줄 문제 문구 = 같은 날짜·시작의 issue", () => {
    const issues = [{ date: "2026-11-13", startTime: "14:00", endTime: "16:00", message: "이미 예약" }];
    expect(issueForSession(issues, { date: "2026-11-13", startTime: "14:00", endTime: "16:00" })).toBe("이미 예약");
    expect(issueForSession(issues, { date: "2026-11-06", startTime: "14:00", endTime: "16:00" })).toBeNull();
    const byText = [{ message: "2026-11-06 14:00-16:00: 이미 지난 시간입니다." }];
    expect(issueForSession(byText, { date: "2026-11-06", startTime: "14:00", endTime: "16:00" })).toBe("2026-11-06 14:00-16:00: 이미 지난 시간입니다.");
  });
  test("완료 주소에서 신청번호", () => {
    expect(requestIdFromHref("/success?requestId=REQ-1&fee=1000")).toBe("REQ-1");
    expect(requestIdFromHref("/success")).toBe("");
  });
});
