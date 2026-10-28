/**
 * audit-fix-3 3-1 — 시트 백업 라우트 (MOCK_MODE · 드라이브 대신 임시 폴더 `.mock-backups/`)
 * 운영 시트·드라이브에 접근하지 않는다. 실제 드라이브 업로드는 DriveBackupStore를 가짜 drive 객체로 확인.
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { setupMockEnv, nextIp } from "../helpers/routeEnv";

let env: ReturnType<typeof setupMockEnv>;
beforeAll(() => {
  env = setupMockEnv("backup");
  process.env.CRON_SECRET = "test-cron-secret-value";
});
afterAll(() => {
  delete process.env.CRON_SECRET;
  env.restore();
});
afterEach(() => {
  delete process.env.MOCK_BACKUP_STORE;
  jest.restoreAllMocks();
});

const db = () => require("@/lib/database").getDatabase();
const backupDir = () => path.join(process.cwd(), ".mock-backups");

async function adminCookie(): Promise<string> {
  const { createAdminSession } = require("@/lib/adminSession");
  const s = await createAdminSession();
  return `admin_auth=${encodeURIComponent(s.token)}; admin_last_activity=${encodeURIComponent(s.activity)}`;
}

async function call(mod: string, method: "GET" | "POST" | "DELETE", url: string, headers: Record<string, string> = {}, body?: unknown) {
  const handler = require(mod)[method];
  const init: RequestInit = { method, headers: { "x-forwarded-for": nextIp(), ...headers } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  const res: Response = await handler(new Request(url, init));
  return { status: res.status, body: await res.json() };
}

const RUN = "@/app/api/admin/backup/run/route";
const LIST = "@/app/api/admin/backup/list/route";
const DEL = "@/app/api/admin/backup/route";
const RUN_URL = "http://localhost/api/admin/backup/run";

async function seed(n: number) {
  const base = {
    roomId: "sangsang1", startTime: "10:00", endTime: "12:00",
    applicantName: "홍가명", birth: "1990-01-01", address: "서울", phone: "01000000000", email: "a@example.com",
    orgName: "가명", headcount: 5, equipment: { laptop: false, projector: false, audio: false }, purpose: "테스트",
    attachments: [], privacyAgree: true, pledgeAgree: true, pledgeDate: "2026-10-26", pledgeName: "홍가명",
  };
  return db().appendRequestsBatch(Array.from({ length: n }, (_, i) => ({ ...base, date: `2026-12-${String(i + 1).padStart(2, "0")}` })));
}

describe("POST /api/admin/backup/run", () => {
  test("관리자 쿠키 → 200 · tabs.requests = 신청 행 수 · 엑셀 탭·헤더가 데이터와 같음", async () => {
    await seed(3);
    const total = (await db().getAllRequests()).length;
    const r = await call(RUN, "POST", RUN_URL, { cookie: await adminCookie() });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.trigger).toBe("admin");
    expect(r.body.fileName).toMatch(/^대관앱백업_\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/);
    expect(r.body.tabs.requests).toBe(total);
    expect(typeof r.body.durationMs).toBe("number");

    const file = path.join(backupDir(), r.body.fileName);
    expect(fs.existsSync(file)).toBe(true);
    const wb = XLSX.read(fs.readFileSync(file));
    const { mock_exportTabs } = require("@/lib/mockdb");
    const tabs: Array<{ title: string; rows: string[][] }> = await mock_exportTabs();
    expect(wb.SheetNames).toEqual(tabs.map((t) => t.title));
    for (const t of tabs) {
      const first = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[t.title], { header: 1 })[0] ?? [];
      expect(first).toEqual(t.rows[0]);
    }
  });

  test("무인증 → 401 · 위조 쿠키 → 401 · 틀린 Bearer → 401", async () => {
    expect((await call(RUN, "POST", RUN_URL)).status).toBe(401);
    expect((await call(RUN, "POST", RUN_URL, { cookie: `admin_auth=v2.forged.sig; admin_last_activity=${Date.now()}.forged` })).status).toBe(401);
    expect((await call(RUN, "GET", RUN_URL, { authorization: "Bearer wrong-secret" })).status).toBe(401);
  });

  test("크론 Bearer(GET) → 200 trigger=cron", async () => {
    const r = await call(RUN, "GET", RUN_URL, { authorization: "Bearer test-cron-secret-value" });
    expect(r.status).toBe(200);
    expect(r.body.trigger).toBe("cron");
  });

  test("드라이브 설정 없음 → 503 BACKUP_DRIVE_NOT_CONFIGURED · 크론이면 관리자 알림 메일 1통", async () => {
    process.env.MOCK_BACKUP_STORE = "off";
    const mail = require("@/lib/mail");
    const spy = jest.spyOn(mail, "sendAdminBackupFailEmail").mockResolvedValue(undefined);
    const admin = await call(RUN, "POST", RUN_URL, { cookie: await adminCookie() });
    expect(admin.status).toBe(503);
    expect(admin.body).toMatchObject({ ok: false, code: "BACKUP_DRIVE_NOT_CONFIGURED", message: "드라이브 연결 설정이 없어 백업할 수 없습니다." });
    expect(spy).not.toHaveBeenCalled(); // 관리자 버튼은 화면에 바로 보이므로 메일 없음

    const cron = await call(RUN, "GET", RUN_URL, { authorization: "Bearer test-cron-secret-value" });
    expect(cron.status).toBe(503);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ code: "BACKUP_DRIVE_NOT_CONFIGURED" });
  });

  test("시트 읽기 한도(429) → 503 SHEET_BUSY · 다른 오류 → 500 BACKUP_FAILED(원인 비노출)", async () => {
    const sheets = require("@/lib/sheets");
    const q = Object.assign(new Error("Quota exceeded for quota metric"), { code: 429 });
    jest.spyOn(sheets, "readAllTabsForBackup").mockRejectedValueOnce(q);
    const busy = await call(RUN, "POST", RUN_URL, { cookie: await adminCookie() });
    expect(busy.status).toBe(503);
    expect(busy.body.code).toBe("SHEET_BUSY");

    jest.spyOn(sheets, "readAllTabsForBackup").mockRejectedValueOnce(new Error("secret internal detail"));
    const failed = await call(RUN, "POST", RUN_URL, { cookie: await adminCookie() });
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ ok: false, code: "BACKUP_FAILED", message: "백업하지 못했습니다." });
    expect(JSON.stringify(failed.body)).not.toContain("secret");
  });
});

describe("GET /api/admin/backup/list · DELETE /api/admin/backup", () => {
  const OLD = "대관앱백업_2026-08-01_0400.xlsx";
  const OLD2 = "대관앱백업_2026-08-02_0400.xlsx";
  const NEW = "대관앱백업_2099-01-01_0400.xlsx";
  const OTHER = "메모.xlsx";

  function place(name: string, daysAgo: number) {
    fs.mkdirSync(backupDir(), { recursive: true });
    const p = path.join(backupDir(), name);
    fs.writeFileSync(p, "x");
    const t = new Date(Date.now() - daysAgo * 86400000);
    fs.utimesSync(p, t, t);
  }

  beforeEach(() => {
    fs.rmSync(backupDir(), { recursive: true, force: true });
    place(OLD, 40);
    place(OLD2, 39);
    place(NEW, 1);
    place(OTHER, 60);
  });

  test("목록: 이름 형식 맞는 파일만 · 30일 표시 · 무인증 401", async () => {
    expect((await call(LIST, "GET", "http://localhost/api/admin/backup/list")).status).toBe(401);
    const r = await call(LIST, "GET", "http://localhost/api/admin/backup/list", { cookie: await adminCookie() });
    expect(r.status).toBe(200);
    expect(r.body.configured).toBe(true);
    expect(r.body.count).toBe(3);
    const names = r.body.items.map((i: { name: string }) => i.name);
    expect(names).not.toContain(OTHER);
    const old = r.body.items.filter((i: { olderThan30d: boolean }) => i.olderThan30d).map((i: { name: string }) => i.name).sort();
    expect(old).toEqual([OLD, OLD2]);
    expect(r.body.lastSuccessAt).toBeTruthy(); // 감사로그가 없어도 가장 최근 파일로 판단
  });

  test("30일 안 된 파일이 섞이면 409 · 아무것도 지우지 않음", async () => {
    const r = await call(DEL, "DELETE", "http://localhost/api/admin/backup", { cookie: await adminCookie() }, { fileIds: [OLD, NEW], confirmCount: 2 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NOT_DELETABLE");
    expect(fs.existsSync(path.join(backupDir(), OLD))).toBe(true);
    expect(fs.existsSync(path.join(backupDir(), NEW))).toBe(true);
  });

  test("형식이 다른 파일 · 폴더 밖 경로 → 409 · 지우지 않음", async () => {
    const cookie = await adminCookie();
    expect((await call(DEL, "DELETE", "http://localhost/api/admin/backup", { cookie }, { fileIds: [OTHER], confirmCount: 1 })).status).toBe(409);
    expect((await call(DEL, "DELETE", "http://localhost/api/admin/backup", { cookie }, { fileIds: ["../.mockdb.json"], confirmCount: 1 })).status).toBe(409);
    expect(fs.existsSync(path.join(backupDir(), OTHER))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), ".mockdb.json"))).toBe(true);
  });

  test("confirmCount 불일치 → 400 COUNT_MISMATCH", async () => {
    const r = await call(DEL, "DELETE", "http://localhost/api/admin/backup", { cookie: await adminCookie() }, { fileIds: [OLD], confirmCount: 2 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "COUNT_MISMATCH", message: "확인한 개수와 삭제할 개수가 다릅니다. 목록을 다시 열어 주세요." });
    expect(fs.existsSync(path.join(backupDir(), OLD))).toBe(true);
  });

  test("확인한 목록만 삭제 → 200 deleted 2 · 나머지는 그대로", async () => {
    const r = await call(DEL, "DELETE", "http://localhost/api/admin/backup", { cookie: await adminCookie() }, { fileIds: [OLD, OLD2], confirmCount: 2 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, deleted: 2 });
    expect(fs.existsSync(path.join(backupDir(), OLD))).toBe(false);
    expect(fs.existsSync(path.join(backupDir(), NEW))).toBe(true);
    expect(fs.existsSync(path.join(backupDir(), OTHER))).toBe(true);
  });

  test("무인증 DELETE → 401 · 지우지 않음", async () => {
    const r = await call(DEL, "DELETE", "http://localhost/api/admin/backup", {}, { fileIds: [OLD], confirmCount: 1 });
    expect(r.status).toBe(401);
    expect(fs.existsSync(path.join(backupDir(), OLD))).toBe(true);
  });
});

describe("관리자 홈 띠(getBackupHealth)", () => {
  test("기록 없음 → never · 36시간 넘음 → stale · 최근 → 숨김", async () => {
    const backup = require("@/lib/backup");
    const { mock_appendAuditRow } = require("@/lib/mockdb");
    const now = Date.parse("2026-10-29T00:00:00Z");
    backup.__resetBackupHealthCache();
    expect(await backup.getBackupHealth(now)).toEqual({ show: true, kind: "never" });

    const row = (ts: string) => ({ timestamp: ts, action: "시트 백업", target: "f", actor: "시스템", summary: "", details: "", ip: "cron" });
    await mock_appendAuditRow(row("2026-10-28 04:00:00")); // = 10-27T19:00Z → 29시간 전
    backup.__resetBackupHealthCache();
    expect(await backup.getBackupHealth(now)).toEqual({ show: false });
    backup.__resetBackupHealthCache();
    expect(await backup.getBackupHealth(now + 8 * 3600000)).toEqual({ show: true, kind: "stale" }); // 37시간
  });
});

describe("드라이브 저장소(가짜 drive 객체 — 실제 드라이브 호출 없음)", () => {
  test("폴더를 이름으로 찾고 그 폴더에 업로드 · 목록은 그 폴더만 · 삭제는 files.delete", async () => {
    const calls: Array<{ op: string; arg: Record<string, unknown> }> = [];
    const fakeDrive = {
      files: {
        list: async (arg: Record<string, unknown>) => {
          calls.push({ op: "list", arg });
          if (String(arg.q).includes("mimeType = 'application/vnd.google-apps.folder'")) return { data: { files: [{ id: "FOLDER1", name: "대관앱 백업" }] } };
          return { data: { files: [{ id: "F1", name: "대관앱백업_2026-10-28_0400.xlsx", createdTime: "2026-10-28T19:00:00Z" }] } };
        },
        create: async (arg: Record<string, unknown>) => {
          calls.push({ op: "create", arg });
          return { data: { id: "NEWID", name: (arg.requestBody as { name: string }).name, createdTime: "2026-10-29T19:00:00Z" } };
        },
        delete: async (arg: Record<string, unknown>) => {
          calls.push({ op: "delete", arg });
          return { data: {} };
        },
      },
    };
    // DriveBackupStore는 내보내지 않으므로 getBackupStore의 운영 분기를 탄다: env·google 클라이언트만 격리 모듈에서 바꿔 끼운다
    let store: { kind: string; upload: (n: string, b: Buffer) => Promise<unknown>; list: () => Promise<unknown[]>; remove: (id: string) => Promise<void>; folderUrl: () => Promise<string | null> } | null = null;
    await jest.isolateModulesAsync(async () => {
      jest.doMock("@/lib/env", () => ({ ...jest.requireActual("@/lib/env"), isMockMode: () => false, getGoogleOAuthEnvOptional: () => ({ GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y", GOOGLE_OAUTH_REFRESH_TOKEN: "z" }) }));
      jest.doMock("@/lib/google", () => ({ getDriveUploadClient: () => ({ drive: fakeDrive, mode: "oauth" }) }));
      const b = require("@/lib/backup");
      store = await b.getBackupStore();
    });
    expect(store).not.toBeNull();
    expect(store!.kind).toBe("drive");
    await store!.upload("대관앱백업_2026-10-30_0400.xlsx", Buffer.from("x"));
    const created = calls.find((c) => c.op === "create");
    expect((created!.arg.requestBody as { parents: string[] }).parents).toEqual(["FOLDER1"]);
    const items = await store!.list();
    expect(items).toHaveLength(1);
    const listCall = calls.filter((c) => c.op === "list").pop()!;
    expect(String(listCall.arg.q)).toBe("'FOLDER1' in parents and trashed = false");
    await store!.remove("F1");
    expect(calls.find((c) => c.op === "delete")!.arg).toEqual({ fileId: "F1" });
    expect(await store!.folderUrl()).toBe("https://drive.google.com/drive/folders/FOLDER1");
  });
});
