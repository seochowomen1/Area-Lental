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
 */
export default function SpaceListPage({ searchParams }: { searchParams?: { category?: string; floor?: string } }) {
  const category = normalizeRoomCategory(searchParams?.category);
  if (category === "studio") redirect("/space/media");
  if (category === "gallery") redirect("/space/gallery");

  const rooms = getRoomsByCategory("lecture");
  const floors = FLOORS.map((f) => f.id).filter((id) => rooms.some((r) => r.floor === id));
  const asked = String(searchParams?.floor ?? "") as FloorId;
  const initialFloor: FloorId = floors.includes(asked) ? asked : floors[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-[960px] px-4 pb-12 pt-5 sm:px-6">
        <StepHeader current={1} />
        <h1 className={`${A_H1} mt-2`}>강의실을 고르세요</h1>
        <p className="mt-1 text-[15px] leading-6 text-ink-2">운영시간: 평일 {OPERATING_RULES.weekday.start}~{OPERATING_RULES.weekday.end} · 화 ~{OPERATING_RULES.tuesday.end} · 토 ~{OPERATING_RULES.saturday.end} · 일요일·공휴일 휴관</p>
        <div className="mt-4">
          <LectureRoomList floors={floors} rooms={rooms} initialFloor={initialFloor} />
        </div>
        <HelpPhoneLine className="mt-6 text-center" />
      </main>
    </div>
  );
}
