"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { adminFetch, AdminFetchError } from "@/lib/adminFetch";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/useMediaQuery";

export type TableRowData = {
  key: string;
  requestIds: string[];
  isDeletable: boolean;
  /** 반려·취소 건인데 삭제가 막힌 이유(lib/payment.ts DELETION_BLOCK_LABEL) — 없으면 null · audit-fix-1 [8] */
  deleteBlockLabel: string | null;

  primaryId: string;
  idLink: string;
  extraCount: number;

  roomName: string;
  dateDisplay: string;
  timeDisplay: string;
  countDisplay: string;
  applicantName: string;
  orgHeadcount: string;

  status: string;
  displayStatus: string;
  isPartial: boolean;
  usingApprovedBasis: boolean;
  approvedCount: number;
  totalCount: number;

  totalFeeKRW: number;
  discountRatePct: number;
  discountAmountKRW: number;
  finalFeeKRW: number;

  /** 결제 열 칩 (lib/payment paymentListChip) — posted=홈페이지 게시중이면 주황 점 */
  paymentChip: { text: string; tone: "none" | "gray" | "red" | "green"; posted: boolean };
};

function PaymentChip({ chip }: { chip: TableRowData["paymentChip"] }) {
  if (chip.tone === "none") return <span className="text-ink-3">-</span>;
  // 결제 칩 매핑(02_ui §1-1): green→승인톤 · red→반려톤 · gray→취소톤
  const cls =
    chip.tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : chip.tone === "red"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-300 bg-slate-100 text-slate-600";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-semibold ${cls}`}>{chip.text}</span>
      {chip.posted && (
        <span className="inline-block h-2 w-2 rounded-full bg-accent" title="홈페이지 게시중" aria-label="홈페이지 게시중" />
      )}
    </span>
  );
}

function formatKRW(value: number): string {
  const n = Number.isFinite(value) ? Math.round(value) : 0;
  return `${n.toLocaleString("ko-KR")}원`;
}

function StatusBadge({ status }: { status: string }) {
  const labelMap: Record<string, string> = { "접수": "신청", "승인": "승인", "반려": "반려", "취소": "취소" };
  const label = labelMap[status] ?? status;
  const base = "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-semibold";
  let cls = "border-slate-300 bg-slate-100 text-slate-600";
  if (status === "접수") cls = "border-amber-200 bg-amber-50 text-amber-800";
  else if (status === "승인") cls = "border-emerald-200 bg-emerald-50 text-emerald-700";
  else if (status === "반려") cls = "border-red-200 bg-red-50 text-red-700";
  return <span className={`${base} ${cls}`}>{label}</span>;
}

function PartialChip() {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-800">
      부분처리
    </span>
  );
}

/** ③-B 삭제 확인 문구 — 신청번호 최대 10개, 넘으면 "외 {k}건" */
function deleteConfirmText(ids: string[]): string {
  const shown = ids.slice(0, 10).join(", ");
  const rest = ids.length > 10 ? ` 외 ${ids.length - 10}건` : "";
  return `선택한 ${ids.length}건을 삭제합니다.\n${shown}${rest}\n삭제한 신청은 되돌릴 수 없습니다.`;
}

const BTN_DANGER =
  "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-red-300 bg-white px-4 text-[15px] font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500";
const BTN_SECONDARY =
  "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-ink transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500";

