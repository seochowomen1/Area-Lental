"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import Modal, { MODAL_BTN_DANGER, MODAL_BTN_SECONDARY } from "@/components/ui/Modal";
import { adminFetch, AdminFetchError } from "@/lib/adminFetch";

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

  async function call(dryRun: boolean): Promise<RunResult> {
    try {
      const res = await adminFetch(`/api/admin/payment-deadline/run${dryRun ? "?dryRun=1" : ""}`, { method: "POST" });
      return (await res.json().catch(() => ({ ok: false, message: "응답을 읽을 수 없습니다." }))) as RunResult;
    } catch (e) {
      // 503 AUTH_STORE_BUSY → G-1 문구(로그인으로 보내지 않음) · 그 밖 → 서버 메시지
      if (e instanceof AdminFetchError) return { ok: false, message: e.message, code: e.code };
      throw e;
    }
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
    if (loading) return;
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
      <button type="button" onClick={startPreview} className="min-h-[44px] text-sm text-slate-600 underline hover:text-slate-900">
        지금 점검
      </button>

      <Modal
        open={open}
        onClose={close}
        busy={loading}
        size="lg"
        title="결제 기한 경과 점검"
        showClose={false}
        footer={
          <>
            <button type="button" onClick={close} disabled={loading} data-modal-cancel className={`${MODAL_BTN_SECONDARY} flex-1 md:flex-none`}>
              닫기
            </button>
            {!result && preview && count > 0 && (
              <button type="button" onClick={execute} disabled={loading} className={`${MODAL_BTN_DANGER} flex-1 md:flex-none`}>
                {loading ? "취소 실행 중…" : `${count}건 취소 실행`}
              </button>
            )}
          </>
        }
      >
        <div className="text-[15px] text-slate-700">
          <p className="mb-3 text-sm text-slate-500">기한이 지난 미결제 승인 건을 먼저 확인하고, 확인 후에만 취소를 실행합니다.</p>
          {loading && <p className="text-slate-500">확인 중…</p>}
          {error && <p role="alert" className="font-semibold text-red-700">{error}</p>}

          {!loading && !error && result && (
            <div className="space-y-2">
              <p className="font-semibold text-slate-900">취소 실행 완료 · {result.cancelled?.length ?? 0}건</p>
              {(result.skippedOverCap ?? 0) > 0 && <p className="text-amber-800">상한 초과로 다음 실행으로 넘긴 건: {result.skippedOverCap}건</p>}
              {(result.errors?.length ?? 0) > 0 && (
                <ul className="list-disc pl-5 text-[13px] text-red-700">
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
                  <p className="font-semibold text-slate-900">
                    자동 취소 대상 {count}건{preview.today ? ` · 기준일 ${preview.today}` : ""}
                  </p>
                  <CandidateList items={preview.cancelled ?? []} />
                  <p className="text-[13px] text-slate-500">실행하면 위 신청의 승인 회차가 취소되고 신청자에게 취소 안내 메일이 발송됩니다. 홈페이지·복지종합시스템 강좌는 자동으로 닫히지 않습니다.</p>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function CandidateList({ items }: { items: Candidate[] }) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {items.map((c) => (
        <li key={c.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="font-medium text-slate-900">{c.roomName}</span>
          <span className="text-slate-600">기한 {c.paymentDueDate} · 승인 {c.approvedCount}회</span>
          <span className="w-full text-slate-500 tabular-nums">{c.requestIds.join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}
