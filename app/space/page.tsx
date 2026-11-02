import { redirect } from "next/navigation";
import { OPERATING_RULES } from "@/lib/config";
import { FLOORS, getRoomsByCategory, normalizeRoomCategory, type FloorId } from "@/lib/space";
import { A_H1, HelpPhoneLine, PublicHeader, StepHeader } from "@/components/apply/ui";
import LectureRoomList from "@/components/apply/LectureRoomList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "강의실 대관 신청" };

/**
 * 1단계 강의실 목록 — "어느 강의실?" (02_ui_apply §2-2)
 * 예전 주소 `/space?category=studio|gallery`는 각 2단계로 보낸다.
 * 2026-11-02 사용자 피드백: 화면·카드가 너무 작고 여백이 없음 → 홈과 같은 폭(max-w-6xl) · 운영시간은 한 줄 나열 대신 표 상자 · 단계 띠 · 여백 확대
 */
export default function SpaceListPage({ searchParams }: { searchParams?: { category?: string; floor?: string } }) {
  const category = normalizeRoomCategory(searchParams?.category);
  if (category === "studio") redirect("/space/media");
  if (category === "gallery") redirect("/space/gallery");

  const rooms = getRoomsByCategory("lecture");
  const floors = FLOORS.map((f) => f.id).filter((id) => rooms.some((r) => r.floor === id));
  const asked = String(searchParams?.floor ?? "") as FloorId;
  const initialFloor: FloorId = floors.includes(asked) ? asked : floors[0];

  const hours: Array<{ label: string; value: string; note?: string }> = [
    { label: "평일", value: `${OPERATING_RULES.weekday.start}~${OPERATING_RULES.weekday.end}`, note: `화요일은 ${OPERATING_RULES.tuesday.end}까지` },
    { label: "토요일", value: `${OPERATING_RULES.saturday.start}~${OPERATING_RULES.saturday.end}` },
    { label: "일요일·공휴일", value: "휴관" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-[960px] px-4 pb-14 pt-6 sm:px-6 min-[900px]:max-w-6xl">
        <StepHeader current={1} />

        <h1 className={`${A_H1} mt-8 min-[900px]:text-[28px] min-[900px]:leading-9`}>강의실을 고르세요</h1>
        <p className="mt-2 text-[17px] leading-7 text-ink-2">층을 고른 뒤 강의실을 누르면 날짜 선택으로 이어집니다.</p>

        <section aria-labelledby="hours-title" className="mt-5 rounded-xl border border-line bg-white px-4 py-4 sm:px-5">
          <h2 id="hours-title" className="text-[15px] font-bold leading-6 text-ink-3">
            운영시간
          </h2>
          <dl className="mt-2 grid gap-y-2 sm:grid-cols-3 sm:gap-x-6">
            {hours.map((h) => (
              <div key={h.label} className="flex items-baseline gap-3 sm:block">
                <dt className="w-[104px] shrink-0 text-[16px] font-semibold leading-7 text-ink-2 sm:w-auto sm:text-[15px] sm:leading-6">{h.label}</dt>
                <dd className="text-[18px] font-bold leading-7 text-ink">
                  {h.value}
                  {h.note ? <span className="block text-[15px] font-medium leading-6 text-ink-2 sm:ml-1.5 sm:inline">({h.note})</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-8 min-[900px]:mt-10">
          <LectureRoomList floors={floors} rooms={rooms} initialFloor={initialFloor} />
        </div>

        <HelpPhoneLine className="mt-12 text-center" />
      </main>
    </div>
  );
}
