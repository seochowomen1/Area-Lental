/**
 * 신청 보내기 — 응답을 화면 상태 셋으로 나눈다 (audit-fix-3 3-4 · 02_ui_apply §2-8 S3)
 * - ok: 완료 화면 주소(handleApplySuccess — 토큰은 sessionStorage에만)
 * - schedule: 409 SLOT_TAKEN·BATCH_CONFLICT · 400 SESSION_INVALID → 입력 보기로 돌아가 일정 카드 빨간 줄
 * - error: 그 밖(확인 보기에 반려톤 상자)
 * 보내는 데이터 형식은 3-4 전과 같다(rawToFormData).
 */
import { handleApplySuccess, parseApplyError } from "@/lib/applySubmit";

export type ScheduleIssue = { date?: string; startTime?: string; endTime?: string; message?: string };

export type PostApplyResult =
  | { kind: "ok"; href: string }
  | { kind: "schedule"; message: string; issues: ScheduleIssue[] }
  | { kind: "error"; message: string };

const SCHEDULE_CODES = new Set(["SLOT_TAKEN", "BATCH_CONFLICT", "SESSION_INVALID"]);

export function classifyApplyResponse(status: number, data: unknown, isGallery: boolean): Exclude<PostApplyResult, { kind: "ok" }> {
  const d = (data ?? {}) as { code?: string; issues?: ScheduleIssue[] };
  const v = parseApplyError(data, isGallery);
  if (SCHEDULE_CODES.has(String(d.code ?? ""))) {
    return { kind: "schedule", message: v.message, issues: Array.isArray(d.issues) ? d.issues : [] };
  }
  return { kind: "error", message: v.message };
}

export async function postApply(fd: FormData, opts: { category?: "gallery"; screenFeeKRW?: number | null }): Promise<PostApplyResult> {
  try {
    const res = await fetch("/api/requests", { method: "POST", body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok) return classifyApplyResponse(res.status, data, opts.category === "gallery");
    return { kind: "ok", href: handleApplySuccess(data, opts) };
  } catch {
    return { kind: "error", message: "신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

/** 회차 줄의 문제 문구(서버 issues 우선) */
export function issueForSession(issues: readonly ScheduleIssue[], s: { date: string; startTime: string; endTime: string }): string | null {
  const hit = issues.find((it) => it.date === s.date && (!it.startTime || it.startTime === s.startTime));
  if (hit?.message) return hit.message;
  const byText = issues.find((it) => typeof it.message === "string" && it.message.startsWith(`${s.date} ${s.startTime}`));
  return byText?.message ?? null;
}

/** 완료 화면 카드용 요약(개인정보 없음 · 같은 탭 sessionStorage) */
export type DoneSummary = { requestId: string; roomName: string; schedule: string; feeLabel: string };
const DONE_KEY = "applyDoneSummary";

/** 완료 주소에서 신청번호 */
export function requestIdFromHref(href: string): string {
  return new URLSearchParams(href.split("?")[1] ?? "").get("requestId") ?? "";
}

export function saveDoneSummary(s: DoneSummary): void {
  try {
    window.sessionStorage.setItem(DONE_KEY, JSON.stringify(s));
  } catch {
    /* 무시 */
  }
}

/** 같은 신청번호일 때만(다른 신청의 요약이 섞이지 않게) */
export function readDoneSummary(requestId: string | null): DoneSummary | null {
  try {
    const o = JSON.parse(window.sessionStorage.getItem(DONE_KEY) ?? "null");
    if (o && requestId && o.requestId === requestId && typeof o.roomName === "string" && typeof o.schedule === "string")
      return { requestId: o.requestId, roomName: o.roomName, schedule: o.schedule, feeLabel: String(o.feeLabel ?? "") };
  } catch {
    /* 무시 */
  }
  return null;
}
