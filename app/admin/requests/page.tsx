import Link from "next/link";
import { getDatabase } from "@/lib/database";
import { statusLabel, REQUEST_ID_LABEL } from "@/lib/labels";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { getCategoryLabel, getRoomsByCategory, normalizeRoomCategory, type RoomCategory } from "@/lib/space";
import type { RentalRequest, RequestStatus } from "@/lib/types";
import RequestTable, { type TableRowData } from "./RequestTable";

// 관리자 목록은 승인/반려 등 상태 변경 후 즉시 반영되어야 하므로 캐시를 끕니다.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ViewMode = "group" | "items";

type GroupRow = {
  key: string;
  representative: RentalRequest;
  items: RentalRequest[];
  groupStatus: RequestStatus;
  displayStatus: string;
  isPartial: boolean;
  approvedCount: number;
  totalCount: number;
  createdAt: string;
};

function groupKey(r: RentalRequest) {
  return r.batchId && r.batchId.trim() ? `batch:${r.batchId}` : `single:${r.requestId}`;
}

function sortSessions(list: RentalRequest[]) {
  return list
    .slice()
    .sort((a, b) => {
      const aKey = `${a.date} ${a.startTime}`;
      const bKey = `${b.date} ${b.startTime}`;
      return aKey.localeCompare(bKey);
    });
}

function sortByBatchSeq(list: RentalRequest[]) {
  return list.slice().sort((a, b) => {
    const as = a.batchSeq ?? Number.MAX_SAFE_INTEGER;
    const bs = b.batchSeq ?? Number.MAX_SAFE_INTEGER;
    if (as !== bs) return as - bs;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.requestId.localeCompare(b.requestId);
  });
}

function pickRepresentative(list: RentalRequest[]) {
  const withSeq = list.filter((r) => typeof r.batchSeq === "number" && (r.batchSeq as number) > 0);
  const sorted = withSeq.length ? sortByBatchSeq(withSeq) : sortSessions(list);
  return sorted[0];
}

function formatPeriod(items: RentalRequest[]) {
  const s = sortSessions(items);
  const first = s[0];
  const last = s[s.length - 1];
  const isGallery = first.roomId === "gallery";
  const sameDate = first.date === last.date;
  const sameTime = s.every((r) => r.startTime === first.startTime && r.endTime === first.endTime);

  const datePart = isGallery && first.startDate && first.endDate
    ? `${first.startDate} ~ ${first.endDate}`
    : sameDate
      ? `${first.date}`
      : `${first.date} ~ ${last.date}`;

  const timePart = isGallery
    ? "일 단위(하루 전체)"
    : sameTime
      ? `${first.startTime}-${first.endTime}`
      : "시간 다양";

  // 갤러리 1행 형식: galleryExhibitionDayCount 사용, 다행 형식: 행 수
  const galleryDayCount = isGallery && !first.batchId && (first.galleryExhibitionDayCount ?? 0) > 0
    ? first.galleryExhibitionDayCount!
    : s.length;
  const countPart = isGallery
    ? (galleryDayCount > 0 ? `${galleryDayCount}일` : "")
    : s.length > 1 ? `${s.length}회` : "";

  return { datePart, timePart, countPart };
}

