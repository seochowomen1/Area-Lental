import Link from "next/link";
import { getDatabase } from "@/lib/database";
import { statusLabel, REQUEST_ID_LABEL } from "@/lib/labels";
import { analyzeBundle, pickFeeBasisSessions } from "@/lib/bundle";
import { computeFeesForBundle, computeFeesForRequest } from "@/lib/pricing";
import { getCategoryLabel, getRoomsByCategory, normalizeRoomCategory, type RoomCategory } from "@/lib/space";
import type { RentalRequest, RequestStatus } from "@/lib/types";
import { sortSessions, categoryAccent } from "@/lib/requestUtils";
import RequestTable, { type TableRowData } from "./RequestTable";
import ExcelDownloadButton from "@/components/admin/ExcelDownloadButton";
import PaymentStatusChips, { type PaymentFocus } from "@/components/admin/PaymentStatusChips";
import { DELETION_BLOCK_LABEL, deletionBlockReason, derivePaymentView, paymentListChip, summarizePaymentChips, type PaymentView } from "@/lib/payment";
import { todayYmdSeoul } from "@/lib/datetime";
import { assertAdminAuth } from "@/lib/adminAuth";

const PAYMENT_FOCUS_VALUES: readonly PaymentFocus[] = ["payment-waiting", "close-needed", "auto-cancelled"];

/** 결제 현황 칩 클릭 시 목록 조건 (01_spec ②-(라)) */
function matchesPaymentFocus(view: PaymentView, focus: PaymentFocus): boolean {
  if (focus === "payment-waiting") return (view.paymentState === "waiting" || view.paymentState === "dueTomorrow") && !!view.paymentLinkUrl;
  if (focus === "close-needed") return view.closeNeeded;
  return view.paymentState === "autoCancelled" && !view.homepageClosedAt;
}

const FILTER_CONTROL =
  "mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-sky/40 sm:text-[15px]";
/** 툴바 버튼 — 글자 한 줄 고정(whitespace-nowrap shrink-0) · 높이 44 (01_spec ②-2-4) */
const TOOLBAR_PRIMARY =
  "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-brand px-5 text-[15px] font-semibold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2";
const TOOLBAR_SECONDARY =
  "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 text-[15px] font-semibold text-ink transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2";

// 관리자 목록은 승인/반려 등 상태 변경 후 즉시 반영되어야 하므로 캐시를 끕니다.
export const dynamic = "force-dynamic";

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
  paymentView: PaymentView;
};

