"use client";

import { useState } from "react";

type ExpiredItem = {
  requestId: string;
  createdAt: string;
  status: string;
  roomName: string;
  date: string;
};

type CheckResult = {
  expiredCount: number;
  cutoffDate: string;
  expired: ExpiredItem[];
};

export default function DataRetentionPanel() {
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [message, setMessage] = useState("");

  async function handleCheck() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/data-retention");
      const data = await res.json();
      if (data.ok) {
        setResult(data);
      } else {
        setMessage(data.message ?? "조회 실패");
      }
    } catch {
      setMessage("조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePurge() {
    if (!result || result.expiredCount === 0) return;
    if (!confirm(`보존기한이 경과한 ${result.expiredCount}건을 파기합니다. 이 작업은 되돌릴 수 없습니다.`)) return;

    setPurging(true);
    setMessage("");
    try {
      const ids = result.expired.map((e) => e.requestId);
      const res = await fetch("/api/admin/data-retention", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestIds: ids }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`${data.purgedCount}건이 파기되었습니다.`);
        setResult(null);
      } else {
        setMessage(data.message ?? "파기 처리 실패");
      }
    } catch {
      setMessage("파기 처리 중 오류가 발생했습니다.");
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold text-slate-900">개인정보 보존기한 관리</h3>
      <p className="mt-1 text-xs text-slate-500">
        개인정보보호법 제21조에 따라 보존기한(3년)이 경과한 개인정보를 파기합니다.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleCheck}
          disabled={loading}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "만료 데이터 조회"}
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm text-slate-700">{message}</p>
      )}

      {result && (
        <div className="mt-4">
          <p className="text-sm text-slate-700">
            기준일: <strong>{result.cutoffDate}</strong> 이전 생성 건 &mdash;{" "}
            <strong className={result.expiredCount > 0 ? "text-red-600" : "text-green-600"}>
              {result.expiredCount}건
            </strong>
          </p>

          {result.expiredCount > 0 && (
            <>
              <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200 text-xs">
                <table className="w-full">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">신청번호</th>
                      <th className="px-3 py-2 text-left font-semibold">공간</th>
                      <th className="px-3 py-2 text-left font-semibold">대관일</th>
                      <th className="px-3 py-2 text-left font-semibold">상태</th>
                      <th className="px-3 py-2 text-left font-semibold">생성일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.expired.map((e) => (
                      <tr key={e.requestId}>
                        <td className="px-3 py-1.5 font-mono">{e.requestId.slice(0, 8)}...</td>
                        <td className="px-3 py-1.5">{e.roomName}</td>
                        <td className="px-3 py-1.5">{e.date}</td>
                        <td className="px-3 py-1.5">{e.status}</td>
                        <td className="px-3 py-1.5">{e.createdAt.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={handlePurge}
                disabled={purging}
                className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {purging ? "파기 중..." : `${result.expiredCount}건 파기`}
              </button>
            </>
          )}

          {result.expiredCount === 0 && (
            <p className="mt-2 text-xs text-green-600">보존기한 경과 데이터가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
