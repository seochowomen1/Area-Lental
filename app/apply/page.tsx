// 3단계 신청서 쓰기 — 서버 래퍼 (audit-fix-3 3-4)
// - 새 주소 `/apply?roomId=…&s=…` · 예전 주소 `/apply?roomId=…&date=…&start=…&end=…`(계속 동작) · 갤러리 `?roomId=gallery&startDate&endDate(&prepDate)`
// - 일정이 잘못되면 2단계(`/space/{roomId}?err=schedule`)로, 공간을 모르면 홈으로 보낸다.
// - segment config(dynamic/revalidate)는 서버 컴포넌트에 둔다(예전 "Invalid revalidate value" 회피).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ApplyClient from "./ApplyClient";
import ApplyGalleryClient from "./ApplyGalleryClient";
import { fallbackHrefForInvalid, parseApplySchedule } from "@/lib/apply/schedule";

export const metadata: Metadata = {
  title: "신청서 쓰기",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ApplyPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const get = (k: string) => {
    const v = searchParams?.[k];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  };
  const parsed = parseApplySchedule({ get });
  if (parsed.kind === "invalid") redirect(fallbackHrefForInvalid(parsed));
  if (parsed.kind === "gallery") {
    return <ApplyGalleryClient key={`${parsed.startDate}_${parsed.endDate}`} startDate={parsed.startDate} endDate={parsed.endDate} prepDate={parsed.prepDate} />;
  }
  return <ApplyClient key={parsed.sessions.map((s) => s.date + s.startTime).join(",")} roomId={parsed.roomId} sessions={parsed.sessions} />;
}
