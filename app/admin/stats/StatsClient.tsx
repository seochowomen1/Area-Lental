"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type CategoryStats = {
  uniqueApplicants: number;
  totalDays: number;
  totalRevenue: number;
};

type MonthStats = {
  month: string;
  lecture: CategoryStats;
  studio: CategoryStats;
  lectureStudio: CategoryStats;
  gallery: CategoryStats;
  total: CategoryStats;
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

function formatRevenue(v: number): string {
  if (v === 0) return "-";
  return `${v.toLocaleString("ko-KR")}원`;
}

function formatCount(v: number): string {
  return v === 0 ? "-" : String(v);
}

export default function StatsClient() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/stats?year=${year}`)
      .then((r) => r.json())
      .then((j: ApiResp) => setData(j))
      .catch(() => setData({ ok: false, year: String(year), months: [], message: "조회 실패" }))
      .finally(() => setLoading(false));
  }, [year]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // 연간 합계
  const emptyC = { uniqueApplicants: 0, totalDays: 0, totalRevenue: 0 };
  const yearTotal = data?.months?.reduce(
    (acc, m) => ({
      lecture: { uniqueApplicants: acc.lecture.uniqueApplicants + m.lecture.uniqueApplicants, totalDays: acc.lecture.totalDays + m.lecture.totalDays, totalRevenue: acc.lecture.totalRevenue + m.lecture.totalRevenue },
      studio: { uniqueApplicants: acc.studio.uniqueApplicants + m.studio.uniqueApplicants, totalDays: acc.studio.totalDays + m.studio.totalDays, totalRevenue: acc.studio.totalRevenue + m.studio.totalRevenue },
      lectureStudio: { uniqueApplicants: acc.lectureStudio.uniqueApplicants + m.lectureStudio.uniqueApplicants, totalDays: acc.lectureStudio.totalDays + m.lectureStudio.totalDays, totalRevenue: acc.lectureStudio.totalRevenue + m.lectureStudio.totalRevenue },
      gallery: { uniqueApplicants: acc.gallery.uniqueApplicants + m.gallery.uniqueApplicants, totalDays: acc.gallery.totalDays + m.gallery.totalDays, totalRevenue: acc.gallery.totalRevenue + m.gallery.totalRevenue },
      total: { uniqueApplicants: acc.total.uniqueApplicants + m.total.uniqueApplicants, totalDays: acc.total.totalDays + m.total.totalDays, totalRevenue: acc.total.totalRevenue + m.total.totalRevenue },
    }),
    { lecture: { ...emptyC }, studio: { ...emptyC }, lectureStudio: { ...emptyC }, gallery: { ...emptyC }, total: { ...emptyC } }
  );

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
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[rgb(var(--brand-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-primary)/0.15)]"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">조회 중...</div>
      ) : data && !data.ok ? (
        <div className="py-12 text-center text-sm text-red-500">{data.message}</div>
      ) : data ? (
        <div className="space-y-6">
          {/* 월별 상세 테이블 */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th rowSpan={2} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-700 border-r border-slate-200">월</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-blue-700 border-r border-slate-200 bg-blue-50/50">강의실</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-violet-700 border-r border-slate-200 bg-violet-50/50">E-스튜디오</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-indigo-700 border-r border-slate-200 bg-indigo-50/50">강의실+E-스튜디오</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-emerald-700 border-r border-slate-200 bg-emerald-50/50">우리동네 갤러리</th>
                  <th colSpan={3} className="px-4 py-2 text-center font-semibold text-slate-700 bg-slate-100/50">합계</th>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  {/* 강의실 */}
                  <th className="px-3 py-2 text-center border-l border-slate-200">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="px-3 py-2 text-center border-r border-slate-200">수입</th>
                  {/* E-스튜디오 */}
                  <th className="px-3 py-2 text-center">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="px-3 py-2 text-center border-r border-slate-200">수입</th>
                  {/* 강의실+E-스튜디오 합산 */}
                  <th className="px-3 py-2 text-center">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="px-3 py-2 text-center border-r border-slate-200">수입</th>
                  {/* 갤러리 */}
                  <th className="px-3 py-2 text-center">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="px-3 py-2 text-center border-r border-slate-200">수입</th>
                  {/* 합계 */}
                  <th className="px-3 py-2 text-center">실인원</th>
                  <th className="px-3 py-2 text-center">연인원</th>
                  <th className="px-3 py-2 text-center">수입</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m, idx) => {
                  const hasData = m.total.uniqueApplicants > 0 || m.total.totalDays > 0 || m.total.totalRevenue > 0;
                  return (
                    <tr
                      key={m.month}
                      className={cn(
                        "border-b border-slate-100 transition hover:bg-slate-50",
                        !hasData && "text-slate-400"
                      )}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 border-r border-slate-200">{MONTH_LABELS[idx]}</td>
                      {/* 강의실 */}
                      <td className="px-3 py-3 text-center border-l border-slate-100">{formatCount(m.lecture.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center">{formatCount(m.lecture.totalDays)}</td>
                      <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums">{formatRevenue(m.lecture.totalRevenue)}</td>
                      {/* E-스튜디오 */}
                      <td className="px-3 py-3 text-center">{formatCount(m.studio.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center">{formatCount(m.studio.totalDays)}</td>
                      <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums">{formatRevenue(m.studio.totalRevenue)}</td>
                      {/* 강의실+E-스튜디오 합산 */}
                      <td className="px-3 py-3 text-center bg-indigo-50/30 font-medium">{formatCount(m.lectureStudio.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center bg-indigo-50/30 font-medium">{formatCount(m.lectureStudio.totalDays)}</td>
                      <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums bg-indigo-50/30 font-medium">{formatRevenue(m.lectureStudio.totalRevenue)}</td>
                      {/* 갤러리 */}
                      <td className="px-3 py-3 text-center">{formatCount(m.gallery.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center">{formatCount(m.gallery.totalDays)}</td>
                      <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums">{formatRevenue(m.gallery.totalRevenue)}</td>
                      {/* 합계 */}
                      <td className="px-3 py-3 text-center font-semibold">{formatCount(m.total.uniqueApplicants)}</td>
                      <td className="px-3 py-3 text-center font-semibold">{formatCount(m.total.totalDays)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatRevenue(m.total.totalRevenue)}</td>
                    </tr>
                  );
                })}

                {/* 연간 합계 */}
                {yearTotal && (
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800">
                    <td className="px-4 py-3 border-r border-slate-200">연간 합계</td>
                    <td className="px-3 py-3 text-center border-l border-slate-100">{formatCount(yearTotal.lecture.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.lecture.totalDays)}</td>
                    <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums">{formatRevenue(yearTotal.lecture.totalRevenue)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.studio.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.studio.totalDays)}</td>
                    <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums">{formatRevenue(yearTotal.studio.totalRevenue)}</td>
                    <td className="px-3 py-3 text-center bg-indigo-50/30">{formatCount(yearTotal.lectureStudio.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center bg-indigo-50/30">{formatCount(yearTotal.lectureStudio.totalDays)}</td>
                    <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums bg-indigo-50/30">{formatRevenue(yearTotal.lectureStudio.totalRevenue)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.gallery.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.gallery.totalDays)}</td>
                    <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums">{formatRevenue(yearTotal.gallery.totalRevenue)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.total.uniqueApplicants)}</td>
                    <td className="px-3 py-3 text-center">{formatCount(yearTotal.total.totalDays)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatRevenue(yearTotal.total.totalRevenue)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500 space-y-1">
            <p><span className="font-semibold text-slate-700">실인원</span>: 해당 월 승인 완료된 개별 신청자 수 (이메일 기준 중복 제거)</p>
            <p><span className="font-semibold text-slate-700">연인원</span>: 해당 월 총 대관 일수 (회차 수)</p>
            <p><span className="font-semibold text-slate-700">수입</span>: 해당 월 총 대관료 (승인 건 기준, 할인 적용 후)</p>
            <p><span className="font-semibold text-indigo-700">강의실+E-스튜디오</span>: 강의실과 E-스튜디오의 합산 실적 (실인원은 이메일 기준 중복 제거)</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
