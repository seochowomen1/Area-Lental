"use client";

import { fmtCreatedAt } from "@/lib/datetime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import { cn } from "@/lib/cn";
import { BUTTON_BASE, BUTTON_VARIANT } from "@/components/ui/presets";
import {
  adoptTokenFromUrl,
  clearApplicantAccess,
  purgeLegacyApplicantToken,
  readApplicantAccess,
} from "@/lib/applicantAccess";

type MyListGroup = {
  key: string;
  isBatch: boolean;
  requestId: string;
  batchId: string;
  roomId: string;
  roomName: string;
  roomFloor: string;
  dateTime: string;
  createdAt: string;
  status: string;
  payableFeeKRW: number;
  feeIsEstimated: boolean;
  past: boolean;
  cancelable: boolean;
  sessions: Array<{
    requestId: string;
    seq: number;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
};

type ListOk = { ok: true; scope: "email" | "req"; email: string; current: MyListGroup[]; past: MyListGroup[]; cancelled: MyListGroup[] };

/** 화면 상태 */
type View =
  | { kind: "form" }                       // 조회 권한 없음 → 이메일 입력 폼
  | { kind: "loading" }
  | { kind: "list"; data: ListOk }
  | { kind: "linkError"; message: string } // 403 TOKEN_EXPIRED / TOKEN_INVALID → 폼과 함께 안내
  | { kind: "error"; message: string };    // 기타 실패

const FALLBACK_ERROR = "조회 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    "접수": "bg-blue-50 text-blue-700 border-blue-200",
    "승인": "bg-green-50 text-green-700 border-green-200",
    "반려": "bg-red-50 text-red-700 border-red-200",
    "취소": "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
      colorMap[status] ?? "bg-slate-50 text-slate-700 border-slate-200",
    )}>
      {status}
    </span>
  );
}

