"use client";

/**
 * M7 확인 보기 (02_ui_apply §2-6) — 같은 주소에서 입력 보기와 바뀜
 * h1 `신청 내용을 확인해 주세요` → 일정 카드(바꾸기 없음) → 항목 카드들 → 동의 카드 → 예상 이용료 → `이대로 신청하기` → `고치기`
 * 누르는 중: 주 버튼 비활성 + `신청 중…`, `고치기`도 잠금.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { A_BTN_PRIMARY, A_BTN_SECONDARY, A_CARD, A_CARD_TITLE, A_H1 } from "@/components/apply/ui";

export type KvRow = { label: string; value: ReactNode };
export type KvCard = { title: string; rows: KvRow[] };

export function KvCardView({ card }: { card: KvCard }) {
  const rows = card.rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== "");
  if (!rows.length) return null;
  return (
    <section className={`${A_CARD} p-4 sm:p-5`} aria-label={card.title}>
      <h2 className={A_CARD_TITLE}>{card.title}</h2>
      <dl className="mt-2 grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 sm:grid-cols-[140px_1fr]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-[17px] font-semibold leading-7 text-ink-3">{r.label}</dt>
            <dd className="min-w-0 whitespace-pre-line break-words text-[17px] font-semibold leading-7 text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function ConfirmSheet({
  schedule,
  cards,
  fee,
  submitting,
  onSubmit,
  onEdit,
  error,
}: {
  schedule: ReactNode;
  cards: KvCard[];
  fee: ReactNode;
  submitting: boolean;
  onSubmit: () => void;
  onEdit: () => void;
  /** 서버 오류(일정 문제 외) */
  error?: string | null;
}) {
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    h1Ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="space-y-6">
      <h1 ref={h1Ref} tabIndex={-1} className={`${A_H1} outline-none`}>
        신청 내용을 확인해 주세요
      </h1>
      {schedule}
      {cards.map((c) => (
        <KvCardView key={c.title} card={c} />
      ))}
      {fee}
      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[17px] font-bold leading-7 text-red-700">
          {error}
        </div>
      ) : null}
      <div className="space-y-2">
        <button type="button" className={A_BTN_PRIMARY} onClick={onSubmit} disabled={submitting}>
          {submitting ? "신청 중…" : "이대로 신청하기"}
        </button>
        <button type="button" className={A_BTN_SECONDARY} onClick={onEdit} disabled={submitting}>
          고치기
        </button>
      </div>
    </div>
  );
}
