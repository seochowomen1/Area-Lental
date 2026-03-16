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
export function categoryAccent(cat: RoomCategory) {
  if (cat === "studio") return { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" };
  if (cat === "gallery") return { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
  return { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" };
}
