"use client";

import { adminFetch, isAuthBusyError } from "@/lib/adminFetch";
import KeepText from "@/components/ui/KeepText";
import { AUTH_STORE_BUSY_MESSAGE } from "@/lib/adminConstants";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { PAYMENT_LABELS } from "@/lib/labels";

type CategoryStats = {
  uniqueApplicants: number;
  totalDays: number;
  totalRevenue: number;
  /** 결제 확인 금액 (결제완료 금액 − 환불 금액) · 03_api §8-4 */
  collectedKRW?: number;
  /** 결제 미확인 묶음 수 */
  unconfirmedCount?: number;
};

type MonthStats = {
  month: string;
  lecture: CategoryStats;
  studio: CategoryStats;
  lectureStudio: CategoryStats;
  gallery: CategoryStats;
};

type ApiResp = {
  ok: boolean;
  year: string;
  months: MonthStats[];
  message?: string;
};

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

/** 결제 확인 금액을 병기하기 시작하는 이용월 (01_spec ⑧-A-7 · 2026-11 이용분부터) */
const COLLECTED_SINCE_MONTH = "2026-11";
/** 이 연도부터 결제 확인 금액이 기본(위 줄)·수입은 참고(아래 줄) — 상수 1개로 전환 (02_ui §5) */
const COLLECTED_PRIMARY_FROM_YEAR = 2027;

function formatRevenue(v: number): string {
  if (v === 0) return "-";
  return `${v.toLocaleString("ko-KR")}원`;
}

function formatCount(v: number): string {
  return v === 0 ? "-" : String(v);
}

function sumCat(a: CategoryStats, b: CategoryStats): CategoryStats {
  return {
    uniqueApplicants: a.uniqueApplicants + b.uniqueApplicants,
    totalDays: a.totalDays + b.totalDays,
    totalRevenue: a.totalRevenue + b.totalRevenue,
    collectedKRW: (a.collectedKRW ?? 0) + (b.collectedKRW ?? 0),
    unconfirmedCount: (a.unconfirmedCount ?? 0) + (b.unconfirmedCount ?? 0),
  };
}

/**
 * "수입" 셀 2줄 — 1줄 수입(승인 금액 합계) · 2줄 `결제 확인 ○원 · 미확인 N건` (02_ui §5 · 용어 03_api §11)
 * showCollected=false(2026-10 이전 이용월)면 1줄만.
 */
function RevenueCell({ c, showCollected, collectedPrimary }: { c: CategoryStats; showCollected: boolean; collectedPrimary: boolean }) {
  const collected = c.collectedKRW ?? 0;
  const unconfirmed = c.unconfirmedCount ?? 0;
  const hasAny = c.totalRevenue > 0 || collected > 0 || unconfirmed > 0;
  const revenueText = formatRevenue(c.totalRevenue);
  if (!showCollected || !hasAny) return <>{revenueText}</>;

  const collectedLine = (
    <>
      <span className="text-emerald-700">{PAYMENT_LABELS.collectedShort} {collected.toLocaleString("ko-KR")}</span>
      {unconfirmed > 0 && <span className="text-amber-700"> · 미확인 {unconfirmed}건</span>}
    </>
  );

  if (collectedPrimary) {
    return (
      <>
        <span className="block">{collectedLine}</span>
        <span className="mt-0.5 block text-xs leading-4 text-slate-500">{PAYMENT_LABELS.revenue} {revenueText}</span>
      </>
    );
  }
  return (
    <>
      <span className="block">{revenueText}</span>
      <span className="mt-0.5 block text-xs leading-4">{collectedLine}</span>
    </>
  );
}

