"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = { key: string; requestIds: string[]; roomName: string; paymentDueDate: string; approvedCount: number; mailOk: boolean | null };
type RunResult = {
  ok: boolean;
  message?: string;
  code?: string;
  today?: string;
  dryRun?: boolean;
  candidates?: number;
  cancelled?: Candidate[];
  skippedOverCap?: number;
  reminders?: { enabled: boolean; candidates: number; sent: number; failed: number };
  errors?: Array<{ key: string; stage: string; message: string }>;
};

/**
 * 관리자 "지금 점검" — 결제 기한 경과 자동 취소를 수동 실행 (01_spec ②-(사) · 03_api §7)
 * 먼저 dryRun=1 로 대상 건수·목록을 모달에 보여주고, "N건 취소 실행" 확인 후에만 실제 실행한다.
 */
export default function PaymentDeadlineCheckButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<RunResult | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPreview(null);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function call(dryRun: boolean): Promise<RunResult> {
    const res = await fetch(`/api/admin/payment-deadline/run${dryRun ? "?dryRun=1" : ""}`, { method: "POST" });
    const data = (await res.json().catch(() => ({ ok: false, message: "응답을 읽을 수 없습니다." }))) as RunResult;
    return data;
  }

  async function startPreview() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await call(true);
      if (!data.ok) {
        setError(data.message || "점검에 실패했습니다.");
        setPreview(null);
      } else {
        setPreview(data);
      }
    } catch {
      setError("점검 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function execute() {
    setLoading(true);
    setError(null);
    try {
      const data = await call(false);
      if (!data.ok) setError(data.message || "실행에 실패했습니다.");
      else {
        setResult(data);
        router.refresh();
      }
    } catch {
      setError("실행 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const count = preview?.candidates ?? 0;

  return (
    <>
      <button type="button" onClick={startPreview} className="text-xs text-gray-600 underline hover:text-gray-900 min-h-[44px] md:min-h-0">
        지금 점검
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="deadline-check-title">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 id="deadline-check-title" className="text-lg font-bold text-gray-900">결제 기한 경과 점검</h2>
              <p className="mt-1 text-sm text-gray-500">기한이 지난 미결제 승인 건을 먼저 확인하고, 확인 후에만 취소를 실행합니다.</p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 text-sm text-gray-700">
              {loading && <p className="text-gray-500">확인 중…</p>}
              {error && <p role="alert" className="font-semibold text-red-600">{error}</p>}

              {!loading && !error && result && (
                <div className="space-y-2">
                  <p className="font-semibold text-gray-900">취소 실행 완료 · {result.cancelled?.length ?? 0}건</p>
                  {(result.skippedOverCap ?? 0) > 0 && <p className="text-amber-700">상한 초과로 다음 실행으로 넘긴 건: {result.skippedOverCap}건</p>}
                  {(result.errors?.length ?? 0) > 0 && (
                    <ul className="list-disc pl-5 text-xs text-red-600">
                      {result.errors!.map((e, i) => (
                        <li key={i}>{e.key} · {e.stage} · {e.message}</li>
                      ))}
                    </ul>
                  )}
                  <CandidateList items={result.cancelled ?? []} />
                </div>
              )}

              {!loading && !error && !result && preview && (
                <div className="space-y-2">
                  {count === 0 ? (
                    <p>자동 취소 대상이 없습니다.{preview.today ? ` (기준일 ${preview.today})` : ""}</p>
                  ) : (
                    <>
                      <p className="font-semibold text-gray-900">
                        자동 취소 대상 {count}건{preview.today ? ` · 기준일 ${preview.today}` : ""}
                      </p>
                      <CandidateList items={preview.cancelled ?? []} />
                      <p className="text-xs text-gray-500">실행하면 위 신청의 승인 회차가 취소되고 신청자에게 취소 안내 메일이 발송됩니다. 홈페이지·복지종합시스템 강좌는 자동으로 닫히지 않습니다.</p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button type="button" onClick={close} disabled={loading} className="flex-1 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 md:flex-none">
                닫기
              </button>
              {!result && preview && count > 0 && (
                <button type="button" onClick={execute} disabled={loading} className="flex-1 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60 md:flex-none">
                  {count}건 취소 실행
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CandidateList({ items }: { items: Candidate[] }) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {items.map((c) => (
        <li key={c.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <span className="font-medium text-gray-900">{c.roomName}</span>
          <span className="text-gray-600">기한 {c.paymentDueDate} · 승인 {c.approvedCount}회</span>
          <span className="w-full text-gray-500 tabular-nums">{c.requestIds.join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}
