/**
 * 관리자 "할 일" 단계 판정 (audit-fix-3 3-2 · 간소화안 v2 · 02_ui §4)
 *
 * DB 접근 없음. 서버 컴포넌트(관리자 홈·상세)와 테스트가 같이 쓰는 순수 함수.
 * 단위 = 묶음(batchId, 없으면 신청번호 1건). 결제 쪽 판정은 기존 `derivePaymentView`를 그대로 부른다.
 *
 * 단계 4개 + 끝남:
 *   approve(승인) → notice(결제 안내) → payment(결제 확인) → close(홈페이지 마감) · done(끝남)
 * 판정 순서(위에서부터 처음 맞는 것):
 *   1. 회차 중 "접수"가 1개라도 있음                                          → approve
 *      (모든 회차 이용일이 오늘 전이면 sub=approvePastDate · 목록 맨 아래 별도 한 줄로 모음)
 *   2. 홈페이지 게시함 · 마감 기록 없음 · (결제완료·환불·자동 취소·전 회차 반려/취소) → close
 *   3. 자동 취소됨 · 마감 기록 없음(게시 체크가 없어도)                          → close
 *   4. 승인 ≥1 · 승인 요금 0원                                               → done(무료 승인)
 *   5. 승인 ≥1 · 결제 기록 없음 · (가장 늦은 승인일 < WORKFLOW_SINCE 또는 승인일 기록 없음) → done(이전 방식)
 *   6. 승인 ≥1 · 미결제 · 기한 지남                                          → payment(overdue)
 *   7. 승인 ≥1 · 미결제 · (기한 없음 또는 링크 있는데 안내 메일 전)               → notice
 *   8. 승인 ≥1 · 미결제 · 안내 메일 보냄(또는 링크 없이 기한만)                  → payment
 *   9. 나머지                                                                → done
 */

import type { RentalRequest } from "@/lib/types";
import { derivePaymentView, formatShortMd, latestApprovedDate, type PaymentView } from "@/lib/payment";
import { dayOfWeek } from "@/lib/datetime";
import { sortSessions } from "@/lib/requestUtils";

/** 결제 4단계(payment-link-record) 배포일 — 이 날 전 승인·결제 기록 없음 = 이전 방식(⑧ Q8) */
export const WORKFLOW_SINCE = "2026-10-26";

export type WorkStage = "approve" | "notice" | "payment" | "close" | "done";

export type WorkSub =
  | "approvePastDate"
  | "noticeBeforeLink"
  | "noticeBeforeMail"
  | "paymentWaiting"
  | "closePaid"
  | "closeAutoCancelled"
  | "closeEnded"
  | null;

/** 목록 기한 칩 — 급할 때만 */
export type WorkChip = { kind: "overdue" | "dueToday" | "dueTomorrow"; text: string } | null;

