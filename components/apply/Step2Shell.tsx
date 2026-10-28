"use client";

/**
 * 2단계 날짜 고르기 틀 (02_ui_apply §0-4 · §2-3)
 * 휴대폰: 단계 → h1 → 대표 사진 2:1(eager) → 위치·인원·금액 → (본문) → 비치물품·이용 규정 접힘 → 전화 줄 → 고정 바
 * PC(≥900): 2단 `1fr | 380` — 왼쪽 사진 12:5 · 본문 / 오른쪽 따라 내려오는 요약 카드. 고정 바 없음.
 */
import type { ReactNode } from "react";
import type { SpaceRoom } from "@/lib/space";
import RoomGuideContent from "@/components/apply/RoomGuideContent";
import { roomInfoRows } from "@/components/apply/RoomInfo";
import { A_H1, HelpPhoneLine, InfoList, PublicHeader, StepHeader } from "@/components/apply/ui";

export default function Step2Shell({
  room,
  title,
  step1Href,
  children,
  summary,
  bar,
}: {
  room: SpaceRoom;
  title: string;
  step1Href: string;
  children: ReactNode;
  /** PC 오른쪽 요약 카드 */
  summary: ReactNode;
  /** 휴대폰 고정 바 */
  bar: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 [scroll-padding-bottom:150px] min-[900px]:[scroll-padding-bottom:0]">
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-[1120px] px-4 pb-[170px] pt-5 sm:px-6 min-[900px]:pb-12">
        <StepHeader current={2} step1Href={step1Href} />
        <h1 className={`${A_H1} mt-2`}>{title}</h1>
        <div className="mt-3 min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_380px] min-[900px]:items-start min-[900px]:gap-8">
          <div className="space-y-4">
            {room.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={room.image}
                alt={room.name}
                width={1200}
                height={600}
                loading="eager"
                decoding="async"
                className="aspect-[2/1] w-full rounded-xl bg-slate-100 object-cover min-[900px]:aspect-[12/5]"
              />
            ) : null}
            <InfoList rows={roomInfoRows(room, true)} />
            {children}
            <details className="rounded-xl border border-line bg-white">
              <summary className="flex min-h-[52px] cursor-pointer items-center px-4 text-[17px] font-bold text-ink">비치물품·이용 규정 보기</summary>
              <div className="border-t border-line p-3 sm:p-4">
                <RoomGuideContent roomId={room.id} />
              </div>
            </details>
            <HelpPhoneLine roomId={room.id} className="min-[900px]:hidden" />
          </div>
          <aside className="hidden min-[900px]:block">
            <div className="sticky top-6 space-y-3">
              {summary}
              <HelpPhoneLine roomId={room.id} />
            </div>
          </aside>
        </div>
      </main>
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 shadow-sm min-[900px]:hidden">
        {bar}
      </footer>
    </div>
  );
}
