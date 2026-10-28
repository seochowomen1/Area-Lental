"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { DESKTOP_QUERY, useMediaQuery } from "@/lib/useMediaQuery";
import type { TodoRow, WorkChip } from "@/lib/workflow";

/**
 * 할 일 목록 (audit-fix-3 3-2 · 02_ui v2 §2-2)
 * PC(≥900) 표 4열(신청자 · 공간·일정 · 다음 할 일 · 기한) · 행 전체가 상세 링크
 * 휴대폰 카드 3줄(이름+기한 칩 / 공간·일정 / 다음 할 일) · 카드 전체 링크
 * 체크박스·선택 삭제 없음(삭제는 공간 탭 기존 화면)
 */

function Chip({ chip }: { chip: WorkChip }) {
  if (!chip) return null;
  const cls =
    chip.kind === "overdue" || chip.kind === "dueToday"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-px text-sm font-semibold leading-[22px] ${cls}`}>
      {chip.text}
    </span>
  );
}

function NextLabel({ row }: { row: TodoRow }) {
  if (row.stage === "done") {
    // 검색 결과의 끝난 건 — 할 일이 아님을 구분(굵게 · brand 아님)
    return <span className="text-base font-bold text-ink-3">{row.nextLabel}</span>;
  }
  return (
    <span className="whitespace-nowrap text-base font-bold text-brand">
      {row.nextLabel}
      <span className="font-semibold text-ink-3" aria-hidden="true"> ›</span>
    </span>
  );
}

export default function TodoList({ rows }: { rows: TodoRow[] }) {
  const router = useRouter();
  // hydration 전에는 카드(휴대폰에서 표가 번쩍이지 않게 · 기존 목록과 같은 규칙)
  const isDesktop = useMediaQuery(DESKTOP_QUERY, false);

  if (!isDesktop) {
    return (
      <ul className="space-y-2.5" aria-label="할 일 목록">
        {rows.map((r) => (
          <li key={r.key}>
            <Link
              href={r.href}
              className="block rounded-xl border border-line bg-white px-3.5 py-3 text-inherit transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[17px] font-bold text-ink">{r.applicantName}</span>
                <Chip chip={r.chip} />
              </div>
              <p className="text-[15px] leading-6 text-ink-2">{r.spaceSchedule}</p>
              <p className="mt-0.5">
                <NextLabel row={r} />
              </p>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <table className="w-full border-collapse text-base leading-6">
        <caption className="sr-only">할 일 목록 · 급한 순</caption>
        <thead>
          <tr className="border-b border-line bg-slate-50 text-left text-sm text-ink-2">
            <th scope="col" className="w-[220px] px-4 py-2.5 font-semibold">신청자</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">공간 · 일정</th>
            <th scope="col" className="w-[220px] px-4 py-2.5 font-semibold">다음 할 일</th>
            <th scope="col" className="w-[180px] px-4 py-2.5 font-semibold">기한</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              onClick={(e) => {
                // 행 전체 클릭 → 상세(실제 링크는 이름 · 글자 선택·새 탭 열기는 링크 그대로)
                if ((e.target as HTMLElement).closest("a")) return;
                if (window.getSelection()?.toString()) return;
                router.push(r.href);
              }}
              className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
            >
              <td className="px-4 py-3.5 align-middle">
                <Link href={r.href} className="font-bold text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky">
                  {r.applicantName}
                </Link>
                {r.orgName && <div className="text-sm leading-[22px] text-ink-3">{r.orgName}</div>}
              </td>
              <td className="px-4 py-3.5 align-middle tabular-nums">{r.spaceSchedule}</td>
              <td className="px-4 py-3.5 align-middle">
                <NextLabel row={r} />
              </td>
              <td className="px-4 py-3.5 align-middle">
                <Chip chip={r.chip} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