export default function RequestTable({
  rows,
  isGalleryCategory,
  view,
  idLabel,
  resetHref,
}: {
  rows: TableRowData[];
  isGalleryCategory: boolean;
  view: "group" | "items";
  idLabel: string;
  /** 빈 목록 [필터 초기화] 링크 — ?category= 만 남김 */
  resetHref: string;
}) {
  const router = useRouter();
  // PC(≥900px)=표 / 휴대폰=카드 · hydration 전에는 카드(휴대폰에서 표가 번쩍이지 않게)
  const isDesktop = useMediaQuery(DESKTOP_QUERY, false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  // 삭제 진행 중인 행 키 (페이드 아웃 표시)
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  // optimistic: 삭제 완료되어 화면에서 숨길 행 키
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // removedKeys에 해당하는 행은 즉시 화면에서 제거
  const visibleRows = useMemo(
    () => rows.filter((r) => !removedKeys.has(r.key)),
    [rows, removedKeys],
  );

  const deletableRows = visibleRows.filter((r) => r.isDeletable);
  // 잠긴(삭제 불가) 행도 체크박스 칸을 보여 준다 — 비활성 체크박스 + 이유
  const hasDeletable = deletableRows.length > 0 || visibleRows.some((r) => !!r.deleteBlockLabel);

  const allDeletableSelected = hasDeletable && deletableRows.length > 0 && deletableRows.every((r) => selected.has(r.key));

  const toggleAll = useCallback(() => {
    if (allDeletableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(deletableRows.map((r) => r.key)));
    }
  }, [allDeletableSelected, deletableRows]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedRows = visibleRows.filter((r) => selected.has(r.key));

  const handleDelete = async () => {
    if (deleting) return;
    const targetRows = selectedRows;
    const requestIds = targetRows.flatMap((r) => r.requestIds);
    const targetKeys = new Set(targetRows.map((r) => r.key));
    if (!requestIds.length) return;
    if (!confirm(deleteConfirmText(requestIds))) return;

    // 1단계: 삭제 중 시각 표시 (페이드 아웃)
    setDeleting(true);
    setDeleteNotice(null);
    setDeletingKeys(targetKeys);

    try {
      let data: { ok?: boolean; code?: string; message?: string; protected?: Array<{ requestId: string }> };
      try {
        const res = await adminFetch("/api/admin/requests", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestIds }),
        });
        data = await res.json();
      } catch (e) {
        if (e instanceof AdminFetchError) {
          // 503 AUTH_STORE_BUSY는 로그인 화면으로 보내지 않고 G-1 문구(바 아래)
          if (e.busy) {
            setDeleteNotice(e.message);
            setDeletingKeys(new Set());
            return;
          }
          data = { ok: false, code: e.code, message: e.message };
        } else {
          throw e;
        }
      }
      if (!data.ok) {
        // 409 PROTECTED_RECORDS: 결제·환불 기록·홈페이지 마감 전 건이 섞이면 서버가 아무것도 지우지 않는다(01_spec ③-I)
        if (data.code === "PROTECTED_RECORDS") {
          const ids: string[] = Array.isArray(data.protected) ? data.protected.map((p) => p.requestId) : [];
          alert(
            data.message ||
              `결제·환불 기록이 있거나 홈페이지 마감 전인 신청이 ${ids.length}건 섞여 있어 아무것도 삭제하지 않았습니다: ${ids.join(", ")}. 화면을 새로고침한 뒤 다시 골라 주세요.`
          );
          setDeletingKeys(new Set());
          return;
        }
        alert(data.message || "삭제에 실패했습니다.");
        setDeletingKeys(new Set());
        return;
      }

      // 2단계: 즉시 화면에서 제거 (Optimistic UI)
      setRemovedKeys((prev) => {
        const next = new Set(prev);
        targetKeys.forEach((k) => next.add(k));
        return next;
      });
      setSelected(new Set());
      setDeletingKeys(new Set());

      // 3단계: 백그라운드에서 서버 데이터 동기화
      startTransition(() => {
        router.refresh();
      });
    } catch (e: unknown) {
      console.error("삭제 요청 실패:", e);
      alert("삭제 중 오류가 발생했습니다.");
      setDeletingKeys(new Set());
    } finally {
      setDeleting(false);
    }
  };

  const selectedItemCount = selectedRows.flatMap((r) => r.requestIds).length;

  const emptyState = (
    <div className="px-4 py-12 text-center text-base text-ink-2">
      <p>조건에 맞는 신청이 없습니다. 필터를 바꾸거나 [필터 초기화]를 눌러 주세요.</p>
      <Link href={resetHref} className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-ink hover:bg-slate-50">
        필터 초기화
      </Link>
    </div>
  );

  // ── 휴대폰: 카드 보기 ──
  if (!isDesktop) {
    return (
      <div className={selected.size > 0 ? "pb-24" : undefined}>
        {visibleRows.length === 0 ? (
          <div className="rounded-xl border border-line bg-white">{emptyState}</div>
        ) : (
          <ul className="space-y-2.5" aria-label="신청 목록">
            {visibleRows.map((r) => {
              const isSel = selected.has(r.key);
              const schedule = [r.roomName, r.dateDisplay, r.countDisplay, r.timeDisplay].filter(Boolean).join(" · ");
              return (
                <li key={r.key} className={deletingKeys.has(r.key) ? "pointer-events-none opacity-40" : undefined}>
                  <Link
                    href={r.idLink}
                    className={
                      "block rounded-xl border bg-white px-3.5 py-3 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky " +
                      (isSel ? "border-brand shadow-[inset_0_0_0_1px_rgb(var(--brand-primary))]" : "border-line")
                    }
                  >
                    {/* 1행: 이름 + 상태 칩 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center">
                        {r.isDeletable && (
                          <span
                            role="checkbox"
                            aria-checked={isSel}
                            aria-label={`${r.primaryId} 선택`}
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggle(r.key);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === " " || e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                toggle(r.key);
                              }
                            }}
                            className="-my-2 -ml-2 mr-1 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
                          >
                            <span
                              className={
                                "inline-flex h-5 w-5 items-center justify-center rounded border-2 text-xs font-bold text-white " +
                                (isSel ? "border-brand bg-brand" : "border-slate-400 bg-white")
                              }
                              aria-hidden="true"
                            >
                              {isSel ? "✓" : ""}
                            </span>
                          </span>
                        )}
                        <span className="truncate text-[17px] font-bold text-ink">{r.applicantName}</span>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {/* 2행: 공간 · 일시 */}
                    <p className="mt-1 text-[15px] leading-[22px] text-ink-2">{schedule}</p>
                    {/* 3행: 결제 칩 / 최종금액 */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <PaymentChip chip={r.paymentChip} />
                      <span className="text-lg font-bold tabular-nums text-ink">{formatKRW(r.finalFeeKRW)}</span>
                    </div>
                    {/* 4행(있을 때만) */}
                    {(r.usingApprovedBasis || r.displayStatus === "부분처리" || r.deleteBlockLabel) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        {r.usingApprovedBasis && (
                          <span className="text-ink-3">승인 기준: 전체 {r.totalCount}회 중 {r.approvedCount}회</span>
                        )}
                        {r.displayStatus === "부분처리" && <PartialChip />}
                        {r.deleteBlockLabel && (
                          <span className="w-full text-red-700">삭제 불가 · {r.deleteBlockLabel}</span>
                        )}
                      </div>
                    )}
                    {/* 5행: 신청번호 · 단체/인원 */}
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-sm text-ink-3">
                      <span className="tabular-nums">
                        {r.primaryId}
                        {r.extraCount > 0 ? ` 외 ${r.extraCount}건` : ""}
                      </span>
                      <span className="truncate">{r.orgHeadcount}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* 하단 고정 선택 바(카드 보기 · 전체 선택 없음) */}
        {selected.size > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-4 py-2.5 shadow-sm">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
              <span className="mr-auto text-base font-bold text-ink">
                {selectedItemCount}건 선택됨{selectedItemCount !== selected.size ? ` (묶음 ${selected.size}개)` : ""}
              </span>
              <button type="button" onClick={handleDelete} disabled={deleting} className={BTN_DANGER}>
                {deleting ? "삭제 중…" : "선택 삭제"}
              </button>
              <button type="button" onClick={() => setSelected(new Set())} disabled={deleting} className={BTN_SECONDARY}>
                선택 해제
              </button>
              {deleteNotice && <p role="alert" className="w-full text-[13px] text-amber-800">{deleteNotice}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── PC: 표 보기(열 구성 34719f0과 같음) ──
  return (
    <div className="rounded-xl border border-line bg-white">
      {/* 선택 삭제 바 */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-t-xl border-b border-line bg-slate-50 px-4 py-2.5">
          <span className="text-base font-bold text-ink">
            {selected.size}건 선택됨
            {selectedItemCount !== selected.size ? <span className="ml-1 text-sm font-medium text-ink-3">(신청 {selectedItemCount}개)</span> : null}
          </span>
          <button type="button" onClick={handleDelete} disabled={deleting} className={BTN_DANGER}>
            {deleting ? "삭제 중…" : "선택 삭제"}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} disabled={deleting} className={BTN_SECONDARY}>
            선택 해제
          </button>
          {deleteNotice && <p role="alert" className="w-full text-[13px] text-amber-800">{deleteNotice}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[15px] leading-[22px]">
          <caption className="sr-only">신청 목록</caption>
          <thead className="border-b border-line bg-slate-50 text-left text-sm">
            <tr>
              {hasDeletable && (
                <th scope="col" className="w-11 px-2 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    onChange={toggleAll}
                    disabled={deletableRows.length === 0}
                    className="h-5 w-5 rounded border-slate-400 text-brand focus:ring-sky"
                    aria-label="반려/취소 건 전체 선택"
                  />
                </th>
              )}
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink-2">{idLabel}</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink-2">공간</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink-2">일시</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink-2">신청자</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink-2">단체/인원</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink-2">상태</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-ink-2">총액</th>
              {!isGalleryCategory && (
                <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-ink-2">할인</th>
              )}
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-ink-2">최종금액</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink-2">결제</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visibleRows.map((r) => (
              <tr
                key={r.key}
                className={
                  "transition hover:bg-slate-50" +
                  (deletingKeys.has(r.key) ? " pointer-events-none opacity-40" : "")
                }
              >
                {hasDeletable && (
                  <td className="w-11 px-2 py-2.5 text-center">
                    {r.isDeletable ? (
                      <input
                        type="checkbox"
                        checked={selected.has(r.key)}
                        onChange={() => toggle(r.key)}
                        className="h-5 w-5 rounded border-slate-400 text-brand focus:ring-sky"
                        aria-label={`${r.primaryId} 선택`}
                      />
                    ) : r.deleteBlockLabel ? (
                      <input
                        type="checkbox"
                        checked={false}
                        disabled
                        readOnly
                        title="결제·환불 기록이나 홈페이지 마감이 남아 있어 삭제할 수 없습니다."
                        aria-describedby={`del-block-${r.key}`}
                        className="h-5 w-5 cursor-not-allowed rounded border-slate-300 bg-slate-200"
                        aria-label={`${r.primaryId} 선택`}
                      />
                    ) : null}
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <Link
                    className="whitespace-nowrap font-medium text-brand hover:underline"
                    href={r.idLink}
                  >
                    {r.primaryId}
                  </Link>
                  {r.extraCount > 0 && (
                    <div className="mt-0.5 text-sm text-ink-3">외 {r.extraCount}건</div>
                  )}
                  {r.deleteBlockLabel && (
                    <div id={`del-block-${r.key}`} className="mt-0.5 whitespace-nowrap text-sm text-red-700">
                      삭제 불가 · {r.deleteBlockLabel}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.roomName}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {view === "group" ? (
                    <>
                      <div>
                        {r.dateDisplay}{" "}
                        {r.countDisplay && (
                          <span className="ml-1 text-sm text-ink-3">({r.countDisplay})</span>
                        )}
                      </div>
                      <div className="text-sm text-ink-3">{r.timeDisplay}</div>
                    </>
                  ) : (
                    r.dateDisplay
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium">{r.applicantName}</td>
                <td className="px-3 py-2.5">{r.orgHeadcount}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <StatusBadge status={r.status} />
                  {r.displayStatus === "부분처리" && (
                    <div className="mt-1">
                      <PartialChip />
                    </div>
                  )}
                  {r.usingApprovedBasis && (
                    <div className="mt-1 text-sm text-ink-3">
                      전체 {r.totalCount}회 중 승인 {r.approvedCount}회
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {formatKRW(r.totalFeeKRW)}
                  {r.usingApprovedBasis && (
                    <div className="mt-0.5 text-sm text-ink-3">(승인기준)</div>
                  )}
                </td>
                {!isGalleryCategory && (
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {r.discountAmountKRW > 0
                      ? `${r.discountRatePct.toFixed(2)}% (${formatKRW(r.discountAmountKRW)})`
                      : "-"}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                  {formatKRW(r.finalFeeKRW)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <PaymentChip chip={r.paymentChip} />
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={isGalleryCategory ? (hasDeletable ? 10 : 9) : (hasDeletable ? 11 : 10)}>
                  {emptyState}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