export default function MyClient() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [clearedNotice, setClearedNotice] = useState(false);

  // 조회 링크 받기 폼
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // PC(≥900) = 표 / 휴대폰 = 카드
  const [isPc, setIsPc] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setIsPc(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const loadList = useCallback(async () => {
    const access = readApplicantAccess();
    if (!access) {
      setView({ kind: "form" });
      return;
    }
    setView({ kind: "loading" });
    try {
      const res = await fetch(`/api/public/my/list?token=${encodeURIComponent(access.token)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setView({ kind: "list", data: json as ListOk });
        return;
      }
      const code = String(json?.code ?? "");
      if (res.status === 403 || code === "LINK_REQUIRED") {
        // 만료·무효 링크 → 이 기기의 권한을 지우고 폼으로
        clearApplicantAccess();
        setView({ kind: "linkError", message: String(json?.message ?? FALLBACK_ERROR) });
        return;
      }
      setView({ kind: "error", message: String(json?.message ?? FALLBACK_ERROR) });
    } catch {
      setView({ kind: "error", message: FALLBACK_ERROR });
    }
  }, []);

  useEffect(() => {
    // ★ [10] 구형 localStorage 토큰 삭제 · 메일 링크(?token=)는 sessionStorage로 옮기고 주소에서 뺀다
    purgeLegacyApplicantToken();
    adoptTokenFromUrl();
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("cleared") === "1") {
        setClearedNotice(true);
        url.searchParams.delete("cleared");
        const qs = url.searchParams.toString();
        window.history.replaceState(window.history.state, "", `${url.pathname}${qs ? `?${qs}` : ""}`);
      }
    } catch {
      /* 무시 */
    }
    void loadList();
  }, [loadList]);

  const data = view.kind === "list" ? view.data : null;

  /** 현재 + 지난 + 취소/반려 모두 통합 (서버 정렬 유지) */
  const allRows = useMemo(() => {
    if (!data) return [];
    return [...data.current, ...data.past, ...data.cancelled];
  }, [data]);

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    setSending(true);
    setSendError(null);
    setSentTo(null);
    try {
      const res = await fetch("/api/public/my/send-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: v }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setSendError(String(json?.message ?? FALLBACK_ERROR));
        return;
      }
      setSentTo(v);
    } catch {
      setSendError(FALLBACK_ERROR);
    } finally {
      setSending(false);
    }
  }

  function clearDeviceRecord() {
    clearApplicantAccess();
    setSentTo(null);
    setSendError(null);
    setClearedNotice(true);
    setView({ kind: "form" });
  }

  function openResult(requestId: string) {
    router.push(`/result?requestId=${encodeURIComponent(requestId)}`);
  }

  const isCancelled = (s: string) => s === "반려" || s === "취소";
  // 이메일 전체 조회(메일 링크)일 때만 폼을 숨긴다. 신청 직후 토큰(scope=req)이면 다른 신청을 위해 폼을 함께 보여 준다.
  const showForm = view.kind === "form" || view.kind === "linkError" || view.kind === "error" || (data !== null && data.scope === "req");
  const dateHeader = allRows.every((r) => r.roomId === "gallery") ? "전시 기간" : allRows.some((r) => r.roomId === "gallery") ? "이용 일시" : "대관 일시";

  return (
    <div>
      <SiteHeader title="내 신청 조회" backHref="/" backLabel="홈으로" />

      <main className="mx-auto max-w-6xl px-4 py-8">
        {clearedNotice ? (
          <div className="mb-4 max-w-2xl">
            <Notice variant="success">이 기기에 저장된 조회 기록을 지웠습니다.</Notice>
          </div>
        ) : null}

        {view.kind === "loading" ? (
          <div className="text-sm text-slate-600" role="status">조회 중...</div>
        ) : null}

        {view.kind === "linkError" ? (
          <div className="mb-4 max-w-2xl">
            <Notice variant="warn">{view.message}</Notice>
          </div>
        ) : null}

        {view.kind === "error" ? (
          <div className="mb-4 max-w-2xl">
            <Notice variant="danger">{view.message}</Notice>
          </div>
        ) : null}

        {data ? (
          <div className="mb-8 space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <Notice variant="success" className="flex-1">
                {data.scope === "req" ? (
                  <>방금 신청한 내역입니다. 다른 신청은 [조회 링크 받기]로 확인해 주세요.</>
                ) : (
                  <><b>{data.email}</b>로 신청한 내역 {allRows.length}건</>
                )}
              </Notice>
              <button
                type="button"
                onClick={clearDeviceRecord}
                className="shrink-0 self-end text-sm font-semibold text-brand underline-offset-2 hover:underline sm:self-start sm:pt-3"
              >
                이 기기에서 조회 기록 지우기
              </button>
            </div>

            {allRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
                이 이메일로 신청한 내역이 없습니다.
              </div>
            ) : isPc ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                      <th className="px-4 py-3">공간</th>
                      <th className="px-4 py-3">{dateHeader}</th>
                      <th className="px-4 py-3">신청 일시</th>
                      <th className="px-4 py-3 text-center">상태</th>
                      <th className="px-4 py-3 text-right">금액</th>
                      <th className="px-4 py-3 text-center">상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allRows.map((g) => (
                      <tr key={g.key} className={cn("transition-colors hover:bg-slate-50", isCancelled(g.status) && "opacity-60")}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{g.roomName}</div>
                          {g.roomFloor && <div className="mt-0.5 text-xs text-slate-500">{g.roomFloor}층</div>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          <div>{g.dateTime}</div>
                          {g.isBatch && (
                            <div className="mt-0.5 text-xs text-slate-500">
                              {g.roomId === "gallery" ? `${g.sessions.length}일` : `${g.sessions.length}회차`}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtCreatedAt(g.createdAt)}</td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={g.status} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
                          {(g.payableFeeKRW ?? 0).toLocaleString()}원
                          {g.feeIsEstimated && <div className="text-xs text-slate-500">(예상)</div>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => openResult(g.requestId)}
                            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            조회
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="space-y-3">
                {allRows.map((g) => (
                  <li key={g.key} className={cn("rounded-xl border border-slate-200 bg-white p-4", isCancelled(g.status) && "opacity-60")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-slate-900">{g.roomName}</div>
                        {g.roomFloor && <div className="text-xs text-slate-500">{g.roomFloor}층</div>}
                      </div>
                      <StatusBadge status={g.status} />
                    </div>
                    <div className="mt-2 text-sm text-slate-800">{g.dateTime}</div>
                    {g.isBatch && (
                      <div className="text-xs text-slate-500">
                        {g.roomId === "gallery" ? `${g.sessions.length}일` : `${g.sessions.length}회차`}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-xs text-slate-500">신청 {fmtCreatedAt(g.createdAt)}</span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {(g.payableFeeKRW ?? 0).toLocaleString()}원{g.feeIsEstimated ? <span className="ml-1 text-xs font-normal text-slate-500">(예상)</span> : null}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openResult(g.requestId)}
                      className={cn(BUTTON_BASE, BUTTON_VARIANT.outline, "mt-3 w-full justify-center rounded-xl py-2.5")}
                    >
                      조회
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {showForm ? (
          <div className="max-w-2xl">
            <Card>
              <form onSubmit={handleSendLink} className="space-y-3">
                <p className="text-sm text-slate-700">
                  신청할 때 입력한 이메일을 넣으면 신청 내역을 볼 수 있는 조회 링크를 메일로 보내 드립니다. 링크는 30분 동안 쓸 수 있습니다.
                </p>

                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                  <label htmlFor="my-email" className="sr-only">이메일</label>
                  <input
                    id="my-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@domain.com"
                    autoComplete="email"
                    className="w-full flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/[0.15]"
                  />
                  <button
                    type="submit"
                    disabled={sending || !email.trim()}
                    className={cn(
                      BUTTON_BASE,
                      BUTTON_VARIANT.primary,
                      "shrink-0 justify-center rounded-xl px-6 py-2.5",
                      (sending || !email.trim()) && "opacity-60"
                    )}
                  >
                    {sending ? "보내는 중…" : "조회 링크 받기"}
                  </button>
                </div>

                {sentTo ? (
                  <Notice variant="info">
                    {sentTo}로 조회 링크를 보냈습니다. 메일이 오지 않으면 스팸함을 확인하고, 신청 시 입력한 이메일이 맞는지 확인해 주세요.
                  </Notice>
                ) : null}
                {sendError ? <Notice variant="danger">{sendError}</Notice> : null}
              </form>
            </Card>
          </div>
        ) : null}
      </main>
    </div>
  );
}
