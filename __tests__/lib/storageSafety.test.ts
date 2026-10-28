/**
 * audit-fix-3 3-1 저장소 안전망 — 순수 함수
 * 조건부 쓰기(writeExpect) · 백업 파일 이름·엑셀·삭제 검사 · 재검토 기준 집계
 */
import * as XLSX from "xlsx";
import type { RentalRequest } from "@/lib/types";
import { findExpectMismatches, parseViewedStatuses, StaleWriteError, assertWriteExpect, isStaleWriteError } from "@/lib/writeExpect";
import {
  backupFileName,
  buildBackupWorkbook,
  countTabRows,
  storageReviewStats,
  toBackupItems,
  validateBackupDeletion,
  BACKUP_NAME_RE,
} from "@/lib/backup";
import { auditTsToMs, lastOf } from "@/lib/auditQuery";

function row(over: Partial<RentalRequest>): RentalRequest {
  return {
    requestId: "REQ-1", createdAt: "2026-10-01T10:00:00+09:00", roomId: "sangsang1", roomName: "상상교실 1",
    date: "2026-11-07", startTime: "10:00", endTime: "12:00", applicantName: "홍가명", birth: "1990-01-01",
    address: "서울", phone: "01000000000", email: "a@example.com", orgName: "가명", headcount: 5,
    equipment: { laptop: false, projector: false, audio: false }, purpose: "테스트", attachments: [],
    privacyAgree: true, pledgeAgree: true, pledgeDate: "2026-10-01", pledgeName: "홍가명",
    status: "접수", adminMemo: "", rejectReason: "", decidedAt: "", decidedBy: "",
    ...over,
  } as RentalRequest;
}

describe("findExpectMismatches", () => {
  const bundle = [
    row({ requestId: "A", batchId: "B1", status: "승인", paymentDueDate: "2026-10-27" }),
    row({ requestId: "B", batchId: "B1", status: "반려", paymentDueDate: "2026-10-27" }),
    row({ requestId: "C", status: "접수" }),
  ];

  test("expect 없으면 통과", () => {
    expect(findExpectMismatches(bundle, ["A"], "A", undefined)).toEqual([]);
  });

  test("status는 바꾸는 행만 본다(같은 묶음의 반려 회차는 무시)", () => {
    expect(findExpectMismatches(bundle, ["A"], "A", { status: ["승인"] })).toEqual([]);
    expect(findExpectMismatches(bundle, ["A", "B"], "A", { status: ["승인"] })).toEqual(["B.status=반려"]);
  });

  test("결제 조건은 묶음 전 행을 본다 — 빈값은 미결제와 같이 취급", () => {
    expect(findExpectMismatches(bundle, ["A"], "A", { paymentStatus: ["", "미결제"], autoCancelledAtEmpty: true })).toEqual([]);
    const paid = bundle.map((r) => (r.batchId === "B1" ? { ...r, paymentStatus: "결제완료" as const } : r));
    expect(findExpectMismatches(paid, ["A"], "A", { paymentStatus: ["", "미결제"] })).toHaveLength(2);
    const cancelled = bundle.map((r) => (r.batchId === "B1" ? { ...r, autoCancelledAt: "2026-10-28T09:00:00+09:00" } : r));
    expect(findExpectMismatches(cancelled, ["A"], "A", { autoCancelledAtEmpty: true })).toHaveLength(2);
  });

  test("기한이 바뀌었으면(관리자 기한 연장) 불일치", () => {
    const extended = bundle.map((r) => (r.batchId === "B1" ? { ...r, paymentDueDate: "2026-11-03" } : r));
    expect(findExpectMismatches(extended, ["A"], "A", { paymentDueDate: "2026-10-27" }).length).toBeGreaterThan(0);
  });

  test("statusById — 화면을 연 시점 상태와 다르면 불일치 · 없는 행도 불일치", () => {
    expect(findExpectMismatches(bundle, ["C"], "C", { statusById: { C: "접수" } })).toEqual([]);
    expect(findExpectMismatches(bundle, ["C"], "C", { statusById: { C: "반려" } })).toHaveLength(1);
    expect(findExpectMismatches(bundle, ["C"], "C", { statusById: { Z: "접수" } })).toEqual(["Z.missing"]);
  });

  test("assertWriteExpect → StaleWriteError(code STALE_WRITE)", () => {
    let caught: unknown;
    try {
      assertWriteExpect(bundle, ["C"], "C", { statusById: { C: "승인" } });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StaleWriteError);
    expect(isStaleWriteError(caught)).toBe(true);
    expect((caught as StaleWriteError).code).toBe("STALE_WRITE");
  });
});

