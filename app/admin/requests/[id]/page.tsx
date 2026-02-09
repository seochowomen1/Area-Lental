import Link from "next/link";
import { redirect } from "next/navigation";

import AdminDiscountFields from "@/components/admin/AdminDiscountFields";
import BatchSessionSelector from "@/components/admin/BatchSessionSelector";
import StatusBadge from "@/components/admin/StatusBadge";

import { assertAdminAuth } from "@/lib/adminAuth";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { getDatabase } from "@/lib/database";
import { REQUEST_ID_LABEL, statusLabel } from "@/lib/labels";
import { computeBaseTotalKRW, computeFeesForBundle, computeFeesForRequest, formatKRW } from "@/lib/pricing";
import { dayOfWeek } from "@/lib/datetime";
import { getCategoryLabel, getRoom, normalizeRoomCategory, type RoomCategory } from "@/lib/space";
import type { RentalRequest, RequestStatus } from "@/lib/types";

function categoryAccent(cat: RoomCategory) {
  if (cat === "studio") return { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500", badge: "border-violet-200 bg-violet-50 text-violet-700" };
  if (cat === "gallery") return { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", badge: "border-blue-200 bg-blue-50 text-blue-700" };
}

import {
  decideSingleAction,
  saveBundleMetaAction,
  decideSelectedSessionsAction,
  sendCurrentStatusEmailAction,
} from "./actions";

export const runtime = "nodejs";

function sortSessions(list: RentalRequest[]) {
  return list
    .slice()
    .sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0) || `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

export default async function AdminRequestDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { category?: string };
}) {
  await assertAdminAuth();

  const db = getDatabase();
  let req: RentalRequest | null = null;
  try {
    req = await db.getRequestById(params.id);
  } catch (e) {
    // DB 에러 — 로깅 후 빈 결과로 처리
    console.error("[admin/requests/[id]] getRequestById error:", e);
  }

  if (!req) {
    const cat = normalizeRoomCategory(searchParams?.category);
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <div className="text-4xl text-amber-400">!</div>
          <h1 className="mt-3 text-lg font-bold text-gray-900">신청 정보를 찾을 수 없습니다</h1>
          <p className="mt-2 text-sm text-gray-600">
            신청번호 <b>{params.id}</b>에 해당하는 데이터가 없습니다.<br />
            Mock 모드에서는 서버 재시작 시 데이터가 초기화될 수 있습니다.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href={`/admin/requests?category=${encodeURIComponent(cat)}`}
              className="rounded-full bg-[rgb(var(--brand-primary))] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            >
              목록으로 돌아가기
            </Link>
            <Link
              href={`/admin/calendar?category=${encodeURIComponent(cat)}`}
              className="rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              캘린더 보기
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ✅ 상세 URL에 category가 없을 때, 해당 신청의 roomId 기반으로 category를 붙여줍니다.
  //    (관리자 탭/뒤로가기 흐름에서 카테고리 유지)
  const room = getRoom(req.roomId);
  const inferredCategory = normalizeRoomCategory(room?.category);


  const rawCategory = (searchParams?.category ?? "").trim();
  if (!rawCategory) {
    redirect(`/admin/requests/${encodeURIComponent(req.requestId)}?category=${encodeURIComponent(inferredCategory)}`);
  }

  const normalizedCategory = normalizeRoomCategory(rawCategory);

  const isGallery = req.roomId === "gallery" || normalizedCategory === "gallery";

  // 목록(카테고리) 복귀용: 쿼리 category를 우선 사용 (없으면 위에서 redirect됨)
  const backToListHref = `/admin/requests?category=${encodeURIComponent(normalizedCategory)}`;

  const batchList = req.batchId ? await db.getRequestsByBatchId(req.batchId) : [];
  const sessions = req.batchId ? sortSessions(batchList.length ? batchList : [req]) : [req];
  const isBatch = !!req.batchId;

  const galleryExhibitionSessions = isGallery ? sessions.filter((s) => !s.isPrepDay) : [];
  const galleryWeekdayCount = isGallery
    ? galleryExhibitionSessions.filter((s) => {
        const dow = dayOfWeek(s.date);
        return dow >= 1 && dow <= 5;
      }).length
    : 0;
  const gallerySaturdayCount = isGallery ? galleryExhibitionSessions.filter((s) => dayOfWeek(s.date) === 6).length : 0;
  const galleryExhibitionDayCount = isGallery ? galleryExhibitionSessions.length : 0;
  const galleryPrepDate = isGallery ? (sessions.find((s) => s.isPrepDay)?.date || "") : "";

  const bundle = isBatch ? analyzeBundle(sessions) : null;
  const displayStatus = isBatch ? bundle!.displayStatus : req.status;
  const statusForFilter: RequestStatus = isBatch ? bundle!.statusForFilter : req.status;

  const approvedSessions = isBatch ? sessions.filter((s) => s.status === "승인") : [];
  const feeBasisSessions = isBatch ? pickFeeBasisSessions(sessions) : sessions;
  const usingApprovedBasis = isBatch && approvedSessions.length > 0 && approvedSessions.length < sessions.length;

  const feeAll = isBatch ? computeFeesForBundle(sessions) : null;
  const feeBasis = isBatch ? computeFeesForBundle(feeBasisSessions) : computeFeesForRequest(req);

  // ✅ Server Action은 별도 모듈로 분리하여(클로저 직렬화 이슈 방지)
  //    requestId만 바인딩해서 사용합니다.
  const decideSingle = decideSingleAction.bind(null, req.requestId);
  const saveBundleMeta = saveBundleMetaAction.bind(null, req.requestId);
  const decideSelectedSessions = decideSelectedSessionsAction.bind(null, req.requestId);
  const sendCurrentStatusEmail = sendCurrentStatusEmailAction.bind(null, req.requestId);

  const sessionSelectorRows = isBatch
    ? sessions.map((s, idx) => {
        const base = computeBaseTotalKRW(s);
        return {
          requestId: s.requestId,
          seq: idx + 1,
          isPrepDay: s.isPrepDay ? true : false,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status,
          baseTotalKRW: base.totalFeeKRW,
          rejectReason: s.rejectReason ?? "",
        };
      })
    : [];

  const rejectSummary = isBatch
    ? sessions
        .map((s, idx) => (s.status === "반려" ? `${idx + 1}회차: ${s.rejectReason || ""}` : ""))
        .filter((v) => v && v.trim().length > 0)
        .join("\n")
    : req.rejectReason ?? "";

  const accent = categoryAccent(normalizedCategory);
  const categoryLabel = getCategoryLabel(normalizedCategory);

  return (
    <main className="mx-auto max-w-5xl p-6">
      {/* 카테고리 표시 + 헤더 */}
      <div className={`mb-6 rounded-xl border ${accent.border} ${accent.bg} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${accent.dot}`} />
              <span className={`text-xs font-semibold ${accent.text}`}>{categoryLabel}</span>
            </div>
            <h1 className="mt-1 text-xl font-bold text-gray-900">대관 신청 상세</h1>
            <p className="mt-1 text-sm text-gray-600">
              {REQUEST_ID_LABEL}: <b className="text-gray-900">{req.requestId}</b>
              {isBatch ? (
                <>
                  <span className="mx-2 text-gray-300">|</span>
                  묶음({req.batchId}) · {sessions.length}회
                </>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={backToListHref} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              목록
            </Link>
            <Link
              href={`/api/admin/export/form?requestId=${encodeURIComponent(req.requestId)}`}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              신청서 Excel
            </Link>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">처리 상태</span>
              <StatusBadge status={statusForFilter} />
              {isBatch && displayStatus === "부분처리" ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">부분처리</span>
              ) : null}
            </div>
            {isBatch ? (
              <p className="mt-2 text-sm text-gray-600">
                승인 {bundle!.approvedCount} · 반려 {bundle!.rejectedCount} · 대기 {bundle!.pendingCount}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-sm text-gray-600">승인 회차 기준 결제금액</div>
            <div className="mt-1 text-xl font-extrabold text-gray-900">{formatKRW(feeBasis.finalFeeKRW)}</div>
            {usingApprovedBasis ? (
              <div className="mt-1 text-xs text-gray-600">(승인 {approvedSessions.length}/{sessions.length}회 기준)</div>
            ) : isBatch ? (
              <div className="mt-1 text-xs text-gray-600">(전체 회차 기준)</div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 p-4">
            <div className="text-sm font-semibold text-gray-900">신청자</div>
            <div className="mt-2 text-sm text-gray-700">
              <div>
                <b>성명</b>: {req.applicantName}
              </div>
              <div>
                <b>연락처</b>: {req.phone}
              </div>
              <div>
                <b>이메일</b>: {req.email}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 p-4">
            <div className="text-sm font-semibold text-gray-900">신청 정보</div>
            <div className="mt-2 text-sm text-gray-700">
              <div>
                <b>공간</b>: {req.roomName}
              </div>

              {isGallery ? (
                <>
                  <div className="mt-2">
                    <b>전시 기간</b>: {req.startDate || sessions.find((s) => !s.isPrepDay)?.date} ~ {req.endDate || sessions.slice().reverse().find((s) => !s.isPrepDay)?.date}
                    {sessions.some((s) => s.isPrepDay) ? <span className="ml-2 text-xs text-gray-500">(준비일 1일 무료 포함)</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    전시일수: 평일 {galleryWeekdayCount}일 · 토 {gallerySaturdayCount}일 (총 {galleryExhibitionDayCount}일)
                    {galleryPrepDate ? <> / 준비일: {galleryPrepDate}</> : null}
                    {req.galleryGeneratedAt ? (
                      <>
                        <br />
                        <span className="text-gray-500">
                          서버 생성: {req.galleryGeneratedAt}
                          {req.galleryGenerationVersion ? ` (${req.galleryGenerationVersion})` : ""}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-2">
                    <b>전시명(필수)</b>: {req.exhibitionTitle || "-"}
                  </div>
                  {req.exhibitionPurpose ? (
                    <div className="mt-1">
                      <b>전시 목적</b>: {req.exhibitionPurpose}
                    </div>
                  ) : null}
                  {req.genreContent ? (
                    <div className="mt-1">
                      <b>장르·내용</b>: {req.genreContent}
                    </div>
                  ) : null}
                  {req.awarenessPath ? (
                    <div className="mt-1">
                      <b>인지 경로</b>: {req.awarenessPath}
                    </div>
                  ) : null}
                  {req.specialNotes ? (
                    <div className="mt-1">
                      <b>특이사항</b>: {req.specialNotes}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div>
                    <b>인원</b>: {req.headcount}명
                  </div>
                  <div>
                    <b>사용 목적</b>: {req.purpose}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {isBatch ? (
          <div className="mt-4 rounded-lg border border-gray-100 p-4">
            <div className="text-sm font-semibold text-gray-900">회차별 현황</div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="p-2 text-left">회차</th>
                    <th className="p-2 text-left">{isGallery ? "전시일" : "일시"}</th>
                    <th className="p-2 text-left">상태</th>
                    <th className="p-2 text-left">반려 사유</th>
                    <th className="p-2 text-right">기본 이용료</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessionSelectorRows.map((s) => (
                    <tr key={s.requestId}>
                      <td className="p-2">{s.seq}</td>
                      <td className="p-2">
                        {isGallery
                          ? `${s.date} (${s.isPrepDay ? "준비일" : "전시일"})`
                          : `${s.date} ${s.startTime}~${s.endTime}`}
                        {isGallery && s.isPrepDay ? (
                          <span className="ml-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">준비(세팅)</span>
                        ) : null}
                      </td>
                      <td className="p-2">{statusLabel(s.status)}</td>
                      <td className="p-2">{s.status === "반려" ? s.rejectReason : ""}</td>
                      <td className="p-2 text-right tabular-nums">{formatKRW(s.baseTotalKRW)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">요금</h2>
          <div className="mt-4 space-y-2 text-sm text-gray-800">
            {isBatch ? (
              <>
                <div className="flex items-center justify-between">
                  <span>기본 이용료 합계(전체)</span>
                  <span className="tabular-nums font-semibold">{formatKRW(feeAll!.totalFeeKRW)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>
                    기본 이용료 합계(승인)
                    {usingApprovedBasis ? <span className="ml-2 text-xs text-gray-500">승인 {approvedSessions.length}/{sessions.length}회</span> : null}
                  </span>
                  <span className="tabular-nums font-semibold">{formatKRW(feeBasis.totalFeeKRW)}</span>
                </div>

                {isGallery ? (
                  <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                    <div className="font-semibold text-gray-900">갤러리 요금 안내</div>
                    <div className="mt-1">평일 20,000원/일 · 토 10,000원/일 · 준비(세팅)일 1일 무료</div>
                    <div className="mt-1">* 갤러리는 할인/바우처/장비 옵션 적용 불가</div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span>할인</span>
                      <span className="tabular-nums">-{formatKRW(feeBasis.discountAmountKRW)} ({feeBasis.discountRatePct}%)</span>
                    </div>
                    {feeBasis.discountReason ? <div className="text-xs text-gray-600">사유: {feeBasis.discountReason}</div> : null}
                  </>
                )}

                <div className="mt-2 flex items-center justify-between border-t pt-2">
                  <span className="font-semibold">최종 결제 금액</span>
                  <span className="tabular-nums text-base font-extrabold">{formatKRW(feeBasis.finalFeeKRW)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span>기본 이용료</span>
                  <span className="tabular-nums font-semibold">{formatKRW(feeBasis.totalFeeKRW)}</span>
                </div>

                {isGallery ? (
                  <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                    <div className="font-semibold text-gray-900">갤러리 요금 안내</div>
                    <div className="mt-1">평일 20,000원/일 · 토 10,000원/일 · 준비(세팅)일 1일 무료</div>
                    <div className="mt-1">* 갤러리는 할인/바우처/장비 옵션 적용 불가</div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span>할인</span>
                      <span className="tabular-nums">-{formatKRW(feeBasis.discountAmountKRW)} ({feeBasis.discountRatePct}%)</span>
                    </div>
                    {feeBasis.discountReason ? <div className="text-xs text-gray-600">사유: {feeBasis.discountReason}</div> : null}
                  </>
                )}

                <div className="mt-2 flex items-center justify-between border-t pt-2">
                  <span className="font-semibold">최종 결제 금액</span>
                  <span className="tabular-nums text-base font-extrabold">{formatKRW(feeBasis.finalFeeKRW)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">관리자 처리</h2>

          {isBatch ? (
            <>
              <form action={saveBundleMeta} className="mt-4 space-y-4">
                {isGallery ? (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                    <div className="font-semibold text-gray-900">갤러리 안내</div>
                    <div className="mt-1">갤러리는 할인/바우처/장비 옵션을 적용할 수 없습니다.</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-semibold text-gray-900">할인 설정(묶음 공통)</div>
                    <div className="mt-2">
                      <AdminDiscountFields
                        totalFeeKRW={feeAll!.totalFeeKRW}
                        defaultRatePct={req.discountRatePct ?? 0}
                        defaultAmountKRW={req.discountAmountKRW ?? 0}
                        defaultReason={req.discountReason ?? ""}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-900">관리 메모(묶음 공통)</label>
                  <textarea
                    name="adminMemo"
                    defaultValue={req.adminMemo || ""}
                    className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                    rows={3}
                    placeholder="예: 할인 적용 근거, 내부 확인 사항 등"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black"
                >
                  {isGallery ? "메모 저장" : "할인/메모 저장"}
                </button>
                <p className="text-xs text-gray-600">
                  * {isGallery ? "메모 저장" : "할인/메모 저장"}은 회차별 승인/반려 상태를 변경하지 않습니다.
                </p>
              </form>

              <div className="mt-6 border-t pt-6">
                <div className="text-sm font-semibold text-gray-900">회차별 승인/반려</div>
                <form action={decideSelectedSessions} className="mt-3 space-y-4">
                  <BatchSessionSelector sessions={sessionSelectorRows} />

                  <div>
                    <label className="block text-sm font-semibold text-gray-900">선택 처리</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        name="actionStatus"
                        value="승인"
                        className="rounded-lg bg-[rgb(var(--brand-primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                      >
                        선택 승인
                      </button>
                      <button
                        type="submit"
                        name="actionStatus"
                        value="반려"
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                      >
                        선택 반려
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900">반려 사유(선택 반려 시 적용)</label>
                    <textarea
                      name="rejectReason"
                      defaultValue={""}
                      className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                      rows={3}
                      placeholder="예: 신청 목적 확인 불가, 운영시간 외 신청 등"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900">관리 메모(선택 회차에 적용, 미입력 시 기존 유지)</label>
                    <textarea
                      name="adminMemo"
                      defaultValue={""}
                      className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                      rows={2}
                      placeholder="예: 전화로 내용 확인 완료"
                    />
                  </div>

                  <p className="text-xs text-gray-600">
                    * 선택 승인/반려는 체크된 회차에만 적용됩니다. 전체 처리하려면 ‘전체 선택’ 후 버튼을 누르세요.
                  </p>
                </form>

                <form action={sendCurrentStatusEmail} className="mt-4">
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    현재 상태 메일 발송
                  </button>
                  <p className="mt-2 text-xs text-gray-600">
                    * 회차별 진행 상황(승인/반려/검토중)을 신청자에게 안내합니다. (승인된 회차가 있으면 요금 포함)
                  </p>
                </form>
              </div>
            </>
          ) : (
            <form action={decideSingle} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900">처리 상태</label>
                <select
                  name="status"
                  defaultValue={req.status}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm outline-none focus:border-gray-400"
                >
                  <option value="접수">접수</option>
                  <option value="검토중">검토중</option>
                  <option value="승인">승인</option>
                  <option value="반려">반려</option>
                  <option value="취소">취소</option>
                  <option value="완료">완료</option>
                </select>
              </div>

              {isGallery ? (
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  <div className="font-semibold text-gray-900">갤러리 안내</div>
                  <div className="mt-1">갤러리는 할인/바우처/장비 옵션을 적용할 수 없습니다.</div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-gray-900">할인</label>
                  <div className="mt-2">
                    <AdminDiscountFields
                      totalFeeKRW={feeBasis.totalFeeKRW}
                      defaultRatePct={req.discountRatePct ?? 0}
                      defaultAmountKRW={req.discountAmountKRW ?? 0}
                      defaultReason={req.discountReason ?? ""}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-900">반려 사유 (반려 시 필수)</label>
                <textarea
                  name="rejectReason"
                  defaultValue={req.rejectReason || ""}
                  className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                  rows={3}
                  placeholder="예: 신청 목적 확인 불가, 운영시간 외 신청 등"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900">관리 메모</label>
                <textarea
                  name="adminMemo"
                  defaultValue={req.adminMemo || ""}
                  className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                  rows={3}
                  placeholder="예: 전화로 내용 확인 완료"
                />
              </div>

              <button type="submit" className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black">
                저장 및 (최종결정 시) 메일 발송
              </button>
            </form>
          )}
        </div>
      </section>

      {rejectSummary ? (
        <section className="mt-6 rounded-xl border border-red-100 bg-red-50 p-5">
          <h2 className="text-sm font-bold text-red-800">반려 사유</h2>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-red-900">{rejectSummary}</pre>
        </section>
      ) : null}
    </main>
  );
}
