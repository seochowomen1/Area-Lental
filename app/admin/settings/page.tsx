import Notice from "@/components/ui/Notice";

import SettingsClient from "@/app/admin/settings/SettingsClient";
import KeepText from "@/components/ui/KeepText";
import DataRetentionPanel from "@/components/admin/DataRetentionPanel";

import { getCategoryLabel, getRoomsByCategory, normalizeRoomCategory, type RoomCategory } from "@/lib/space";
import { getDatabase } from "@/lib/database";
import { categoryAccent } from "@/lib/requestUtils";
import { assertAdminAuth } from "@/lib/adminAuth";
import { getHolidayHealth, type HolidayHealth } from "@/lib/holidays";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * ③-F-7 설정 화면 공휴일 상태 한 줄 — 키 값·URL은 화면에 내보내지 않는다.
 * 내장표(2026~2027 법정공휴일)를 쓰는 동안은 "평일로 계산" 문구를 쓰지 않는다(03_api 2절 · 오케스트레이터 확정).
 */
function holidayHealthLine(h: HolidayHealth): { text: string; tone: "ok" | "warn" | "error" } {
  if (h.status === "ok") return { text: "공휴일 자동 조회: 정상", tone: "ok" };
  if (h.status === "no_key") {
    return h.usingFallback
      ? {
          text: "공휴일 자동 조회: 꺼져 있음 — 공휴일 조회 키가 설정되지 않아 기본 공휴일표(법정 공휴일)로 계산 중입니다. 임시공휴일은 빠질 수 있으니 관리 담당자에게 알려 주세요.",
          tone: "warn",
        }
      : {
          text: "공휴일 자동 조회: 꺼져 있음 — 공휴일 조회 키가 설정되지 않아 공휴일 정보를 확인하지 못합니다. 이용료는 승인 때 확정해 주세요. 관리 담당자에게 알려 주세요.",
          tone: "error",
        };
  }
  if (h.status === "fallback") {
    return { text: "공휴일 자동 조회: 오류 — 기본 공휴일표로 대신 계산 중입니다(임시공휴일은 빠질 수 있음).", tone: "warn" };
  }
  return { text: "공휴일 자동 조회: 오류 — 최근 조회에 실패했습니다. 갤러리 신청 금액을 확인해 주세요.", tone: "error" };
}

const DAY_OPTIONS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" }
];

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  await assertAdminAuth();
  const category = normalizeRoomCategory(searchParams?.category);
  const categoryLabel = getCategoryLabel(category);
  const accent = categoryAccent(category);

  const db = getDatabase();
  const categoryRooms = getRoomsByCategory(category).map((r) => ({ id: r.id, name: r.name }));
  const allRooms = categoryRooms.length > 1
    ? [{ id: "all", name: "전체" }, ...categoryRooms]
    : categoryRooms;
  const [schedules, blocks] = await Promise.all([db.getClassSchedules(), db.getBlocks()]);
  let healthLine: ReturnType<typeof holidayHealthLine>;
  try {
    healthLine = holidayHealthLine(await getHolidayHealth());
  } catch {
    healthLine = holidayHealthLine({ status: "error", usingFallback: false, checkedAt: null, fallbackYears: [] });
  }

  return (
    <div className="mx-auto max-w-5xl pb-16 pt-2">
      {/* 카테고리 헤더 */}
      <div className={`rounded-xl border ${accent.border} ${accent.bg} p-4 mb-3`}>
        <div className="flex items-center gap-3">
          <span className={`inline-block h-6 w-1 shrink-0 rounded-full ${accent.bar}`} aria-hidden="true" />
          <h1 className={`text-xl font-bold ${accent.text}`}>{categoryLabel} 운영 설정</h1>
        </div>
        <p className="mt-1 ml-4 text-sm text-slate-600">
          {category === "gallery"
            ? "내부 전시 일정을 관리합니다. 등록된 기간에는 외부 전시 신청이 불가능합니다."
            : "정규 수업시간 및 내부 대관 일정을 관리합니다. 등록된 시간/기간에는 대관 신청이 불가능합니다."}
        </p>
      </div>

      {/* ③-F-7 공휴일 자동 조회 상태 — 페이지 제목 바로 아래 첫 줄 */}
      <p
        role="status"
        className={
          "mb-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-[15px] " +
          (healthLine.tone === "ok"
            ? "border-line bg-white text-ink"
            : healthLine.tone === "warn"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-red-200 bg-red-50 text-red-700")
        }
      >
        {healthLine.tone === "ok" ? <span className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-700" aria-hidden="true" /> : null}
        <span>{healthLine.text}</span>
      </p>

      <Notice title="안내" variant="info">
        <ul className="list-disc pl-5 space-y-1">
          <KeepText>
          {category === "gallery" ? (
            <>
              <li><b>내부 전시 일정</b>: 내부(강사·수강생) 전시 일정을 등록하면 해당 기간 동안 외부 전시 신청이 차단됩니다.</li>
              <li><b>차단 방식</b>: 일 단위(시작일~종료일)로 등록되며, 등록된 기간의 전체 운영시간이 차단됩니다.</li>
              <li><b>겹침 방지</b>: 등록 기간이 기존 일정과 겹치는 경우 저장되지 않으며, 화면에 안내가 표시됩니다.</li>
              <li><b>메일 템플릿</b>: 하단에서 접수/승인/반려/취소 시 발송되는 메일 내용을 수정할 수 있습니다 (모든 공간 공통).</li>
            </>
          ) : (
            <>
              <li><b>정규 수업시간</b>: 매주 반복되는 정규 수업시간을 등록합니다. 등록된 시간에는 대관 신청이 차단됩니다.</li>
              <li><b>시간 단위 차단</b>: 특정 날짜의 시간대를 수동으로 차단합니다. 운영시간 내 30분 단위(00/30)로 설정합니다.</li>
              <li><b>일 단위 차단</b>: 특정 기간(시작일~종료일)을 하루 전체 차단합니다. 행사, 점검 등 장기간 차단 시 사용합니다.</li>
              <li><b>겹침 방지</b>: 등록 시간/기간이 기존 데이터와 겹치는 경우 저장되지 않으며, 화면에 안내가 표시됩니다.</li>
              <li><b>메일 템플릿</b>: 하단에서 접수/승인/반려/취소 시 발송되는 메일 내용을 수정할 수 있습니다 (모든 공간 공통).</li>
            </>
          )}
          </KeepText>
        </ul>
      </Notice>

      <div className="mt-6">
        <SettingsClient rooms={allRooms} dayOptions={DAY_OPTIONS} initialSchedules={schedules} initialBlocks={blocks} category={category} />
      </div>

      <div className="mt-8">
        <DataRetentionPanel />
      </div>
    </div>
  );
}
