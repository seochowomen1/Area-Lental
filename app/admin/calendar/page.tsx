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

  const categoryLabel = getCategoryLabel(category);
  const accent = category === "studio"
    ? { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" }
    : category === "gallery"
      ? { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" }
      : { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border ${accent.border} ${accent.bg} p-4 shadow-sm`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-3 w-3 rounded-full ${accent.dot}`} />
          <h1 className={`text-lg font-bold ${accent.text}`}>{categoryLabel} 예약 캘린더</h1>
        </div>
        <p className="mt-1 ml-6 text-sm text-gray-600">
          {categoryLabel} 신청/승인 현황을 날짜별로 확인합니다. (정규수업·차단시간은 옵션에서 표시/숨김)
        </p>
      </div>

      <CalendarClient initialYmd={today} category={category} />
    </div>
  );
}
