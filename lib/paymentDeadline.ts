/**
 * 결제 기한 경과 자동 취소 · D-1 리마인드 — 대상 선별(순수 함수)과 실행기 (2026-10-26)
 *
 * 보호 4중(01_spec ⑦): ⑴ 기한 미설정 건 절대 제외 ⑵ PAYMENT_AUTO_CANCEL_SINCE 이전 기한 제외
 * ⑶ 1회 상한(기본 20묶음) ⑷ dryRun. 취소는 상태 변경이지 행 삭제가 아니다.
 */

import type { RentalRequest } from "@/lib/types";
import type { Database } from "@/lib/database";
import { nowIsoSeoul, todayYmdSeoul } from "@/lib/datetime";
import { recordAudit, auditLog } from "@/lib/auditLog";
import { maskName } from "@/lib/mask";
import {
  AUTO_CANCEL_DECIDED_BY,
  autoCancelReason,
  addDaysYmd,
  bundleKey,
  groupBundles,
  isYmdString,
  paymentRep,
} from "@/lib/payment";
import {
  sendApplicantAutoCancelEmail,
  sendApplicantPaymentReminderEmail,
  sendAdminPaymentDeadlineSummaryEmail,
} from "@/lib/mail";

export const DEFAULT_MAX_PER_RUN = 20;

export type DeadlineTarget = {
  key: string;
  sessions: RentalRequest[];
  approved: RentalRequest[];
  paymentDueDate: string;
};

export type SelectOptions = {
  /** 실행 시점 KST 날짜 */
  todayYmd: string;
  /** 이 날짜 이전 기한은 제외 (배포 첫 실행 보호) */
  sinceYmd: string;
  /** 1회 상한(묶음) */
  maxPerRun?: number;
};

/** 결제 미확인(빈값·미결제) 판정 */
function isUnpaid(rep: RentalRequest | null): boolean {
  const s = rep?.paymentStatus ?? "";
  return s === "" || s === "미결제";
}

/**
 * 자동 취소 대상 선별 — 4조건 모두 만족하는 묶음
 * 1 승인 회차 ≥ 1 · 2 paymentDueDate 설정 · 3 결제 미확인 · 4 today > paymentDueDate (기한 당일 제외)
 * + paymentDueDate ≥ sinceYmd · paymentDueDate 오름차순 · 상한 적용
 */
export function selectDeadlineCancelTargets(
  all: RentalRequest[],
  opts: SelectOptions
): { targets: DeadlineTarget[]; candidates: number; skippedOverCap: number } {
  const max = Math.max(1, Math.floor(opts.maxPerRun ?? DEFAULT_MAX_PER_RUN));
  const found: DeadlineTarget[] = [];
  for (const [key, sessions] of groupBundles(all)) {
    const approved = sessions.filter((s) => s.status === "승인");
    if (approved.length === 0) continue; // 1
    const rep = paymentRep(sessions);
    const due = rep?.paymentDueDate ?? "";
    if (!isYmdString(due)) continue; // 2
    if (!isUnpaid(rep)) continue; // 3
    if (!(opts.todayYmd > due)) continue; // 4 (기한 당일은 대상 아님)
    if (due < opts.sinceYmd) continue; // SINCE 보호
    found.push({ key, sessions, approved, paymentDueDate: due });
  }
  found.sort((a, b) => a.paymentDueDate.localeCompare(b.paymentDueDate) || a.key.localeCompare(b.key));
  const targets = found.slice(0, max);
  return { targets, candidates: found.length, skippedOverCap: Math.max(0, found.length - targets.length) };
}

/** D-1 리마인드 대상: 승인 ≥1 · 미결제 · 링크 있음 · 기한 == 내일 · 리마인드 미발송 */
export function selectReminderTargets(all: RentalRequest[], todayYmd: string): DeadlineTarget[] {
  const tomorrow = addDaysYmd(todayYmd, 1);
  const out: DeadlineTarget[] = [];
  for (const [key, sessions] of groupBundles(all)) {
    const approved = sessions.filter((s) => s.status === "승인");
    if (approved.length === 0) continue;
    const rep = paymentRep(sessions);
    if (!isUnpaid(rep)) continue;
    if (!rep?.paymentLinkUrl) continue;
    if (rep.paymentDueDate !== tomorrow) continue;
    if (rep.paymentReminderSentAt) continue;
    out.push({ key, sessions, approved, paymentDueDate: rep.paymentDueDate });
  }
  return out;
}

