import CalendarClient from "./CalendarClient";
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-5 shadow">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">예약 캘린더 · {getCategoryLabel(category)}</h1>
            <p className="mt-1 text-sm text-gray-600">
              신청/승인 현황을 날짜별로 확인할 수 있습니다. (정규수업·차단시간은 옵션에서 표시/숨김)
            </p>
          </div>
        </div>
      </div>

      <CalendarClient initialYmd={today} category={category} />
    </div>
  );
}
