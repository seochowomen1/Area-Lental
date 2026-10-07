import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { getRoom } from "@/lib/space";
import type { RentalRequest } from "@/lib/types";
import { auditLog } from "@/lib/auditLog";
import { getClientIp } from "@/lib/rateLimit";
import { handleApiError } from "@/lib/apiResponse";
import { maskName } from "@/lib/mask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 수입 내역 엑셀 (행정사무감사 자료 양식) — 2026-10 행정감사 후속
 *
 * GET /api/admin/export/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD[&mask=true]
 *   (from/to 미지정 시 year=YYYY 또는 올해 1/1~12/31)
 *
 * - 승인된 건만 집계 (묶음은 승인 회차만, 1건 = 1행)
 * - 시트1 "대관(강의실·E-스튜디오)": 연도 · 대관일자 · 대관처 · 장소 · 금액 (+ 정가·할인·근거·유무료·신청번호·처리자)
 * - 시트2 "전시(우리동네 갤러리)": 같은 형식 (갤러리는 대관 시설이 아니므로 분리)
 * - 시트3 "월별 합계": 월 × 장소 금액·건수
 * - mask=true 이면 대관처를 감사 자료처럼 가림 처리 (기관명은 'OO어린이집'처럼, 개인은 성만)
 */

type Row = {
  key: string;
  isGallery: boolean;
  firstDate: string;
  year: string;
  dateText: string;
  org: string;
  place: string;
  baseKRW: number;
  discountKRW: number;
  discountReason: string;
  finalKRW: number;
  requestIds: string;
  decidedBy: string;
  decidedAt: string;
};

