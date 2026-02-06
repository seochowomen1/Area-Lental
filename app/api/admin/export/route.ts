import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import * as XLSX from "xlsx";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { pickFeeBasisSessions } from "@/lib/bundle";
import { getRoomsByCategory, normalizeRoomCategory } from "@/lib/space";
import type { RentalRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function buildBatchMaps(all: RentalRequest[]) {
  const batchMap = new Map<string, RentalRequest[]>();
  for (const r of all) {
    if (!r.batchId) continue;
    const key = r.batchId;
    const arr = batchMap.get(key) ?? [];
    arr.push(r);
    batchMap.set(key, arr);
  }

  const feesMap = new Map<string, ReturnType<typeof computeFeesForBundle>>();
  for (const [batchId, list] of batchMap.entries()) {
    const sorted = list.slice().sort((a, b) => {
      const sa = a.batchSeq ?? 0;
      const sb = b.batchSeq ?? 0;
      if (sa !== sb) return sa - sb;
      return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
    });
    const basis = pickFeeBasisSessions(sorted);
    feesMap.set(batchId, computeFeesForBundle(basis));
  }

  return { batchMap, feesMap };
}

export async function GET(req: Request) {
  const auth = assertAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawCategory = url.searchParams.get("category");
  const category = normalizeRoomCategory(rawCategory);
  const allowedRoomIds = new Set(getRoomsByCategory(category).map((r) => r.id));
  const inCategory = (r: RentalRequest) => r.roomId === "all" || allowedRoomIds.has(r.roomId);
  const roomId = url.searchParams.get("roomId") ?? "all";
  const status = url.searchParams.get("status") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const date = (url.searchParams.get("date") ?? "").trim();

  const db = getDatabase();
  const all = await db.getAllRequests();
  const allCat = all.filter(inCategory);
  const { batchMap, feesMap } = buildBatchMaps(allCat);

  const filtered = allCat
    .filter((r) => (roomId === "all" ? true : r.roomId === roomId))
    .filter((r) => (status === "all" ? true : r.status === status))
    .filter((r) => (date ? r.date === date : true))
    .filter((r) => {
      if (!q) return true;
      const hay = `${r.requestId} ${r.applicantName} ${r.phone} ${r.email} ${r.orgName} ${r.roomName} ${r.purpose}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rows = filtered.map((r) => {
    const fee = computeFeesForRequest(r);
    const eq = (r as any).equipment ?? { laptop: false, projector: false, audio: false };
    const atts = Array.isArray((r as any).attachments) ? (r as any).attachments : [];
    const isGallery = r.roomId === "gallery";

    const isBatch = !!r.batchId;
    const bundleList = isBatch ? (batchMap.get(r.batchId!) ?? [r]) : null;

    const bundleFee = isBatch
      ? (feesMap.get(r.batchId!) ?? computeFeesForBundle(pickFeeBasisSessions(bundleList!)))
      : fee;

    const bundleSize = isBatch ? (bundleList?.length ?? r.batchSize ?? 1) : 1;

    return {
      // 기본
      requestId: r.requestId,
      status: r.status,
      room: r.roomName,
      date: r.date,
      time: isGallery ? "하루 전체" : `${r.startTime}-${r.endTime}`,
      applicantName: r.applicantName,
      phone: r.phone,
      email: r.email,
      orgName: r.orgName,
      headcount: r.headcount,
      equipment: isGallery
        ? "해당없음"
        : `노트북:${eq.laptop ? "O" : "X"}, 빔:${eq.projector ? "O" : "X"}, 음향:${eq.audio ? "O" : "X"}`,
      purpose: r.purpose,
      attachments: atts.join(" | "),
      createdAt: r.createdAt,

      // 회차/묶음
      batchId: r.batchId ?? "",
      batchSeq: r.batchSeq ?? "",
      batchSize: bundleSize,

      // 회차 금액(할인 미적용)
      rentalFeeKRW: fee.rentalFeeKRW,
      equipmentFeeKRW: fee.equipmentFeeKRW,
      totalFeeKRW: fee.totalFeeKRW,

      // 묶음 합산 금액(할인 적용)
      bundleTotalFeeKRW: bundleFee.totalFeeKRW,
      bundleDiscountRatePct: bundleFee.discountRatePct,
      bundleDiscountAmountKRW: bundleFee.discountAmountKRW,
      bundleDiscountReason: bundleFee.discountReason,
      bundleFinalFeeKRW: bundleFee.finalFeeKRW
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "requests");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="rental_requests.xlsx"'
    }
  });
}
