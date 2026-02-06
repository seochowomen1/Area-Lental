import Notice from "@/components/ui/Notice";
import Card from "@/components/ui/Card";

import SettingsClient from "@/app/admin/settings/SettingsClient";

import { rooms } from "@/lib/rooms";
import { ROOMS } from "@/lib/space";
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

export default async function AdminSettingsPage() {
  const db = getDatabase();
  const allRooms = [{ id: "all", name: "전체" }, ...rooms];
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

  // NOTE: AdminLayout(app/admin/layout.tsx) already provides the shell + tabs.
  // Keep this page focused on content only to avoid duplicating layouts.
  return (
    <div className="mx-auto max-w-5xl pb-16 pt-2">
      <Notice title="안내" variant="info">
        <ul className="list-disc pl-5">
          <li>정규 수업시간/수동 차단 시간을 등록하면 해당 시간에는 대관 신청이 불가능합니다.</li>
          <li>시간은 운영시간 내에서만 선택되며, 30분 단위(00/30)로만 설정할 수 있습니다.</li>
          <li>등록 시간이 기존 데이터와 겹치는 경우 저장되지 않으며, 화면에 안내가 표시됩니다.</li>
        </ul>
      </Notice>

      <div className="mt-6">
        <Card pad="md">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">대관 이용료 안내(시간당)</div>
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
        <SettingsClient rooms={allRooms} dayOptions={DAY_OPTIONS} initialSchedules={schedules} initialBlocks={blocks} />
      </div>
    </div>
  );
}
