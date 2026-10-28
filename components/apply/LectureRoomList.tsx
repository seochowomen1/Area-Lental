"use client";

/**
 * 강의실 목록 층 탭 (02_ui_apply §0-5 (2) · §2-2)
 * 4칸 같은 폭(52) · 기본 4층 · 주소에 ?floor= 남김 · role=tablist · 좌우 화살표 이동
 * 카드 = 링크 하나: 사진 120×90(PC 160×120) + 이름 20 + 인원·금액 / `이 강의실로 날짜 고르기 ›`
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { FloorId, SpaceRoom } from "@/lib/space";
import { InfoList } from "@/components/apply/ui";
import { roomInfoRows } from "@/components/apply/RoomInfo";

export default function LectureRoomList({
  floors,
  rooms,
  initialFloor,
}: {
  floors: FloorId[];
  rooms: SpaceRoom[];
  initialFloor: FloorId;
}) {
  const [floor, setFloor] = useState<FloorId>(initialFloor);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const list = rooms.filter((r) => r.floor === floor);

  function choose(f: FloorId, focus = false) {
    setFloor(f);
    const url = new URL(window.location.href);
    url.searchParams.set("category", "lecture");
    url.searchParams.set("floor", f);
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    if (focus) tabRefs.current[floors.indexOf(f)]?.focus();
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % floors.length;
    if (e.key === "ArrowLeft") n = (i - 1 + floors.length) % floors.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = floors.length - 1;
    choose(floors[n], true);
  }

  return (
    <div>
      <div role="tablist" aria-label="층 고르기" className="grid max-w-[560px] grid-cols-4 gap-1.5">
        {floors.map((f, i) => {
          const selected = f === floor;
          return (
            <button
              key={f}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`floor-tab-${f}`}
              aria-selected={selected}
              aria-controls="floor-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(f)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "min-h-[52px] rounded-xl text-[18px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2",
                selected ? "bg-brand text-white" : "border border-slate-300 bg-white text-ink hover:bg-slate-50"
              )}
            >
              {f}층
            </button>
          );
        })}
      </div>

      <div id="floor-panel" role="tabpanel" aria-labelledby={`floor-tab-${floor}`} className="mt-4 grid gap-3 min-[900px]:grid-cols-2 min-[900px]:gap-4">
        {list.map((room) => (
          <Link
            key={room.id}
            href={`/space/${room.id}`}
            className="block rounded-xl border border-line bg-white p-3.5 hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
          >
            <span className="flex gap-3.5">
              {room.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={room.image}
                  alt=""
                  width={160}
                  height={120}
                  loading="lazy"
                  decoding="async"
                  className="h-[90px] w-[120px] shrink-0 rounded-lg bg-slate-100 object-cover sm:h-[120px] sm:w-[160px]"
                />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block text-[20px] font-extrabold leading-[30px] text-ink">{room.name}</span>
                <InfoList rows={roomInfoRows(room, false)} className="mt-1" />
              </span>
            </span>
            <span className="mt-3 flex min-h-[44px] items-center border-t border-line pt-2 text-[17px] font-bold text-brand">이 강의실로 날짜 고르기 ›</span>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-center text-[15px] leading-6 text-ink-2">다른 층 강의실은 위에서 층을 눌러 보세요.</p>
    </div>
  );
}
