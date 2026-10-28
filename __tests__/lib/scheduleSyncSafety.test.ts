/**
 * audit-fix-3 3-1 — 정규 수업 동기화 "추가하고 지움" · 동시 실행 방지
 * Google API는 가짜 클라이언트(네트워크·운영 시트 접근 없음).
 */
const calls = { append: 0, batchUpdate: [] as Array<Array<{ deleteDimension: { range: { startIndex: number } } }>>, get: 0 };
let failAppend = false;
let sheetRows: string[][] = [];
const HEADER = ["id", "roomId", "dayOfWeek", "startTime", "endTime", "title", "effectiveFrom", "effectiveTo", "source", "sourceId", "syncedAt"];

jest.mock("@/lib/env", () => {
  const actual = jest.requireActual("@/lib/env");
  return { ...actual, isMockMode: () => false, requireGoogleEnv: () => ({ GOOGLE_SHEET_ID: "TEST_SHEET" }) };
});
jest.mock("@/lib/google", () => ({
  getGoogleClient: () => ({
    sheets: {
      spreadsheets: {
        get: async () => ({ data: { sheets: [{ properties: { title: "class_schedule", sheetId: 7 } }] } }),
        batchUpdate: async ({ requestBody }: { requestBody: { requests: Array<{ deleteDimension: { range: { startIndex: number } } }> } }) => {
          calls.batchUpdate.push(requestBody.requests);
          // 실제 시트처럼 행 삭제 반영(아래부터)
          for (const r of requestBody.requests) sheetRows.splice(r.deleteDimension.range.startIndex, 1);
          return { data: {} };
        },
        values: {
          get: async ({ range }: { range: string }) => {
            calls.get += 1;
            if (range.endsWith("!1:1")) return { data: { values: [HEADER] } };
            return { data: { values: sheetRows.map((r) => [...r]) } };
          },
          update: async () => ({ data: {} }),
          append: async ({ requestBody }: { requestBody: { values: string[][] } }) => {
            calls.append += 1;
            if (failAppend) throw Object.assign(new Error("Quota exceeded"), { code: 429 });
            sheetRows.push(...requestBody.values);
            return { data: {} };
          },
        },
      },
    },
  }),
}));

import { replaceClassSchedulesBySource } from "@/lib/sheets";
import { acquireSyncSlot, __resetSyncSlotForTest, SYNC_LOCK_MS } from "@/lib/classroomSync";

function sched(id: string, source: string, title: string): string[] {
  const r: Record<string, string> = { id, roomId: "sangsang1", dayOfWeek: "1", startTime: "10:00", endTime: "12:00", title, effectiveFrom: "2026-10-01", effectiveTo: "2026-12-31", source, sourceId: "", syncedAt: "" };
  return HEADER.map((h) => r[h] ?? "");
}
const item = (title: string) => ({ roomId: "sangsang1", dayOfWeek: 2, startTime: "14:00", endTime: "16:00", title, effectiveFrom: "2026-10-01", effectiveTo: "2026-12-31" });

beforeEach(() => {
  calls.append = 0;
  calls.batchUpdate = [];
  calls.get = 0;
  failAppend = false;
  sheetRows = [HEADER, sched("CS-old-1", "classroom", "옛 강좌1"), sched("CS-manual", "", "수동 등록"), sched("CS-old-2", "classroom", "옛 강좌2")];
});

describe("replaceClassSchedulesBySource — 추가하고 지움", () => {
  test("수용 기준 8: 추가가 실패하면 기존 정규 수업 행 수가 그대로 · 삭제 호출 없음", async () => {
    failAppend = true;
    const before = sheetRows.length;
    await expect(replaceClassSchedulesBySource("classroom", [item("새 강좌")])).rejects.toThrow(/Quota/);
    expect(sheetRows.length).toBe(before);
    expect(calls.batchUpdate).toHaveLength(0);
  });

  test("성공: 새 행 추가 뒤 옛 classroom 행만 id로 찾아 삭제 · 수동 행 유지", async () => {
    const r = await replaceClassSchedulesBySource("classroom", [item("새 강좌A"), item("새 강좌B")]);
    expect(r).toEqual({ deleted: 2, added: 2 });
    expect(calls.append).toBe(1);
    expect(calls.batchUpdate).toHaveLength(1);
    const titles = sheetRows.slice(1).map((row) => row[HEADER.indexOf("title")]);
    expect(titles).toEqual(["수동 등록", "새 강좌A", "새 강좌B"]);
  });

  test("추가 중 다른 행이 끼어 행 번호가 밀려도 id로 찾아 정확히 지운다", async () => {
    // append 직후 위쪽에 수동 행이 하나 더 들어온 상황 흉내 — 첫 values.get(옛 id 수집) 다음에 끼워 넣는다
    const origPush = sheetRows.push.bind(sheetRows);
    let injected = false;
    sheetRows.push = ((...rows: string[][]) => {
      const n = origPush(...rows);
      if (!injected) {
        injected = true;
        sheetRows.splice(1, 0, sched("CS-manual-2", "", "끼어든 수동 행"));
      }
      return n;
    }) as typeof sheetRows.push;
    await replaceClassSchedulesBySource("classroom", [item("새 강좌")]);
    const ids = sheetRows.slice(1).map((row) => row[0]);
    expect(ids).toContain("CS-manual");
    expect(ids).toContain("CS-manual-2");
    expect(ids).not.toContain("CS-old-1");
    expect(ids).not.toContain("CS-old-2");
  });
});

describe("acquireSyncSlot — 동시 실행 방지", () => {
  beforeEach(() => __resetSyncSlotForTest());
  const noTail = async () => [];

  test("같은 인스턴스: 진행 중이면 거부 · release 후 다시 가능", async () => {
    const start = jest.fn(async () => undefined);
    const a = await acquireSyncSlot({ recordStart: start, readTail: noTail, now: 1_000_000 });
    expect(a.ok).toBe(true);
    const b = await acquireSyncSlot({ recordStart: start, readTail: noTail, now: 1_010_000 });
    expect(b.ok).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
    if (a.ok) a.release();
    const c = await acquireSyncSlot({ recordStart: start, readTail: noTail, now: 1_020_000 });
    expect(c.ok).toBe(true);
  });

  test("다른 인스턴스: 감사로그의 마지막 시작이 60초 안이면 거부 · 지나면 허용", async () => {
    const startedKst = "2026-10-28 04:00:00";
    const startedMs = Date.parse("2026-10-28T04:00:00+09:00");
    const tail = async () => [{ timestamp: startedKst, action: "수업시간 동기화 시작", target: "classroom" }];
    const start = jest.fn(async () => undefined);
    expect((await acquireSyncSlot({ recordStart: start, readTail: tail, now: startedMs + 30_000 })).ok).toBe(false);
    expect(start).not.toHaveBeenCalled();
    const later = await acquireSyncSlot({ recordStart: start, readTail: tail, now: startedMs + SYNC_LOCK_MS + 1 });
    expect(later.ok).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test("감사로그를 읽지 못해도 동기화는 막지 않는다(메모리 표식만)", async () => {
    const start = jest.fn(async () => undefined);
    const r = await acquireSyncSlot({ recordStart: start, readTail: async () => { throw new Error("quota"); }, now: 5_000_000 });
    expect(r.ok).toBe(true);
  });
});