/* ───────────────────────────── 실행기 ───────────────────────────── */

export type RunError = { key: string; stage: "status" | "mail" | "audit" | "reminder"; message: string };

export type CancelledItem = {
  key: string;
  requestIds: string[];
  roomName: string;
  paymentDueDate: string;
  approvedCount: number;
  mailOk: boolean | null;
};

export type RunResult = {
  ranAt: string;
  today: string;
  dryRun: boolean;
  since: string;
  maxPerRun: number;
  candidates: number;
  cancelled: CancelledItem[];
  skippedOverCap: number;
  reminders: { enabled: boolean; candidates: number; sent: number; failed: number };
  errors: RunError[];
};

export function paymentDeadlineConfig(): { since: string | null; maxPerRun: number; reminderEnabled: boolean } {
  const since = (process.env.PAYMENT_AUTO_CANCEL_SINCE || "").trim();
  const maxRaw = parseInt((process.env.PAYMENT_AUTO_CANCEL_MAX_PER_RUN || "").trim(), 10);
  const maxPerRun = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_MAX_PER_RUN;
  const rem = (process.env.PAYMENT_REMINDER_ENABLED ?? "true").trim().toLowerCase();
  const reminderEnabled = !(rem === "false" || rem === "0" || rem === "off");
  return { since: isYmdString(since) ? since : null, maxPerRun, reminderEnabled };
}

function describeWhen(sessions: RentalRequest[]): string {
  const first = sessions[0];
  if (first.roomId === "gallery" && first.startDate && first.endDate) return `${first.startDate}~${first.endDate}`;
  const dates = sessions.map((s) => s.date).filter(Boolean).sort();
  if (!dates.length) return "";
  return dates.length === 1 ? dates[0] : `${dates[0]}~${dates[dates.length - 1]}`;
}

/**
 * 자동 취소 + 리마인드 1회 실행
 * - 묶음마다: 승인 회차 전부 취소 → autoCancelledAt(전 행) → 신청자 메일 1통(실패해도 취소 유지) → 감사(await)
 * - 상태 변경 자체가 실패한 묶음은 건너뛰고 errors에 기록, 다음 묶음 계속
 */
