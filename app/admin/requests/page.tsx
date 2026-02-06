import Link from "next/link";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/database";
import { statusLabel, REQUEST_ID_LABEL } from "@/lib/labels";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { computeFeesForBundle, computeFeesForRequest, formatKRW } from "@/lib/pricing";
import { getCategoryLabel, getRoomsByCategory, normalizeRoomCategory } from "@/lib/space";
import type { RentalRequest, RequestStatus } from "@/lib/types";

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

  const countPart = s.length > 1
    ? `${s.length}${isGallery ? "일" : "회"}`
    : "";

  return { datePart, timePart, countPart };
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
    .filter((g) => (date ? g.items.some((r) => r.date === date) : true))
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
      <div className="no-print rounded-xl bg-white p-4 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <form
            className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-5"
            action="/admin/requests"
            method="get"
          >
            <input type="hidden" name="category" value={category} />

            <div>
              <label className="text-sm font-medium">{roomLabel}</label>
              <select name="roomId" defaultValue={roomId} className="mt-1 w-full rounded-xl border px-3 py-2">
                {roomOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">상태</label>
              <select name="status" defaultValue={status} className="mt-1 w-full rounded-xl border px-3 py-2">
                {["all", "접수", "검토중", "승인", "반려", "취소", "완료"].map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "전체" : statusLabel(s as any)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">날짜(선택)</label>
              <input type="date" name="date" defaultValue={date} className="mt-1 w-full rounded-xl border px-3 py-2" />
            </div>

            <div>
              <label className="text-sm font-medium">검색</label>
              <input
                name="q"
                defaultValue={q}
                className="mt-1 w-full rounded-xl border px-3 py-2"
                placeholder="이름/연락처/단체/신청번호..."
              />
            </div>

            <div>
              <label className="text-sm font-medium">보기</label>
              <select name="view" defaultValue={view} className="mt-1 w-full rounded-xl border px-3 py-2">
                <option value="group">묶음 기준</option>
                <option value="items">개별 건</option>
              </select>
            </div>

            <div className="md:col-span-5 flex gap-2">
              <button className="rounded-full bg-[rgb(var(--brand-primary))] px-4 py-2 text-white shadow-sm transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2 disabled:opacity-60">
                검색
              </button>
              <a
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2"
                href={exportUrl}
              >
                엑셀 다운로드
              </a>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm">
              <Link
                href={makeUrl("group")}
                className={
                  "px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2 " +
                  (view === "group" ? "bg-[rgb(var(--brand-primary))] text-white" : "text-gray-700 hover:bg-gray-50")
                }
              >
                그룹 보기
              </Link>
              <Link
                href={makeUrl("items")}
                className={
                  "px-4 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-primary))] focus-visible:ring-offset-2 " +
                  (view === "items" ? "bg-[rgb(var(--brand-primary))] text-white" : "text-gray-700 hover:bg-gray-50")
                }
              >
                회차 보기
              </Link>
            </div>
            <div className="text-sm text-gray-600">
              총 <b className="text-gray-900">{totalCount}</b>건
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">{REQUEST_ID_LABEL}</th>
                <th className="p-3">{roomLabel}</th>
                <th className="p-3">일시</th>
                <th className="p-3">신청자</th>
                <th className="p-3">단체/인원</th>
                <th className="p-3">상태</th>
                <th className="p-3">총액</th>
                {!isGalleryCategory && <th className="p-3">할인</th>}
                <th className="p-3">최종금액</th>
              </tr>
            </thead>
            <tbody>
              {view === "items" &&
                filteredItems.map((r) => {
                  const fee = computeFeesForRequest(r);
                  return (
                    <tr key={r.requestId} className="border-t hover:bg-gray-50">
                      <td className="p-3">
                        <Link
                          className="text-[rgb(var(--brand-primary))] underline"
                          href={`/admin/requests/${encodeURIComponent(r.requestId)}?category=${encodeURIComponent(category)}`}
                        >
                          {r.requestId}
                        </Link>
                      </td>
                      <td className="p-3">{r.roomName}</td>
                      <td className="p-3">
                        {r.roomId === "gallery"
                          ? `${r.date} (${r.isPrepDay ? "준비일" : "전시일"})`
                          : `${r.date} ${r.startTime}-${r.endTime}`}
                      </td>
                      <td className="p-3">{r.applicantName}</td>
                      <td className="p-3">
                        {r.orgName} / {r.headcount}명
                      </td>
                      <td className="p-3">{statusLabel(r.status)}</td>
                      <td className="p-3 whitespace-nowrap">{formatKRW(fee.totalFeeKRW)}</td>
                      {!isGalleryCategory && (
                        <td className="p-3 whitespace-nowrap">
                          {fee.discountAmountKRW > 0
                            ? `${fee.discountRatePct.toFixed(2)}% (${formatKRW(fee.discountAmountKRW)})`
                            : "-"}
                        </td>
                      )}
                      <td className="p-3 whitespace-nowrap font-medium">{formatKRW(fee.finalFeeKRW)}</td>
                    </tr>
                  );
                })}

              {view === "group" &&
                filteredGroups.map((g) => {
                  const rep = g.representative;
                  const isBatch = g.key.startsWith("batch:");
                  const hasMultiple = g.items.length > 1;
                  const feeBasis = isBatch ? pickFeeBasisSessions(g.items) : [rep];
                  const fee = isBatch ? computeFeesForBundle(feeBasis) : computeFeesForRequest(rep);
                  const usingApprovedBasis = isBatch && g.approvedCount > 0 && g.approvedCount < g.totalCount;
                  const p = formatPeriod(g.items);

                  return (
                    <tr key={g.key} className="border-t hover:bg-gray-50">
                      <td className="p-3">
                        <Link
                          className="text-[rgb(var(--brand-primary))] underline"
                          href={`/admin/requests/${encodeURIComponent(rep.requestId)}?category=${encodeURIComponent(category)}`}
                        >
                          {rep.requestId}
                        </Link>
                        {isBatch && hasMultiple && <div className="mt-1 text-xs text-gray-600">외 {g.items.length - 1}건</div>}
                      </td>
                      <td className="p-3">{rep.roomName}</td>
                      <td className="p-3">
                        <div>
                          {p.datePart} {p.countPart && <span className="ml-1 text-xs text-gray-600">({p.countPart})</span>}
                        </div>
                        <div className="text-xs text-gray-600">{p.timePart}</div>
                      </td>
                      <td className="p-3">{rep.applicantName}</td>
                      <td className="p-3">
                        {rep.orgName} / {rep.headcount}명
                      </td>
                      <td className="p-3">
                        <div>{statusLabel(g.groupStatus)}</div>
                        {g.displayStatus === "부분처리" && (
                          <div className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            부분처리
                          </div>
                        )}
                        {usingApprovedBasis && <div className="mt-1 text-xs text-gray-600">승인 {g.approvedCount}/{g.totalCount}회</div>}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {formatKRW(fee.totalFeeKRW)}
                        {usingApprovedBasis && <div className="mt-0.5 text-xs text-gray-600">(승인 회차 기준)</div>}
                      </td>
                      {!isGalleryCategory && (
                        <td className="p-3 whitespace-nowrap">
                          {fee.discountAmountKRW > 0
                            ? `${fee.discountRatePct.toFixed(2)}% (${formatKRW(fee.discountAmountKRW)})`
                            : "-"}
                        </td>
                      )}
                      <td className="p-3 whitespace-nowrap font-medium">{formatKRW(fee.finalFeeKRW)}</td>
                    </tr>
                  );
                })}

              {!totalCount && (
                <tr>
                  <td colSpan={isGalleryCategory ? 8 : 9} className="p-6 text-center text-gray-500">
                    조건에 맞는 신청이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
