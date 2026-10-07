import { notFound } from "next/navigation";
import { ROOMS_BY_ID, getCategoryLabel, normalizeRoomCategory } from "@/lib/space";
import SiteHeader from "@/components/SiteHeader";
import SpaceDetailShell from "@/components/SpaceDetailShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SpaceDetailPage({
  params,
}: {
  params: { roomId: string };
}) {
  const room = ROOMS_BY_ID[params.roomId];
  if (!room) return notFound();

  const category = normalizeRoomCategory(room.category);
  const isGallery = category === "gallery";

  return (
    <div>
      <SiteHeader
        title={`${getCategoryLabel(category)} ${isGallery ? "전시 신청" : "대관신청"}`}
        backHref={isGallery ? "/space?category=gallery" : "/space"}
        backLabel="목록"
      />

      <SpaceDetailShell room={room} />
    </div>
  );
}
