import Link from "next/link";
import { redirect } from "next/navigation";

import AdminDiscountFields from "@/components/admin/AdminDiscountFields";
import BatchActionSection from "@/components/admin/BatchActionSection";
import BatchSessionSelector from "@/components/admin/BatchSessionSelector";
import SingleStatusFields from "@/components/admin/SingleStatusFields";
import StatusBadge from "@/components/admin/StatusBadge";

import { assertAdminAuth } from "@/lib/adminAuth";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { getDatabase } from "@/lib/database";
import { REQUEST_ID_LABEL, intakeChannelLabel, isOfflineIntake } from "@/lib/labels";
import { computeBaseTotalKRW, computeFeesForBundle, computeFeesForRequest, formatKRW, getSelectedEquipmentDetails } from "@/lib/pricing";

import { getCategoryLabel, getRoom, normalizeRoomCategory, type RoomCategory } from "@/lib/space";
import type { RentalRequest, RequestStatus } from "@/lib/types";
import { logger } from "@/lib/logger";
import { sortSessions, categoryAccent } from "@/lib/requestUtils";

import EmailConfirmModal from "@/components/admin/EmailConfirmModal";
import FormSubmitButton from "@/components/FormSubmitButton";
import ExcelDownloadButton from "@/components/admin/ExcelDownloadButton";
import GianCopyButton from "@/components/admin/GianCopyButton";
import PaymentSection from "@/components/admin/PaymentSection";
import WelfareCopyButton from "@/components/admin/WelfareCopyButton";
import { derivePaymentView } from "@/lib/payment";
import { BADGE_TONE_CLASS, homepageBadge, paymentBadges, toPaymentViewDTO } from "@/lib/paymentUi";
import { todayYmdSeoul } from "@/lib/datetime";
import { Suspense } from "react";

import {
  decideSingleAction,
  saveBundleMetaAction,
  decideSelectedSessionsAction,
  recalcGalleryFeeAction,
} from "./actions";
import GalleryHolidayBanner from "@/components/admin/GalleryHolidayBanner";
import { getGalleryRecalcView } from "@/lib/galleryRecalc";

export const runtime = "nodejs";

/* ── helpers ── */

/** galleryRemovalTime이 비어 있으면 galleryAuditJson에서 추출(구버전 데이터 호환) */
function resolveGalleryRemovalTime(req: RentalRequest): string | undefined {
  if (req.galleryRemovalTime) return req.galleryRemovalTime;
  if (req.galleryAuditJson) {
    try {
      const audit = JSON.parse(req.galleryAuditJson);
      if (typeof audit.removalTime === "string" && audit.removalTime) return audit.removalTime;
    } catch { /* ignore */ }
  }
  return undefined;
}

/* 정보 표시용 행 */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-20 shrink-0 text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

