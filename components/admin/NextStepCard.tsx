"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import FormSubmitButton from "@/components/FormSubmitButton";
import GianCopyButton from "@/components/admin/GianCopyButton";
import WelfareCopyButton from "@/components/admin/WelfareCopyButton";
import { BTN_MAIN, BTN_SUB, NEXT_STEP_CARD_ID, PaymentForms, usePaymentWorkflow, type PaymentPanel } from "@/components/admin/PaymentSection";
import { shortMdDow } from "@/lib/workflow";
import type { WorkStage, WorkSub } from "@/lib/workflow";

/**
 * 상세 맨 위 "다음 할 일" 카드 (audit-fix-3 3-2 · 02_ui v2 §2-4)
 * 카드 = `다음 할 일` · 제목 · 설명 1줄 · 주 버튼 1 + 보조 1. 반려·일부 회차 처리는 아래 회차별 현황에서.
 * 결제 쪽 입력 폼은 PaymentSection의 PaymentForms를 그대로 카드 안에 연다(화면에 폼 1개).
 */

/** 상세의 회차별 현황 구역 id — "이용일이 지난 미처리" 카드가 여기로 이동 */
export const SESSIONS_SECTION_ID = "sessions-section";

export type NextStepWork = {
  stage: WorkStage;
  sub: WorkSub;
  overdue: boolean;
  /** 오늘이 결제 기한(검수 M2) */
  dueToday: boolean;
  pendingCount: number;
  totalCount: number;
  partial: boolean;
  doneReason: string;
  isGallery: boolean;
  isBatch: boolean;
  paymentDueDate: string;
};

type ApproveProps = {
  /** decideSelectedSessionsAction.bind(null, requestId) */
  action: (formData: FormData) => void | Promise<void>;
  /** 승인할 회차(접수 상태) */
  pendingIds: string[];
  /** 화면을 연 시점 상태(3-1 조건부 쓰기) */
  viewedStatusesJson: string;
  gianPayload: Record<string, unknown>;
};

const PANEL_TITLE: Record<Exclude<PaymentPanel, null>, string> = {
  notice: "결제 링크·기한",
  confirm: "결제 확인",
  refund: "환불 기록",
  restore: "자동 취소 되돌리기",
};

