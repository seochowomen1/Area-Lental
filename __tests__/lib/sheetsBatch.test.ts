/**
 * audit-fix-1 [9] 묶음 상태 변경 = 시트 읽기 1(+헤더 확인)·쓰기 1
 * Google API는 가짜 클라이언트로 대체(네트워크·운영 시트 접근 없음).
 */
const calls = { get: [] as string[], batchUpdate: 0, update: 0, append: 0 };
let failBatchUpdate = false;
let sheetRows: string[][] = [];

jest.mock("@/lib/env", () => {
  const actual = jest.requireActual("@/lib/env");
  return { ...actual, isMockMode: () => false, requireGoogleEnv: () => ({ GOOGLE_SHEET_ID: "TEST_SHEET" }) };
});
jest.mock("@/lib/google", () => ({
  getGoogleClient: () => ({
    sheets: {
      spreadsheets: {
        values: {
          get: async ({ range }: { range: string }) => {
            calls.get.push(range);
            if (range.endsWith("!1:1")) return { data: { values: [sheetRows[0]] } };
            return { data: { values: sheetRows } };
          },
          batchUpdate: async () => {
            calls.batchUpdate += 1;
            if (failBatchUpdate) {
              const e = new Error("Quota exceeded") as Error & { code: number };
              e.code = 429;
              throw e;
            }
            return { data: {} };
          },
          update: async () => { calls.update += 1; return { data: {} }; },
          append: async () => { calls.append += 1; return { data: {} }; },
        },
      },
    },
  }),
}));

import { REQUEST_OPTIONAL_HEADERS, updateRequestsStatusBatch } from "@/lib/sheets";

const BASE = [
  "requestId", "createdAt", "roomId", "roomName", "date", "startTime", "endTime",
  "applicantName", "birth", "address", "phone", "email", "orgName", "headcount",
  "equipment_laptop", "equipment_projector", "equipment_audio", "purpose", "attachments",
  "privacyAgree", "pledgeAgree", "pledgeDate", "pledgeName",
  "status", "adminMemo", "rejectReason", "decidedAt", "decidedBy",
];
const HEADER = [...BASE, ...REQUEST_OPTIONAL_HEADERS];

function makeRows(n: number, batchId: string): string[][] {
  const rows: string[][] = [HEADER];
  for (let i = 0; i < n; i++) {
    const r: Record<string, string> = {
      requestId: `REQ-T-${i + 1}`, createdAt: "2026-10-26T10:00:00+09:00", roomId: "sangsang1", roomName: "상상교실 1",
      date: `2026-12-${String(i + 1).padStart(2, "0")}`, startTime: "10:00", endTime: "12:00",
      applicantName: "홍가명", birth: "1990-01-01", address: "서울", phone: "01000000000", email: "a@example.com",
      orgName: "가명", headcount: "5", equipment_laptop: "FALSE", equipment_projector: "FALSE", equipment_audio: "FALSE",
      purpose: "테스트", attachments: "", privacyAgree: "TRUE", pledgeAgree: "TRUE", pledgeDate: "2026-10-26", pledgeName: "홍가명",
      status: "접수", adminMemo: "", rejectReason: "", decidedAt: "", decidedBy: "",
      batchId, batchSeq: String(i + 1), batchSize: String(n),
    };
    rows.push(HEADER.map((h) => r[h] ?? ""));
  }
  return rows;
}

beforeEach(() => {
  calls.get = [];
  calls.batchUpdate = 0;
  calls.update = 0;
  calls.append = 0;
  failBatchUpdate = false;
});

test("20회차 묶음 승인 + 할인 + 결제 기록 → batchUpdate 1회 · 읽기 ≤ 2회", async () => {
  sheetRows = makeRows(20, "BAT-T");
  const out = await updateRequestsStatusBatch(
    sheetRows.slice(1).map((r) => ({ requestId: r[0], status: "승인" as const, decidedBy: "관리자", adminMemo: "메모", rejectReason: "" })),
    { batchId: "BAT-T", discountRatePct: 10, discountAmountKRW: 0, discountReason: "협약" },
    { requestId: "REQ-T-1", patch: { autoCancelledAt: "2026-10-26T09:00:00+09:00" } }
  );
  expect(calls.batchUpdate).toBe(1);
  expect(calls.update).toBe(0);
  expect(calls.append).toBe(0);
  expect(calls.get.length).toBeLessThanOrEqual(2);
  expect(out).toHaveLength(20);
  expect(out.every((r) => r.status === "승인" && r.decidedBy === "관리자" && r.discountRatePct === 10)).toBe(true);

  // 다음 호출은 헤더 확인을 재사용 → 읽기 1회
  calls.get = [];
  await updateRequestsStatusBatch([{ requestId: "REQ-T-2", status: "반려", decidedBy: "관리자", rejectReason: "사유" }]);
  expect(calls.get).toEqual(["requests!A:ZZ"]);
});