/* 카테고리 색상 매핑 */
function categoryAccent(cat: RoomCategory) {
  if (cat === "studio") return { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" };
  if (cat === "gallery") return { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
  return { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: { category?: string; roomId?: string; status?: string; q?: string; date?: string; view?: string };
}) {
  const category = normalizeRoomCategory(searchParams.category);
  const isGalleryCategory = category === "gallery";
  const roomsInCategory = getRoomsByCategory(category);
  const allowedRoomIds = new Set(roomsInCategory.map((r) => r.id));
  const roomLabel = getCategoryLabel(category);
  const accent = categoryAccent(category);

  let roomId = searchParams.roomId ?? "all";
  const status = searchParams.status ?? "all";
  const q = (searchParams.q ?? "").trim();
  const date = (searchParams.date ?? "").trim();
  const view = (searchParams.view === "items" ? "items" : "group") as ViewMode;

  // 카테고리 외 강의실 값이 들어오면 안전하게 전체로 되돌립니다.
  if (roomId !== "all" && !allowedRoomIds.has(roomId)) {
    roomId = "all";
  }

  const db = getDatabase();
  const all = await db.getAllRequests();

  const exportUrl = `/api/admin/export?category=${encodeURIComponent(category)}&roomId=${encodeURIComponent(
    roomId
  )}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}&date=${encodeURIComponent(date)}`;

  // 그룹(묶음) 구성
  const map = new Map<string, RentalRequest[]>();
  for (const r of all) {
    // 카테고리 필터(전체 선택 시)
    if (roomId === "all" && r.roomId !== "all" && !allowedRoomIds.has(r.roomId)) continue;
    const key = groupKey(r);
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }

  const groups: GroupRow[] = Array.from(map.entries()).map(([key, items]) => {
    const sorted = sortSessions(items);
    const representative = pickRepresentative(items);
    const bundle = analyzeBundle(items);
    const groupStatus = bundle.statusForFilter;
    const createdAt = representative.createdAt;
    return {
      key,
      representative,
      items: sorted,
      groupStatus,
      displayStatus: bundle.displayStatus,
      isPartial: bundle.isPartial,
      approvedCount: bundle.approvedCount,
      totalCount: bundle.totalCount,
      createdAt,
    };
  });

  const qLower = q.toLowerCase();

  const filteredGroups = groups
    .filter((g) => {
      if (roomId === "all") return true;
      return g.representative.roomId === roomId;
    })
    .filter((g) => (status === "all" ? true : g.groupStatus === (status as any)))
    .filter((g) => {
      if (!date) return true;
      // 갤러리 1행 형식: 날짜 범위 내 포함 여부 확인
      const rep = g.representative;
      if (rep.roomId === "gallery" && !rep.batchId && rep.startDate && rep.endDate) {
        return date >= rep.startDate && date <= rep.endDate;
      }
      return g.items.some((r) => r.date === date);
    })
    .filter((g) => {
      if (!qLower) return true;
      const hay = [
        g.representative.requestId,
        ...g.items.map((r) => r.requestId),
        g.representative.applicantName,
        g.representative.phone,
        g.representative.email,
        g.representative.orgName,
        g.representative.roomName,
        g.representative.purpose,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qLower);
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // view=items: 개별 행
  const filteredItems = view === "items"
    ? all
        .filter((r) => {
          if (roomId !== "all") return r.roomId === roomId;
          if (r.roomId === "all") return true;
          return allowedRoomIds.has(r.roomId);
        })
        .filter((r) => (status === "all" ? true : r.status === (status as any)))
        .filter((r) => (date ? r.date === date : true))
        .filter((r) => {
          if (!qLower) return true;
          const hay = `${r.requestId} ${r.applicantName} ${r.phone} ${r.email} ${r.orgName} ${r.roomName} ${r.purpose}`.toLowerCase();
          return hay.includes(qLower);
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    : [];

  const totalCount = view === "items" ? filteredItems.length : filteredGroups.length;

  // 테이블 행 데이터를 클라이언트 컴포넌트용으로 직렬화
  const DELETABLE_STATUSES = new Set(["반려", "취소"]);

  const tableRows: TableRowData[] = view === "group"
    ? filteredGroups.map((g) => {
        const rep = g.representative;
        const isBatch = g.key.startsWith("batch:");
        const hasMultiple = g.items.length > 1;
        const feeBasis = isBatch ? pickFeeBasisSessions(g.items) : [rep];
        const fee = isBatch ? computeFeesForBundle(feeBasis) : computeFeesForRequest(rep);
        const usingApprovedBasis = isBatch && g.approvedCount > 0 && g.approvedCount < g.totalCount;
        const p = formatPeriod(g.items);
        const isDeletable = g.items.every((r) => DELETABLE_STATUSES.has(r.status));

        return {
          key: g.key,
          requestIds: g.items.map((r) => r.requestId),
          isDeletable,
          primaryId: rep.requestId,
          idLink: `/admin/requests/${encodeURIComponent(rep.requestId)}?category=${encodeURIComponent(category)}`,
          extraCount: isBatch && hasMultiple ? g.items.length - 1 : 0,
          roomName: rep.roomName,
          dateDisplay: p.datePart,
          timeDisplay: p.timePart,
          countDisplay: p.countPart,
          applicantName: rep.applicantName,
          orgHeadcount: `${rep.orgName} / ${rep.headcount}명`,
          status: g.groupStatus,
          displayStatus: g.displayStatus,
          isPartial: g.isPartial,
          usingApprovedBasis,
          approvedCount: g.approvedCount,
          totalCount: g.totalCount,
          totalFeeKRW: fee.totalFeeKRW,
          discountRatePct: fee.discountRatePct,
          discountAmountKRW: fee.discountAmountKRW,
          finalFeeKRW: fee.finalFeeKRW,
        };
      })
    : filteredItems.map((r) => {
        const fee = computeFeesForRequest(r);
        const dateDisplay =
          r.roomId === "gallery"
            ? r.startDate && r.endDate && !r.batchId
              ? `${r.startDate} ~ ${r.endDate} (${r.galleryExhibitionDayCount ?? 0}일)`
              : `${r.date} (${r.isPrepDay ? "준비일" : "전시일"})`
            : `${r.date} ${r.startTime}-${r.endTime}`;

        return {
          key: r.requestId,
          requestIds: [r.requestId],
          isDeletable: DELETABLE_STATUSES.has(r.status),
          primaryId: r.requestId,
          idLink: `/admin/requests/${encodeURIComponent(r.requestId)}?category=${encodeURIComponent(category)}`,
          extraCount: 0,
          roomName: r.roomName,
          dateDisplay,
          timeDisplay: "",
          countDisplay: "",
          applicantName: r.applicantName,
          orgHeadcount: `${r.orgName} / ${r.headcount}명`,
          status: r.status,
          displayStatus: r.status,
          isPartial: false,
          usingApprovedBasis: false,
          approvedCount: 0,
          totalCount: 0,
          totalFeeKRW: fee.totalFeeKRW,
          discountRatePct: fee.discountRatePct,
          discountAmountKRW: fee.discountAmountKRW,
          finalFeeKRW: fee.finalFeeKRW,
        };
      });

  const makeUrl = (nextView: ViewMode) => {
    const params = new URLSearchParams();
    params.set("category", category);
    params.set("roomId", roomId);
    params.set("status", status);
    if (q) params.set("q", q);
    if (date) params.set("date", date);
    params.set("view", nextView);
    return `/admin/requests?${params.toString()}`;
  };

  const roomOptions = [{ id: "all", name: "전체" }].concat(
    roomsInCategory
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  return (
    <div className="space-y-4">
      {/* 카테고리 헤더 */}
      <div className={`rounded-xl border ${accent.border} ${accent.bg} p-4 shadow-sm`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-3 w-3 rounded-full ${accent.dot}`} />
          <h1 className={`text-lg font-bold ${accent.text}`}>{roomLabel} 대관 신청 목록</h1>
        </div>
        <p className="mt-1 ml-6 text-sm text-gray-600">
          {roomLabel} 대관 신청 현황을 조회하고 관리합니다.
        </p>
      </div>

      {/* 필터 영역 */}
      <div className="no-print rounded-xl bg-white p-4 shadow">
        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-5"
          action="/admin/requests"
          method="get"
        >
          <input type="hidden" name="category" value={category} />

          <div>
            <label className="text-xs font-semibold text-gray-700">
              {category === "gallery" ? "공간" : category === "studio" ? "공간" : "강의실"}
            </label>
            <select name="roomId" defaultValue={roomId} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[rgb(var(--brand-primary))] focus:ring-1 focus:ring-[rgb(var(--brand-primary))]">
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">상태</label>
            <select name="status" defaultValue={status} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[rgb(var(--brand-primary))] focus:ring-1 focus:ring-[rgb(var(--brand-primary))]">
              {["all", "접수", "승인", "반려", "취소"].map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "전체" : statusLabel(s as any)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">날짜</label>
            <input type="date" name="date" defaultValue={date} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[rgb(var(--brand-primary))] focus:ring-1 focus:ring-[rgb(var(--brand-primary))]" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">검색</label>
            <input
              name="q"
              defaultValue={q}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[rgb(var(--brand-primary))] focus:ring-1 focus:ring-[rgb(var(--brand-primary))]"
              placeholder="이름/연락처/단체/신청번호..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">보기</label>
            <select name="view" defaultValue={view} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[rgb(var(--brand-primary))] focus:ring-1 focus:ring-[rgb(var(--brand-primary))]">
              <option value="group">묶음 기준</option>
              <option value="items">개별 건</option>
            </select>
          </div>

          <div className="md:col-span-5 flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <button className="rounded-full bg-[rgb(var(--brand-primary))] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2">
                검색
              </button>
              <a
                className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2"
                href={exportUrl}
              >
                엑셀 다운로드
              </a>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm">
                <Link
                  href={makeUrl("group")}
                  className={
                    "px-4 py-2 text-sm transition focus-visible:outline-none " +
                    (view === "group" ? "bg-[rgb(var(--brand-primary))] text-white" : "text-gray-700 hover:bg-gray-50")
                  }
                >
                  그룹
                </Link>
                <Link
                  href={makeUrl("items")}
                  className={
                    "px-4 py-2 text-sm transition focus-visible:outline-none " +
                    (view === "items" ? "bg-[rgb(var(--brand-primary))] text-white" : "text-gray-700 hover:bg-gray-50")
                  }
                >
                  회차
                </Link>
              </div>
              <div className="text-sm text-gray-600">
                총 <b className="text-gray-900">{totalCount}</b>건
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* 테이블 (클라이언트 컴포넌트: 체크박스 + 선택 삭제) */}
      <RequestTable
        rows={tableRows}
        isGalleryCategory={isGalleryCategory}
        view={view}
        idLabel={REQUEST_ID_LABEL}
      />
    </div>
  );
}
