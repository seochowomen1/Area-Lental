import Link from "next/link";
import { redirect } from "next/navigation";

import AdminDiscountFields from "@/components/admin/AdminDiscountFields";
import BatchSessionSelector from "@/components/admin/BatchSessionSelector";
import StatusBadge from "@/components/admin/StatusBadge";

import { assertAdminAuth } from "@/lib/adminAuth";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { getDatabase } from "@/lib/database";
import { REQUEST_ID_LABEL } from "@/lib/labels";
import { computeBaseTotalKRW, computeFeesForBundle, computeFeesForRequest, formatKRW } from "@/lib/pricing";
import { dayOfWeek } from "@/lib/datetime";
import { getCategoryLabel, getRoom, normalizeRoomCategory, type RoomCategory } from "@/lib/space";
import type { RentalRequest, RequestStatus } from "@/lib/types";

import {
  decideSingleAction,
  saveBundleMetaAction,
  decideSelectedSessionsAction,
  sendCurrentStatusEmailAction,
} from "./actions";

export const runtime = "nodejs";

/* ── helpers ── */

function categoryAccent(cat: RoomCategory) {
  if (cat === "studio") return { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" };
  if (cat === "gallery") return { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
  return { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };
}

function sortSessions(list: RentalRequest[]) {
  return list
    .slice()
    .sort((a, b) => (a.batchSeq ?? 0) - (b.batchSeq ?? 0) || `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}

/* 정보 표시용 행 */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-20 shrink-0 text-xs font-semibold text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

/* 섹션 카드 */
function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className ?? ""}`}>
      <div className="border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/* ── main page ── */

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

  /* ── 카테고리 자동 보정 ── */
  const room = getRoom(req.roomId);
  const inferredCategory = normalizeRoomCategory(room?.category);
  const rawCategory = (searchParams?.category ?? "").trim();
  if (!rawCategory) {
    redirect(`/admin/requests/${encodeURIComponent(req.requestId)}?category=${encodeURIComponent(inferredCategory)}`);
  }
  const normalizedCategory = normalizeRoomCategory(rawCategory);
  const isGallery = req.roomId === "gallery" || normalizedCategory === "gallery";
  const backToListHref = `/admin/requests?category=${encodeURIComponent(normalizedCategory)}`;

  /* ── 묶음(배치) ── */
  const batchList = req.batchId ? await db.getRequestsByBatchId(req.batchId) : [];
  const sessions = req.batchId ? sortSessions(batchList.length ? batchList : [req]) : [req];
  const isBatch = !!req.batchId;

  /* ── 갤러리 통계 ── */
  const galleryExhibitionSessions = isGallery ? sessions.filter((s) => !s.isPrepDay) : [];
  const galleryWeekdayCount = isGallery
    ? galleryExhibitionSessions.filter((s) => { const dow = dayOfWeek(s.date); return dow >= 1 && dow <= 5; }).length
    : 0;
  const gallerySaturdayCount = isGallery ? galleryExhibitionSessions.filter((s) => dayOfWeek(s.date) === 6).length : 0;
  const galleryExhibitionDayCount = isGallery ? galleryExhibitionSessions.length : 0;
  const galleryPrepDate = isGallery ? (sessions.find((s) => s.isPrepDay)?.date || "") : "";

  /* ── 상태/요금 ── */
  const bundle = isBatch ? analyzeBundle(sessions) : null;
  const displayStatus = isBatch ? bundle!.displayStatus : req.status;
  const statusForFilter: RequestStatus = isBatch ? bundle!.statusForFilter : req.status;
  const approvedSessions = isBatch ? sessions.filter((s) => s.status === "승인") : [];
  const feeBasisSessions = isBatch ? pickFeeBasisSessions(sessions) : sessions;
  const usingApprovedBasis = isBatch && approvedSessions.length > 0 && approvedSessions.length < sessions.length;
  const feeAll = isBatch ? computeFeesForBundle(sessions) : null;
  const feeBasis = isBatch ? computeFeesForBundle(feeBasisSessions) : computeFeesForRequest(req);

  /* ── Server Actions ── */
  const decideSingle = decideSingleAction.bind(null, req.requestId);
  const saveBundleMeta = saveBundleMetaAction.bind(null, req.requestId);
  const decideSelectedSessions = decideSelectedSessionsAction.bind(null, req.requestId);
  const sendCurrentStatusEmail = sendCurrentStatusEmailAction.bind(null, req.requestId);

  const sessionSelectorRows = isBatch
    ? sessions.map((s, idx) => ({
        requestId: s.requestId,
        seq: idx + 1,
        isPrepDay: s.isPrepDay ? true : false,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        baseTotalKRW: computeBaseTotalKRW(s).totalFeeKRW,
        rejectReason: s.rejectReason ?? "",
      }))
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
    <main className="mx-auto max-w-5xl space-y-5 p-6">

      {/* ═══ 1. 헤더 바 ═══ */}
      <div className={`rounded-xl border ${accent.border} ${accent.bg} px-5 py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${accent.dot}`} />
            <div>
              <span className={`text-xs font-semibold ${accent.text}`}>{categoryLabel}</span>
              <h1 className="text-lg font-bold text-gray-900">
                {REQUEST_ID_LABEL} {req.requestId}
                {isBatch && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    묶음 · {sessions.length}회
                  </span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={backToListHref} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
              ← 목록
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

      {/* ═══ 2. 상태 요약 스트립 ═══ */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">처리 상태</span>
              <StatusBadge status={statusForFilter} />
              {isBatch && displayStatus === "부분처리" && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">부분처리</span>
              )}
            </div>

            {isBatch && (
              <div className="flex items-center gap-3 border-l border-gray-200 pl-4 text-sm text-gray-600">
                <span>승인 <b className="text-emerald-700">{bundle!.approvedCount}</b></span>
                <span>반려 <b className="text-rose-700">{bundle!.rejectedCount}</b></span>
                <span>대기 <b className="text-amber-700">{bundle!.pendingCount}</b></span>
              </div>
            )}
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">최종 결제금액</div>
            <div className="text-xl font-extrabold text-gray-900">{formatKRW(feeBasis.finalFeeKRW)}</div>
            {usingApprovedBasis && (
              <div className="text-xs text-gray-500">승인 {approvedSessions.length}/{sessions.length}회 기준</div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ 3. 신청자 + 대관 정보 (2열) ═══ */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 신청자 정보 */}
        <Section title="신청자 정보">
          <dl>
            <InfoRow label="성명">{req.applicantName}</InfoRow>
            <InfoRow label="연락처">{req.phone}</InfoRow>
            <InfoRow label="이메일">{req.email}</InfoRow>
            {req.orgName && <InfoRow label="단체명">{req.orgName}</InfoRow>}
            {!isGallery && <InfoRow label="인원">{req.headcount}명</InfoRow>}
          </dl>
        </Section>

        {/* 대관 정보 */}
        <Section title="대관 정보">
          <dl>
            <InfoRow label="공간">{req.roomName}</InfoRow>

            {isGallery ? (
              <>
                <InfoRow label="전시 기간">
                  {req.startDate || sessions.find((s) => !s.isPrepDay)?.date} ~ {req.endDate || sessions.slice().reverse().find((s) => !s.isPrepDay)?.date}
                  {sessions.some((s) => s.isPrepDay) && <span className="ml-1 text-xs text-gray-500">(준비일 1일 포함)</span>}
                </InfoRow>
                <InfoRow label="전시일수">
                  평일 {galleryWeekdayCount}일 · 토 {gallerySaturdayCount}일 (총 {galleryExhibitionDayCount}일)
                  {galleryPrepDate ? <span className="ml-1 text-gray-500">/ 준비일 {galleryPrepDate}</span> : null}
                </InfoRow>
                <InfoRow label="전시명">{req.exhibitionTitle || "-"}</InfoRow>
                {req.exhibitionPurpose && <InfoRow label="전시 목적">{req.exhibitionPurpose}</InfoRow>}
                {req.genreContent && <InfoRow label="장르·내용">{req.genreContent}</InfoRow>}
                {req.awarenessPath && <InfoRow label="인지 경로">{req.awarenessPath}</InfoRow>}
                {req.specialNotes && <InfoRow label="특이사항">{req.specialNotes}</InfoRow>}
              </>
            ) : (
              <>
                {!isBatch && (
                  <InfoRow label="일시">{req.date} {req.startTime}~{req.endTime}</InfoRow>
                )}
                {isBatch && (
                  <InfoRow label="기간">
                    {sessions[0].date} ~ {sessions[sessions.length - 1].date} ({sessions.length}회)
                  </InfoRow>
                )}
                <InfoRow label="사용 목적">{req.purpose}</InfoRow>
              </>
            )}
          </dl>

          {isGallery && req.galleryGeneratedAt && (
            <div className="mt-2 text-xs text-gray-400">
              서버 생성: {req.galleryGeneratedAt}
              {req.galleryGenerationVersion ? ` (${req.galleryGenerationVersion})` : ""}
            </div>
          )}
        </Section>
      </div>

      {/* ═══ 4. 회차별 현황 (배치만) ═══ */}
      {isBatch && (
        <Section title={`회차별 현황 (${sessions.length}건)`}>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                  <th className="pb-2 pr-4">회차</th>
                  <th className="pb-2 pr-4">{isGallery ? "전시일" : "일시"}</th>
                  <th className="pb-2 pr-4">상태</th>
                  <th className="pb-2 pr-4">반려 사유</th>
                  <th className="pb-2 text-right">기본 이용료</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessionSelectorRows.map((s) => (
                  <tr key={s.requestId} className="text-gray-700">
                    <td className="py-2 pr-4 tabular-nums">{s.seq}</td>
                    <td className="py-2 pr-4">
                      {isGallery
                        ? `${s.date} (${s.isPrepDay ? "준비일" : "전시일"})`
                        : `${s.date} ${s.startTime}~${s.endTime}`}
                      {isGallery && s.isPrepDay && (
                        <span className="ml-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">준비</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{s.status === "반려" ? s.rejectReason : "-"}</td>
                    <td className="py-2 text-right tabular-nums">{formatKRW(s.baseTotalKRW)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ═══ 5. 요금 상세 ═══ */}
      <Section title="요금 상세">
        <div className="space-y-3 text-sm">
          {isBatch ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">기본 이용료 합계(전체 {sessions.length}회)</span>
                <span className="tabular-nums font-semibold">{formatKRW(feeAll!.totalFeeKRW)}</span>
              </div>
              {usingApprovedBasis && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">
                    기본 이용료 합계(승인 {approvedSessions.length}회)
                  </span>
                  <span className="tabular-nums font-semibold">{formatKRW(feeBasis.totalFeeKRW)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">기본 이용료</span>
              <span className="tabular-nums font-semibold">{formatKRW(feeBasis.totalFeeKRW)}</span>
            </div>
          )}

          {isGallery ? (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              평일 20,000원/일 · 토 10,000원/일 · 준비(세팅)일 1일 무료 · 할인/바우처/장비 옵션 적용 불가
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">할인</span>
                <span className="tabular-nums text-gray-700">-{formatKRW(feeBasis.discountAmountKRW)} ({feeBasis.discountRatePct}%)</span>
              </div>
              {feeBasis.discountReason && (
                <div className="text-xs text-gray-500 pl-1">사유: {feeBasis.discountReason}</div>
              )}
            </>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="font-bold text-gray-900">최종 결제 금액</span>
            <span className="tabular-nums text-lg font-extrabold text-gray-900">{formatKRW(feeBasis.finalFeeKRW)}</span>
          </div>
        </div>
      </Section>

      {/* ═══ 6. 반려 사유 (있으면) ═══ */}
      {rejectSummary && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
          <h2 className="text-sm font-bold text-rose-800">반려 사유</h2>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-rose-900">{rejectSummary}</pre>
        </div>
      )}

      {/* ═══ 7. 관리자 처리 ═══ */}
      <section className="rounded-xl border-2 border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-bold text-gray-900">관리자 처리</h2>
        </div>

        <div className="px-5 py-5">
          {isBatch ? (
            <div className="space-y-8">
              {/* ── 할인/메모 저장 (묶음 공통) ── */}
              <form action={saveBundleMeta} className="space-y-4">
                <h3 className="text-sm font-bold text-gray-800">할인 및 메모 (묶음 공통)</h3>

                {isGallery ? (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    갤러리는 할인/바우처/장비 옵션을 적용할 수 없습니다.
                  </div>
                ) : (
                  <AdminDiscountFields
                    totalFeeKRW={feeAll!.totalFeeKRW}
                    defaultRatePct={req.discountRatePct ?? 0}
                    defaultAmountKRW={req.discountAmountKRW ?? 0}
                    defaultReason={req.discountReason ?? ""}
                  />
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700">관리 메모</label>
                  <textarea
                    name="adminMemo"
                    defaultValue={req.adminMemo || ""}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                    rows={2}
                    placeholder="예: 할인 적용 근거, 내부 확인 사항 등"
                  />
                </div>

                <button
                  type="submit"
                  className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black"
                >
                  {isGallery ? "메모 저장" : "할인/메모 저장"}
                </button>
                <p className="text-xs text-gray-500">
                  * 회차별 승인/반려 상태는 변경하지 않습니다.
                </p>
              </form>

              {/* ── 회차별 승인/반려 ── */}
              <div className="border-t border-gray-100 pt-6">
                <h3 className="text-sm font-bold text-gray-800">회차별 승인 / 반려</h3>

                <form action={decideSelectedSessions} className="mt-4 space-y-4">
                  <BatchSessionSelector sessions={sessionSelectorRows} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700">반려 사유 (선택 반려 시 적용)</label>
                      <textarea
                        name="rejectReason"
                        defaultValue=""
                        className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                        rows={2}
                        placeholder="예: 신청 목적 확인 불가, 운영시간 외 신청 등"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700">관리 메모 (선택 회차에 적용, 미입력 시 기존 유지)</label>
                      <textarea
                        name="adminMemo"
                        defaultValue=""
                        className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                        rows={2}
                        placeholder="예: 전화로 내용 확인 완료"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      name="actionStatus"
                      value="승인"
                      className="rounded-lg bg-[rgb(var(--brand-primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                    >
                      선택 승인
                    </button>
                    <button
                      type="submit"
                      name="actionStatus"
                      value="반려"
                      className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      선택 반려
                    </button>
                    <span className="text-xs text-gray-500">
                      * 체크된 회차에만 적용됩니다. 전체 처리하려면 '전체 선택' 후 버튼을 누르세요.
                    </span>
                  </div>
                </form>
              </div>

              {/* ── 현재 상태 메일 발송 ── */}
              <div className="border-t border-gray-100 pt-6">
                <form action={sendCurrentStatusEmail} className="flex flex-wrap items-center gap-4">
                  <button
                    type="submit"
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    현재 상태 메일 발송
                  </button>
                  <p className="text-xs text-gray-500">
                    회차별 진행 상황(승인/반려/접수)을 신청자에게 안내합니다.
                  </p>
                </form>
              </div>
            </div>
          ) : (
            /* ── 단일 건 처리 ── */
            <form action={decideSingle} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">처리 상태</label>
                  <select
                    name="status"
                    defaultValue={req.status}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                  >
                    <option value="접수">접수</option>
                    <option value="승인">승인</option>
                    <option value="반려">반려</option>
                    <option value="취소">취소</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700">반려 사유 (반려 시 필수)</label>
                  <textarea
                    name="rejectReason"
                    defaultValue={req.rejectReason || ""}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                    rows={2}
                    placeholder="예: 신청 목적 확인 불가, 운영시간 외 신청 등"
                  />
                </div>
              </div>

              {isGallery ? (
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  갤러리는 할인/바우처/장비 옵션을 적용할 수 없습니다.
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">할인</label>
                  <AdminDiscountFields
                    totalFeeKRW={feeBasis.totalFeeKRW}
                    defaultRatePct={req.discountRatePct ?? 0}
                    defaultAmountKRW={req.discountAmountKRW ?? 0}
                    defaultReason={req.discountReason ?? ""}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700">관리 메모</label>
                <textarea
                  name="adminMemo"
                  defaultValue={req.adminMemo || ""}
                  className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
                  rows={2}
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
    </main>
  );
}