test("쓰기 실패(429) → throw · 다른 쓰기 없음(부분 반영 없음)", async () => {
  sheetRows = makeRows(20, "BAT-T");
  failBatchUpdate = true;
  await expect(
    updateRequestsStatusBatch(sheetRows.slice(1).map((r) => ({ requestId: r[0], status: "취소" as const, decidedBy: "시스템" })))
  ).rejects.toThrow(/Quota/);
  expect(calls.batchUpdate).toBe(1);
  expect(calls.update).toBe(0);
});

test("대상 중 하나라도 없으면 아무것도 쓰지 않는다", async () => {
  sheetRows = makeRows(3, "BAT-T");
  await expect(
    updateRequestsStatusBatch([
      { requestId: "REQ-T-1", status: "승인", decidedBy: "관리자" },
      { requestId: "REQ-NOPE", status: "승인", decidedBy: "관리자" },
    ])
  ).rejects.toThrow(/찾을 수 없습니다/);
  expect(calls.batchUpdate).toBe(0);
});

/* ── audit-fix-3 3-1: 조건부 쓰기 · 결제 단독 갱신도 같은 경로 ── */
test("expect 불일치 → StaleWriteError · batchUpdate 0회", async () => {
  sheetRows = makeRows(3, "BAT-T");
  const statusCol = HEADER.indexOf("status");
  sheetRows[2][statusCol] = "반려"; // 다른 창이 먼저 반려
  await expect(
    updateRequestsStatusBatch(
      sheetRows.slice(1).map((r) => ({ requestId: r[0], status: "승인" as const, decidedBy: "관리자" })),
      undefined,
      undefined,
      { statusById: { "REQ-T-1": "접수", "REQ-T-2": "접수", "REQ-T-3": "접수" } }
    )
  ).rejects.toMatchObject({ code: "STALE_WRITE" });
  expect(calls.batchUpdate).toBe(0);
});

test("크론 조건: 결제완료 묶음은 쓰지 않음 · 미결제면 1회 쓰기", async () => {
  sheetRows = makeRows(2, "BAT-T");
  const psCol = HEADER.indexOf("paymentStatus");
  const cron = { status: ["승인" as const], paymentStatus: ["" as const, "미결제" as const], autoCancelledAtEmpty: true };
  for (const r of sheetRows.slice(1)) r[HEADER.indexOf("status")] = "승인";
  for (const r of sheetRows.slice(1)) r[psCol] = "결제완료";
  await expect(
    updateRequestsStatusBatch([{ requestId: "REQ-T-1", status: "취소", decidedBy: "시스템" }], undefined, { requestId: "REQ-T-1", patch: { autoCancelledAt: "x" } }, cron)
  ).rejects.toMatchObject({ code: "STALE_WRITE" });
  expect(calls.batchUpdate).toBe(0);

  for (const r of sheetRows.slice(1)) r[psCol] = "";
  await updateRequestsStatusBatch([{ requestId: "REQ-T-1", status: "취소", decidedBy: "시스템" }], undefined, { requestId: "REQ-T-1", patch: { autoCancelledAt: "x" } }, cron);
  expect(calls.batchUpdate).toBe(1);
});

test("updateRequestPayment = 읽기 1(+헤더) · batchUpdate 1 · 묶음 전 행", async () => {
  sheetRows = makeRows(4, "BAT-T");
  const { updateRequestPayment } = require("@/lib/sheets");
  const out = await updateRequestPayment({ requestId: "REQ-T-2", patch: { paymentDueDate: "2026-11-03" } });
  expect(calls.batchUpdate).toBe(1);
  expect(calls.get.filter((g) => g === "requests!A:ZZ")).toHaveLength(1);
  expect(out).toHaveLength(4);
  expect(out.every((r: { paymentDueDate?: string }) => r.paymentDueDate === "2026-11-03")).toBe(true);
});

test("단건 할인(batchId 빈값) → 그 1행만", async () => {
  sheetRows = makeRows(1, "");
  const out = await updateRequestsStatusBatch(
    [{ requestId: "REQ-T-1", status: "승인", decidedBy: "관리자" }],
    { batchId: "", requestId: "REQ-T-1", discountRatePct: 50, discountAmountKRW: 10000, discountReason: "협약" }
  );
  expect(calls.batchUpdate).toBe(1);
  expect(out[0]).toMatchObject({ status: "승인", discountRatePct: 50, discountAmountKRW: 10000, discountReason: "협약" });
});
