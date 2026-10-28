"use client";

/**
 * 버튼 바로 위 "빠진 항목" 요약 (02_ui_apply §2-5 S4 · P-8)
 * 접수톤 상자 role="alert" — 굵은 1줄 `입력이 필요한 항목이 N개 있습니다` + 항목마다 한 줄 버튼(높이 44) `› 이 칸으로`.
 * 누르면 그 칸으로 스크롤하고 초점을 옮긴다(동의 줄은 팝업을 열지 않고 줄로만 이동).
 */
export type MissingField = { key: string; label: string; targetId: string };

export function focusField(targetId: string) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (typeof (el as HTMLElement).focus === "function") {
    (el as HTMLElement).focus({ preventScroll: true });
  }
}

export default function MissingFieldsSummary({ items }: { items: MissingField[] }) {
  if (!items.length) return null;
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
      <p className="text-[17px] font-bold leading-7">입력이 필요한 항목이 {items.length}개 있습니다</p>
      <ul className="mt-1">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              onClick={() => focusField(it.targetId)}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left text-[17px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
            >
              <span className="font-semibold underline underline-offset-4">{it.label}</span>
              <span className="shrink-0 text-[15px] font-semibold">› 이 칸으로</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
