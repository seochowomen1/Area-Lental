/**
 * 라우트 핸들러 직접 호출 테스트용 환경 (audit-fix-1)
 * - MOCK_MODE + 임시 폴더의 .mockdb.json (프로젝트 .mockdb.json은 건드리지 않음)
 * - lib/mockdb.ts는 import 시점의 process.cwd()로 경로를 정하므로, 라우트 모듈은 setup 뒤에 require 한다.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { addDays } from "@/lib/rules/ymd";

/** 오늘(KST) YYYY-MM-DD */
export function todayYmd(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function setupMockEnv(tag: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `al-${tag}-`));
  const prevCwd = process.cwd();
  process.env.MOCK_MODE = "true";
  process.env.ADMIN_PASSWORD = "test-admin-password";
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_SESSION_SECRET;
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.chdir(dir);
  return {
    dir,
    restore() {
      process.chdir(prevCwd);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 무시 */ }
    },
  };
}

let ipSeq = 1;
export function nextIp() {
  ipSeq += 1;
  return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
}

/** 오늘(KST) 기준 n주 뒤의 특정 요일 YYYY-MM-DD (0=일 … 6=토) */
export function futureDate(dow: number, weeksAhead = 3): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const base = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + weeksAhead * 7));
  while (base.getUTCDay() !== dow) base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

/** 날짜 더하기 — lib/rules/ymd.ts 1벌 (3-3) */
export { addDays };

/** 강의실·스튜디오 기본 신청 폼 */
export function lectureForm(over: Record<string, string>): FormData {
  const date = over.date ?? futureDate(3);
  const base: Record<string, string> = {
    roomId: "sangsang1",
    date,
    startTime: "10:00",
    endTime: "12:00",
    applicantName: "홍가명",
    birth: "1990-01-01",
    address: "서울 서초구",
    phone: "01000000000",
    email: "applicant@example.com",
    orgName: "가명단체",
    headcount: "5",
    purpose: "테스트용 신청입니다",
    privacyAgree: "on",
    pledgeAgree: "on",
    pledgeDate: todayYmd(),
    pledgeName: "홍가명",
  };
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  if (!over.sessions) {
    const merged = { ...base, ...over };
    f.set("sessions", JSON.stringify([{ date: merged.date, startTime: merged.startTime, endTime: merged.endTime }]));
  }
  return f;
}

export function galleryForm(over: Record<string, string>): FormData {
  const start = over.startDate ?? futureDate(1, 4);
  const end = over.endDate ?? addDays(start, 4);
  const base: Record<string, string> = {
    roomId: "gallery",
    date: start,
    startTime: "09:00",
    endTime: "18:00",
    startDate: start,
    endDate: end,
    exhibitionTitle: "테스트 전시",
    galleryRemovalTime: "11:00",
    // galleryPrepDate 미전송 = 서버가 전날 준비일 자동 계산(온라인은 준비일 필수 · 2026-10-28)
    applicantName: "홍가명",
    birth: "1990-01-01",
    address: "서울 서초구",
    phone: "01000000000",
    email: "artist@example.com",
    orgName: "개인",
    headcount: "10",
    purpose: "테스트 전시",
    privacyAgree: "on",
    pledgeAgree: "on",
    pledgeDate: todayYmd(),
    pledgeName: "홍가명",
  };
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  return f;
}

export async function postRequest(form: FormData, headers: Record<string, string> = {}) {
  const { POST } = require("@/app/api/requests/route");
  const res: Response = await POST(new Request("http://localhost/api/requests", { method: "POST", body: form, headers: { "x-forwarded-for": nextIp(), ...headers } }));
  return { status: res.status, body: await res.json() };
}

export async function postJson(modulePath: string, url: string, body: unknown, headers: Record<string, string> = {}) {
  const { POST } = require(modulePath);
  const res: Response = await POST(new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": nextIp(), ...headers } }));
  return { status: res.status, body: await res.json() };
}
