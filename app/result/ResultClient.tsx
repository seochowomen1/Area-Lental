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
import {
  adoptTokenFromUrl,
  clearApplicantAccess,
  purgeLegacyApplicantToken,
  readApplicantAccess,
} from "@/lib/applicantAccess";

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

      // 결제 안내 (03_api §8-3 · 미결제·기한 전일 때만 링크)
      paymentStatus?: string;
      paymentLinkUrl?: string;
      paymentDueDate?: string;
      paymentDueDateText?: string;
      paidAt?: string;
      refundedAt?: string;
      autoCancelled?: boolean;

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

      // 장비 정보
      equipmentDetails?: { key: string; label: string; feeKRW: number }[];

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

      // 갤러리 전시 기간 정보
      startDate?: string;
      endDate?: string;
      galleryExhibitionDayCount?: number;
      galleryWeekdayCount?: number;
      gallerySaturdayCount?: number;
      galleryPrepDate?: string;
    }
  | { ok: false; message: string };

const FALLBACK_ERROR = "조회 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
const LINK_EXPIRED_TEXT = "조회 링크 유효 시간이 지났습니다. 신청번호와 이메일을 넣고 [조회 링크 받기]를 다시 눌러 주세요.";
const LINK_SCOPE_TEXT = "이 링크로는 해당 신청을 볼 수 없습니다. 신청번호와 이메일을 넣고 [조회 링크 받기]를 눌러 주세요.";

/** 조회·취소 API 실패 → 화면 문구 (01_spec ③-C) */
class ResultFetchError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function messageForError(err: unknown, fallback: string): { text: string; needLink: boolean; clearAccess: boolean } {
  if (err instanceof ResultFetchError) {
    if (err.code === "TOKEN_EXPIRED" || err.code === "TOKEN_INVALID") return { text: LINK_EXPIRED_TEXT, needLink: true, clearAccess: true };
    if (err.code === "TOKEN_SCOPE") return { text: LINK_SCOPE_TEXT, needLink: true, clearAccess: false };
    if (err.code === "LINK_REQUIRED") return { text: err.message || fallback, needLink: true, clearAccess: false };
    return { text: err.message || fallback, needLink: false, clearAccess: false };
  }
  return { text: fallback, needLink: false, clearAccess: false };
}

