import { categoryAccent } from "@/lib/requestUtils";
import CalendarClient from "./CalendarClient";
import { AdminSpaceSwitch } from "@/components/AdminNavTabs";
import { todayYmdSeoul } from "@/lib/datetime";
import { assertAdminAuth } from "@/lib/adminAuth";
import { getCategoryLabel, normalizeRoomCategory } from "@/lib/space";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  await assertAdminAuth();

  const category = normalizeRoomCategory(searchParams?.category);

  const today = todayYmdSeoul();

  const categoryLabel = getCategoryLabel(category);
  const accent = categoryAccent(category);

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border ${accent.border} ${accent.bg} p-4`}>
        <div className="flex items-center gap-3">
          <span className={`inline-block h-6 w-1 shrink-0 rounded-full ${accent.bar}`} aria-hidden="true" />
          <h1 className={`text-xl font-bold ${accent.text}`}>{categoryLabel} 예약 캘린더</h1>
        </div>
        <p className="mt-1 ml-4 text-sm text-slate-600">
          {categoryLabel} 신청/승인 현황을 날짜별로 확인합니다. (정규수업·차단시간은 옵션에서 표시/숨김)
        </p>
      </div>

      {/* audit-fix-3 3-2: 헤더 공간 탭은 목록으로 가므로 캘린더의 공간은 화면 안에서 바꾼다 */}
      <AdminSpaceSwitch basePath="/admin/calendar" current={category} />

      <CalendarClient initialYmd={today} category={category} />
    </div>
  );
}
