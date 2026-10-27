"use client";

/**
 * 신청 버튼 위 "빠진 항목" 요약 (audit-2026-10 ux.md Top④ · audit-fix-1)
 * 문구: `입력이 필요한 항목이 {N}개 있습니다 — 날짜 · 철수 시간 · 서약 동의`
 * 각 항목을 누르면 그 칸으로 스크롤하고 포커스를 옮긴다.
 */
export type MissingField = { key: string; label: string; targetId: string };

export default function MissingFieldsSummary({ items }: { items: MissingField[] }) {
  if (!items.length) return null;

  function go(targetId: string) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof (el as HTMLElement).focus === "function") {
      (el as HTMLElement).focus({ preventScroll: true });
    }
  }

  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="font-semibold">입력이 필요한 항목이 {items.length}개 있습니다</span>
      {" — "}
      {items.map((it, i) => (
        <span key={it.key}>
          {i > 0 ? " · " : ""}
          <button
            type="button"
            onClick={() => go(it.targetId)}
            className="font-semibold underline underline-offset-2 hover:text-amber-700"
          >
            {it.label}
          </button>
        </span>
      ))}
    </div>
  );
}
