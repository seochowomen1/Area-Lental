"use client";

/**
 * 신청 일정 카드(읽기 전용) — 02_ui_apply §0-8 (3) A-2
 * 휴대폰: 이름 + 층 칩 → 폭 가득 사진(높이 120) → 구분선 → 소제목 `신청 날짜 · N회` → 회차 줄 → [날짜·시간 바꾸기]
 * PC(≥640): 왼쪽 사진 160×120 · 오른쪽 이름·회차 · 버튼은 오른쪽 아래 자동 폭
 * 409: 빨간 테두리 · 문제 회차 줄 빨강 · 서버 message 상자 · [바꾸기]가 주 버튼
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { A_BTN_PRIMARY, A_BTN_SECONDARY, A_CARD } from "@/components/apply/ui";

export type SummaryLine = { key: string; text: string; problem?: string | null };
export type SummarySection = { title: string; lines: SummaryLine[] };

export default function ScheduleSummary({
  roomName,
  floor,
  image,
  sections,
  changeHref,
  changeLabel,
  onBeforeChange,
  conflictMessage,
}: {
  roomName: string;
  floor: string;
  image?: string;
  sections: SummarySection[];
  /** 없으면 확인 보기(바꾸기 버튼 없음) */
  changeHref?: string;
  changeLabel?: string;
  onBeforeChange?: () => void;
  /** 409 SLOT_TAKEN·BATCH_CONFLICT 등 일정 문제 — 서버 message 원문 */
  conflictMessage?: string | null;
}) {
  const hasConflict = Boolean(conflictMessage);
  const lineHasProblem = sections.some((sec) => sec.lines.some((l) => Boolean(l.problem)));
  return (
    <section
      id="schedule-card"
      tabIndex={-1}
      aria-label={`신청 일정: ${roomName}`}
      className={cn(A_CARD, "p-4 outline-none sm:p-5", hasConflict && "border-2 border-red-700")}
    >
      <div className="sm:grid sm:grid-cols-[160px_1fr] sm:gap-5">
        <div className="sm:order-2">
          <h2 className="flex flex-wrap items-center gap-2 text-[20px] font-extrabold leading-[30px] text-ink">
            {roomName}
            <span className="inline-flex items-center rounded-full border border-brand/[0.16] bg-brand-soft px-2.5 py-0.5 text-[14px] font-semibold leading-5 text-brand">
              {floor}층
            </span>
          </h2>
        </div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={roomName}
            width={640}
            height={240}
            loading="eager"
            decoding="async"
            className="mt-2.5 h-[120px] w-full rounded-lg bg-slate-100 object-cover sm:order-1 sm:row-span-2 sm:mt-0 sm:w-[160px]"
          />
        ) : null}
        <div className="sm:order-3">
          <hr className="-mx-4 my-3.5 border-line sm:mx-0 sm:mt-3" />
          {sections.map((sec, si) => (
            <div key={sec.title} className={si > 0 ? "mt-3" : undefined}>
              <p className="text-[15px] font-bold leading-6 text-ink-3">{sec.title}</p>
              <ul className="mt-1">
                {sec.lines.map((l) => (
                  <li key={l.key} className={cn("text-[17px] leading-7 tabular-nums", l.problem ? "font-bold text-red-700" : "text-ink")}>
                    {l.text}
                    {l.problem ? <span className="block text-[15px] leading-6">{l.problem}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {hasConflict ? (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[17px] font-bold leading-7 text-red-700">
          {/* 회차 줄에 이미 사유가 붙어 있으면 같은 문구를 한 번 더 쓰지 않는다(3-4 검수 L-2) */}
          {lineHasProblem ? "빨간색으로 표시한 날짜를 신청할 수 없습니다. 날짜·시간을 바꿔 주세요." : conflictMessage}
        </div>
      ) : null}

      {changeHref ? (
        <div className="mt-3.5 sm:flex sm:justify-end">
          <Link
            href={changeHref}
            data-leave-ok="true"
            onClick={() => onBeforeChange?.()}
            className={cn(hasConflict ? A_BTN_PRIMARY : A_BTN_SECONDARY, "sm:w-auto")}
          >
            {changeLabel ?? "날짜·시간 바꾸기"}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
