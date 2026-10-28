import { notFound } from "next/navigation";
import { ROOMS_BY_ID } from "@/lib/space";
import { decodeSessions } from "@/lib/apply/schedule";
import { isRealYmd } from "@/lib/rules/ymd";
import LectureDatePicker from "@/components/apply/LectureDatePicker";
import GalleryPeriodPicker from "@/components/apply/GalleryPeriodPicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function generateMetadata({ params }: { params: { roomId: string } }) {
  const room = ROOMS_BY_ID[params.roomId];
  if (!room) return {};
  return { title: room.category === "gallery" ? "우리동네 갤러리 · 전시 기간 고르기" : `${room.name} · 날짜 고르기` };
}

/**
 * 2단계 날짜 고르기 — "언제?" (02_ui_apply §2-3)
 * - `?s=` 고른 회차(3단계 `날짜·시간 바꾸기`에서 돌아올 때) · 갤러리는 `?startDate&endDate`
 * - `?err=schedule` 잘못된 `/apply` 주소에서 돌아옴
 */
export default function SpaceDatePage({
  params,
  searchParams,
}: {
  params: { roomId: string };
  searchParams?: { s?: string; err?: string; startDate?: string; endDate?: string };
}) {
  const room = ROOMS_BY_ID[params.roomId];
  if (!room) return notFound();
  const scheduleError = searchParams?.err === "schedule";

  if (room.category === "gallery") {
    const s = String(searchParams?.startDate ?? "");
    const e = String(searchParams?.endDate ?? "");
    const ok = isRealYmd(s) && isRealYmd(e) && s <= e;
    return <GalleryPeriodPicker room={room} initialStart={ok ? s : ""} initialEnd={ok ? e : ""} scheduleError={scheduleError} />;
  }
  const sessions = decodeSessions(searchParams?.s) ?? [];
  return <LectureDatePicker room={room} initialSessions={sessions} scheduleError={scheduleError} />;
}
