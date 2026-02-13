import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { computeFeesForBundle, computeFeesForRequest, getSelectedEquipmentDetails } from "@/lib/pricing";
import { normalizeRoomCategory } from "@/lib/space";
import type { RentalRequest } from "@/lib/types";
import { verifyApplicantLinkToken } from "@/lib/publicLinkToken";
import { ROOMS } from "@/lib/space";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 조회: IP당 1분 내 10회 제한 */
const RESULT_MAX_PER_MIN = 10;
const RESULT_WINDOW_MS = 60 * 1000;

// NOTE: 묶음 상태는 lib/bundle.ts의 analyzeBundle()로 계산

function sortSessions(list: RentalRequest[]) {
  return list
    .slice()
    .sort((a, b) => {
      const sa = a.batchSeq ?? 0;
      const sb = b.batchSeq ?? 0;
      if (sa !== sb) return sa - sb;
      return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
    });
}

function normalizeEmail(email: string) {
  return (email ?? "").toString().trim().toLowerCase();
}

function approvalLabel(status: string, decidedBy?: string) {
  if (status === "승인") return "승인완료";
  if (status === "반려") return "반려";
  if (status === "부분처리") return "부분처리";
  if (status === "취소") {
    if ((decidedBy ?? "").includes("사용자")) return "사용자취소";
    return "예약취소";
  }
  return "승인대기";
}

function paymentLabel(status: string) {
  return status === "승인" ? "결제대기" : "미결제";
}

function reservationLabel(status: string, decidedBy?: string) {
  if (status === "취소") {
    if ((decidedBy ?? "").includes("사용자")) return "사용자취소";
    return "예약취소";
  }
  if (status === "반려") return "반려";
  return "신청완료";
}

function roomMeta(roomId: string) {
  return ROOMS.find((r) => r.id === roomId);
}