export async function runPaymentDeadline(
  db: Database,
  opts: { todayYmd?: string; dryRun?: boolean; ip?: string; trigger?: string }
): Promise<RunResult> {
  const cfg = paymentDeadlineConfig();
  if (!cfg.since) throw new Error("PAYMENT_AUTO_CANCEL_SINCE not configured");
  const today = opts.todayYmd ?? todayYmdSeoul();
  const dryRun = !!opts.dryRun;
  const ranAt = nowIsoSeoul();

  const all = await db.getAllRequests();
  const { targets, candidates, skippedOverCap } = selectDeadlineCancelTargets(all, {
    todayYmd: today,
    sinceYmd: cfg.since,
    maxPerRun: cfg.maxPerRun,
  });

  const cancelled: CancelledItem[] = [];
  const errors: RunError[] = [];

  for (const t of targets) {
    const first = t.sessions[0];
    const item: CancelledItem = {
      key: t.key,
      requestIds: t.approved.map((r) => r.requestId),
      roomName: first.roomName || first.roomId,
      paymentDueDate: t.paymentDueDate,
      approvedCount: t.approved.length,
      mailOk: null,
    };
    if (dryRun) {
      cancelled.push(item);
      continue;
    }

    // a. 승인 회차만 취소 (반려·취소 회차는 그대로) — 묶음당 시트 쓰기 1회 (audit-fix-1 [9])
    try {
      await db.updateRequestsStatusBatch(
        t.approved.map((r) => ({
          requestId: r.requestId,
          status: "취소" as const,
          adminMemo: r.adminMemo ?? "",
          rejectReason: autoCancelReason(t.paymentDueDate),
          decidedBy: AUTO_CANCEL_DECIDED_BY,
        })),
        undefined,
        // b. 묶음 전 행에 autoCancelledAt — 같은 쓰기 요청에 합침(묶음당 시트 읽기 1·쓰기 1)
        { requestId: first.requestId, patch: { autoCancelledAt: ranAt } }
      );
    } catch (e) {
      errors.push({ key: t.key, stage: "status", message: e instanceof Error ? e.message : String(e) });
      continue;
    }

    // c. 신청자 취소 메일 1통 (실패해도 취소 유지)
    let mailOk = true;
    try {
      const cancelledSessions = t.approved.map((r) => ({ ...r, status: "취소" as const, rejectReason: autoCancelReason(t.paymentDueDate), decidedBy: AUTO_CANCEL_DECIDED_BY }));
      await sendApplicantAutoCancelEmail(cancelledSessions, t.paymentDueDate);
    } catch (e) {
      mailOk = false;
      errors.push({ key: t.key, stage: "mail", message: "취소 안내 메일 발송 실패(상세는 서버 로그)" });
      console.error("[payment-deadline] mail error", t.key, e instanceof Error ? e.message : String(e));
    }
    item.mailOk = mailOk;
    cancelled.push(item);

    // d. 감사로그 (await · 시트 저장)
    try {
      await recordAudit({
        action: "PAYMENT_DEADLINE_AUTO_CANCEL",
        ip: opts.ip ?? "cron",
        actor: "시스템",
        target: (first.batchId ?? "").trim() || first.requestId,
        summary: [
          "승인 → 취소(자동)",
          `결제 기한 ${t.paymentDueDate} 경과`,
          first.roomName || first.roomId,
          describeWhen(t.approved),
          maskName(first.orgName && first.orgName !== "개인" ? first.orgName : first.applicantName),
          `메일 발송 ${mailOk ? "성공" : "실패"}`,
        ].filter(Boolean).join(" · "),
        details: {
          batchId: (first.batchId ?? "").trim() || undefined,
          requestIds: item.requestIds,
          paymentDueDate: t.paymentDueDate,
          approvedCount: t.approved.length,
          mailOk,
          dryRun: false,
          trigger: opts.trigger ?? "cron",
        },
      });
    } catch (e) {
      errors.push({ key: t.key, stage: "audit", message: e instanceof Error ? e.message : String(e) });
    }
  }

  // D-1 리마인드
  const reminders = { enabled: cfg.reminderEnabled, candidates: 0, sent: 0, failed: 0 };
  if (cfg.reminderEnabled) {
    // 취소 뒤 최신 상태로 다시 읽어 리마인드 대상 선별 (같은 실행에서 취소된 묶음은 승인 0건이라 제외됨)
    const latest = dryRun ? all : await db.getAllRequests();
    const remTargets = selectReminderTargets(latest, today);
    reminders.candidates = remTargets.length;
    if (!dryRun) {
      for (const t of remTargets) {
        const first = t.sessions[0];
        try {
          await sendApplicantPaymentReminderEmail(t.approved, t.paymentDueDate);
          await db.updateRequestPayment({ requestId: first.requestId, patch: { paymentReminderSentAt: nowIsoSeoul() } });
          reminders.sent++;
          auditLog({
            action: "PAYMENT_REMINDER_SEND",
            ip: opts.ip ?? "cron",
            actor: "시스템",
            target: (first.batchId ?? "").trim() || first.requestId,
            summary: `결제 기한 리마인드 · 기한 ${t.paymentDueDate} · ${first.roomName || first.roomId} · ${describeWhen(t.approved)}`,
            details: { paymentDueDate: t.paymentDueDate, approvedCount: t.approved.length },
          });
        } catch (e) {
          reminders.failed++;
          errors.push({ key: t.key, stage: "reminder", message: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }

  const result: RunResult = {
    ranAt,
    today,
    dryRun,
    since: cfg.since,
    maxPerRun: cfg.maxPerRun,
    candidates,
    cancelled,
    skippedOverCap,
    reminders,
    errors,
  };

  // 관리자 요약 메일: 취소 ≥1 · 상한 초과 · 오류 (⑧-B-3) — dryRun 제외
  if (!dryRun && (cancelled.length > 0 || skippedOverCap > 0 || errors.length > 0)) {
    try {
      await sendAdminPaymentDeadlineSummaryEmail(result);
    } catch (e) {
      console.warn("[payment-deadline] 관리자 요약 메일 실패", e instanceof Error ? e.message : e);
    }
  }

  return result;
}

/** 응답용 키(개인정보 없음) */
export function targetKeyOf(r: RentalRequest): string {
  return bundleKey(r);
}
