"use client";

/**
 * 강의실 목록 층 탭 (02_ui_apply §0-5 (2) · §2-2)
 * 4칸 같은 폭(52) · 기본 4층 · 주소에 ?floor= 남김 · role=tablist · 좌우 화살표 이동
 * 카드 = 링크 하나: 사진 가로 전체(16:9) + 이름 22 + 인원·금액 / `이 강의실로 날짜 고르기 ›`
 * 2026-11-02 사용자 피드백: 카드·사진이 너무 작고 여백 없음 → 사진을 위로 크게, 2열(640↑), 층 탭 56, 간격 확대
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
      <h2 className="text-[17px] font-bold leading-7 text-ink">층 고르기</h2>
      <div role="tablist" aria-label="층 고르기" className="mt-2.5 grid max-w-[640px] grid-cols-4 gap-2">
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
                "min-h-[56px] rounded-xl text-[19px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2",
                selected ? "bg-brand text-white" : "border border-slate-300 bg-white text-ink hover:bg-slate-50"
              )}
            >
              {f}층
            </button>
          );
        })}
      </div>

      <div id="floor-panel" role="tabpanel" aria-labelledby={`floor-tab-${floor}`} className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-5 min-[900px]:gap-6">
        {list.map((room) => (
          <Link
            key={room.id}
            href={`/space/${room.id}`}
            className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white hover:border-brand hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
          >
            {room.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={room.image}
                alt=""
                width={640}
                height={360}
                loading="lazy"
                decoding="async"
                className="aspect-[16/9] w-full bg-slate-100 object-cover"
              />
            ) : null}
            <span className="flex flex-1 flex-col p-4 sm:p-5">
              <span className="block text-[22px] font-extrabold leading-8 text-ink">{room.name}</span>
              <InfoList rows={roomInfoRows(room, false)} className="mt-2" />
              <span className="mt-4 flex min-h-[48px] items-center justify-between border-t border-line pt-3 text-[17px] font-bold text-brand">
                <span>이 강의실로 날짜 고르기</span>
                <span aria-hidden="true" className="text-[22px] leading-none">›</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-center text-[15px] leading-6 text-ink-2">다른 층 강의실은 위에서 층을 눌러 보세요.</p>
    </div>
  );
}
