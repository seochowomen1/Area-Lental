"use client";

/**
 * 3단계 신청서 틀 — 헤더(로고) · 단계 표시 · 본문 폭 720 · 이탈 확인 모달 (02_ui_apply §2 공통 · §2-5)
 */
import type { ReactNode } from "react";
import { HelpPhoneLine, PublicHeader, StepHeader } from "@/components/apply/ui";

export default function ApplyFrame({
  roomId,
  step1Href,
  step2Href,
  children,
  modal,
}: {
  roomId: string;
  step1Href: string;
  step2Href: string;
  children: ReactNode;
  modal?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-5 sm:px-6">
        <StepHeader current={3} step1Href={step1Href} step2Href={step2Href} />
        <div className="mt-2">{children}</div>
        <HelpPhoneLine roomId={roomId} className="mt-6" />
      </main>
      {modal}
    </div>
  );
}

/** 회차 문제·409 안내 아래 한 줄 */
export const KEEP_TEXT = "쓰신 내용은 그대로 남아 있습니다.";
