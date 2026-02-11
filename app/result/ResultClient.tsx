"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import { FieldLabel, Input } from "@/components/ui/Field";
import { formatKRW } from "@/lib/pricing";
import { cn } from "@/lib/cn";

type SessionInfo = {
  requestId: string;
  seq: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  rejectReason: string;
};

type ResultPayload =
  | {
      ok: true;
      // 기본 상태(묶음이면 displayStatus)
      status: string;
      approvalStatusText: string;
      reservationStatusText: string;
      paymentStatusText: string;
      spaceCategoryText: string;

      requestId: string;
      roomId: string;
      roomName: string;
      // 대표 일시(단일 호환)
      date: string;
      startTime: string;
      endTime: string;
      createdAt: string;

      applicantName: string;
      phone: string;
      orgName: string;
      headcount: number;
      purpose: string;

      // 묶음
      isBatch?: boolean;
      batchId?: string;
      batchSize?: number;
      sessions?: SessionInfo[];

      // 금액/할인
      rentalFeeKRW: number;
      equipmentFeeKRW: number;
      totalFeeKRW: number;
      discountRatePct: number;
      discountAmountKRW: number;
      discountReason: string;
      finalFeeKRW: number;
      payableFeeKRW: number;
      feeIsEstimated: boolean;

      // 금액 표시 기준
      feeAvailable?: boolean;
      feeBasis?: "all" | "approved" | "none";
      approvedCount?: number;
      rejectedCount?: number;
      pendingCount?: number;

      decidedBy: string;
      rejectReason: string;
      cancelable: boolean;
    }
  | { ok: false; message: string };