export async function POST(req: Request) {
  try {
  // Rate Limiting
  const ip = getClientIp(req);
  const rl = rateLimit("result", ip, RESULT_MAX_PER_MIN, RESULT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `요청이 너무 많습니다. ${rl.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const requestId = (body?.requestId ?? "").toString().trim();
  const token = (body?.token ?? "").toString().trim();
  const emailInput = (body?.email ?? "").toString().trim();

  let email = normalizeEmail(emailInput);
  if (token) {
    const verified = verifyApplicantLinkToken(token);
    if (!verified.ok) {
      return NextResponse.json({ ok: false, message: verified.message }, { status: 403 });
    }
    email = verified.email;
  }

  if (!requestId || !email) {
    return NextResponse.json({ ok: false, message: "신청번호와 이메일을 입력해주세요." }, { status: 400 });
  }

  const db = getDatabase();
  const r = await db.getRequestById(requestId);

  // 신청번호 미존재 또는 이메일 불일치 시 동일 메시지 반환 (이메일 열거 방지)
  if (!r || normalizeEmail(r.email) !== email) {
    return NextResponse.json(
      { ok: false, message: "신청번호 또는 이메일을 확인해주세요." },
      { status: 400 },
    );
  }

  // 묶음 신청이면 같은 batchId 전체를 조회하여 요약
  const sessions0 = r.batchId ? await db.getRequestsByBatchId(r.batchId) : [r];
  const sessions = sortSessions(
    (sessions0.length ? sessions0 : [r]).filter((x) => normalizeEmail(x.email) === email)
  );
  const representative = sessions[0] ?? r;

  const isBatch = !!(r.batchId);

  const bundle = isBatch ? analyzeBundle(sessions) : null;
  const overallStatus = isBatch ? bundle!.displayStatus : representative.status;

  const approvedSessions = sessions.filter((s) => s.status === "승인");
  const usingApprovedBasis = isBatch && approvedSessions.length > 0 && approvedSessions.length < sessions.length;

  const feeAvailable = isBatch ? approvedSessions.length > 0 : representative.status === "승인";
  const fee = isBatch
    ? computeFeesForBundle(feeAvailable ? pickFeeBasisSessions(sessions) : sessions)
    : computeFeesForRequest(representative);
  const estimateFee = isBatch ? computeFeesForBundle(sessions) : computeFeesForRequest(representative);

  const overallDecidedBy = isBatch
    ? (sessions.find((s) => s.decidedBy)?.decidedBy ?? representative.decidedBy)
    : representative.decidedBy;

  const meta = roomMeta(representative.roomId);

  const approvalStatusText = approvalLabel(overallStatus, overallDecidedBy);
  const reservationStatusText = reservationLabel(overallStatus, overallDecidedBy);
  const paymentStatusText = paymentLabel(overallStatus);

  const payableFeeKRW = feeAvailable ? fee.finalFeeKRW : estimateFee.finalFeeKRW;

  // 사용자 취소 가능 여부
  // - 이미 취소된 건이 포함되면 불가
  // - 묶음이면 전체 기준으로 판단
  const cancelable = !["취소", "반려"].includes(overallStatus) && sessions.every((s) => s.status !== "취소" && s.status !== "반려");

  return NextResponse.json({
    ok: true,
    status: overallStatus,
    approvalStatusText,
    reservationStatusText,
    paymentStatusText,

    requestId: representative.requestId,
    roomName: representative.roomName,
    roomId: representative.roomId,
    spaceCategoryText: meta?.category === "studio" ? `E-스튜디오(${meta?.floor ?? ""}층)` : `${meta?.floor ?? ""}층`,
    // 단일 호환 필드(대표 일시)
    date: representative.date,
    startTime: representative.startTime,
    endTime: representative.endTime,
    createdAt: representative.createdAt,
    applicantName: representative.applicantName,
    phone: representative.phone,
    email: representative.email,
    address: representative.address,
    orgName: representative.orgName,
    headcount: representative.headcount,
    purpose: representative.purpose,

    // 묶음 정보
    isBatch,
    batchId: representative.batchId ?? "",
    batchSize: sessions.length,
    statusKind: isBatch ? bundle!.kind : "single",
    approvedCount: isBatch ? bundle!.approvedCount : (representative.status === "승인" ? 1 : 0),
    rejectedCount: isBatch ? bundle!.rejectedCount : (representative.status === "반려" ? 1 : 0),
    pendingCount: isBatch ? bundle!.pendingCount : (representative.status === "접수" ? 1 : 0),
    feeAvailable,
    feeBasis: feeAvailable ? (usingApprovedBasis ? "approved" : "all") : "none",
    sessions: sessions.map((s) => ({
      requestId: s.requestId,
      seq: s.batchSeq ?? 0,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      decidedBy: s.decidedBy ?? "",
      decidedAt: s.decidedAt ?? "",
      rejectReason: s.rejectReason ?? ""
    })),

    // 장비 정보
    equipmentDetails: getSelectedEquipmentDetails(
      representative.equipment,
      normalizeRoomCategory(meta?.category)
    ),

    // 금액/할인/최종
    rentalFeeKRW: fee.rentalFeeKRW,
    equipmentFeeKRW: fee.equipmentFeeKRW,
    totalFeeKRW: fee.totalFeeKRW,
    discountRatePct: fee.discountRatePct,
    discountAmountKRW: fee.discountAmountKRW,
    discountReason: fee.discountReason,
    finalFeeKRW: fee.finalFeeKRW,

    payableFeeKRW,
    feeIsEstimated: !feeAvailable,

    decidedBy: overallDecidedBy ?? "",
    cancelable,

    // 반려 사유(묶음은 대표/첫회차 기준)
    rejectReason: overallStatus === "반려" && approvedSessions.length === 0 ? (representative.rejectReason ?? "") : "",

    // 갤러리 전시 기간 정보
    ...(representative.roomId === "gallery" ? {
      startDate: representative.startDate ?? "",
      endDate: representative.endDate ?? "",
      galleryExhibitionDayCount: representative.galleryExhibitionDayCount ?? 0,
      galleryWeekdayCount: representative.galleryWeekdayCount ?? 0,
      gallerySaturdayCount: representative.gallerySaturdayCount ?? 0,
      galleryPrepDate: representative.galleryPrepDate ?? "",
    } : {}),
  });
  } catch {
    return NextResponse.json({ ok: false, message: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