export default function StatsClient() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [revFrom, setRevFrom] = useState("");
  const [revTo, setRevTo] = useState("");
  const [revBasis, setRevBasis] = useState<"usage" | "paid">("usage");
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyNotice, setBusyNotice] = useState(false);

  useEffect(() => {
    setLoading(true);
    // adminFetch: 401 → 로그인 · 503 AUTH_STORE_BUSY → G-1 문구(로그인 유지)
    adminFetch(`/api/admin/stats?year=${year}`)
      .then((r) => r.json())
      .then((j: ApiResp) => { setBusyNotice(false); setData(j); })
      .catch((e) => {
        console.error("통계 조회 실패:", e);
        setBusyNotice(isAuthBusyError(e));
        setData({ ok: false, year: String(year), months: [], message: isAuthBusyError(e) ? AUTH_STORE_BUSY_MESSAGE : "조회 실패" });
      })
      .finally(() => setLoading(false));
  }, [year]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const collectedPrimary = year >= COLLECTED_PRIMARY_FROM_YEAR;
  const revenueHeader = collectedPrimary
    ? `${PAYMENT_LABELS.collectedShort} / ${PAYMENT_LABELS.revenue}`
    : `${PAYMENT_LABELS.revenue} / ${PAYMENT_LABELS.collectedShort}`;

  // 연간 합계 (데이터 변경 시에만 재계산)
  const yearTotal = useMemo(() => {
    if (!data?.months) return undefined;
    const emptyC: CategoryStats = { uniqueApplicants: 0, totalDays: 0, totalRevenue: 0, collectedKRW: 0, unconfirmedCount: 0 };
    return data.months.reduce(
      (acc, m) => ({
        lecture: sumCat(acc.lecture, m.lecture),
        studio: sumCat(acc.studio, m.studio),
        lectureStudio: sumCat(acc.lectureStudio, m.lectureStudio),
        gallery: sumCat(acc.gallery, m.gallery),
      }),
      { lecture: { ...emptyC }, studio: { ...emptyC }, lectureStudio: { ...emptyC }, gallery: { ...emptyC } }
    );
  }, [data?.months]);

  const revFromValue = revFrom || `${year}-01-01`;
  const revToValue = revTo || `${year}-12-31`;
  const revenueHref = (mask: boolean) =>
    `/api/admin/export/revenue?from=${revFromValue}&to=${revToValue}&basis=${revBasis}${mask ? "&mask=true" : ""}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900">통합 실적 관리</h1>

        <div className="flex items-center gap-2">
          <label htmlFor="year-select" className="text-sm font-medium text-slate-600">연도:</label>
          <select
            id="year-select"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/[0.15]"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
      </div>

      {/* 수입 내역 엑셀 (행정사무감사 자료 양식) */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">수입 내역 엑셀 (감사 자료 양식)</p>
            <p className="mt-0.5 text-xs text-slate-500">
              승인 건 기준 · 연도·대관일자·대관처·장소·{PAYMENT_LABELS.approvedFee}·결제 상태·결제일·{PAYMENT_LABELS.collected} · 대관과 전시(갤러리) 시트 분리 · 월별 합계 포함
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600">
              기간 기준
              <select
                value={revBasis}
                onChange={(e) => setRevBasis(e.target.value === "paid" ? "paid" : "usage")}
                className="ml-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                aria-label="수입 엑셀 기간 기준"
              >
                <option value="usage">이용일 기준(기본)</option>
                <option value="paid">결제일 기준</option>
              </select>
            </label>
            <label className="text-xs text-slate-600">
              시작
              <input
                type="date"
                value={revFromValue}
                onChange={(e) => setRevFrom(e.target.value)}
                className="ml-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              종료
              <input
                type="date"
                value={revToValue}
                onChange={(e) => setRevTo(e.target.value)}
                className="ml-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <a
              href={revenueHref(false)}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              엑셀 받기
            </a>
            <a
              href={revenueHref(true)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              대관처 가림본
            </a>
          </div>
        </div>
        {revBasis === "paid" && (
          <p className="mt-2 text-xs text-amber-700">결제일 기준: 기간 안에 결제일이 있는 건만 들어갑니다. 결제 기록이 없는 승인 건은 제외됩니다.</p>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">조회 중...</div>
      ) : data && !data.ok ? (
        <div role="alert" className={busyNotice ? "my-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" : "py-12 text-center text-sm text-red-700"}>{data.message}</div>
      ) : data ? (
        <div className="space-y-6">
          {/* 월별 상세 테이블 */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th rowSpan={2} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-700 border-r border-slate-200">월</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-blue-700 border-r border-slate-200 bg-blue-50/50">강의실</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-ink border-r border-slate-200 bg-slate-50">E-스튜디오</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-ink border-r border-slate-200 bg-slate-50">강의실+E-스튜디오</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-ink bg-slate-50">우리동네 갤러리</th>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  {/* 강의실 */}
                  <th className="px-3 py-2 text-center border-l border-slate-200">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center border-r border-slate-200">{revenueHeader}</th>
                  {/* E-스튜디오 */}
                  <th className="px-3 py-2 text-center">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center border-r border-slate-200">{revenueHeader}</th>
                  {/* 강의실+E-스튜디오 합산 */}
                  <th className="px-3 py-2 text-center">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center border-r border-slate-200">{revenueHeader}</th>
                  {/* 갤러리 */}
                  <th className="px-3 py-2 text-center">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center">{revenueHeader}</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m, idx) => {
                  const hasData = m.lecture.uniqueApplicants > 0 || m.lecture.totalDays > 0 || m.lecture.totalRevenue > 0
                    || m.studio.uniqueApplicants > 0 || m.studio.totalDays > 0 || m.studio.totalRevenue > 0
                    || m.gallery.uniqueApplicants > 0 || m.gallery.totalDays > 0 || m.gallery.totalRevenue > 0;
                  const showCollected = m.month >= COLLECTED_SINCE_MONTH;
                  return (
                    <tr
                      key={m.month}
                      className={cn(
                        "border-b border-slate-100 transition hover:bg-slate-50",
                        !hasData && "text-slate-500"
                      )}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 border-r border-slate-200">{MONTH_LABELS[idx]}</td>
                      {/* 강의실 */}
                      <td className="px-3 py-3 text-center border-l border-slate-100">{formatCount(m.lecture.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center">{formatCount(m.lecture.totalDays)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right border-r border-slate-200 tabular-nums"><RevenueCell c={m.lecture} showCollected={showCollected} collectedPrimary={collectedPrimary} /></td>
                      {/* E-스튜디오 */}
                      <td className="px-3 py-3 text-center">{formatCount(m.studio.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center">{formatCount(m.studio.totalDays)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right border-r border-slate-200 tabular-nums"><RevenueCell c={m.studio} showCollected={showCollected} collectedPrimary={collectedPrimary} /></td>
                      {/* 강의실+E-스튜디오 합산 */}
                      <td className="px-3 py-3 text-center bg-slate-50 font-medium">{formatCount(m.lectureStudio.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center bg-slate-50 font-medium">{formatCount(m.lectureStudio.totalDays)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right border-r border-slate-200 tabular-nums bg-slate-50 font-medium"><RevenueCell c={m.lectureStudio} showCollected={showCollected} collectedPrimary={collectedPrimary} /></td>
                      {/* 갤러리 */}
                      <td className="px-3 py-3 text-center">{formatCount(m.gallery.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center">{formatCount(m.gallery.totalDays)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums"><RevenueCell c={m.gallery} showCollected={showCollected} collectedPrimary={collectedPrimary} /></td>
                    </tr>
                  );
                })}

                {/* 연간 합계 */}
                {yearTotal && (
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800">
                    <td className="px-4 py-3 border-r border-slate-200">연간 합계</td>
                    <td className="px-3 py-3 text-center border-l border-slate-100">{formatCount(yearTotal.lecture.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.lecture.totalDays)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right border-r border-slate-200 tabular-nums"><RevenueCell c={yearTotal.lecture} showCollected collectedPrimary={collectedPrimary} /></td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.studio.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.studio.totalDays)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right border-r border-slate-200 tabular-nums"><RevenueCell c={yearTotal.studio} showCollected collectedPrimary={collectedPrimary} /></td>
                    <td className="px-3 py-3 text-center bg-slate-50">{formatCount(yearTotal.lectureStudio.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center bg-slate-50">{formatCount(yearTotal.lectureStudio.totalDays)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right border-r border-slate-200 tabular-nums bg-slate-50"><RevenueCell c={yearTotal.lectureStudio} showCollected collectedPrimary={collectedPrimary} /></td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.gallery.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.gallery.totalDays)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums"><RevenueCell c={yearTotal.gallery} showCollected collectedPrimary={collectedPrimary} /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500 space-y-1">
            <KeepText>
            <p><span className="font-semibold text-slate-700">실인원</span>: 해당 월 승인 완료된 개별 신청자 수 (이메일 기준 중복 제거)</p>
            <p><span className="font-semibold text-slate-700">연인원</span>: 해당 월 총 대관(전시) 일수 (회차 수)</p>
            <p><span className="font-semibold text-slate-700">{PAYMENT_LABELS.revenue}</span>: 해당 월 총 대관료(갤러리는 이용료) (승인 건 기준, 할인 적용 후)</p>
            <p><span className="font-semibold text-slate-700">{PAYMENT_LABELS.collected}</span>: 결제완료 건의 결제 금액 − 환불 금액 · 결제 미확인 건은 공란 · 2026년 11월 이용분부터 표시</p>
            <p><span className="font-semibold text-ink">강의실+E-스튜디오</span>: 강의실과 E-스튜디오의 합산 실적 (실인원은 이메일 기준 중복 제거)</p>
            </KeepText>
          </div>
        </div>
      ) : null}
    </div>
  );
}