export default function ResultClient() {
  const sp = useSearchParams();
  const prefillRequestId = sp.get("requestId") ?? "";
  const prefillEmail = sp.get("email") ?? "";
  const token = sp.get("token") ?? "";

  const [requestId, setRequestId] = useState(prefillRequestId);
  const [email, setEmail] = useState(prefillEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ResultPayload | null>(null);

  const didAutoFetch = useRef(false);

  const canSubmit = useMemo(() => {
    return requestId.trim().length > 2 && (!!token || email.trim().includes("@"));
  }, [requestId, email, token]);

  async function fetchResult() {
    const reqId = requestId.trim();
    const em = email.trim();

    const res = await fetch("/api/public/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: reqId, email: em, token: token || undefined }),
    });
    const json = (await res.json()) as ResultPayload;
    if (!res.ok || !json.ok) {
      throw new Error((json as any).message ?? "조회에 실패했습니다.");
    }
    return json;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setData(null);
    try {
      const json = await fetchResult();
      setData(json);
    } catch {
      setError("조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (didAutoFetch.current) return;
    if (!prefillRequestId) return;
    if (!token && !prefillEmail) return;
    // URL로 바로 들어온 경우 1회 자동 조회
    didAutoFetch.current = true;
    (async () => {
      setError(null);
      setLoading(true);
      setData(null);
      try {
        const json = await fetchResult();
        setData(json);
      } catch (err: any) {
        setError(err?.message || "조회에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillRequestId, prefillEmail, token]);

  const [cancelLoading, setCancelLoading] = useState(false);

  async function onCancel() {
    if (!data || !data.ok) return;
    if (!data.cancelable) return;
    const ok = window.confirm("위 예약을 취소하시겠습니까?\n(취소 후 되돌릴 수 없습니다.)");
    if (!ok) return;

    setError(null);
    setCancelLoading(true);
    try {
      const res = await fetch("/api/public/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: data.requestId,
          email: token ? undefined : email.trim(),
          token: token || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message ?? "취소에 실패했습니다.");
      }
      // 취소 후 최신 상태 재조회
      const refreshed = await fetchResult();
      setData(refreshed);
    } catch (err: any) {
      setError(err?.message || "취소 중 오류가 발생했습니다.");
    } finally {
      setCancelLoading(false);
    }
  }

  const feeAvailable = data && data.ok && !!data.feeAvailable;
  const rejectedOnly = data && data.ok && data.status === "반려" && (data.approvedCount ?? 0) === 0;
  const sessions: SessionInfo[] = useMemo(
    () => (data && data.ok && data.sessions ? data.sessions : []),
    [data],
  );
  const isBatch = !!(data && data.ok && data.isBatch);
  const isGallery = !!(data && data.ok && data.roomId === "gallery");

  const dateLabel = useMemo(() => {
    if (!data || !data.ok) return "";
    if (!isBatch) return isGallery ? `${data.date} (일 단위)` : `${data.date} ${data.startTime}-${data.endTime}`;

    const list = sessions.length
      ? sessions
      : [{ requestId: data.requestId, seq: 1, date: data.date, startTime: data.startTime, endTime: data.endTime, status: data.status, rejectReason: data.rejectReason }];

    const first = list[0];
    const last = list[list.length - 1];

    if (list.length === 1) {
      return isGallery ? `${first.date} (총 1일)` : `${first.date} ${first.startTime}-${first.endTime} (총 1회)`;
    }

    const range = first.date === last.date ? first.date : `${first.date} ~ ${last.date}`;
    return `${range} (총 ${list.length}${isGallery ? "일" : "회"})`;
  }, [data, isBatch, sessions, isGallery]);

  return (
    <div>
      <SiteHeader title="신청 결과 조회" backHref="/" backLabel="홈으로" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <Card pad="lg" className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">신청 결과 조회</h2>
            <p className="mt-2 text-sm text-gray-700">
              신청번호와 신청 시 입력한 이메일로 승인 결과 및 최종금액을 확인할 수 있습니다.
            </p>
          </div>

          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5">
              <FieldLabel htmlFor="requestId">신청번호</FieldLabel>
              <Input id="requestId" value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="예: R-2026XXXX" />
            </div>
            {!token ? (
              <div className="md:col-span-5">
                <FieldLabel htmlFor="email">이메일</FieldLabel>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="신청서에 입력한 이메일" />
              </div>
            ) : (
              <div className="md:col-span-5 flex items-end">
                <Notice title="인증 완료" variant="success" className="w-full">
                  매직링크로 인증되었습니다. (이메일 입력 없이 조회 가능)
                </Notice>
              </div>
            )}
            <div className="md:col-span-2 flex items-end">
              <Button type="submit" disabled={!canSubmit || loading} className="w-full">
                {loading ? "조회 중" : "조회"}
              </Button>
            </div>
          </form>

          {error && <Notice variant="danger">{error}</Notice>}

          {data && data.ok && (
            <div className="space-y-10">
              {/* 상단 요약 */}
              <div className="border-y border-slate-300">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 text-center font-semibold">
                        <th className="px-3 py-4">공간분류</th>
                        <th className="px-3 py-4">공간명</th>
                        <th className="px-3 py-4">예약일시</th>
                        <th className="px-3 py-4">승인상태</th>
                        <th className="px-3 py-4">예약상태</th>
                        <th className="px-3 py-4">결제상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-center">
                        <td className="px-3 py-5">
                          <div className="flex items-center gap-3">
                            <div className="h-14 w-20 flex-none rounded border border-slate-200 bg-slate-100" aria-hidden="true" />
                            <div className="text-left">
                              <div className="font-semibold text-slate-900">{data.spaceCategoryText || "-"}</div>
                              {isBatch && (
                                <div className="mt-1 text-xs text-slate-600">
                                  묶음 {sessions.length || data.batchSize || 1}{isGallery ? "일" : "회"}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-5 text-left">
                          <div className="font-semibold text-slate-900">{data.roomName}</div>
                        </td>
                        <td className="px-3 py-5">
                          <div className="font-semibold text-slate-900">{isBatch && sessions.length > 1 ? dateLabel : data.date}</div>
                          {!isBatch && !isGallery && (
                            <div className="mt-1 text-slate-700">
                              {data.startTime} ~ {data.endTime}
                            </div>
                          )}
                          {!isBatch && isGallery && (
                            <div className="mt-1 text-xs text-slate-600">일 단위(하루 전체)</div>
                          )}
                        </td>
                        <td className="px-3 py-5">
                          <OutlinedBadge variant={badgeVariant(data.approvalStatusText)}>{data.approvalStatusText}</OutlinedBadge>
                        </td>
                        <td className="px-3 py-5">
                          <OutlinedBadge variant={badgeVariant(data.reservationStatusText)}>{data.reservationStatusText}</OutlinedBadge>
                        </td>
                        <td className="px-3 py-5">
                          <OutlinedBadge variant={badgeVariant(data.paymentStatusText)}>{data.paymentStatusText}</OutlinedBadge>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-end px-3 py-6">
                  <div className="text-lg font-bold text-slate-900">
                    최종 금액 : {formatKRW(data.payableFeeKRW)}
                  </div>
                </div>
              </div>

              {data.feeIsEstimated && data.status !== "반려" && data.status !== "취소" && (
                <Notice>
                  현재 신청건은 검토 중입니다. 승인/반려 처리 후 최종 금액이 확정됩니다.
                </Notice>
              )}

              {rejectedOnly && <Notice variant="danger">반려 사유: {data.rejectReason || "-"}</Notice>}

              {/* 신청 정보 */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-xs">⏰</span>
                  <h3 className="text-lg font-bold text-slate-900">신청 정보</h3>
                </div>
                <div className="overflow-x-auto border-t-2 border-slate-900">
                  <table className="w-full text-sm">
                    <tbody>
                      <Row label="신청번호" value={data.requestId} />
                      <Row label="신청일시" value={data.createdAt || "-"} />
                      <Row label="단체명" value={data.orgName || "-"} />
                      <Row label="성명" value={data.applicantName || "-"} />
                      <Row label="연락처" value={data.phone || "-"} />
                      <Row label="인원" value={Number.isFinite(data.headcount) ? `${data.headcount}명` : "-"} />
                      <Row label="사용 목적" value={data.purpose || ""} />
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 승인정보(취소 포함) */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-lg">✓</span>
                  <h3 className="text-lg font-bold text-slate-900">승인정보</h3>
                </div>
                <div className="overflow-x-auto border-t-2 border-slate-900">
                  <table className="w-full text-sm">
                    <tbody>
                      {data.status === "취소" ? (
                        <tr className="border-b border-slate-200">
                          <th className="w-48 bg-slate-50 px-4 py-4 text-left font-semibold">예약상태</th>
                          <td className="px-4 py-4">
                            <span className="text-red-600">
                              ※ 예약이 {(data.decidedBy || "").includes("사용자") ? "사용자취소" : "취소"} 되었습니다.
                            </span>
                          </td>
                        </tr>
                      ) : (
                        <tr className="border-b border-slate-200">
                          <th className="w-48 bg-slate-50 px-4 py-4 text-left font-semibold">예약취소</th>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                className={cn(
                                  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm",
                                  "focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.3)]",
                                )}
                                defaultValue="위의 예약을 취소합니다."
                                readOnly
                              />
                              <Button
                                type="button"
                                onClick={onCancel}
                                disabled={!data.cancelable || cancelLoading}
                                className="whitespace-nowrap"
                              >
                                {cancelLoading ? "처리 중" : "예약취소"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 금액 상세 */}
              <section className="space-y-2">
                <div className="text-base font-semibold text-slate-900">금액 상세</div>
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-2">
                  <div>
                    <span className="text-slate-600">대관료</span>: <b>{formatKRW(data.rentalFeeKRW ?? 0)}</b>
                    {data.feeBasis === "approved" && <div className="mt-1 text-xs text-slate-500">* 승인된 회차 기준 금액</div>}
                  </div>
                  <div>
                    <span className="text-slate-600">장비 사용료</span>: <b>{(data.equipmentFeeKRW ?? 0) > 0 ? formatKRW(data.equipmentFeeKRW) : "-"}</b>
                  </div>
                  <div>
                    <span className="text-slate-600">총액</span>: <b>{formatKRW(data.totalFeeKRW)}</b>
                  </div>
                  <div>
                    <span className="text-slate-600">할인</span>: <b>{data.discountAmountKRW > 0 ? `${data.discountRatePct.toFixed(2)}% (${formatKRW(data.discountAmountKRW)})` : "-"}</b>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-slate-600">할인 사유</span>: <b>{data.discountReason || "-"}</b>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-slate-600">최종금액</span>: <b className="text-base">{formatKRW(data.finalFeeKRW)}</b>
                    {isBatch && <div className="mt-1 text-xs text-slate-500">* 묶음 신청은 총액 기준으로 할인 적용됩니다.</div>}
                  </div>
                </div>
              </section>

              {/* 묶음 회차 목록 */}
              {isBatch && sessions.length > 1 && (
                <section>
                  <div className="mb-2 text-base font-semibold text-slate-900">회차 목록</div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="p-3">회차</th>
                          <th className="p-3">{isGallery ? "전시일" : "일시"}</th>
                          <th className="p-3">상태</th>
                          <th className="p-3">반려 사유</th>
                          <th className="p-3">신청번호</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((s) => (
                          <tr key={s.requestId} className="border-t">
                            <td className="p-3">{s.seq || "-"}</td>
                            <td className="p-3">
                              {isGallery ? `${s.date} (일 단위)` : `${s.date} ${s.startTime}-${s.endTime}`}
                            </td>
                            <td className="p-3">{s.status}</td>
                            <td className="p-3">{s.status === "반려" ? (s.rejectReason || "-") : "-"}</td>
                            <td className="p-3">{s.requestId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

function badgeVariant(text: string): "success" | "warning" | "danger" | "neutral" {
  const t = (text || "").trim();
  if (t.includes("반려")) return "danger";
  if (t.includes("취소") || t.includes("부분")) return "warning";
  if (t.includes("미결제")) return "success";
  if (t.includes("승인") || t.includes("신청")) return "success";
  return "neutral";
}

function OutlinedBadge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "success" | "warning" | "danger" | "neutral";
}) {
  const cls =
    variant === "success"
      ? "border-emerald-500 text-emerald-700"
      : variant === "warning"
        ? "border-orange-500 text-orange-700"
        : variant === "danger"
          ? "border-red-500 text-red-700"
          : "border-slate-400 text-slate-700";

  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold", cls)}>{children}</span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200">
      <th className="w-48 bg-slate-50 px-4 py-4 text-left font-semibold">{label}</th>
      <td className="px-4 py-4 text-slate-900">{value || ""}</td>
    </tr>
  );
}
