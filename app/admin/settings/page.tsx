import Notice from "@/components/ui/Notice";
import Card from "@/components/ui/Card";

import SettingsClient from "@/app/admin/settings/SettingsClient";

import { ROOMS, getCategoryLabel, getRoomsByCategory, normalizeRoomCategory, type RoomCategory } from "@/lib/space";
import { getDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DAY_OPTIONS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" }
];

function categoryAccent(cat: RoomCategory) {
  if (cat === "studio") return { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" };
  if (cat === "gallery") return { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
  return { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  const category = normalizeRoomCategory(searchParams?.category);
  const categoryLabel = getCategoryLabel(category);
  const accent = categoryAccent(category);

  const db = getDatabase();
  const categoryRooms = getRoomsByCategory(category).map((r) => ({ id: r.id, name: r.name }));
  const allRooms = categoryRooms.length > 1
    ? [{ id: "all", name: "전체" }, ...categoryRooms]
    : categoryRooms;
  const [schedules, blocks] = await Promise.all([db.getClassSchedules(), db.getBlocks()]);

  const feeGroups = (() => {
    const map = new Map<number, string[]>();
    for (const r of ROOMS) {
      const key = r.feeKRW ?? 0;
      const list = map.get(key) ?? [];
      list.push(r.name);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b - a);
  })();

  return (
    <div className="mx-auto max-w-5xl pb-16 pt-2">
      {/* 카테고리 헤더 */}
      <div className={`rounded-xl border ${accent.border} ${accent.bg} p-4 shadow-sm mb-6`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-3 w-3 rounded-full ${accent.dot}`} />
          <h1 className={`text-lg font-bold ${accent.text}`}>{categoryLabel} 운영 설정</h1>
        </div>
        <p className="mt-1 ml-6 text-sm text-gray-600">
          {category === "gallery"
            ? "내부 대관 일정을 관리합니다. 등록된 기간에는 외부 대관 신청이 불가능합니다."
            : "정규 수업시간 및 내부 대관 일정을 관리합니다. 등록된 시간에는 대관 신청이 불가능합니다."}
        </p>
      </div>

      <Notice title="안내" variant="info">
        <ul className="list-disc pl-5">
          {category === "gallery" ? (
            <>
              <li>내부(강사·수강생) 대관 일정을 등록하면 해당 기간 동안 외부 대관 신청이 불가능합니다.</li>
              <li>갤러리 차단은 일 단위(시작일~종료일)로 등록됩니다.</li>
              <li>등록 기간이 기존 일정과 겹치는 경우 저장되지 않으며, 화면에 안내가 표시됩니다.</li>
            </>
          ) : (
            <>
              <li>정규 수업시간/내부 대관 일정을 등록하면 해당 시간에는 대관 신청이 불가능합니다.</li>
              <li>시간은 운영시간 내에서만 선택되며, 30분 단위(00/30)로만 설정할 수 있습니다.</li>
              <li>등록 시간이 기존 데이터와 겹치는 경우 저장되지 않으며, 화면에 안내가 표시됩니다.</li>
            </>
          )}
        </ul>
      </Notice>

      <div className="mt-6">
        <Card pad="md">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">대관료 안내(시간당)</div>
            <div className="text-xs text-slate-500">※ 기자재 사용료 별도</div>
          </div>

          <div className="mt-4 grid gap-2">
            {feeGroups.map(([fee, names]) => (
              <div key={fee} className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  {fee > 0 ? `${fee.toLocaleString()}원` : "별도 협의"}
                </div>
                <div className="text-sm text-slate-700 sm:text-right">
                  {names.join(" · ")}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-600">
            ※ 실제 청구 금액은 신청서 기준으로 산정되며, 장비·부대비용이 추가될 수 있습니다.
          </p>
        </Card>
      </div>

      <div className="mt-6">
        <SettingsClient rooms={allRooms} dayOptions={DAY_OPTIONS} initialSchedules={schedules} initialBlocks={blocks} category={category} />
      </div>
    </div>
  );
}
