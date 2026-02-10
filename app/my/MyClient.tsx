"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  | { ok: true; email: string; current: MyListGroup[]; past: MyListGroup[] };

const STORAGE_KEY = "applicantToken";

function getSavedToken(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
}

function clearSavedToken() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function MyClient({ token: urlToken }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);

  // URL 토큰 우선, 없으면 localStorage 토큰 사용
  const [activeToken, setActiveToken] = useState(urlToken);

  useEffect(() => {
    if (urlToken) {
      setActiveToken(urlToken);
      return;
    }
    const saved = getSavedToken();
    if (saved) setActiveToken(saved);
  }, [urlToken]);

  const hasToken = !!activeToken;

  useEffect(() => {
    if (!activeToken) return;
    setLoading(true);
    fetch(`/api/public/my/list?token=${encodeURIComponent(activeToken)}`)
      .then((r) => r.json())
      .then((j: ApiResp) => {
        setResp(j);
        // 토큰 인증 실패 시 localStorage 정리
        if (!j.ok && !urlToken) {
          clearSavedToken();
          setActiveToken("");
        }
      })
      .catch(() => {
        setResp({ ok: false, message: "조회 중 오류가 발생했습니다." });
        if (!urlToken) {
          clearSavedToken();
          setActiveToken("");
        }
      })
      .finally(() => setLoading(false));
  }, [activeToken, urlToken]);

  const view = useMemo(() => {
    if (!resp) return null;
    if (!resp.ok) return { ok: false as const, message: resp.message };
    return resp;
  }, [resp]);

  async function sendLink() {
    const v = email.trim();
    if (!v) return;
    setSending(true);
    setSent(false);
    try {
      const res = await fetch("/api/public/my/send-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: v }),
      });
      const j = await res.json().catch(() => ({ ok: false, message: "" }));
      if (j?.ok) setSent(true);
      else setSent(false);
    } catch {
      setSent(false);
    } finally {
      setSending(false);
    }
  }

  function openResult(requestId: string) {
    const t = activeToken || urlToken;
    router.push(`/result?requestId=${encodeURIComponent(requestId)}&token=${encodeURIComponent(t)}`);
  }

  return (
    <div>
      <SiteHeader title="내 신청 조회" backHref="/" backLabel="홈으로" />

      <main className="mx-auto max-w-6xl px-4 py-8">
        {!hasToken ? (
          <div className="max-w-xl">
            <Card>
              <div className="space-y-4">
                <p className="text-sm text-slate-700">
                  신청 시 입력한 <span className="font-semibold">이메일</span>로 조회 링크를 보내드립니다.
                </p>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-800">이메일</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[rgb(var(--brand-primary))] focus:outline-none"
                    placeholder="example@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={sendLink}
                  disabled={sending || !email.trim()}
                  className={cn(
                    BUTTON_BASE,
                    BUTTON_VARIANT.primary,
                    "w-full justify-center rounded-full py-2",
                    (sending || !email.trim()) && "opacity-60"
                  )}
                >
                  {sending ? "발송 중..." : "조회 링크 보내기"}
                </button>

                {sent ? (
                  <Notice title="발송 완료" variant="success">
                    입력하신 이메일로 조회 링크를 발송했습니다. 메일함(스팸함 포함)을 확인해주세요.
                  </Notice>
                ) : null}

                <Notice title="안내" variant="info">
                  링크는 일정 시간 후 만료됩니다. 만료 시 다시 링크를 요청해주세요.
                </Notice>
              </div>
            </Card>
          </div>
        ) : (
          <div>
            {loading ? (
              <div className="text-sm text-slate-600">조회 중...</div>
            ) : view && !view.ok ? (
              <Notice title="조회 실패" variant="danger">
                {view.message}
                <div className="mt-3">
                  <Link href="/my" className={cn(BUTTON_BASE, BUTTON_VARIANT.outline, "rounded-full")}>다시 링크 요청하기</Link>
                </div>
              </Notice>
            ) : view && view.ok ? (
              <div className="space-y-8">
                <Notice title="인증됨" variant="success">
                  {view.email} 계정으로 조회 중입니다.
                </Notice>

                <section>
                  <h2 className="text-lg font-bold text-slate-900">현재 예약</h2>
                  <div className="mt-4 grid gap-3">
                    {view.current.length === 0 ? (
                      <div className="text-sm text-slate-600">현재 예약 내역이 없습니다.</div>
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
                                  결제하실 금액: <span className="font-semibold">{(g.payableFeeKRW ?? 0).toLocaleString()}원</span>
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
                  <h2 className="text-lg font-bold text-slate-900">지난 예약 / 취소</h2>
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
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
