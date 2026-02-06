import { notFound } from "next/navigation";
import { ROOMS_BY_ID } from "@/lib/space";
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

  return (
    <div>
      <SiteHeader title="대관신청" backHref="/space" backLabel="목록" />

      <SpaceDetailShell room={room} />
    </div>
  );
}