export default function ResultClient() {
  const sp = useSearchParams();
  const prefillRequestId = sp.get("requestId") ?? "";

  const [requestId, setRequestId] = useState(prefillRequestId);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ResultPayload | null>(null);

  // ★ [1][10] 조회 권한(토큰)은 sessionStorage에서만 읽는다. 메일 링크의 ?token= 은 옮긴 뒤 주소에서 뺀다.
  const [token, setToken] = useState("");
  const [accessChecked, setAccessChecked] = useState(false);
  /** 토큰이 있어도 이 신청에는 쓸 수 없을 때(만료·범위 밖) 링크 받기 폼을 보인다 */
  const [needLink, setNeedLink] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);

  // 조회 링크 받기
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const didAutoFetch = useRef(false);

  useEffect(() => {
    purgeLegacyApplicantToken();
    adoptTokenFromUrl();
    const access = readApplicantAccess();
    setToken(access?.token ?? "");
    setAccessChecked(true);
  }, []);

  const showLinkForm = accessChecked && (!token || needLink);

  const canSend = useMemo(() => {
    return requestId.trim().length > 2 && email.trim().includes("@");
  }, [requestId, email]);

  async function fetchResult(reqId: string, tk: string) {
    const res = await fetch("/api/public/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: reqId, token: tk }),
    });
    const json = (await res.json().catch(() => null)) as (ResultPayload & { code?: string }) | null;
    if (!res.ok || !json || !json.ok) {
      const msg = json && !json.ok ? json.message : "";
      throw new ResultFetchError(msg, String(json?.code ?? ""), res.status);
    }
    return json;
  }

  function applyError(err: unknown, fallback: string) {
    const m = messageForError(err, fallback);
    setError(m.text);
    if (m.needLink) setNeedLink(true);
    if (m.clearAccess) {
      clearApplicantAccess();
      setToken("");
    }
  }

  // 토큰 + 신청번호가 있으면 1회 자동 조회
  useEffect(() => {
    if (!accessChecked) return;
    if (didAutoFetch.current) return;
    if (!prefillRequestId || !token) return;
    didAutoFetch.current = true;
    (async () => {
      setError(null);
      setLoading(true);
      setData(null);
      try {
        const json = await fetchResult(prefillRequestId, token);
        setData(json);
      } catch (err: unknown) {
        applyError(err, FALLBACK_ERROR);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessChecked, prefillRequestId, token]);

  async function onSendLink(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setError(null);
    setSentTo(null);
    setSending(true);
    try {
      const res = await fetch("/api/public/my/send-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), requestId: requestId.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(String(json?.message ?? FALLBACK_ERROR));
        return;
      }
      setSentTo(email.trim());
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setSending(false);
    }
  }

  function clearDeviceRecord() {
    clearApplicantAccess();
    setToken("");
    setData(null);
    setError(null);
    setNeedLink(false);
    setClearedNotice(true);
  }

  const [cancelLoading, setCancelLoading] = useState(false);

  // PC(≥900) = 표에 "결제" 열 · 휴대폰 = 표 아래 "결제" 박스 (02_ui §4)
  const [isPc, setIsPc] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setIsPc(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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
        body: JSON.stringify({ requestId: data.requestId, token }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new ResultFetchError(String(json?.message ?? "취소에 실패했습니다."), String(json?.code ?? ""), res.status);
      }
      // 취소 후 최신 상태 재조회
      const refreshed = await fetchResult(data.requestId, token);
      setData(refreshed);
    } catch (err: unknown) {
      applyError(err, "취소 중 오류가 발생했습니다.");
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

    // 갤러리: startDate ~ endDate (N일)
    if (isGallery) {
      const sd = data.startDate || data.date;
      const ed = data.endDate || data.date;
      const days = data.galleryExhibitionDayCount ?? (sessions.length || 1);
      return sd === ed ? `${sd} (${days}일)` : `${sd} ~ ${ed} (${days}일)`;
    }

    if (!isBatch) return `${data.date} ${data.startTime}-${data.endTime}`;

    const list = sessions.length
      ? sessions
      : [{ requestId: data.requestId, seq: 1, date: data.date, startTime: data.startTime, endTime: data.endTime, status: data.status, rejectReason: data.rejectReason }];

    const first = list[0];
    const last = list[list.length - 1];

    if (list.length === 1) {
      return `${first.date} ${first.startTime}-${first.endTime} (총 1회)`;
    }

    const range = first.date === last.date ? first.date : `${first.date} ~ ${last.date}`;
    return `${range} (총 ${list.length}회)`;
  }, [data, isBatch, sessions, isGallery]);

  return (
    <div>
      <SiteHeader title="신청 결과 조회" backHref="/" backLabel="홈으로" />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <Card pad="lg" className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">신청 결과 조회</h2>
              {showLinkForm ? (
                <p className="mt-2 text-sm text-slate-700">
                  신청번호와 신청할 때 입력한 이메일을 넣으면 이 신청의 조회 링크를 메일로 보내 드립니다.
                </p>
              ) : null}
            </div>
            {token ? (
              <button
                type="button"
                onClick={clearDeviceRecord}
                className="shrink-0 self-end text-sm font-semibold text-brand underline-offset-2 hover:underline sm:self-start"
              >
                이 기기에서 조회 기록 지우기
              </button>
            ) : null}
          </div>

          {clearedNotice ? <Notice variant="success">이 기기에 저장된 조회 기록을 지웠습니다.</Notice> : null}

          {!accessChecked ? <div className="text-sm text-slate-600" role="status">확인 중...</div> : null}

          {accessChecked && token && !needLink ? (
            <Notice variant="success">메일 링크로 확인된 조회 화면입니다.</Notice>
          ) : null}

          {showLinkForm ? (
            <form onSubmit={onSendLink} className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-5">
                <FieldLabel htmlFor="requestId">신청번호</FieldLabel>
                <Input id="requestId" value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="예: REQ-20261026-XXXXXXXX" />
              </div>
              <div className="md:col-span-4">
                <FieldLabel htmlFor="email">이메일</FieldLabel>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="신청서에 입력한 이메일" autoComplete="email" />
              </div>
              <div className="flex items-end md:col-span-3">
                <Button type="submit" disabled={!canSend || sending} className="w-full">
                  {sending ? "보내는 중…" : "조회 링크 받기"}
                </Button>
              </div>
            </form>
          ) : null}

          {sentTo ? (
            <Notice variant="info">신청번호와 이메일이 맞으면 {sentTo}로 조회 링크를 보냈습니다. 메일 속 링크를 눌러 주세요.</Notice>
          ) : null}

          {loading ? <div className="text-sm text-slate-600" role="status">조회 중...</div> : null}

          {error && <Notice variant={needLink ? "warn" : "danger"}>{error}</Notice>}

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
                        {isPc && <th className="px-3 py-4">결제</th>}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-center">
                        <td className="px-3 py-5">
                          <div className="flex items-center gap-3">
                            <div className="h-14 w-20 flex-none rounded border border-slate-200 bg-slate-100" aria-hidden="true" />
                            <div className="text-left">
                              <div className="font-semibold text-slate-900">{data.spaceCategoryText || "-"}</div>
                              {isGallery && (data.galleryExhibitionDayCount ?? 0) > 0 && (
                                <div className="mt-1 text-xs text-slate-600">
                                  전시 {data.galleryExhibitionDayCount}일
                                </div>
                              )}
                              {!isGallery && isBatch && (
                                <div className="mt-1 text-xs text-slate-600">
                                  묶음 {sessions.length || data.batchSize || 1}회
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-5 text-left">
                          <div className="font-semibold text-slate-900">{data.roomName}</div>
                        </td>
                        <td className="px-3 py-5">
                          <div className="font-semibold text-slate-900">{dateLabel}</div>
                          {isGallery && (data.galleryWeekdayCount ?? 0) + (data.gallerySaturdayCount ?? 0) > 0 && (
                            <div className="mt-1 text-xs text-slate-600">
                              평일 {data.galleryWeekdayCount ?? 0}일 · 토 {data.gallerySaturdayCount ?? 0}일
                              {data.galleryPrepDate ? ` · 준비일 1일` : ""}
                            </div>
                          )}
                          {!isGallery && !isBatch && (
                            <div className="mt-1 text-slate-700">
                              {data.startTime} ~ {data.endTime}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-5">
                          <OutlinedBadge variant={badgeVariant(data.approvalStatusText)}>{data.approvalStatusText}</OutlinedBadge>
                        </td>
                        <td className="px-3 py-5">
                          <OutlinedBadge variant={badgeVariant(data.reservationStatusText)}>{data.reservationStatusText}</OutlinedBadge>
                        </td>
                        {isPc && (
                          <td className="min-w-[220px] px-3 py-5">
                            <PaymentCell data={data} />
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {!isPc && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">결제</span>
                      <OutlinedBadge variant={paymentBadgeVariant(data.paymentStatusText)}>{data.paymentStatusText || "-"}</OutlinedBadge>
                    </div>
                    <PaymentCell data={data} mobile />
                  </div>
                )}

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
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs">⏰</span>
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
                              ※ 예약이 {(data.decidedBy || "").includes("사용자") ? "사용자에 의해 취소" : "취소"} 되었습니다.
                            </span>
                          </td>
                        </tr>
                      ) : data.status === "반려" ? (
                        <tr className="border-b border-slate-200">
                          <th className="w-48 bg-slate-50 px-4 py-4 text-left font-semibold">예약상태</th>
                          <td className="px-4 py-4">
                            <span className="text-red-600">
                              ※ 신청이 반려 되었습니다.
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
                                  "focus:outline-none focus:ring-2 focus:ring-brand/[0.3]",
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
                            {!data.cancelable && data.status === "승인" && (
                              <p className="mt-2 text-xs text-slate-500">
                                승인된 예약은 환불 규정에 따라 처리되므로 온라인으로 취소할 수 없습니다. 센터(070-7163-2953)로 연락해 주세요.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 장비 사용 */}
              {data.equipmentDetails && data.equipmentDetails.length > 0 && (
                <section>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs">🎬</span>
                    <h3 className="text-lg font-bold text-slate-900">{isGallery ? "장비" : data.roomId === "media" ? "촬영장비" : "기자재"}</h3>
                  </div>
                  <div className="overflow-x-auto border-t-2 border-slate-900">
                    <table className="w-full text-sm">
                      <tbody>
                        {data.equipmentDetails.map((eq) => (
                          <tr key={eq.key} className="border-b border-slate-200">
                            <th className="w-48 bg-slate-50 px-4 py-3 text-left font-semibold">{eq.label}</th>
                            <td className="px-4 py-3 text-slate-900 tabular-nums">{formatKRW(eq.feeKRW)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* 금액 상세 */}
              <section className="space-y-2">
                <div className="text-base font-semibold text-slate-900">금액 상세</div>
                <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-2">
                  <div>
                    <span className="text-slate-600">{isGallery ? "이용료" : "대관료"}</span>: <b>{formatKRW(data.rentalFeeKRW ?? 0)}</b>
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

              {/* 묶음 회차 목록 (갤러리 1행 형식에서는 표시 안함) */}
              {isBatch && !isGallery && sessions.length > 1 && (
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
  if (t.includes("결제")) return "neutral";
  if (t.includes("승인") || t.includes("신청")) return "success";
  return "neutral";
}

/** 결제 열 배지 색 (01_spec ③-(마)) — 기존 badgeVariant의 "결제→neutral" 분기보다 먼저 판정 */
function paymentBadgeVariant(text: string): "success" | "warning" | "danger" | "neutral" {
  const t = (text || "").trim();
  if (t === "결제 완료") return "success";
  if (t === "결제 대기") return "warning";
  if (t.includes("기한 지남") || t.includes("자동 취소")) return "danger";
  return "neutral";
}

type PaymentCellData = {
  paymentStatusText: string;
  paymentLinkUrl?: string;
  paymentDueDate?: string;
  paymentDueDateText?: string;
  paidAt?: string;
  refundedAt?: string;
  autoCancelled?: boolean;
};

/** 결제 열(PC) / 결제 박스(휴대폰) 내용 — 문구 01_spec ③-(마) 표 원문 */
function PaymentCell({ data, mobile = false }: { data: PaymentCellData; mobile?: boolean }) {
  const t = (data.paymentStatusText || "-").trim();
  const noteCls = cn("text-xs leading-5 text-slate-600", mobile ? "mt-2" : "mt-2 text-left");
  const btnCls = cn("inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95", mobile && "mt-3 w-full min-h-[44px]");

  let note: string | null = null;
  if (t === "결제 안내 예정") note = "승인 메일로 결제 방법을 안내드립니다.";
  else if (t === "결제 대기") note = `결제 기한 ${data.paymentDueDateText || data.paymentDueDate || ""}까지 · 기한까지 결제가 확인되지 않으면 신청이 자동 취소됩니다.`;
  else if (t === "결제 기한 지남") note = "결제 기한이 지났습니다. 신청이 곧 자동 취소됩니다. 이용을 원하시면 센터로 문의해 주세요.";
  else if (t === "기한 경과 자동 취소") note = `결제 기한(${data.paymentDueDate || ""}) 경과로 자동 취소되었습니다. 다시 이용하시려면 새로 신청해 주세요.`;
  else if (t === "결제 완료") note = data.paidAt ? `${data.paidAt} 결제` : null;
  else if (t === "환불 완료") note = data.refundedAt ? `${data.refundedAt} 환불` : null;

  const showButton = t === "결제 대기" && !!data.paymentLinkUrl;

  return (
    <div>
      {!mobile && <OutlinedBadge variant={paymentBadgeVariant(t)}>{t}</OutlinedBadge>}
      {showButton && !mobile && (
        <div className="mt-2.5">
          <a href={data.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className={btnCls}>홈페이지에서 결제하기</a>
        </div>
      )}
      {note && <p className={noteCls}>{note}</p>}
      {showButton && mobile && (
        <a href={data.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className={btnCls}>홈페이지에서 결제하기</a>
      )}
    </div>
  );
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