export type WorkItem = {
  stage: WorkStage;
  sub: WorkSub;
  /** 결제 기한 지남(미결제) — 카드 빨강·목록 맨 위 */
  overdue: boolean;
  /** 오늘이 결제 기한(미결제) — 다음 날 09:00 자동 취소 직전 */
  dueToday: boolean;
  /** 내일이 결제 기한(미결제) */
  dueTomorrow: boolean;
  /** 접수 회차가 남았는데 모든 회차 이용일(갤러리는 전시 종료일)이 오늘 전 — 할 일 맨 아래 별도 묶음 */
  pastPending: boolean;
  /** 작을수록 급함 — 기한 지남 0 · 오늘 기한 1 · 내일 기한 2 · 홈페이지 마감 3 · 승인 4 · 결제 안내 5 · 결제 확인 6 · 이용일 지난 미처리 8 · 끝남 9 */
  urgentRank: number;
  chip: WorkChip;
  /** 접수(승인 전) 회차 수 */
  pendingCount: number;
  approvedCount: number;
  totalCount: number;
  /** 접수 회차가 남았는데 이미 처리된 회차도 있음 */
  partial: boolean;
  /** 목록 "다음 할 일" 칸 문구(끝남이면 사유) */
  nextLabel: string;
  /** 끝남 사유(③ 끝난 건 사유 문구) */
  doneReason: string;
  view: PaymentView;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** "2026-11-10" → "11/10(화)" */
export function shortMdDow(ymd: string): string {
  if (!isYmd(ymd)) return "";
  return `${formatShortMd(ymd)}(${WEEKDAY_KO[dayOfWeek(ymd)]})`;
}

/** "2026-11-09" → "11월 9일(월)" */
export function koMonthDayDow(ymd: string): string {
  if (!isYmd(ymd)) return ymd || "";
  const m = parseInt(ymd.slice(5, 7), 10);
  const d = parseInt(ymd.slice(8, 10), 10);
  return `${m}월 ${d}일(${WEEKDAY_KO[dayOfWeek(ymd)]})`;
}

/** 결제 필드가 하나도 없는가(이전 방식 판정용) */
function hasNoPaymentRecord(v: PaymentView): boolean {
  return (
    !v.paymentLinkUrl &&
    !v.paymentDueDate &&
    !v.noticeSentAt &&
    !v.homepagePostedAt &&
    !v.homepageClosedAt &&
    !v.autoCancelledAt &&
    (v.paymentStatus === "" || v.paymentStatus === "미결제")
  );
}

/** 회차들의 가장 늦은 처리일(decidedAt) M/D */
function latestDecidedShort(list: RentalRequest[]): string {
  const ds = list
    .map((s) => (s.decidedAt ?? "").slice(0, 10))
    .filter(isYmd)
    .sort();
  return ds.length ? formatShortMd(ds[ds.length - 1]) : "";
}

function withDate(label: string, md: string): string {
  return md ? `${label} ${md}` : label;
}

/** 끝남 사유 (01_spec ③ 3-2 끝난 건 사유 문구 · 해당 없는 경우는 같은 형식으로 보탬) */
function doneReasonOf(sessions: RentalRequest[], v: PaymentView, kind: "free" | "legacy" | "other"): string {
  if (kind === "free") return "무료 승인 · 결제 없음";
  if (kind === "legacy") return "이전 방식 승인 · 결제 기록 없음";

  const closedMd = formatShortMd(v.homepageClosedAt);
  if (v.paymentState === "paid") {
    const onSite = (v.paymentMethod ?? "").startsWith("현장");
    const head = onSite ? "결제 완료(현장)" : "결제 완료";
    if (v.homepageState === "closed") return `${head} · 홈페이지 마감 ${closedMd}`;
    return `${head} · 홈페이지 게시 안 함`;
  }
  if (v.paymentState === "refunded") {
    const base = withDate("환불", formatShortMd(v.refundedAt));
    return v.homepageState === "closed" ? `${base} · 홈페이지 마감 ${closedMd}` : base;
  }
  if (v.paymentState === "autoCancelled") {
    const base = withDate("자동 취소", formatShortMd((v.autoCancelledAt ?? "").slice(0, 10)));
    return v.homepageState === "closed" ? `${base} · 홈페이지 마감 ${closedMd}` : base;
  }

  const rejected = sessions.filter((s) => s.status === "반려");
  const cancelled = sessions.filter((s) => s.status === "취소");
  if (rejected.length && rejected.length === sessions.length) return withDate("반려", latestDecidedShort(rejected));
  if (cancelled.length && cancelled.length === sessions.length) {
    const bySystem = cancelled.every((s) => (s.decidedBy ?? "").startsWith("시스템"));
    return withDate(bySystem ? "자동 취소" : "신청자 취소", latestDecidedShort(cancelled));
  }
  if (rejected.length + cancelled.length === sessions.length) return withDate("반려·취소", latestDecidedShort(sessions));
  if (v.homepageState === "closed") return `홈페이지 마감 ${closedMd}`;
  return "처리 끝남";
}

const NEXT_LABEL: Record<Exclude<WorkStage, "done">, string> = {
  approve: "승인하기",
  notice: "결제 안내 보내기",
  payment: "결제 확인",
  close: "홈페이지 마감",
};

/** 묶음(또는 단건) 회차 → 단계 */
export function deriveWorkStage(sessionsIn: RentalRequest[], todayYmd: string): WorkItem {
  const sessions = sortSessions(sessionsIn);
  const view = derivePaymentView(sessions, todayYmd);
  const totalCount = sessions.length;
  const pendingCount = sessions.filter((s) => s.status === "접수").length;
  const approvedCount = sessions.filter((s) => s.status === "승인").length;
  const partial = pendingCount > 0 && pendingCount < totalCount;
  const allEnded = totalCount > 0 && sessions.every((s) => s.status === "반려" || s.status === "취소");
  const autoCancelled = view.paymentState === "autoCancelled";
  const unpaid = view.paymentState !== "paid" && view.paymentState !== "refunded" && !autoCancelled;

  const base = { pendingCount, approvedCount, totalCount, partial, view };

  const make = (stage: WorkStage, sub: WorkSub, extra?: { overdue?: boolean; dueToday?: boolean; dueTomorrow?: boolean; doneReason?: string }): WorkItem => {
    const overdue = !!extra?.overdue;
    const dueToday = !overdue && !!extra?.dueToday;
    const dueTomorrow = !overdue && !dueToday && !!extra?.dueTomorrow;
    const pastPending = sub === "approvePastDate";
    let urgentRank = 9;
    if (stage !== "done") {
      if (overdue) urgentRank = 0;
      else if (dueToday) urgentRank = 1;
      else if (dueTomorrow) urgentRank = 2;
      else if (pastPending) urgentRank = 8;
      else urgentRank = { approve: 4, notice: 5, payment: 6, close: 3 }[stage];
    }
    const chip: WorkChip = overdue
      ? { kind: "overdue", text: `기한 지남 ${view.dueDateShort}`.trim() }
      : dueToday
        ? { kind: "dueToday", text: "오늘 기한" }
        : dueTomorrow
          ? { kind: "dueTomorrow", text: "내일 기한" }
          : null;
    const doneReason = extra?.doneReason ?? "";
    return {
      ...base,
      stage,
      sub,
      overdue,
      dueToday,
      dueTomorrow,
      pastPending,
      urgentRank,
      chip,
      nextLabel: stage === "done" ? doneReason : pastPending ? "반려·취소로 정리" : NEXT_LABEL[stage],
      doneReason,
    };
  };

  // 1. 접수 회차가 있으면 승인부터(일부 처리된 묶음 포함)
  if (pendingCount > 0) {
    // 모든 회차 이용일(갤러리는 전시 종료일)이 오늘 전 → 승인할 일이 아니라 정리할 일(첫 화면을 덮지 않게 맨 아래 묶음)
    const lastUseDay = (s: RentalRequest) => (isYmd(s.endDate) ? s.endDate : s.date);
    const allPast = sessions.every((s) => isYmd(lastUseDay(s)) && lastUseDay(s) < todayYmd);
    return make("approve", allPast ? "approvePastDate" : null);
  }

  // 2·3. 홈페이지 마감
  const posted = view.homepageState === "posted";
  const closed = view.homepageState === "closed";
  if (posted && (view.paymentState === "paid" || view.paymentState === "refunded" || autoCancelled || allEnded)) {
    const sub: WorkSub = view.paymentState === "paid" ? "closePaid" : autoCancelled ? "closeAutoCancelled" : "closeEnded";
    return make("close", sub);
  }
  if (autoCancelled && !closed) return make("close", "closeAutoCancelled");

  if (approvedCount > 0 && unpaid) {
    // 4. 무료 승인
    if (view.approvedFeeKRW <= 0) return make("done", null, { doneReason: doneReasonOf(sessions, view, "free") });
    // 5. 이전 방식 승인
    const approvedOn = latestApprovedDate(sessions);
    // 승인일(decidedAt)이 빈 옛 데이터도 결제 기록이 없으면 이전 방식으로 본다(배포 전 확인 권고 · 안전한 기본값)
    if (hasNoPaymentRecord(view) && (!approvedOn || approvedOn < WORKFLOW_SINCE)) {
      return make("done", null, { doneReason: doneReasonOf(sessions, view, "legacy") });
    }
    const overdue = view.paymentState === "overdue";
    const dueTomorrow = view.paymentState === "dueTomorrow";
    // 기한 당일: derivePaymentView는 waiting으로 두지만(다른 화면도 씀) 할 일에서는 내일 기한보다 급하다(검수 M2)
    const dueToday = view.paymentDueDate === todayYmd;
    // 6. 기한 지남은 안내 메일 여부와 관계없이 결제 확인(빨강)
    if (overdue) return make("payment", "paymentWaiting", { overdue: true });
    // 7. 결제 안내
    if (!view.paymentDueDate) return make("notice", "noticeBeforeLink");
    if (view.paymentLinkUrl && !view.noticeSentAt) return make("notice", "noticeBeforeMail", { dueToday, dueTomorrow });
    // 8. 결제 확인
    return make("payment", "paymentWaiting", { dueToday, dueTomorrow });
  }

  // 9. 나머지
  return make("done", null, { doneReason: doneReasonOf(sessions, view, "other") });
}

/* ── 목록(할 일 · 검색) ── */

export type TodoRow = {
  key: string;
  href: string;
  applicantName: string;
  orgName: string;
  /** "상상교실 2 · 11월 9일(월) 19:00~21:00" */
  spaceSchedule: string;
  stage: WorkStage;
  /** 할 일이면 "승인하기" 등, 끝남이면 "끝남 · 결제 완료 · …" */
  nextLabel: string;
  chip: WorkChip;
  urgentRank: number;
  startDate: string;
  /** 이용일이 모두 지난 미처리(접수) — 할 일 첫 화면에서는 맨 아래 한 줄로만 센다 */
  pastPending: boolean;
};

const GALLERY_LABEL = "우리동네 갤러리";

/** 목록 "공간 · 일정" 칸 */
export function formatSpaceSchedule(sessionsIn: RentalRequest[]): string {
  const sessions = sortSessions(sessionsIn);
  if (!sessions.length) return "";
  const first = sessions[0];
  if (first.roomId === "gallery") {
    const days = sessions.filter((s) => !s.isPrepDay).map((s) => s.date).filter(isYmd).sort();
    const start = first.startDate || days[0] || first.date;
    const end = first.endDate || days[days.length - 1] || first.date;
    const range = start && end && start !== end ? `${koMonthDayDow(start)}~${koMonthDayDow(end)}` : koMonthDayDow(start);
    return `${GALLERY_LABEL} · ${range} 전시`;
  }
  const active = sessions.filter((s) => s.status === "접수" || s.status === "승인");
  const list = active.length ? active : sessions;
  const room = first.roomName || first.roomId;
  const head = list[0];
  if (list.length === 1) return `${room} · ${koMonthDayDow(head.date)} ${head.startTime}~${head.endTime}`;
  return `${room} · ${koMonthDayDow(head.date)}부터 ${list.length}회`;
}

/** 이용 시작일(정렬 보조) */
function startDateOf(sessions: RentalRequest[]): string {
  const s = sortSessions(sessions);
  const first = s[0];
  if (!first) return "";
  if (first.roomId === "gallery") return first.galleryPrepDate || first.startDate || first.date || "";
  const active = s.filter((x) => x.status === "접수" || x.status === "승인");
  return (active[0] ?? first).date || "";
}

/** 묶음 대표 행(정렬된 첫 회차) */
function repOf(sessions: RentalRequest[]): RentalRequest {
  return sortSessions(sessions)[0];
}

export function buildTodoRow(sessions: RentalRequest[], todayYmd: string, categoryOf: (roomId: string) => string): TodoRow {
  const item = deriveWorkStage(sessions, todayYmd);
  const rep = repOf(sessions);
  const org = (rep.orgName ?? "").trim();
  return {
    key: (rep.batchId ?? "").trim() ? `B:${rep.batchId}` : `R:${rep.requestId}`,
    href: `/admin/requests/${encodeURIComponent(rep.requestId)}?category=${encodeURIComponent(categoryOf(rep.roomId))}`,
    applicantName: rep.applicantName,
    orgName: org && org !== "-" && org !== rep.applicantName ? org : "",
    spaceSchedule: formatSpaceSchedule(sessions),
    stage: item.stage,
    nextLabel: item.stage === "done" ? `끝남 · ${item.doneReason}` : item.nextLabel,
    chip: item.chip,
    urgentRank: item.urgentRank,
    startDate: startDateOf(sessions),
    pastPending: item.pastPending,
  };
}

/** 급한 순 — urgentRank → 이용 시작일 빠른 순 → 신청번호 */
export function sortTodoRows(rows: TodoRow[]): TodoRow[] {
  return rows.slice().sort((a, b) => a.urgentRank - b.urgentRank || (a.startDate || "9999").localeCompare(b.startDate || "9999") || a.key.localeCompare(b.key));
}

/* ── 검색 (서버에서만 · 02_ui §2-1 · spec ⑦) ── */

export type SearchQuery = { kind: "phone4"; digits: string } | { kind: "text"; text: string } | { kind: "tooShort" };

/** 검색어 해석 — 숫자 4자리 = 전화번호 뒤 4자리 · 그 밖 2자 이상 = 이름·단체명·신청번호 */
export function parseSearchQuery(raw: string): SearchQuery {
  const q = (raw ?? "").trim();
  if (/^\d{4}$/.test(q)) return { kind: "phone4", digits: q };
  if (q.length >= 2) return { kind: "text", text: q.toLowerCase() };
  return { kind: "tooShort" };
}

/** 묶음이 검색어에 맞는가 — 전화번호는 숫자만 뽑아 뒤 4자리 정확 일치 */
export function bundleMatchesSearch(sessions: RentalRequest[], q: SearchQuery): boolean {
  if (q.kind === "tooShort") return false;
  if (q.kind === "phone4") {
    // 신청번호에도 날짜 숫자가 들어 있어(예: 2026) 숫자 4자리는 전화번호 뒤 4자리로만 찾는다
    return sessions.some((s) => {
      const digits = String(s.phone ?? "").replace(/\D/g, "");
      return digits.length >= 4 && digits.slice(-4) === q.digits;
    });
  }
  return sessions.some((s) =>
    [s.applicantName, s.orgName, s.requestId].some((v) => String(v ?? "").toLowerCase().includes(q.text))
  );
}
