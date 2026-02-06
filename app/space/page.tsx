import { FLOORS, getCategoryLabel, getRoomsByCategory, normalizeRoomCategory } from "@/lib/space";
import SpaceFloorTabs from "@/components/SpaceFloorTabs";
import SiteHeader from "@/components/SiteHeader";
import OperatingHoursNotice from "@/components/OperatingHoursNotice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "대관신청",
};

export default function SpaceListPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  const category = normalizeRoomCategory(searchParams?.category);
  const rooms = getRoomsByCategory(searchParams?.category);
  const floors = category === "studio" ? FLOORS.filter((f) => f.id === "5") : FLOORS;

  return (
    <div>
      <SiteHeader title={`${getCategoryLabel(category)} 대관신청`} />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">

        <OperatingHoursNotice />

        <section className="mt-8">
          <SpaceFloorTabs floors={floors} rooms={rooms} />
        </section>
      </main>
    </div>
  );
}
