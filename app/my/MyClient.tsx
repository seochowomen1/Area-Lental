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

type Props = {
  token: string;
  initialEmail?: string;
};

export default function MyClient({ token: urlToken, initialEmail = "" }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);

  // 인증 수단: URL토큰 > localStorage토큰 > 이메일 직접 조회
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
    // 이메일 파라미터가 있으면 바로 조회
    if (initialEmail) {
      setActiveEmail(initialEmail);
    }
  }, [urlToken, initialEmail]);

  const hasAuth = !!activeToken || !!activeEmail;

  // 데이터 fetch
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
        // 토큰 인증 실패 시 localStorage 정리
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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    // 이전 상태 초기화 후 이메일로 조회
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

  return (
    <div>
      <SiteHeader title="내 신청 조회" backHref="/" backLabel="홈으로" />

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* 이메일 검색 폼 - 항상 표시 (토큰 인증이 아닌 경우) */}
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

        {/* 결과 영역 */}
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
              <div className="space-y-8">
                <Notice title="조회 완료" variant="success">
                  <b>{view.email}</b> 계정의 신청 내역입니다.
                </Notice>

                <section>
                  <h2 className="text-lg font-bold text-slate-900">현재 신청</h2>
                  <div className="mt-4 grid gap-3">
                    {view.current.length === 0 ? (
                      <div className="text-sm text-slate-600">현재 신청 내역이 없습니다.</div>
                    ) : (
                      view.current.map((g) => (
                        <Card key={g.key} className="p-0">
                          <div className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{g.roomName}</div>
                                <div className="mt-1 text-xs text-slate-600">{g.roomFloor ? `${g.roomFloor}층 · ` : ""}{g.dateTime}</div>
                                <div className="mt-2 text-xs text-slate-700">
                                  상태: <span className="font-semibold">{g.status}</span>
                                  {g.feeIsEstimated ? <span className="ml-2 text-slate-500">(예상금액)</span> : null}
                                </div>
                                <div className="mt-1 text-xs text-slate-700">
                                  금액: <span className="font-semibold">{(g.payableFeeKRW ?? 0).toLocaleString()}원</span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => openResult(g.requestId)}
                                className={cn(BUTTON_BASE, BUTTON_VARIANT.outline, "rounded-full px-4 py-2 text-sm")}
                              >
                                상세조회
                              </button>
                            </div>

                            {g.isBatch ? (
                              <details className="mt-4">
                                <summary className="cursor-pointer text-xs font-medium text-slate-700">{g.roomId === "gallery" ? "전시일 보기" : "회차 보기"}</summary>
                                <div className="mt-2 space-y-1 text-xs text-slate-600">
                                  {g.sessions.map((s) => (
                                    <div key={s.requestId} className="flex justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                                      <div>
                                        {s.seq
                                          ? `${s.seq}${g.roomId === "gallery" ? "일" : "회차"} · `
                                          : ""}
                                        {g.roomId === "gallery"
                                          ? `${s.date} (일 단위)`
                                          : `${s.date} ${s.startTime}-${s.endTime}`}
                                      </div>
                                      <div className="font-medium text-slate-700">{s.status}</div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </section>

                <section>
                  <h2 className="text-lg font-bold text-slate-900">지난 신청</h2>
                  <div className="mt-4 grid gap-3">
                    {view.past.length === 0 ? (
                      <div className="text-sm text-slate-600">내역이 없습니다.</div>
                    ) : (
                      view.past.map((g) => (
                        <Card key={g.key} className="p-0">
                          <div className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{g.roomName}</div>
                                <div className="mt-1 text-xs text-slate-600">{g.roomFloor ? `${g.roomFloor}층 · ` : ""}{g.dateTime}</div>
                                <div className="mt-2 text-xs text-slate-700">
                                  상태: <span className="font-semibold">{g.status}</span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => openResult(g.requestId)}
                                className={cn(BUTTON_BASE, BUTTON_VARIANT.outline, "rounded-full px-4 py-2 text-sm")}
                              >
                                상세조회
                              </button>
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </section>

                {view.cancelled.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-slate-900">취소 · 반려</h2>
                    <div className="mt-4 grid gap-3">
                      {view.cancelled.map((g) => (
                        <Card key={g.key} className="p-0 opacity-70">
                          <div className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">{g.roomName}</div>
                                <div className="mt-1 text-xs text-slate-600">{g.roomFloor ? `${g.roomFloor}층 · ` : ""}{g.dateTime}</div>
                                <div className="mt-2 text-xs">
                                  <span className={cn(
                                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                                    g.status === "반려" ? "border-red-300 text-red-700 bg-red-50" : "border-orange-300 text-orange-700 bg-orange-50"
                                  )}>
                                    {g.status}
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => openResult(g.requestId)}
                                className={cn(BUTTON_BASE, BUTTON_VARIANT.outline, "rounded-full px-4 py-2 text-sm")}
                              >
                                상세조회
                              </button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
