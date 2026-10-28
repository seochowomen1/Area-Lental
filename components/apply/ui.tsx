/**
 * 공개 신청 화면 공용 조각 (audit-fix-3 3-4 · 02_ui_apply §1 토큰 · §2 공통)
 * 글자: 본문 17 · 입력 18(높이 52) · 도움말 15 · 주 버튼 56 · 보조 버튼 52 (01_spec ⑧ Q5)
 * 새 색 없음(brand · ink · line · 접수톤 amber · 반려톤 red-700).
 */
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ROOMS, ROOMS_BY_ID } from "@/lib/space";

export const A_INPUT =
  "block w-full min-h-[52px] rounded-lg border border-slate-300 bg-white px-[14px] py-2 text-[18px] leading-7 text-ink placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-sky";
export const A_INPUT_ERROR = "border-2 border-red-700";
export const A_BTN_PRIMARY =
  "inline-flex min-h-[56px] w-full items-center justify-center rounded-xl bg-brand px-5 text-[18px] font-bold text-white hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";
export const A_BTN_SECONDARY =
  "inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-[17px] font-bold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500";
export const A_BTN_SMALL =
  "inline-flex min-h-[44px] min-w-[56px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-[16px] font-bold text-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky";
export const A_CARD = "rounded-xl border border-line bg-white";
export const A_H1 = "text-[24px] font-extrabold leading-8 text-ink";
export const A_SECTION_TITLE = "text-[20px] font-extrabold leading-[30px] text-ink";
export const A_CARD_TITLE = "text-[18px] font-extrabold leading-7 text-ink";
export const A_HELP = "text-[15px] leading-6 text-ink-2";
export const A_ERROR_TEXT = "text-[15px] font-bold leading-6 text-red-700";

/** 센터 대표 전화(기존 공간 데이터 contactPhone) */
export function centerPhone(roomId?: string): string {
  return (roomId && ROOMS_BY_ID[roomId]?.contactPhone) || ROOMS[0]?.contactPhone || "";
}

/** 헤더 = 로고만(02_ui §2 공통 · `← 목록` 삭제) */
export function PublicHeader() {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:h-16">
        <Link href="/" className="inline-flex min-h-[44px] items-center" aria-label="처음 화면으로">
          <Image src="/brand/seochowomen-ci.png" alt="서초여성가족플라자 서초센터" width={260} height={52} priority className="h-8 w-auto" />
        </Link>
      </div>
    </header>
  );
}

export type StepNo = 1 | 2 | 3;
const STEP_NAMES: Record<StepNo, string> = { 1: "공간 고르기", 2: "날짜 고르기", 3: "신청서 쓰기" };

/**
 * 단계 표시 `1 공간 고르기 · 2 날짜 고르기 · 3 신청서 쓰기`
 * 지금 단계 = 굵게 + 밑줄(aria-current) · 지난 단계 = 링크 · 앞 단계 = 흐린 글자
 */
export function StepHeader({ current, step1Href, step2Href }: { current: StepNo; step1Href?: string; step2Href?: string }) {
  const hrefs: Partial<Record<StepNo, string | undefined>> = { 1: step1Href ?? "/", 2: step2Href };
  return (
    <nav aria-label="신청 단계" className="text-[15px] leading-6">
      <span className="sr-only">{`3단계 중 ${current}단계: ${STEP_NAMES[current]}`}</span>
      <ol className="flex flex-wrap items-center gap-x-1.5" aria-hidden={false}>
        {([1, 2, 3] as StepNo[]).map((n, i) => {
          const label = `${n} ${STEP_NAMES[n]}`;
          const sep = i > 0 ? <span className="text-slate-300" aria-hidden="true">·</span> : null;
          if (n === current) {
            return (
              <li key={n} className="flex items-center gap-x-1.5">
                {sep}
                <span aria-current="step" className="font-extrabold text-ink underline decoration-brand decoration-[3px] underline-offset-[6px]">
                  {label}
                </span>
              </li>
            );
          }
          const href = hrefs[n];
          if (n < current && href) {
            return (
              <li key={n} className="flex items-center gap-x-1.5">
                {sep}
                <Link href={href} className="inline-flex min-h-[44px] items-center font-semibold text-brand underline underline-offset-4">
                  {label}
                </Link>
              </li>
            );
          }
          return (
            <li key={n} className="flex items-center gap-x-1.5">
              {sep}
              <span className="text-ink-3">{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** 도움 전화 줄(2·3단계 맨 아래 · 홈 아래) */
export function HelpPhoneLine({ roomId, className }: { roomId?: string; className?: string }) {
  const phone = centerPhone(roomId);
  return (
    <p className={cn(A_HELP, className)}>
      신청이 어려우시면 센터로 전화 주세요:{" "}
      <a href={`tel:${phone.replace(/[^0-9]/g, "")}`} className="-my-2.5 inline-block py-2.5 font-bold text-brand underline underline-offset-2">
        {phone}
      </a>
    </p>
  );
}

/** 입력칸 묶음: 라벨(17 굵게) · (선택) · 칸 · 도움말 15 · 오류 15 굵게 */
export function AField({
  id,
  label,
  optional,
  help,
  error,
  children,
  after,
}: {
  id: string;
  label: ReactNode;
  optional?: boolean;
  help?: ReactNode;
  error?: string;
  children: ReactNode;
  after?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[17px] font-bold leading-7 text-ink">
        {label}
        {optional ? <span className="font-medium text-ink-3"> (선택)</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {after}
      {error ? (
        <p id={`${id}-error`} className={cn(A_ERROR_TEXT, "mt-1")}>
          {error}
        </p>
      ) : null}
      {help ? (
        <p id={`${id}-help`} className={cn(A_HELP, "mt-1")}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** 칸 접근성 속성 */
export function fieldAria(id: string, error?: string, help?: boolean) {
  const ids = [error ? `${id}-error` : "", help ? `${id}-help` : ""].filter(Boolean).join(" ");
  return { "aria-invalid": error ? true : undefined, "aria-describedby": ids || undefined } as const;
}

/** 항목명 + 값(§0-6 `<dl>`) — 위치 · 인원 · 금액 */
export function InfoList({ rows, className }: { rows: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[40px_1fr] gap-x-3 gap-y-0.5", className)}>
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-[15px] font-semibold leading-[26px] text-ink-3">{r.label}</dt>
          <dd className="text-[17px] font-bold leading-[26px] text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 금액 표기 B-3: **70,000원** (1시간) */
export function Money({ amount, unit, suffix }: { amount: number; unit?: string; suffix?: string }) {
  return (
    <>
      <span className="font-bold text-ink">{amount.toLocaleString()}원</span>
      {suffix ? <span className="font-bold text-ink">{suffix}</span> : null}
      {unit ? <span className="font-medium text-ink-2"> ({unit})</span> : null}
    </>
  );
}