/* 섹션 카드 */
function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className ?? ""}`}>
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
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
  searchParams?: { category?: string; formError?: string; saved?: string };
}) {
  await assertAdminAuth();
  const formErrorMessage =
    searchParams?.formError === "discountReason"
      ? "할인을 적용하려면 할인 근거를 선택해야 합니다. 저장되지 않았습니다."
      : searchParams?.formError === "rejectReason"
        ? "반려 시 반려 사유를 입력해야 합니다. 저장되지 않았습니다."
        : searchParams?.formError === "status"
          ? "처리 상태 값이 올바르지 않습니다. 저장되지 않았습니다."
          : searchParams?.formError === "sheetBusy"
            ? "시트 저장이 잠시 막혀(요청 한도) 아무것도 바뀌지 않았습니다. 1분 뒤 다시 눌러 주세요."
            : searchParams?.formError === "noSelection"
              ? "처리할 회차를 1개 이상 선택하세요."
              : searchParams?.formError === "recalcNotAllowed"
                ? "결제 안내가 이미 나갔으므로 자동으로 바꾸지 않습니다. 차액은 할인·환불 기록으로 처리해 주세요."
                : searchParams?.formError === "holidayUnavailable"
                  ? "지금도 공휴일 정보를 불러오지 못했습니다. 기간에 공휴일이 있는지 달력에서 직접 확인해 주세요."
                  : searchParams?.formError === "recalcNoChange"
                    ? "기간에 공휴일이 없어 바꿀 금액이 없습니다."
                    : "";

  const db = getDatabase();
  let req: RentalRequest | null = null;
  try {
    req = await db.getRequestById(params.id);
  } catch (e) {
    logger.error("신청 상세 조회 오류", { requestId: params.id, error: e instanceof Error ? e.message : String(e) });
  }

  if (!req) {
    const cat = normalizeRoomCategory(searchParams?.category);
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <div className="text-4xl text-amber-400">!</div>
          <h1 className="mt-3 text-lg font-bold text-slate-900">신청 정보를 찾을 수 없습니다</h1>
          <p className="mt-2 text-sm text-slate-600">
            신청번호 <b>{params.id}</b>에 해당하는 데이터가 없습니다.<br />
            Mock 모드에서는 서버 재시작 시 데이터가 초기화될 수 있습니다.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href={`/admin/requests?category=${encodeURIComponent(cat)}`}
              className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            >
              목록으로 돌아가기
            </Link>
            <Link
              href={`/admin/calendar?category=${encodeURIComponent(cat)}`}
              className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
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
  /** 갤러리 공휴일 미확인 배너·다시 계산 보기(서버 전용 · 갤러리가 아니면 null) */
  let recalcView: Awaited<ReturnType<typeof getGalleryRecalcView>> = null;
  if (isGallery) {
    try {
      recalcView = await getGalleryRecalcView(req);
    } catch (e) {
      logger.warn("갤러리 공휴일 배너 계산 실패", { requestId: req.requestId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const isStudio = normalizedCategory === "studio";
  const studioBaseHeadcount = room?.baseHeadcount ?? 2;
  const studioExtraPersons = isStudio ? Math.max(0, Math.floor(Number(req.headcount ?? 0)) - studioBaseHeadcount) : 0;
  const backToListHref = `/admin/requests?category=${encodeURIComponent(normalizedCategory)}`;

  /* ── 묶음(배치) ── */
  const batchList = req.batchId ? await db.getRequestsByBatchId(req.batchId) : [];
  const sessions = req.batchId ? sortSessions(batchList.length ? batchList : [req]) : [req];
  const isBatch = !!req.batchId;

  /* ── 갤러리 통계 (저장된 값 사용 — 1행/다행 형식 모두 호환) ── */
  const galleryWeekdayCount = isGallery ? (req.galleryWeekdayCount ?? 0) : 0;
  const gallerySaturdayCount = isGallery ? (req.gallerySaturdayCount ?? 0) : 0;
  const galleryExhibitionDayCount = isGallery ? (req.galleryExhibitionDayCount ?? 0) : 0;
  const galleryPrepDate = isGallery ? (req.galleryPrepDate ?? "") : "";

  /* ── 상태/요금 ── */
  const bundle = isBatch ? analyzeBundle(sessions) : null;
  const displayStatus = isBatch ? bundle!.displayStatus : req.status;
  const statusForFilter: RequestStatus = isBatch ? bundle!.statusForFilter : req.status;
  const approvedSessions = isBatch ? sessions.filter((s) => s.status === "승인") : [];
  const feeBasisSessions = isBatch ? pickFeeBasisSessions(sessions) : sessions;
  const usingApprovedBasis = isBatch && approvedSessions.length > 0 && approvedSessions.length < sessions.length;
  const feeAll = isBatch ? computeFeesForBundle(sessions) : null;
  const feeBasis = isBatch ? computeFeesForBundle(feeBasisSessions) : computeFeesForRequest(req);

  /* ── 결제 안내·확인 파생 상태 (payment-link-record · 2026-10-26) ── */
  const todayYmd = todayYmdSeoul();
  const paymentView = derivePaymentView(sessions, todayYmd);
  const paymentDto = toPaymentViewDTO(paymentView);
  const payBadges = paymentBadges(paymentDto);
  const hpBadge = homepageBadge(paymentDto.homepageState);

  /* ── Server Actions ── */
  const decideSingle = decideSingleAction.bind(null, req.requestId);
  const saveBundleMeta = saveBundleMetaAction.bind(null, req.requestId);
  const decideSelectedSessions = decideSelectedSessionsAction.bind(null, req.requestId);

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

  const roomCategory = isGallery ? "gallery" as const : isStudio ? "studio" as const : "lecture" as const;
  const equipmentDetails = getSelectedEquipmentDetails(req.equipment, roomCategory);

  const accent = categoryAccent(normalizedCategory);
  const categoryLabel = getCategoryLabel(normalizedCategory);

  /* ── 기안 데이터 복사 페이로드 (2026-08-26) ──
     그룹웨어 대관 기안 작성 도구가 파싱하는 JSON. 필드 변경 시 version을 올릴 것 */
  const gianPayload = {
    _type: "area-lental-gian",
    version: 1,
    exportedAt: new Date().toISOString(),
    category: normalizedCategory,
    categoryLabel,
    requestId: req.requestId,
    status: displayStatus,
    createdAt: req.createdAt,
    /** 서면 접수 건은 appliedAt(실제 신청일)을 신청일자로 쓸 것 (2026-10-19) */
    appliedAt: req.appliedAt ?? "",
    intakeChannel: req.intakeChannel ?? "online",
    applicant: {
      name: req.applicantName,
      birth: req.birth,
      address: req.address,
      phone: req.phone,
      email: req.email,
      orgName: req.orgName,
      headcount: req.headcount,
    },
    room: { id: req.roomId, name: req.roomName },
    sessions: sessions.map((s) => ({
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      ...(s.isPrepDay ? { isPrepDay: true } : {}),
    })),
    ...(isGallery
      ? {
          gallery: {
            exhibitionTitle: req.exhibitionTitle ?? "",
            exhibitionPurpose: req.exhibitionPurpose ?? "",
            genreContent: req.genreContent ?? "",
            startDate: req.startDate ?? "",
            endDate: req.endDate ?? "",
            prepDate: galleryPrepDate,
            removalTime: resolveGalleryRemovalTime(req) ?? "",
            weekdayCount: galleryWeekdayCount,
            saturdayCount: gallerySaturdayCount,
            exhibitionDayCount: galleryExhibitionDayCount,
          },
        }
      : {}),
    purpose: req.purpose,
    equipment: equipmentDetails.map((e) => ({ label: e.label, feeKRW: e.feeKRW })),
    fees: {
      rentalFeeKRW: feeBasis.rentalFeeKRW,
      equipmentFeeKRW: feeBasis.equipmentFeeKRW,
      totalFeeKRW: feeBasis.totalFeeKRW,
      discountRatePct: feeBasis.discountRatePct,
      discountAmountKRW: feeBasis.discountAmountKRW,
      discountReason: feeBasis.discountReason,
      finalFeeKRW: feeBasis.finalFeeKRW,
      ...(usingApprovedBasis ? { note: "승인 회차 기준 요금" } : {}),
    },
    pledge: {
      pledgeDate: req.pledgeDate,
      pledgeName: req.pledgeName,
      privacyAgree: req.privacyAgree,
      pledgeAgree: req.pledgeAgree,
    },
    adminMemo: req.adminMemo ?? "",
  };

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">

      {searchParams?.saved === "recalc" && isGallery && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-[15px] font-semibold text-emerald-700">
          이용료를 다시 계산했습니다: {formatKRW(feeBasis.totalFeeKRW)}
        </div>
      )}

      {formErrorMessage && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">
          {formErrorMessage}
        </div>
      )}

      {/* ═══ 1. 헤더 바 ═══ */}
      <div className={`rounded-xl border ${accent.border} ${accent.bg} px-5 py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`inline-block h-5 w-1 shrink-0 rounded-full ${accent.bar}`} aria-hidden="true" />
            <div>
              <span className={`text-sm font-semibold ${accent.text}`}>{categoryLabel}</span>
              <h1 className="text-lg font-bold text-slate-900">
                {REQUEST_ID_LABEL} {req.requestId}
                {isGallery && !isBatch && galleryExhibitionDayCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    전시 {galleryExhibitionDayCount}일
                  </span>
                )}
                {isBatch && !isGallery && (
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    묶음 · {sessions.length}회
                  </span>
                )}
                {isBatch && isGallery && (
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    묶음 · {sessions.length}일
                  </span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={backToListHref} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              ← 목록
            </Link>
            {(normalizedCategory === "lecture" || normalizedCategory === "studio") && (
              <Link
                href={`/admin/requests/${encodeURIComponent(req.requestId)}/form?category=${encodeURIComponent(normalizedCategory)}`}
                target="_blank"
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              >
                신청서 · 서약서
              </Link>
            )}
            {normalizedCategory === "gallery" && (
              <Link
                href={`/admin/requests/${encodeURIComponent(req.requestId)}/form?category=${encodeURIComponent(normalizedCategory)}`}
                target="_blank"
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              >
                신청서 · 서약서
              </Link>
            )}
            <ExcelDownloadButton
              href={`/api/admin/export/form?requestId=${encodeURIComponent(req.requestId)}`}
              label="Excel"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            />
            <GianCopyButton payload={gianPayload} />
            <WelfareCopyButton requestId={req.requestId} />
          </div>
        </div>
      </div>

      {/* ═══ 1-1. 갤러리 공휴일 미확인 배너(③-F-3) — 헤더 바로 아래, 다른 모든 섹션 위 ═══ */}
      {recalcView?.showBanner && recalcView.bannerLevel ? (
        <GalleryHolidayBanner
          view={{
            bannerLevel: recalcView.bannerLevel,
            nowUnavailable: recalcView.nowStatus === "unavailable",
            periodHolidayLabels: recalcView.periodHolidays.map((h) => h.label),
            statusAllowed: recalcView.statusAllowed,
            canRecalc: recalcView.canRecalc,
            before: recalcView.before,
            after: recalcView.after,
            startDate: recalcView.startDate,
            endDate: recalcView.endDate,
            recalculatedAt: recalcView.recalculatedAt,
          }}
          action={recalcGalleryFeeAction.bind(null, req.requestId)}
        />
      ) : null}

      {/* ═══ 2. 상태 요약 스트립 ═══ */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center md:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">처리 상태</span>
              <StatusBadge status={statusForFilter} />
              {isBatch && displayStatus === "부분처리" && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">부분처리</span>
              )}
            </div>

            {isBatch && (
              <div className="flex items-center gap-3 text-sm text-slate-600 md:border-l md:border-slate-200 md:pl-4">
                <span>승인 <b className="text-emerald-700">{bundle!.approvedCount}</b></span>
                <span>반려 <b className="text-rose-700">{bundle!.rejectedCount}</b></span>
                <span>대기 <b className="text-amber-700">{bundle!.pendingCount}</b></span>
              </div>
            )}

            {/* 결제·홈페이지 배지 — 승인 회차가 있거나 자동 취소된 건만 (01_spec ③-(가)-2) */}
            {payBadges.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2 md:border-l md:border-slate-200 md:pl-4">
                  <span className="text-sm font-semibold text-slate-600">결제</span>
                  {payBadges.map((b) => (
                    <span
                      key={b.text}
                      title={b.title}
                      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${BADGE_TONE_CLASS[b.tone]}`}
                    >
                      {b.text}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 md:border-l md:border-slate-200 md:pl-4">
                  <span className="text-sm font-semibold text-slate-600">홈페이지</span>
                  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${BADGE_TONE_CLASS[hpBadge.tone]}`}>
                    {hpBadge.text}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-500">최종 결제금액</div>
            <div className="text-xl font-extrabold text-slate-900">{formatKRW(feeBasis.finalFeeKRW)}</div>
            {usingApprovedBasis && (
              <div className="text-xs text-slate-500">승인 {approvedSessions.length}/{sessions.length}회 기준</div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ 3. 신청자 + 대관(전시) 정보 (2열) ═══ */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 신청자 정보 */}
        <Section title="신청자 정보">
          <dl>
            <InfoRow label="성명">{req.applicantName}</InfoRow>
            <InfoRow label="연락처">{req.phone}</InfoRow>
            <InfoRow label="이메일">{req.email}</InfoRow>
            {isOfflineIntake(req.intakeChannel) && (
              <InfoRow label="접수 경로">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">서면</span>
                <span className="ml-2">{intakeChannelLabel(req.intakeChannel)}</span>
                {req.appliedAt ? <span className="ml-2 text-slate-600">신청일 {req.appliedAt}</span> : null}
                {req.intakeNote ? <span className="ml-2 text-slate-500">· {req.intakeNote}</span> : null}
              </InfoRow>
            )}
            {req.orgName && req.orgName !== "-" && <InfoRow label="단체명">{req.orgName}</InfoRow>}
            {!isStudio && req.headcount && <InfoRow label="인원">{req.headcount}명</InfoRow>}
            {/* [결3] E-스튜디오도 이용 인원 표시(기본 2명 초과분 표기) */}
            {isStudio && req.headcount ? (
              <InfoRow label="인원">
                {req.headcount}명
                {studioExtraPersons > 0 ? ` (기본 ${studioBaseHeadcount}명 + 추가 ${studioExtraPersons}명)` : ""}
              </InfoRow>
            ) : null}
          </dl>
        </Section>

        {/* 대관(전시) 정보 */}
        <Section title={isGallery ? "전시 정보" : "대관 정보"}>
          <dl>
            <InfoRow label="공간">{req.roomName}</InfoRow>

            {/* 일정 정보 */}
            {isGallery ? (
              <>
                <InfoRow label="전시 기간">
                  {req.startDate ?? req.date} ~ {req.endDate ?? req.date}
                </InfoRow>
                <InfoRow label="준비일">
                  {galleryPrepDate
                    ? <span className="font-medium text-emerald-700">{galleryPrepDate} (무료)</span>
                    : <span className="text-slate-500">없음</span>}
                </InfoRow>
                <InfoRow label="전시일수">
                  평일 {galleryWeekdayCount}일 · 토 {gallerySaturdayCount}일 (총 {galleryExhibitionDayCount}일)
                </InfoRow>
                <InfoRow label="철거일">
                  {req.endDate ?? req.date}
                  {(() => {
                    const removalTime = resolveGalleryRemovalTime(req);
                    return removalTime
                      ? <span className="ml-1 font-medium text-orange-700">{removalTime}까지 철수</span>
                      : <span className="ml-1 text-slate-500">철수 시간 미지정</span>;
                  })()}
                </InfoRow>
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
              </>
            )}

            {/* 사용 목적 / 전시 목적 */}
            {isGallery ? (
              <InfoRow label="전시명">{req.exhibitionTitle || "-"}</InfoRow>
            ) : !isStudio ? (
              <InfoRow label="사용 목적">{req.purpose}</InfoRow>
            ) : null}

            {/* 갤러리 전시 상세 / 강의실·스튜디오 장비 — 동일한 서브섹션 스타일 */}
            {isGallery ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-500 mb-2">전시 상세</div>
                <div className="space-y-1.5 text-sm">
                  {req.exhibitionPurpose && (
                    <div className="flex gap-3">
                      <span className="w-16 shrink-0 text-xs text-slate-500">전시 목적</span>
                      <span className="text-slate-700">{req.exhibitionPurpose}</span>
                    </div>
                  )}
                  {req.genreContent && (
                    <div className="flex gap-3">
                      <span className="w-16 shrink-0 text-xs text-slate-500">장르·내용</span>
                      <span className="text-slate-700">{req.genreContent}</span>
                    </div>
                  )}
                  {req.awarenessPath && (
                    <div className="flex gap-3">
                      <span className="w-16 shrink-0 text-xs text-slate-500">인지 경로</span>
                      <span className="text-slate-700">{req.awarenessPath}</span>
                    </div>
                  )}
                  {req.specialNotes && (
                    <div className="flex gap-3">
                      <span className="w-16 shrink-0 text-xs text-slate-500">특이사항</span>
                      <span className="text-slate-700">{req.specialNotes}</span>
                    </div>
                  )}
                  {!req.exhibitionPurpose && !req.genreContent && !req.awarenessPath && !req.specialNotes && (
                    <div className="text-sm text-slate-500">입력된 상세 정보 없음</div>
                  )}
                </div>
                {req.galleryGeneratedAt && (
                  <div className="mt-2 text-xs text-slate-500">
                    서버 생성: {req.galleryGeneratedAt}
                    {req.galleryGenerationVersion ? ` (${req.galleryGenerationVersion})` : ""}
                  </div>
                )}
              </div>
            ) : equipmentDetails.length > 0 ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-500 mb-2">{isStudio ? "촬영장비" : "기자재"}</div>
                <div className="space-y-1">
                  {equipmentDetails.map((eq) => (
                    <div key={eq.key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{eq.label}</span>
                      <span className="tabular-nums text-slate-600">{formatKRW(eq.feeKRW)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-500 mb-1">{isStudio ? "촬영장비" : "기자재"}</div>
                <div className="text-sm text-slate-500">선택 없음</div>
              </div>
            )}
          </dl>
        </Section>
      </div>

      {/* ═══ 4. 회차별 현황 (배치만) ═══ */}
      {isBatch && (
        <Section title={`회차별 현황 (${sessions.length}건)`}>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                  <th className="pb-2 pr-4">회차</th>
                  <th className="pb-2 pr-4">{isGallery ? "전시일" : "일시"}</th>
                  <th className="pb-2 pr-4">상태</th>
                  <th className="pb-2 pr-4">반려 사유</th>
                  <th className="pb-2 text-right">기본 이용료</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sessionSelectorRows.map((s) => (
                  <tr key={s.requestId} className="text-slate-700">
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
                    <td className="py-2 pr-4 text-slate-500">{s.status === "반려" ? s.rejectReason : "-"}</td>
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
                <span className="text-slate-600">{isGallery ? "이용료" : "대관료"} 합계(전체 {sessions.length}회)</span>
                <span className="tabular-nums font-semibold">{formatKRW(feeAll!.rentalFeeKRW)}</span>
              </div>
              {feeAll!.equipmentFeeKRW > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">장비 사용료</span>
                  <span className="tabular-nums font-semibold">{formatKRW(feeAll!.equipmentFeeKRW)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-600">소계(전체 {sessions.length}회)</span>
                <span className="tabular-nums font-semibold">{formatKRW(feeAll!.totalFeeKRW)}</span>
              </div>
              {usingApprovedBasis && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">
                    소계(승인 {approvedSessions.length}회)
                  </span>
                  <span className="tabular-nums font-semibold">{formatKRW(feeBasis.totalFeeKRW)}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">{isGallery ? "이용료" : "대관료"}</span>
                <span className="tabular-nums font-semibold">{formatKRW(feeBasis.rentalFeeKRW)}</span>
              </div>
              {feeBasis.equipmentFeeKRW > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">장비 사용료</span>
                  <span className="tabular-nums font-semibold">{formatKRW(feeBasis.equipmentFeeKRW)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-600">소계</span>
                <span className="tabular-nums font-semibold">{formatKRW(feeBasis.totalFeeKRW)}</span>
              </div>
            </>
          )}

          {isGallery ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">할인</span>
                <span className="text-xs text-slate-500">적용 불가</span>
              </div>
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                평일 20,000원/일 · 토 10,000원/일 · 준비(세팅)일 1일 무료
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">할인</span>
                <span className="tabular-nums text-slate-700">-{formatKRW(feeBasis.discountAmountKRW)} ({feeBasis.discountRatePct}%)</span>
              </div>
              {feeBasis.discountReason && (
                <div className="text-xs text-slate-500 pl-1">사유: {feeBasis.discountReason}</div>
              )}
            </>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="font-bold text-slate-900">최종 결제 금액</span>
            <span className="tabular-nums text-lg font-extrabold text-slate-900">{formatKRW(feeBasis.finalFeeKRW)}</span>
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
      <section className="rounded-xl border-2 border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-bold text-slate-900">관리자 처리</h2>
        </div>

        <div className="px-5 py-5">
          {isBatch ? (
            <div className="space-y-8">
              {/* ── 할인/메모 저장 (묶음 공통) ── */}
              <form action={saveBundleMeta} className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800">할인 및 메모 (묶음 공통)</h3>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">할인</label>
                  {isGallery ? (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                      갤러리는 할인/바우처 적용 대상이 아닙니다.
                    </div>
                  ) : (
                    <AdminDiscountFields
                      totalFeeKRW={feeAll!.totalFeeKRW}
                      defaultRatePct={req.discountRatePct ?? 0}
                      defaultAmountKRW={req.discountAmountKRW ?? 0}
                      defaultReason={req.discountReason ?? ""}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">관리 메모</label>
                  <textarea
                    name="adminMemo"
                    defaultValue={req.adminMemo || ""}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                    rows={2}
                    placeholder="예: 할인 적용 근거, 내부 확인 사항 등"
                  />
                </div>

                <FormSubmitButton
                  idleText={isGallery ? "메모 저장" : "할인/메모 저장"}
                  pendingText="저장 중..."
                  className="rounded-lg !bg-brand px-5 py-2.5 hover:!bg-brand-hover"
                />
                <p className="text-xs text-slate-500">
                  * 회차별 승인/반려 상태는 변경하지 않습니다.
                </p>
              </form>

              {isGallery ? (
                <>
                  {/* ── 갤러리: 전체 일괄 승인/반려 ── */}
                  <div className="border-t border-slate-100 pt-6">
                    <h3 className="text-sm font-bold text-slate-800">전체 승인 / 반려</h3>
                    <p className="mt-1 text-xs text-slate-500">전시 기간 전체({sessions.length}일)를 일괄 처리합니다.</p>

                    <form action={decideSelectedSessions} className="mt-4 space-y-4">
                      {/* 전체 세션을 hidden으로 전송 */}
                      {sessionSelectorRows.map((s) => (
                        <input key={s.requestId} type="hidden" name="selectedIds" value={s.requestId} />
                      ))}

                      <BatchActionSection
                        approveLabel="전체 승인"
                        rejectLabel="전체 반려"
                      />
                    </form>
                  </div>

                  <p className="mt-4 text-xs text-slate-500">
                    * 처리 후 아래 메일 발송 섹션에서 별도로 안내 메일을 보낼 수 있습니다.
                  </p>
                </>
              ) : (
                <>
                  {/* ── 강의실/스튜디오: 회차별 승인/반려 ── */}
                  <div className="border-t border-slate-100 pt-6">
                    <h3 className="text-sm font-bold text-slate-800">회차별 승인 / 반려</h3>

                    <form action={decideSelectedSessions} className="mt-4 space-y-4">
                      <BatchSessionSelector sessions={sessionSelectorRows} />

                      <BatchActionSection
                        approveLabel="선택 승인"
                        rejectLabel="선택 반려"
                        note="* 체크된 회차에만 적용됩니다. 전체 처리하려면 '전체 선택' 후 버튼을 누르세요."
                      >
                        <div>
                          <label className="block text-sm font-semibold text-slate-700">관리 메모 (선택 회차에 적용, 미입력 시 기존 유지)</label>
                          <textarea
                            name="adminMemo"
                            defaultValue=""
                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                            rows={2}
                            placeholder="예: 전화로 내용 확인 완료"
                          />
                        </div>
                      </BatchActionSection>
                    </form>
                  </div>

                  <p className="mt-4 text-xs text-slate-500">
                    * 처리 후 아래 메일 발송 섹션에서 별도로 안내 메일을 보낼 수 있습니다.
                  </p>
                </>
              )}
            </div>
          ) : (
            /* ── 단일 건 처리 ── */
            <form action={decideSingle} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <SingleStatusFields
                  defaultStatus={req.status}
                  defaultRejectReason={req.rejectReason || ""}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">할인</label>
                {isGallery ? (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                    갤러리는 할인/바우처 적용 대상이 아닙니다.
                  </div>
                ) : (
                  <AdminDiscountFields
                    totalFeeKRW={feeBasis.totalFeeKRW}
                    defaultRatePct={req.discountRatePct ?? 0}
                    defaultAmountKRW={req.discountAmountKRW ?? 0}
                    defaultReason={req.discountReason ?? ""}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700">관리 메모</label>
                <textarea
                  name="adminMemo"
                  defaultValue={req.adminMemo || ""}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  rows={2}
                  placeholder="예: 전화로 내용 확인 완료"
                />
              </div>

              <FormSubmitButton
                idleText="저장"
                pendingText="저장 중..."
                className="w-full rounded-lg !bg-brand px-4 py-3 hover:!bg-brand-hover"
              />
              <p className="text-xs text-slate-500 mt-2">
                * 저장 후 아래 메일 발송 섹션에서 별도로 안내 메일을 보낼 수 있습니다.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ═══ 8. 결제 안내·확인 (payment-link-record) — 경고 띠 + 4단계 체크리스트 ═══ */}
      <PaymentSection requestId={req.requestId} view={paymentDto} todayYmd={todayYmd} />

      {/* 메일 발송 섹션 + 모달 */}
      <Suspense>
        <EmailConfirmModal requestId={req.requestId} currentStatus={req.status} />
      </Suspense>
    </main>
  );
}
