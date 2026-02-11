import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database";
import { assertAdminApiAuth } from "@/lib/adminApiAuth";
import { ROOMS_BY_ID } from "@/lib/space";
import { computeFeesForRequest, computeFeesForBundle } from "@/lib/pricing";
import type { RentalRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CategoryId = "lecture" | "studio" | "gallery";

type CategoryStats = {
  uniqueApplicants: number;
  totalDays: number;
  totalRevenue: number;
};

type MonthStats = {
  month: string; // "YYYY-MM"
  lecture: CategoryStats;
  studio: CategoryStats;
  gallery: CategoryStats;
  total: CategoryStats;
};

function groupKey(r: RentalRequest) {
  return r.batchId && r.batchId.trim() ? `batch:${r.batchId}` : `single:${r.requestId}`;
}

function getMonth(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function emptyStats(): CategoryStats {
  return { uniqueApplicants: 0, totalDays: 0, totalRevenue: 0 };
}

export async function GET(req: Request) {
  const auth = assertAdminApiAuth();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year") ?? new Date().getFullYear().toString();

    const db = getDatabase();
    const allRequests = await db.getAllRequests();

    // 승인된 건만 통계 대상
    const approved = allRequests.filter((r) => r.status === "승인");

    // 묶음별 그룹핑
    const groups = new Map<string, RentalRequest[]>();
    for (const r of approved) {
      const key = groupKey(r);
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }

    // 월별 통계 수집
    const monthMap = new Map<string, { lecture: Map<string, Set<string>>; studio: Map<string, Set<string>>; gallery: Map<string, Set<string>>; lectureDays: number; studioDays: number; galleryDays: number; lectureRevenue: number; studioRevenue: number; galleryRevenue: number }>();

    function ensureMonth(m: string) {
      if (!monthMap.has(m)) {
        monthMap.set(m, {
          lecture: new Map(), studio: new Map(), gallery: new Map(),
          lectureDays: 0, studioDays: 0, galleryDays: 0,
          lectureRevenue: 0, studioRevenue: 0, galleryRevenue: 0,
        });
      }
      return monthMap.get(m)!;
    }

    for (const [key, items] of groups.entries()) {
      const rep = items[0];
      const roomMeta = (ROOMS_BY_ID as Record<string, { category?: string }>)[rep.roomId];
      const cat = (roomMeta?.category ?? "lecture") as CategoryId;

      // 갤러리 1행 형식
      if (cat === "gallery" && !rep.batchId && rep.startDate && rep.endDate) {
        const month = getMonth(rep.startDate);
        if (!month.startsWith(year)) continue;
        const data = ensureMonth(month);
        const email = (rep.email ?? "").toLowerCase().trim();

        // 실인원
        if (!data.gallery.has(month)) data.gallery.set(month, new Set());
        if (email) data.gallery.get(month)!.add(email);

        // 연인원 (전시일수)
        const days = rep.galleryExhibitionDayCount ?? 1;
        data.galleryDays += days;

        // 수입
        const fee = computeFeesForRequest(rep);
        data.galleryRevenue += fee.finalFeeKRW;
        continue;
      }

      // 묶음(강의실/E-스튜디오) 또는 레거시 갤러리
      const isBatch = items.length > 1;

      // 수입 계산 (묶음은 bundle, 단건은 request)
      let revenue = 0;
      if (isBatch) {
        const fee = computeFeesForBundle(items);
        revenue = fee.finalFeeKRW;
      } else {
        const fee = computeFeesForRequest(rep);
        revenue = fee.finalFeeKRW;
      }

      // 묶음의 경우 각 회차 날짜별로 월을 분배
      // 수입은 대표 날짜의 월에 귀속
      const repMonth = getMonth(rep.date);
      if (!repMonth.startsWith(year)) continue;
      const data = ensureMonth(repMonth);
      const email = (rep.email ?? "").toLowerCase().trim();

      const catMap = data[cat];
      if (!catMap.has(repMonth)) catMap.set(repMonth, new Set());
      if (email) catMap.get(repMonth)!.add(email);

      // 연인원 (대관 일수 = 회차 수)
      const days = items.length;
      if (cat === "lecture") {
        data.lectureDays += days;
        data.lectureRevenue += revenue;
      } else if (cat === "studio") {
        data.studioDays += days;
        data.studioRevenue += revenue;
      } else {
        data.galleryDays += days;
        data.galleryRevenue += revenue;
      }
    }

    // 결과 정리
    const months: MonthStats[] = [];
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, "0")}`;
      const data = monthMap.get(month);

      const lectureApplicants = new Set<string>();
      const studioApplicants = new Set<string>();
      const galleryApplicants = new Set<string>();

      if (data) {
        for (const [, emailSet] of data.lecture) emailSet.forEach((e) => lectureApplicants.add(e));
        for (const [, emailSet] of data.studio) emailSet.forEach((e) => studioApplicants.add(e));
        for (const [, emailSet] of data.gallery) emailSet.forEach((e) => galleryApplicants.add(e));
      }

      const lecture: CategoryStats = {
        uniqueApplicants: lectureApplicants.size,
        totalDays: data?.lectureDays ?? 0,
        totalRevenue: data?.lectureRevenue ?? 0,
      };
      const studio: CategoryStats = {
        uniqueApplicants: studioApplicants.size,
        totalDays: data?.studioDays ?? 0,
        totalRevenue: data?.studioRevenue ?? 0,
      };
      const gallery: CategoryStats = {
        uniqueApplicants: galleryApplicants.size,
        totalDays: data?.galleryDays ?? 0,
        totalRevenue: data?.galleryRevenue ?? 0,
      };

      const allEmails = new Set<string>();
      lectureApplicants.forEach((e) => allEmails.add(e));
      studioApplicants.forEach((e) => allEmails.add(e));
      galleryApplicants.forEach((e) => allEmails.add(e));

      months.push({
        month,
        lecture,
        studio,
        gallery,
        total: {
          uniqueApplicants: allEmails.size,
          totalDays: lecture.totalDays + studio.totalDays + gallery.totalDays,
          totalRevenue: lecture.totalRevenue + studio.totalRevenue + gallery.totalRevenue,
        },
      });
    }

    return NextResponse.json({ ok: true, year, months });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "통계 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
