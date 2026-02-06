import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { getDatabase } from "@/lib/database";
import { REQUEST_ID_LABEL, statusLabel } from "@/lib/labels";
import { computeFeesForBundle, computeFeesForRequest, formatKRW } from "@/lib/pricing";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import type { RentalRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function yn(v: boolean) {
  return v ? "O" : "X";
}

function safeFileNamePart(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function toMin(t: string) {
  const [hh, mm] = t.split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

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


/**
 * 출력용 신청서(Excel)
 * - requestId로 조회
 * - 묶음 신청인 경우 회차 목록 + 묶음 총액/할인/최종금액을 포함
 */
export async function GET(req: Request) {
  const auth = assertAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const requestId = (url.searchParams.get("requestId") ?? "").trim();
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "requestId is required" }, { status: 400 });
  }

  const db = getDatabase();
  const r = await db.getRequestById(requestId);
  if (!r) {
    return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });
  }

  const batchList = r.batchId ? await db.getRequestsByBatchId(r.batchId) : [];
  const isBatchId = !!r.batchId;
  const sessions = isBatchId ? sortSessions(batchList.length ? batchList : [r]) : [r];
  const hasMultiple = sessions.length > 1;
  const representative = sessions[0] ?? r;
  // 갤러리 묶음의 경우 첫 회차가 준비일일 수 있으므로 대표 정보는 '전시일'을 우선 사용합니다.
  const repInfo = sessions.find((s) => !s.isPrepDay) ?? representative;
  const isGallery = repInfo.roomId === "gallery";
  const eq = (repInfo as any).equipment ?? { laptop: false, projector: false, audio: false };
  const atts = Array.isArray((repInfo as any).attachments) ? (repInfo as any).attachments : [];

  const bundle = hasMultiple ? analyzeBundle(sessions) : null;
  const basisSessions = isBatchId ? pickFeeBasisSessions(sessions) : sessions;
  const usingApprovedBasis = isBatchId && basisSessions.length > 0 && basisSessions.length !== sessions.length;

  const fee = isBatchId ? computeFeesForBundle(basisSessions) : computeFeesForRequest(repInfo);

  const discountText = isGallery
    ? "-"
    : fee.discountAmountKRW > 0
      ? `${fee.discountRatePct.toFixed(2)}% (${formatKRW(fee.discountAmountKRW)})`
      : "-";
  const discountReason = isGallery ? "-" : fee.discountReason || "-";

  const aoa: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];
  const wrapCells: string[] = [];

  const mergeRow = (r: number, cStart = 0, cEnd = 7) => {
    merges.push({ s: { r, c: cStart }, e: { r, c: cEnd } });
  };

  const pushBlank = () => aoa.push(["", "", "", "", "", "", "", ""]);
  const pushSection = (title: string) => {
    const row = aoa.length;
    aoa.push([title, "", "", "", "", "", "", ""]);
    mergeRow(row);
    return row;
  };

  // Title
  aoa.push([
    isGallery ? "센터 우리동네 갤러리 대관신청서(시스템 출력)" : "센터 강의실 대관신청서(시스템 출력)",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  mergeRow(0);
  pushBlank();

  // Meta
  const statusText = hasMultiple ? (bundle?.displayStatus ?? statusLabel(repInfo.status)) : statusLabel(repInfo.status);
  const decidedAtText = isBatchId
    ? sessions
        .map((s) => s.decidedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || "-"
    : repInfo.decidedAt || "-";

  aoa.push([REQUEST_ID_LABEL, repInfo.requestId, "", "", "상태", statusText, "", ""]);
  aoa.push(["작성일", repInfo.createdAt, "", "", "처리일", decidedAtText, "", ""]);
  aoa.push([
    isGallery ? "공간" : "강의실",
    repInfo.roomName,
    "",
    "",
    "이용일자",
    hasMultiple ? `${sessions[0].date} ~ ${sessions[sessions.length - 1].date} (${sessions.length}회)` : repInfo.date,
    "",
    "",
  ]);
  aoa.push([
    "이용시간",
    isGallery
      ? "일 단위(하루 전체) / 운영시간 자동(평일 09:00~18:00, 화 야간 ~20:00, 토 09:00~13:00)"
      : hasMultiple
        ? "회차별 상이(아래 회차표 참고)"
        : `${repInfo.startTime} ~ ${repInfo.endTime}`,
    "",
    "",
    "이용시간(분)",
    "",
    "",
    "",
  ]);
  pushBlank();

  // Batch sessions
  if (hasMultiple) {
    pushSection("[회차(묶음) 정보]");
    if (isGallery) {
      aoa.push(["회차", "신청번호", "전시일", "구분", "상태", "대관료(일)", "총액(일)", "비고"]);
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        const f = computeFeesForRequest(s); // 갤러리: 일 단위 요금(할인/장비 0)
        aoa.push([
          String(i + 1),
          s.requestId,
          s.date,
          s.isPrepDay ? "준비일(무료)" : "전시일",
          statusLabel(s.status),
          formatKRW(f.rentalFeeKRW),
          formatKRW(f.totalFeeKRW),
          s.rejectReason || ""
        ]);
      }
    } else {
      aoa.push(["회차", "신청번호", "이용일", "시작", "종료", "상태", "총액(회차)", "비고"]);
      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        const f = computeFeesForRequest(s); // 회차별(할인 미적용)
        aoa.push([
          String(i + 1),
          s.requestId,
          s.date,
          s.startTime,
          s.endTime,
          statusLabel(s.status),
          formatKRW(f.totalFeeKRW),
          s.rejectReason || ""
        ]);
      }
    }
    pushBlank();
  }

  // Applicant
  pushSection("[신청자 정보]");
  aoa.push(["성명", repInfo.applicantName, "", "", "생년월일", repInfo.birth, "", ""]);
  aoa.push(["연락처", repInfo.phone, "", "", "이메일", repInfo.email, "", ""]);
  aoa.push(["주소", repInfo.address, "", "", "단체명", repInfo.orgName, "", ""]);
  pushBlank();

  // Usage
  pushSection("[이용 내용]");
  aoa.push([
    "이용 인원",
    `${repInfo.headcount}명`,
    "",
    "",
    "기자재",
    isGallery ? "해당없음" : `노트북(${yn(eq.laptop)}), 빔프로젝터(${yn(eq.projector)}), 음향(${yn(eq.audio)})`,
    "",
    ""
  ]);
  if (isGallery) {
    const gTitleRow = aoa.length;
    aoa.push(["전시명(필수)", repInfo.exhibitionTitle || "", "", "", "", "", "", ""]);
    merges.push({ s: { r: gTitleRow, c: 1 }, e: { r: gTitleRow, c: 7 } });
    wrapCells.push(XLSX.utils.encode_cell({ r: gTitleRow, c: 1 }));

    const gPurposeRow = aoa.length;
    aoa.push(["전시목적", repInfo.exhibitionPurpose || "", "", "", "", "", "", ""]);
    merges.push({ s: { r: gPurposeRow, c: 1 }, e: { r: gPurposeRow, c: 7 } });
    wrapCells.push(XLSX.utils.encode_cell({ r: gPurposeRow, c: 1 }));

    const gGenreRow = aoa.length;
    aoa.push(["장르·내용", repInfo.genreContent || "", "", "", "", "", "", ""]);
    merges.push({ s: { r: gGenreRow, c: 1 }, e: { r: gGenreRow, c: 7 } });
    wrapCells.push(XLSX.utils.encode_cell({ r: gGenreRow, c: 1 }));

    const gAwareRow = aoa.length;
    aoa.push(["인지경로", repInfo.awarenessPath || "", "", "", "", "", "", ""]);
    merges.push({ s: { r: gAwareRow, c: 1 }, e: { r: gAwareRow, c: 7 } });
    wrapCells.push(XLSX.utils.encode_cell({ r: gAwareRow, c: 1 }));

    const gNotesRow = aoa.length;
    aoa.push(["특이사항", repInfo.specialNotes || "", "", "", "", "", "", ""]);
    merges.push({ s: { r: gNotesRow, c: 1 }, e: { r: gNotesRow, c: 7 } });
    wrapCells.push(XLSX.utils.encode_cell({ r: gNotesRow, c: 1 }));
  } else {
    const purposeRow = aoa.length;
    aoa.push(["이용 목적", repInfo.purpose || "", "", "", "", "", "", ""]);
    // B..H merge
    merges.push({ s: { r: purposeRow, c: 1 }, e: { r: purposeRow, c: 7 } });
    wrapCells.push(XLSX.utils.encode_cell({ r: purposeRow, c: 1 }));
  }

  const attRow = aoa.length;
  aoa.push(["첨부파일", atts.length ? atts.join("\n") : "(없음)", "", "", "", "", "", ""]);
  merges.push({ s: { r: attRow, c: 1 }, e: { r: attRow, c: 7 } });
  wrapCells.push(XLSX.utils.encode_cell({ r: attRow, c: 1 }));

  pushBlank();

  // Fee
  pushSection(`[이용 요금${usingApprovedBasis ? " (승인 회차 기준)" : ""}]`);
  aoa.push([
    "대관료",
    formatKRW(fee.rentalFeeKRW),
    "",
    "",
    "장비사용료",
    isGallery ? "해당없음" : formatKRW(fee.equipmentFeeKRW),
    "",
    "",
  ]);
  aoa.push(["총 금액", formatKRW(fee.totalFeeKRW), "", "", "할인", discountText, "", ""]);
  const discountRow = aoa.length;
  aoa.push(["최종금액", formatKRW(fee.finalFeeKRW), "", "", "할인 사유", discountReason, "", ""]);
  merges.push({ s: { r: discountRow, c: 5 }, e: { r: discountRow, c: 7 } });
  wrapCells.push(XLSX.utils.encode_cell({ r: discountRow, c: 5 }));
  pushBlank();

  // Consent / pledge
  pushSection("[동의/서약]");
  aoa.push(["개인정보 동의", repInfo.privacyAgree ? "동의" : "미동의", "", "", "서약 동의", repInfo.pledgeAgree ? "동의" : "미동의", "", ""]);
  aoa.push(["서약일", repInfo.pledgeDate || "", "", "", "서약자", repInfo.pledgeName || "", "", ""]);
  pushBlank();

  // Admin
  pushSection("[관리자 처리]");
  aoa.push(["처리자", repInfo.decidedBy || "", "", "", "내부 메모", repInfo.adminMemo || "", "", ""]);
  const rejectSummary = hasMultiple
    ? sessions
        .map((s, idx) => (s.status === "반려" ? `${idx + 1}회차: ${s.rejectReason || ""}` : ""))
        .filter((v) => v && v.trim().length > 0)
        .join("\n")
    : repInfo.rejectReason || "";
  const rejRow = aoa.length;
  aoa.push(["반려 사유", rejectSummary, "", "", "", "", "", ""]);
  merges.push({ s: { r: rejRow, c: 1 }, e: { r: rejRow, c: 7 } });
  wrapCells.push(XLSX.utils.encode_cell({ r: rejRow, c: 1 }));
  pushBlank();

  const footerRow = aoa.length;
  aoa.push(["※ 본 문서는 시스템에서 생성된 출력용 엑셀 신청서입니다. 필요 시 인쇄 또는 PDF로 저장하여 사용하세요.", "", "", "", "", "", "", ""]);
  mergeRow(footerRow);
  wrapCells.push(XLSX.utils.encode_cell({ r: footerRow, c: 0 }));

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = [
    { wch: 14 },
    { wch: 30 },
    { wch: 2 },
    { wch: 2 },
    { wch: 14 },
    { wch: 38 },
    { wch: 2 },
    { wch: 2 }
  ];

  // Apply merges
  ws["!merges"] = merges;

  // Duration minutes (sum for batch)
  const mins = isBatchId
    ? sessions.reduce((acc, s) => acc + Math.max(0, toMin(s.endTime) - toMin(s.startTime)), 0)
    : Math.max(0, toMin(repInfo.endTime) - toMin(repInfo.startTime));
  ws[XLSX.utils.encode_cell({ r: 5, c: 5 })] = { t: "n", v: mins };

  // Wrap hints
  for (const addr of wrapCells) {
    const cell = ws[addr];
    if (cell) (cell as any).s = { alignment: { wrapText: true, vertical: "top" } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeFileNamePart(representative.requestId));

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `rental_application_${safeFileNamePart(representative.requestId)}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename=\"${filename}\"`
    }
  });
}