describe("parseViewedStatuses", () => {
  test("정상 JSON", () => {
    expect(parseViewedStatuses('{"REQ-1":"접수","REQ-2":"승인"}')).toEqual({ "REQ-1": "접수", "REQ-2": "승인" });
  });
  test.each([null, "", "[]", "{bad", '{"REQ-1":"모름"}', '{"REQ-1":1}'])("형식이 틀리면 null: %p", (raw) => {
    expect(parseViewedStatuses(raw)).toBeNull();
  });
});

describe("백업 파일 이름", () => {
  test("KST 기준 대관앱백업_YYYY-MM-DD_HHmm.xlsx", () => {
    // 2026-10-27T19:00:00Z = 2026-10-28 04:00 KST
    expect(backupFileName(new Date("2026-10-27T19:00:00Z"))).toBe("대관앱백업_2026-10-28_0400.xlsx");
    expect(BACKUP_NAME_RE.test("대관앱백업_2026-10-28_0400.xlsx")).toBe(true);
    expect(BACKUP_NAME_RE.test("대관앱백업_2026-10-28_0400.xlsx.bak")).toBe(false);
    expect(BACKUP_NAME_RE.test("홍길동_신청.xlsx")).toBe(false);
  });
});

describe("백업 엑셀", () => {
  test("탭마다 같은 이름의 시트 · 첫 행 = 헤더 · 행 수 = 데이터 행", () => {
    const tabs = [
      { title: "requests", rows: [["requestId", "status"], ["REQ-1", "접수"], ["REQ-2", "승인"]] },
      { title: "blocks", rows: [["id", "roomId"]] },
      { title: "audit_log", rows: [["timestamp", "action"], ["2026-10-28 04:00:00", "x".repeat(40000)]] },
    ];
    const wb = XLSX.read(buildBackupWorkbook(tabs));
    expect(wb.SheetNames).toEqual(["requests", "blocks", "audit_log"]);
    const first = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.requests, { header: 1 })[0];
    expect(first).toEqual(["requestId", "status"]);
    // 엑셀 셀 한도(32,767자)로 잘라 저장
    const long = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.audit_log, { header: 1 })[1][1];
    expect(long.length).toBe(32767);
    expect(countTabRows(tabs)).toEqual({ requests: 2, blocks: 0, audit_log: 1 });
  });
});

