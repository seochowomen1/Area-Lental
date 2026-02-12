"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Card from "@/components/ui/Card";
import Notice from "@/components/ui/Notice";
import { cn } from "@/lib/cn";
import { BUTTON_BASE, BUTTON_VARIANT } from "@/components/ui/presets";

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

/** ISO 날짜 → "YYYY.MM.DD HH:MM" (KST) */
function fmtCreatedAt(iso: string): string {
  if (!iso) return "-";
  try {
    const dt = new Date(iso);
    const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const d = String(kst.getUTCDate()).padStart(2, "0");
    const h = String(kst.getUTCHours()).padStart(2, "0");
    const min = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${y}.${m}.${d} ${h}:${min}`;
  } catch {
    return iso;
  }
}

type ApiResp =
  | { ok: false; message: string }
  | { ok: true; email: string; current: MyListGroup[]; past: MyListGroup[]; cancelled: MyListGroup[] };

const STORAGE_KEY = "applicantToken";

function getSavedToken(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
}

function clearSavedToken() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

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

type Props = {
  token: string;
  initialEmail?: string;
};

export default function MyClient({ token: urlToken, initialEmail = "" }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);

  const [activeToken, setActiveToken] = useState(urlToken);
  const [activeEmail, setActiveEmail] = useState(initialEmail);

  useEffect(() => {
    if (urlToken) {
      setActiveToken(urlToken);
      return;
    }
    const saved = getSavedToken();
    if (saved) {
      setActiveToken(saved);
      return;
    }
    if (initialEmail) {
      setActiveEmail(initialEmail);
    }
  }, [urlToken, initialEmail]);

  const hasAuth = !!activeToken || !!activeEmail;

  useEffect(() => {
    if (!activeToken && !activeEmail) return;

    setLoading(true);
    const params = new URLSearchParams();
    if (activeToken) {
      params.set("token", activeToken);
    } else if (activeEmail) {
      params.set("email", activeEmail);
    }

    fetch(`/api/public/my/list?${params.toString()}`)
      .then((r) => r.json())
      .then((j: ApiResp) => {
        setResp(j);
        if (!j.ok && activeToken && !urlToken) {
          clearSavedToken();
          setActiveToken("");
        }
      })
      .catch(() => {
        setResp({ ok: false, message: "조회 중 오류가 발생했습니다." });
        if (activeToken && !urlToken) {
          clearSavedToken();
          setActiveToken("");
        }
      })
      .finally(() => setLoading(false));
  }, [activeToken, activeEmail, urlToken]);

  const view = useMemo(() => {
    if (!resp) return null;
    if (!resp.ok) return { ok: false as const, message: resp.message };
    return resp;
  }, [resp]);

  /** 현재 + 지난 + 취소/반려 모두 통합 (날짜 내림차순 정렬) */
  const allRows = useMemo(() => {
    if (!view || !view.ok) return [];
    return [...view.current, ...view.past, ...view.cancelled];
  }, [view]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    setResp(null);
    setActiveToken("");
    setActiveEmail(v);
  }

  function openResult(requestId: string) {
    if (activeToken) {
      router.push(`/result?requestId=${encodeURIComponent(requestId)}&token=${encodeURIComponent(activeToken)}`);
    } else if (activeEmail) {
      router.push(`/result?requestId=${encodeURIComponent(requestId)}&email=${encodeURIComponent(activeEmail)}`);
    }
  }

  const showResults = hasAuth && (loading || resp);
  const isCancelled = (s: string) => s === "반려" || s === "취소";

  return (
    <div>
      <SiteHeader title="내 신청 조회" backHref="/" backLabel="홈으로" />

      <main className="mx-auto max-w-6xl px-4 py-8">
        {!activeToken && (
          <div className="mb-8 max-w-2xl">
            <Card>
              <form onSubmit={handleSearch} className="space-y-3">
                <p className="text-sm text-slate-700">
                  신청 시 입력한 <span className="font-semibold">이메일</span>을 입력하면 신청 내역을 바로 조회할 수 있습니다.
                </p>

                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@domain.com"
                    className="w-full flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-[rgb(var(--brand-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.15)]"
                  />
                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className={cn(
                      BUTTON_BASE,
                      BUTTON_VARIANT.primary,
                      "shrink-0 justify-center rounded-xl px-6 py-2.5",
                      (loading || !email.trim()) && "opacity-60"
                    )}
                  >
                    {loading ? "조회 중..." : "조회하기"}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {showResults && (
          <div>
            {loading ? (
              <div className="text-sm text-slate-600">조회 중...</div>
            ) : view && !view.ok ? (
              <Notice title="조회 결과" variant="info">
                {view.message === "조회 중 오류가 발생했습니다."
                  ? view.message
                  : "해당 이메일로 등록된 신청 내역이 없습니다."}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setResp(null);
                      setActiveEmail("");
                      setActiveToken("");
                      clearSavedToken();
                    }}
                    className={cn(BUTTON_BASE, BUTTON_VARIANT.outline, "rounded-full")}
                  >
                    다시 조회하기
                  </button>
                </div>
              </Notice>
            ) : view && view.ok ? (
              <div className="space-y-6">
                <Notice title="조회 완료" variant="success">
                  <b>{view.email}</b> 계정의 신청 내역입니다. (총 {allRows.length}건)
                </Notice>

                {allRows.length === 0 ? (
                  <div className="text-sm text-slate-600">신청 내역이 없습니다.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                          <th className="px-4 py-3">공간</th>
                          <th className="px-4 py-3">대관 일시</th>
                          <th className="px-4 py-3">신청 일시</th>
                          <th className="px-4 py-3 text-center">상태</th>
                          <th className="px-4 py-3 text-right">금액</th>
                          <th className="px-4 py-3 text-center">상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allRows.map((g) => (
                          <tr
                            key={g.key}
                            className={cn(
                              "transition-colors hover:bg-slate-50",
                              isCancelled(g.status) && "opacity-60",
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{g.roomName}</div>
                              {g.roomFloor && (
                                <div className="mt-0.5 text-xs text-slate-500">{g.roomFloor}층</div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                              <div>{g.dateTime}</div>
                              {g.isBatch && (
                                <div className="mt-0.5 text-xs text-slate-500">
                                  {g.roomId === "gallery" ? `${g.sessions.length}일` : `${g.sessions.length}회차`}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">
                              {fmtCreatedAt(g.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <StatusBadge status={g.status} />
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-slate-900">
                              {(g.payableFeeKRW ?? 0).toLocaleString()}원
                              {g.feeIsEstimated && (
                                <div className="text-xs text-slate-400">(예상)</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => openResult(g.requestId)}
                                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                              >
                                조회
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