function groupKey(r: RentalRequest) {
  return r.batchId && r.batchId.trim() ? `batch:${r.batchId}` : `single:${r.requestId}`;
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

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: { category?: string; roomId?: string; status?: string; q?: string; date?: string; view?: string; focus?: string };
}) {
  await assertAdminAuth();
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
  const focus: PaymentFocus | null = PAYMENT_FOCUS_VALUES.includes(searchParams.focus as PaymentFocus) ? (searchParams.focus as PaymentFocus) : null;
  const todayYmd = todayYmdSeoul();

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
      paymentView: derivePaymentView(sorted, todayYmd),
    };
  });

  // 결제 현황 칩 — 이 카테고리 건만 집계 (02_ui §2)
  const categoryRequests = Array.from(map.values()).flat();
  const chipSummary = summarizePaymentChips(categoryRequests, todayYmd);
  const listHref = `/admin/requests?category=${encodeURIComponent(category)}`;

  const qLower = q.toLowerCase();

  const filteredGroups = groups
    .filter((g) => {
      // 단일 패스: 공간 → 상태 → 날짜 → 검색 필터 결합
      if (roomId !== "all" && g.representative.roomId !== roomId) return false;
      if (status !== "all" && g.groupStatus !== status) return false;
      if (focus && !matchesPaymentFocus(g.paymentView, focus)) return false;
      if (date) {
        const rep = g.representative;
        if (rep.roomId === "gallery" && !rep.batchId && rep.startDate && rep.endDate) {
          if (date < rep.startDate || date > rep.endDate) return false;
        } else if (!g.items.some((r) => r.date === date)) {
          return false;
        }
      }
      if (qLower) {
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
        if (!hay.includes(qLower)) return false;
      }
      return true;
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
        .filter((r) => (status === "all" ? true : r.status === status))
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
  /** [8] 반려·취소 건 중 결제·환불 기록 또는 홈페이지 마감 전이면 삭제 잠금(서버 DELETE도 같은 함수로 409) */
  const blockLabelOf = (items: RentalRequest[]): string | null => {
    if (!items.every((r) => DELETABLE_STATUSES.has(r.status))) return null;
    for (const r of items) {
      const reason = deletionBlockReason(r);
      if (reason) return DELETION_BLOCK_LABEL[reason];
    }
    return null;
  };

  const tableRows: TableRowData[] = view === "group"
    ? filteredGroups.map((g) => {
        const rep = g.representative;
        const isBatch = g.key.startsWith("batch:");
        const hasMultiple = g.items.length > 1;
        const feeBasis = isBatch ? pickFeeBasisSessions(g.items) : [rep];
        const fee = isBatch ? computeFeesForBundle(feeBasis) : computeFeesForRequest(rep);
        const usingApprovedBasis = isBatch && g.approvedCount > 0 && g.approvedCount < g.totalCount;
        const p = formatPeriod(g.items);
        const deleteBlockLabel = blockLabelOf(g.items);
        const isDeletable = g.items.every((r) => DELETABLE_STATUSES.has(r.status)) && !deleteBlockLabel;

        return {
          key: g.key,
          requestIds: g.items.map((r) => r.requestId),
          isDeletable,
          deleteBlockLabel,
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
          paymentChip: paymentListChip(g.paymentView),
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
          isDeletable: DELETABLE_STATUSES.has(r.status) && !blockLabelOf([r]),
          deleteBlockLabel: blockLabelOf([r]),
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
          // 회차 보기에서는 묶음 전체를 다시 읽어 결제 칩을 계산
          paymentChip: paymentListChip(derivePaymentView(r.batchId ? all.filter((x) => x.batchId === r.batchId) : [r], todayYmd)),
        };
      });

  const makeUrl = (nextView: ViewMode) => {
    const params = new URLSearchParams();
    params.set("category", category);
    params.set("roomId", roomId);
    params.set("status", status);
    if (q) params.set("q", q);
    if (date) params.set("date", date);
    if (focus) params.set("focus", focus);
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
      <div className={`rounded-xl border ${accent.border} ${accent.bg} p-4`}>
        <div className="flex items-center gap-3">
          <span className={`inline-block h-6 w-1 shrink-0 rounded-full ${accent.bar}`} aria-hidden="true" />
          <h1 className={`text-xl font-bold ${accent.text}`}>{roomLabel} {isGalleryCategory ? "전시 신청" : "대관 신청"} 목록</h1>
        </div>
        <p className="mt-1 ml-4 text-sm text-slate-600">
          {roomLabel} {isGalleryCategory ? "전시 신청" : "대관 신청"} 현황을 조회하고 관리합니다.
        </p>
      </div>

      {/* 결제 현황 칩 (payment-link-record) — 전부 0건이면 숨김 */}
      <PaymentStatusChips summary={chipSummary} listHref={listHref} activeFocus={focus} />

      {/* 필터 영역 — 보기(묶음/회차)는 아래 토글 한 벌만(01_spec ⑧ Q10) */}
      <div className="no-print rounded-xl border border-line bg-white p-4">
        <form
          className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-[1fr_1fr_1fr_2fr]"
          action="/admin/requests"
          method="get"
        >
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="view" value={view} />
          {focus && <input type="hidden" name="focus" value={focus} />}

          <div>
            <label htmlFor="f-room" className="text-sm font-semibold text-ink-2">
              {category === "gallery" ? "공간" : category === "studio" ? "공간" : "강의실"}
            </label>
            <select id="f-room" name="roomId" defaultValue={roomId} className={FILTER_CONTROL}>
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-status" className="text-sm font-semibold text-ink-2">상태</label>
            <select id="f-status" name="status" defaultValue={status} className={FILTER_CONTROL}>
              {["all", "접수", "승인", "반려", "취소"].map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "전체" : statusLabel(s as RequestStatus)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-date" className="text-sm font-semibold text-ink-2">날짜</label>
            <input id="f-date" type="date" name="date" defaultValue={date} className={FILTER_CONTROL} />
          </div>

          <div>
            <label htmlFor="f-q" className="text-sm font-semibold text-ink-2">검색</label>
            <input
              id="f-q"
              name="q"
              defaultValue={q}
              className={FILTER_CONTROL}
              placeholder="이름/연락처/단체/신청번호..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 min-[900px]:col-span-4">
            <button type="submit" className={TOOLBAR_PRIMARY}>
              검색
            </button>
            <ExcelDownloadButton href={exportUrl} label="엑셀 받기" className={TOOLBAR_SECONDARY} />
            {isGalleryCategory && (
              <Link
                href={`/admin/requests/new?category=${encodeURIComponent(category)}`}
                className={TOOLBAR_SECONDARY}
                title="방문·이메일·팩스로 받은 종이 신청서를 대신 등록합니다"
              >
                + 서면 신청 등록
              </Link>
            )}
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-300 bg-white" role="group" aria-label="보기">
            <Link
              href={makeUrl("group")}
              aria-current={view === "group" ? "true" : undefined}
              className={
                "inline-flex min-h-[44px] items-center whitespace-nowrap px-4 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky " +
                (view === "group" ? "bg-brand text-white" : "text-ink hover:bg-slate-50")
              }
            >
              묶음
            </Link>
            <Link
              href={makeUrl("items")}
              aria-current={view === "items" ? "true" : undefined}
              className={
                "inline-flex min-h-[44px] items-center whitespace-nowrap border-l border-slate-300 px-4 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky " +
                (view === "items" ? "bg-brand text-white" : "text-ink hover:bg-slate-50")
              }
            >
              회차
            </Link>
          </div>
          <div className="text-base text-ink-2">
            총 <b className="tabular-nums text-ink">{totalCount}</b>건
          </div>
        </div>
      </div>

      {/* 테이블 (클라이언트 컴포넌트: 체크박스 + 선택 삭제) */}
      <RequestTable
        rows={tableRows}
        isGalleryCategory={isGalleryCategory}
        view={view}
        idLabel={REQUEST_ID_LABEL}
        resetHref={`/admin/requests?category=${encodeURIComponent(category)}`}
      />
    </div>
  );
}