describe("백업 정리(삭제) 검사", () => {
  const now = Date.parse("2026-12-01T00:00:00Z");
  const old1 = { fileId: "f1", name: "대관앱백업_2026-10-01_0400.xlsx", createdAt: "2026-10-01T00:00:00Z" };
  const old2 = { fileId: "f2", name: "대관앱백업_2026-10-02_0400.xlsx", createdAt: "2026-10-02T00:00:00Z" };
  const recent = { fileId: "f3", name: "대관앱백업_2026-11-25_0400.xlsx", createdAt: "2026-11-25T00:00:00Z" };
  const stranger = { fileId: "f4", name: "다른파일.xlsx", createdAt: "2026-01-01T00:00:00Z" };
  const folder = [old1, old2, recent, stranger];

  test("30일 지난 파일만 · 개수 일치 → 통과", () => {
    const r = validateBackupDeletion(folder, ["f1", "f2"], 2, now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets.map((t) => t.name)).toEqual([old1.name, old2.name]);
  });
  test("개수 불일치 → 400 COUNT_MISMATCH", () => {
    expect(validateBackupDeletion(folder, ["f1", "f2"], 3, now)).toMatchObject({ ok: false, status: 400, code: "COUNT_MISMATCH" });
  });
  test("30일 안 된 파일이 섞이면 → 409 NOT_DELETABLE", () => {
    expect(validateBackupDeletion(folder, ["f1", "f3"], 2, now)).toMatchObject({ ok: false, status: 409, code: "NOT_DELETABLE" });
  });
  test("폴더 밖 파일·이름 형식이 다른 파일 → 409", () => {
    expect(validateBackupDeletion(folder, ["f1", "nope"], 2, now)).toMatchObject({ status: 409 });
    expect(validateBackupDeletion(folder, ["f4"], 1, now)).toMatchObject({ status: 409 });
  });
  test("빈 목록·중복·문자열 아님 → 400", () => {
    expect(validateBackupDeletion(folder, [], 0, now)).toMatchObject({ status: 400 });
    expect(validateBackupDeletion(folder, ["f1", "f1"], 2, now)).toMatchObject({ status: 400 });
    expect(validateBackupDeletion(folder, "f1", 1, now)).toMatchObject({ status: 400 });
  });
  test("32개 이상 → 400", () => {
    const many = Array.from({ length: 32 }, (_, i) => ({ fileId: `m${i}`, name: `대관앱백업_2026-09-${String((i % 28) + 1).padStart(2, "0")}_0${String(i).padStart(3, "0").slice(-3)}.xlsx`, createdAt: "2026-09-01T00:00:00Z" }));
    expect(validateBackupDeletion(many, many.map((m) => m.fileId), 32, now)).toMatchObject({ status: 400 });
  });
  test("목록 — 이름 형식이 맞는 파일만 · 최신순 · 30일 표시", () => {
    const items = toBackupItems(folder, now);
    expect(items.map((i) => i.fileId)).toEqual(["f3", "f2", "f1"]);
    expect(items.map((i) => i.olderThan30d)).toEqual([false, true, true]);
  });
});

describe("재검토 기준 집계", () => {
  test("동시 신청 자동 취소는 묶음 단위로 센다", () => {
    const marks = { decidedBy: "시스템", reason: "동시 신청 중복 — 먼저 접수된 신청이 있어 자동 취소" };
    const all = [
      row({ requestId: "A", batchId: "B1", status: "취소", decidedBy: "시스템", rejectReason: marks.reason }),
      row({ requestId: "B", batchId: "B1", status: "취소", decidedBy: "시스템", rejectReason: marks.reason }),
      row({ requestId: "C", status: "취소", decidedBy: "시스템(결제 기한 경과)", rejectReason: "결제 기한 경과" }),
      row({ requestId: "D", status: "접수" }),
    ];
    expect(storageReviewStats(all, marks)).toEqual({ requestRows: 4, duplicateCancelled: 1 });
  });
});

describe("감사로그 시각 해석", () => {
  test("KST 문자열 → epoch · 가장 최근 기록", () => {
    expect(auditTsToMs("2026-10-28 04:00:00")).toBe(Date.parse("2026-10-27T19:00:00Z"));
    expect(Number.isNaN(auditTsToMs("bad"))).toBe(true);
    const tail = [
      { timestamp: "2026-10-27 04:00:00", action: "시트 백업", target: "a" },
      { timestamp: "2026-10-28 04:00:00", action: "시트 백업", target: "b" },
      { timestamp: "2026-10-28 05:00:00", action: "시트 백업 실패", target: "c" },
    ];
    expect(lastOf(tail, "SHEET_BACKUP")?.row.target).toBe("b");
    expect(lastOf(tail, "SHEET_BACKUP_FAIL")?.row.target).toBe("c");
    expect(lastOf(tail, "SCHEDULE_SYNC_START")).toBeNull();
  });
});
