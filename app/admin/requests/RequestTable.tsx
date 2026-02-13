"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type TableRowData = {
  key: string;
  requestIds: string[];
  isDeletable: boolean;

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
};

function formatKRW(value: number): string {
  const n = Number.isFinite(value) ? Math.round(value) : 0;
  return `${n.toLocaleString("ko-KR")}원`;
}

function StatusBadge({ status }: { status: string }) {
  const labelMap: Record<string, string> = { "접수": "신청", "승인": "승인", "반려": "반려", "취소": "취소" };
  const label = labelMap[status] ?? status;
  const base = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold";
  let cls = "border-gray-200 bg-gray-50 text-gray-700";
  if (status === "접수") cls = "border-amber-200 bg-amber-50 text-amber-800";
  else if (status === "승인") cls = "border-emerald-200 bg-emerald-50 text-emerald-700";
  else if (status === "반려") cls = "border-rose-200 bg-rose-50 text-rose-700";
  else if (status === "취소") cls = "border-gray-200 bg-gray-100 text-gray-600";
  return <span className={`${base} ${cls}`}>{label}</span>;
}

export default function RequestTable({
  rows,
  isGalleryCategory,
  view,
  idLabel,
}: {
  rows: TableRowData[];
  isGalleryCategory: boolean;
  view: "group" | "items";
  idLabel: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
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
  const hasDeletable = deletableRows.length > 0;

  const allDeletableSelected = hasDeletable && deletableRows.every((r) => selected.has(r.key));

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

  const handleDelete = async () => {
    const targetRows = visibleRows.filter((r) => selected.has(r.key));
    const requestIds = targetRows.flatMap((r) => r.requestIds);
    const targetKeys = new Set(targetRows.map((r) => r.key));
    if (!requestIds.length) return;
    if (!confirm(`선택한 ${requestIds.length}건을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) return;

    // 1단계: 삭제 중 시각 표시 (페이드 아웃)
    setDeleting(true);
    setDeletingKeys(targetKeys);

    try {
      const res = await fetch("/api/admin/requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestIds }),
      });
      const data = await res.json();
      if (!data.ok) {
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
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
      setDeletingKeys(new Set());
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-xl bg-white shadow">
      {/* 선택 삭제 바 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b bg-rose-50 px-4 py-2.5 rounded-t-xl">
          <span className="text-sm font-medium text-rose-700">
            {selected.size}건 선택됨 ({visibleRows.filter((r) => selected.has(r.key)).flatMap((r) => r.requestIds).length}개 항목)
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? "삭제 중..." : "선택 삭제"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50"
          >
            선택 해제
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50/80 text-left">
            <tr>
              {hasDeletable && (
                <th className="w-10 px-2 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                    title="반려/취소 건 전체 선택"
                  />
                </th>
              )}
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">{idLabel}</th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">공간</th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">일시</th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">신청자</th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">단체/인원</th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700">상태</th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 text-right">총액</th>
              {!isGalleryCategory && (
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 text-right">할인</th>
              )}
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 text-right">최종금액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleRows.map((r) => (
              <tr
                key={r.key}
                className={
                  "transition hover:bg-gray-50/50" +
                  (deletingKeys.has(r.key) ? " opacity-40 pointer-events-none" : "")
                }
              >
                {hasDeletable && (
                  <td className="w-10 px-2 py-3 text-center">
                    {r.isDeletable ? (
                      <input
                        type="checkbox"
                        checked={selected.has(r.key)}
                        onChange={() => toggle(r.key)}
                        className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                      />
                    ) : null}
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-[rgb(var(--brand-primary))] hover:underline"
                    href={r.idLink}
                  >
                    {r.primaryId}
                  </Link>
                  {r.extraCount > 0 && (
                    <div className="mt-0.5 text-xs text-gray-500">외 {r.extraCount}건</div>
                  )}
                </td>
                <td className="px-4 py-3">{r.roomName}</td>
                <td className="px-4 py-3">
                  {view === "group" ? (
                    <>
                      <div>
                        {r.dateDisplay}{" "}
                        {r.countDisplay && (
                          <span className="ml-1 text-xs text-gray-500">({r.countDisplay})</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{r.timeDisplay}</div>
                    </>
                  ) : (
                    r.dateDisplay
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{r.applicantName}</td>
                <td className="px-4 py-3">{r.orgHeadcount}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                  {r.displayStatus === "부분처리" && (
                    <div className="mt-1">
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        부분처리
                      </span>
                    </div>
                  )}
                  {r.usingApprovedBasis && (
                    <div className="mt-1 text-xs text-gray-500">
                      승인 {r.approvedCount}/{r.totalCount}회
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                  {formatKRW(r.totalFeeKRW)}
                  {r.usingApprovedBasis && (
                    <div className="mt-0.5 text-xs text-gray-500">(승인기준)</div>
                  )}
                </td>
                {!isGalleryCategory && (
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                    {r.discountAmountKRW > 0
                      ? `${r.discountRatePct.toFixed(2)}% (${formatKRW(r.discountAmountKRW)})`
                      : "-"}
                  </td>
                )}
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-semibold">
                  {formatKRW(r.finalFeeKRW)}
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={isGalleryCategory ? (hasDeletable ? 9 : 8) : (hasDeletable ? 10 : 9)}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  조건에 맞는 신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