function ymdDot(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${y}.${Number(m)}.${Number(d)}.`;
}

/** 시작~끝 표기: 2025.11.7.~11.28.(4회) / 2026.2.19.~20.(2회) / 2027.1.3.~2027.1.5. */
function spanText(first: string, last: string, countLabel: string): string {
  if (first === last) return ymdDot(first);
  const [fy, fm] = first.split("-");
  const [ly, lm, ld] = last.split("-");
  const tail = fy !== ly ? ymdDot(last) : fm !== lm ? `${Number(lm)}.${Number(ld)}.` : `${Number(ld)}.`;
  return `${ymdDot(first)}~${tail}${countLabel ? `(${countLabel})` : ""}`;
}

/** 감사 자료 표기: 회차 날짜 목록 → 2025.11.7. / 2025.11.7.~11.28.(4회) */
function dateRangeText(dates: string[], isGallery: boolean): string {
  const sorted = Array.from(new Set(dates)).sort();
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return ymdDot(sorted[0]);
  return spanText(sorted[0], sorted[sorted.length - 1], isGallery ? `${sorted.length}일` : `${sorted.length}회`);
}

function maskOrg(name: string): string {
  const s = String(name ?? "").trim();
  if (!s) return "";
  const suffixes = ["어린이집", "주식회사", "협의체", "협회", "센터", "학원", "학교", "구청", "재단", "복지관", "법인"];
  for (const suf of suffixes) {
    if (s.endsWith(suf) && s.length > suf.length) return `OO${suf}`;
    if (s.includes(suf)) return `OO${suf}`;
  }
  // 개인 이름(2~4자 한글)이면 성만 남김
  if (/^[가-힣]{2,4}$/.test(s)) return maskName(s);
  return s.length > 2 ? `${s.slice(0, 1)}OO` : "OO";
}

function placeOf(r: RentalRequest): string {
  return r.roomName || getRoom(r.roomId)?.name || r.roomId;
}

export async function GET(req: Request) {
  const auth = assertAdminApiAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const yearParam = (url.searchParams.get("year") ?? "").trim();
    const thisYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
    const year = /^\d{4}$/.test(yearParam) ? yearParam : String(thisYear);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : `${year}-01-01`;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : `${year}-12-31`;
    const mask = url.searchParams.get("mask") === "true";

    const db = getDatabase();
    const all = await db.getAllRequests();

    // 묶음/단건 그룹핑
    const groups = new Map<string, RentalRequest[]>();
    for (const r of all) {
      const key = r.batchId ? `B:${r.batchId}` : `R:${r.requestId}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }

    const rows: Row[] = [];
    for (const [key, list] of groups.entries()) {
      const approved = list.filter((r) => r.status === "승인");
      if (approved.length === 0) continue;
      const first = approved[0];
      const isGallery = first.roomId === "gallery";

      // 이용(전시) 날짜 — 갤러리 준비일 제외, 1행형 갤러리는 기간 전개
      let dates: string[];
      if (isGallery && !first.batchId && first.startDate && first.endDate) {
        dates = [first.startDate, first.endDate];
      } else {
        dates = approved.filter((r) => !r.isPrepDay).map((r) => r.date);
        if (dates.length === 0) dates = approved.map((r) => r.date);
      }
      const sortedDates = dates.slice().sort();
      const firstDate = sortedDates[0];
      if (!firstDate || firstDate < from || firstDate > to) continue;

      const fee = first.batchId ? computeFeesForBundle(approved) : computeFeesForRequest(first);
      const dateText =
        isGallery && !first.batchId && first.startDate && first.endDate
          ? spanText(first.startDate, first.endDate, first.galleryExhibitionDayCount ? `${first.galleryExhibitionDayCount}일` : "")
          : dateRangeText(sortedDates, isGallery);

      const orgRaw = (first.orgName || "").trim() && first.orgName !== "개인" ? first.orgName : first.applicantName;
      const decided = approved.map((r) => r.decidedAt || "").sort().pop() ?? "";

      rows.push({
        key,
        isGallery,
        firstDate,
        year: firstDate.slice(0, 4),
        dateText,
        org: mask ? maskOrg(orgRaw) : orgRaw,
        place: placeOf(first),
        baseKRW: fee.totalFeeKRW,
        discountKRW: fee.discountAmountKRW,
        discountReason: fee.discountReason || "",
        finalKRW: fee.finalFeeKRW,
        requestIds: approved.map((r) => r.requestId).join(", "),
        decidedBy: approved.map((r) => r.decidedBy || "").find(Boolean) || "",
        decidedAt: decided ? decided.slice(0, 10) : "",
      });
    }

    rows.sort((a, b) => a.firstDate.localeCompare(b.firstDate));

    const header = ["연번", "연도", "대관일자", "대관처", "장소", "금액", "유료/무료", "정가", "할인액", "할인 근거", "신청번호", "처리자", "처리일"];
    const galleryHeader = ["연번", "연도", "전시기간", "신청처", "장소", "이용료", "유료/무료", "정가", "할인액", "할인 근거", "신청번호", "처리자", "처리일"];

    function toAoa(list: Row[], head: string[]) {
      const aoa: (string | number)[][] = [head];
      list.forEach((r, i) => {
        aoa.push([
          i + 1,
          Number(r.year),
          r.dateText,
          r.org,
          r.place,
          r.finalKRW,
          r.finalKRW > 0 ? "유료" : "무료",
          r.baseKRW,
          r.discountKRW,
          r.discountReason,
          r.requestIds,
          r.decidedBy,
          r.decidedAt,
        ]);
      });
      const total = list.reduce((acc, r) => acc + r.finalKRW, 0);
      aoa.push(["소계", "", `${list.length}건`, "", "", total, "", "", "", "", "", "", ""]);
      return aoa;
    }

    const rentalRows = rows.filter((r) => !r.isGallery);
    const galleryRows = rows.filter((r) => r.isGallery);

    const wb = XLSX.utils.book_new();
    const note = [`※ 기간 ${from} ~ ${to} · 승인 건 기준(묶음은 승인 회차만) · 금액 = 할인 후 청구액${mask ? " · 대관처 가림 처리" : ""}`];

    const ws1 = XLSX.utils.aoa_to_sheet([note, [], ...toAoa(rentalRows, header)]);
    ws1["!cols"] = [6, 7, 24, 24, 14, 12, 9, 12, 10, 24, 30, 10, 12].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws1, "대관(강의실·E-스튜디오)");

    const ws2 = XLSX.utils.aoa_to_sheet([note, [], ...toAoa(galleryRows, galleryHeader)]);
    ws2["!cols"] = [6, 7, 24, 24, 14, 12, 9, 12, 10, 24, 30, 10, 12].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws2, "전시(우리동네 갤러리)");

    // 월별 합계 (월 × 장소)
    const places = Array.from(new Set(rows.map((r) => r.place)));
    const months = Array.from(new Set(rows.map((r) => r.firstDate.slice(0, 7)))).sort();
    const monthAoa: (string | number)[][] = [["월", ...places.flatMap((p) => [`${p} 건수`, `${p} 금액`]), "합계 건수", "합계 금액"]];
    for (const ym of months) {
      const inMonth = rows.filter((r) => r.firstDate.startsWith(ym));
      const cells = places.flatMap((p) => {
        const sub = inMonth.filter((r) => r.place === p);
        return [sub.length, sub.reduce((a, r) => a + r.finalKRW, 0)];
      });
      monthAoa.push([ym, ...cells, inMonth.length, inMonth.reduce((a, r) => a + r.finalKRW, 0)]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(monthAoa);
    XLSX.utils.book_append_sheet(wb, ws3, "월별 합계");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    auditLog({
      action: "EXPORT_LIST",
      ip: getClientIp(req),
      details: { kind: "revenue", from, to, mask, rentalRows: rentalRows.length, galleryRows: galleryRows.length },
    });

    const fname = encodeURIComponent(`수입내역(${from}~${to})${mask ? "_가림" : ""}.xlsx`);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="revenue.xlsx"; filename*=UTF-8''${fname}`,
      },
    });
  } catch (e: unknown) {
    return handleApiError(e, "수입 내역 엑셀");
  }
}
