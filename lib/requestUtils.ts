import type { RentalRequest } from "@/lib/types";
import type { RoomCategory } from "@/lib/space";

/** 묶음 회차를 batchSeq → 날짜+시간 순으로 정렬 */
export function sortSessions(list: RentalRequest[]): RentalRequest[] {
  return (Array.isArray(list) ? list : [])
    .slice()
    .sort(
      (a, b) =>
        (a.batchSeq ?? 0) - (b.batchSeq ?? 0) ||
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)
    );
}

/** 카테고리별 Tailwind 색상 토큰 */
/**
 * 공간 구분 표시 — 테마 색(emerald·violet·indigo) 대신 제목 글자 + 4px 좌측 바(audit-fix-2 ③-A-2)
 * 강의실 brand · 스튜디오 sky · 갤러리 accent. 초록은 상태(승인·결제완료) 전용.
 */
export function categoryAccent(cat: RoomCategory) {
  const bar = cat === "studio" ? "bg-sky" : cat === "gallery" ? "bg-accent" : "bg-brand";
  return { border: "border-line", bg: "bg-white", text: "text-ink", dot: bar, bar };
}
