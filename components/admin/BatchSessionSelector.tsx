"use client";

import { useMemo, useState } from "react";
import { formatKRW } from "@/lib/pricing";
import type { RequestStatus } from "@/lib/types";

export type BatchSessionRow = {
  requestId: string;
  seq: number;
  isPrepDay?: boolean;
  date: string;
  startTime: string;
  endTime: string;
  status: RequestStatus;
  rejectReason: string;
  baseTotalKRW: number;
};

export default function BatchSessionSelector({ sessions }: { sessions: BatchSessionRow[] }) {
  const ids = useMemo(() => sessions.map((s) => s.requestId), [sessions]);
  const pendingIds = useMemo(() => sessions.filter((s) => s.status === "검토중" || s.status === "접수").map((s) => s.requestId), [sessions]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(ids));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function selectPending() {
    setSelected(new Set(pendingIds));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={allSelected ? clearAll : selectAll}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
        <button
          type="button"
          onClick={selectPending}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          대기만 선택
        </button>
        <span className="text-xs text-gray-600">
          * 체크된 회차만 아래 “선택 승인/반려”가 적용됩니다.
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th className="p-2">선택</th>
              <th className="p-2">회차</th>
              <th className="p-2">일시</th>
              <th className="p-2">상태</th>
              <th className="p-2">반려 사유</th>
              <th className="p-2 text-right">기본 이용료</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sessions.map((s) => {
              const checked = selected.has(s.requestId);
              return (
                <tr key={s.requestId} className={checked ? "bg-slate-50" : ""}>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      name="selectedIds"
                      value={s.requestId}
                      checked={checked}
                      onChange={() => toggle(s.requestId)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="p-2">{s.seq}</td>
                  <td className="p-2">
                    {s.date} {s.startTime}-{s.endTime}
                    {s.isPrepDay ? <span className="ml-2 text-xs text-gray-500">(준비일)</span> : null}
                  </td>
                  <td className="p-2">{s.status}</td>
                  <td className="p-2">{s.status === "반려" ? (s.rejectReason || "-") : "-"}</td>
                  <td className="p-2 text-right">{formatKRW(s.baseTotalKRW)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