export default function NextStepCard({ requestId, work, approve }: { requestId: string; work: NextStepWork; approve: ApproveProps }) {
  const w = usePaymentWorkflow();
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  // 단계가 바뀌면(처리 성공 → 서버가 다시 그림) 확인 줄을 닫는다
  useEffect(() => {
    setConfirming(false);
  }, [work.stage, work.sub, work.pendingCount]);

  const dueKo = shortMdDow(work.paymentDueDate);
  const dueShort = work.paymentDueDate ? `${parseInt(work.paymentDueDate.slice(5, 7), 10)}/${parseInt(work.paymentDueDate.slice(8, 10), 10)}` : "";

  /* ── 끝난 건: 카드 대신 회색 한 줄 (고치기로 폼이 열리면 카드 모양으로) ── */
  if (work.stage === "done" && !w.panel) {
    return (
      <div id={NEXT_STEP_CARD_ID} className="rounded-xl border border-line bg-white px-5 py-3 text-[15px] text-ink-2">
        처리할 일이 없습니다 · {work.doneReason}
      </div>
    );
  }

  let title = "";
  let desc = "";
  let red = false;
  let actions: ReactNode = null;

  const mainBtn = (label: string, onClick: () => void, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} className={BTN_MAIN}>
      {label}
    </button>
  );
  const subBtn = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={BTN_SUB}>
      {label}
    </button>
  );

  /** 지금 열린 폼이 이 단계의 주·보조 버튼으로 연 것인가 — 아니면(처리 기록 `고치기`) 제목을 폼 이름으로 */
  const panelBelongsToStage =
    !w.panel ||
    (work.stage === "notice" && w.panel === "notice") ||
    (work.stage === "payment" && (w.panel === "confirm" || w.panel === "notice")) ||
    (work.stage === "close" && w.panel === "restore");

  if (!panelBelongsToStage && w.panel) {
    title = PANEL_TITLE[w.panel];
    desc = "";
  } else if (work.stage === "approve" && work.sub === "approvePastDate") {
    // 이용일이 모두 지난 접수 — 승인할 일이 아니라 정리할 일(회차별 현황에서 반려·취소)
    title = "이용일이 지난 미처리 신청";
    desc = "이용일이 모두 지났습니다. 아래 회차별 현황에서 반려 또는 취소(신청자 요청)로 정리해 주세요.";
    actions = mainBtn("회차별 현황으로", () => {
      const el = document.getElementById(SESSIONS_SECTION_ID);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.focus({ preventScroll: true });
    });
  } else if (work.stage === "approve") {
    title = "승인하기";
    desc = "결재가 끝났으면 승인하세요. 신청자 메일은 다음 단계(결제 안내)에서 보냅니다.";
    const n = approve.pendingIds.length;
    const mainLabel = work.isGallery || !work.isBatch ? "승인" : work.partial ? `남은 ${n}회 승인` : `전체 ${n}회 승인`;
    const confirmText = work.isGallery
      ? "이 전시 신청을 승인합니다."
      : !work.isBatch
        ? "이 신청을 승인합니다."
        : work.partial
          ? `남은 ${n}회를 모두 승인합니다.`
          : `이 신청 ${n}회를 모두 승인합니다.`;
    actions = confirming ? (
      <form action={approve.action} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input type="hidden" name="viewedStatuses" value={approve.viewedStatusesJson} />
        <input type="hidden" name="actionStatus" value="승인" />
        {approve.pendingIds.map((id) => (
          <input key={id} type="hidden" name="selectedIds" value={id} />
        ))}
        <p className="w-full text-base font-semibold text-ink">{confirmText}</p>
        <FormSubmitButton idleText="승인 확정" pendingText="승인 중…" className={BTN_MAIN} />
        <button type="button" ref={cancelRef} onClick={() => setConfirming(false)} className={BTN_SUB}>
          취소
        </button>
      </form>
    ) : (
      <>
        {mainBtn(mainLabel, () => setConfirming(true), n === 0)}
        <GianCopyButton payload={approve.gianPayload} label="기안용 복사" className={BTN_SUB} />
      </>
    );
  } else if (work.stage === "notice" && work.sub === "noticeBeforeLink") {
    title = "결제 안내 보내기";
    desc = "복지종합시스템 등록·홈페이지 웹게시 후, 강좌 주소와 결제 기한을 저장하세요.";
    actions = (
      <>
        {mainBtn("결제 링크·기한 입력", () => w.openPanel("notice"))}
        <WelfareCopyButton requestId={requestId} className={BTN_SUB} />
      </>
    );
  } else if (work.stage === "notice") {
    title = "결제 안내 메일 보내기";
    desc = `결제 링크(기한 ${dueKo})를 저장했습니다. 신청자에게 메일을 보내세요.`;
    actions = (
      <>
        {mainBtn("결제 안내 메일 보내기", w.openEmail)}
        {subBtn("링크·기한 고치기", () => w.openPanel("notice"))}
      </>
    );
  } else if (work.stage === "payment" && work.overdue) {
    red = true;
    title = `결제 기한이 지났습니다 (${dueShort})`;
    desc = "다음 09:00에 자동 취소됩니다. 현장에서 받았으면 결제 확인, 기다려 주려면 기한 연장.";
    actions = (
      <>
        {mainBtn("결제 확인", () => w.openPanel("confirm"))}
        {subBtn("기한 연장", () => w.openPanel("notice", { focusDue: true }))}
      </>
    );
  } else if (work.stage === "payment") {
    title = work.dueToday ? `결제 확인 · 오늘 기한 ${dueKo}` : `결제 확인 · 기한 ${dueKo}`;
    desc = work.dueToday
      ? "오늘이 결제 기한입니다. 내일 09:00까지 결제가 없으면 자동 취소됩니다."
      : "신청자가 결제하면 눌러 기록하세요. 기한 다음 날 09:00까지 결제가 없으면 자동 취소됩니다.";
    actions = (
      <>
        {mainBtn("결제 확인", () => w.openPanel("confirm"))}
        {subBtn("기한 연장", () => w.openPanel("notice", { focusDue: true }))}
      </>
    );
  } else if (work.stage === "close") {
    title = "홈페이지 마감";
    desc =
      work.sub === "closePaid"
        ? "결제가 끝났습니다. 홈페이지 강좌를 마감·미게시로 바꾼 뒤 누르세요."
        : work.sub === "closeAutoCancelled"
          ? "자동 취소되었습니다. 복지종합시스템·홈페이지 강좌를 직접 닫은 뒤 누르세요."
          : "신청은 끝났지만 홈페이지 강좌가 열려 있습니다. 직접 닫은 뒤 누르세요.";
    actions = (
      <>
        {mainBtn(w.busyAction === "homepage" ? "기록 중…" : "홈페이지 마감·미게시 처리 완료", w.closeHomepage, w.busy)}
        {work.sub === "closeAutoCancelled" && subBtn("자동 취소 되돌리기", () => w.openPanel("restore"))}
      </>
    );
  }

  const headingId = `${NEXT_STEP_CARD_ID}-title`;

  return (
    <section
      id={NEXT_STEP_CARD_ID}
      role="region"
      aria-labelledby={headingId}
      className={
        "scroll-mt-4 rounded-xl border border-line border-l-4 bg-white px-[14px] py-[14px] sm:px-5 sm:py-4 " +
        (red ? "border-l-red-700" : "border-l-brand")
      }
    >
      <div className="text-[13px] font-bold leading-5 text-ink-3">{panelBelongsToStage ? "다음 할 일" : "고치기"}</div>
      <h2 id={headingId} className={"mt-0.5 text-lg font-extrabold leading-7 " + (red ? "text-red-700" : "text-ink")}>
        {title}
      </h2>
      {desc && <p className="mt-1 text-[15px] leading-6 text-ink-2">{desc}</p>}

      {w.panel ? (
        <PaymentForms />
      ) : (
        actions && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{actions}</div>
      )}
      {w.homeError && work.stage === "close" && !w.panel && (
        <p role="alert" className={`mt-2 text-[13px] font-semibold ${w.homeError.busy ? "text-amber-800" : "text-red-700"}`}>{w.homeError.text}</p>
      )}
    </section>
  );
}
