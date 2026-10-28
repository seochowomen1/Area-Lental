/**
 * 공간 정보 표기 (02_ui_apply §0-6 · §0-8 B-3) — 서버·클라이언트 공용(훅 없음)
 * 위치 · 인원(갤러리는 작품) · 금액 `70,000원 (1시간)`
 */
import type { ReactNode } from "react";
import { GALLERY_FEE_KRW } from "@/lib/constants";
import { getRoomsByCategory, type SpaceRoom } from "@/lib/space";
import { Money } from "@/components/apply/ui";

/** 갤러리 작품 수 상한 — lib/space.ts 갤러리 `액자 형태: … 최대 15점`과 같은 값 */
export const GALLERY_MAX_ARTWORKS = 15;

export function lectureMinFee(): number {
  const fees = getRoomsByCategory("lecture").map((r) => r.feeKRW).filter((n) => n > 0);
  return fees.length ? Math.min(...fees) : 0;
}

export function studioMinFee(): number {
  const fees = getRoomsByCategory("studio").map((r) => r.feeKRW).filter((n) => n > 0);
  return fees.length ? Math.min(...fees) : 0;
}

/** 갤러리 금액 `20,000원 (하루) · 토 10,000원` */
export function GalleryFee() {
  return (
    <>
      <Money amount={GALLERY_FEE_KRW.WEEKDAY} unit="하루" />
      <span className="font-medium text-ink-2"> · 토 {GALLERY_FEE_KRW.SATURDAY.toLocaleString()}원</span>
    </>
  );
}

/** 공간 금액 표기 */
export function RoomFee({ room }: { room: SpaceRoom }) {
  if (room.category === "gallery") return <GalleryFee />;
  if (room.category === "studio") return <Money amount={room.feeKRW} unit={`1시간 · ${room.baseHeadcount ?? 2}명까지`} />;
  return <Money amount={room.feeKRW} unit="1시간" />;
}

/** InfoList 줄: 위치(선택) · 인원/작품 · 금액 */
export function roomInfoRows(room: SpaceRoom, withFloor: boolean) {
  const rows: Array<{ label: string; value: ReactNode }> = [];
  if (withFloor) rows.push({ label: "위치", value: `${room.floor}층` });
  if (room.category === "gallery") rows.push({ label: "작품", value: `최대 ${GALLERY_MAX_ARTWORKS}점` });
  else rows.push({ label: "인원", value: `최대 ${room.capacity}명` });
  rows.push({ label: "금액", value: <RoomFee room={room} /> });
  return rows;
}
