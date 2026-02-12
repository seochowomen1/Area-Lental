// Server wrapper for /apply
//
// Why?
// - Next.js segment config(dynamic/revalidate)는 Server Component에서 가장 안정적으로 동작합니다.
// - v12에서 page 전체가 Client Component("use client")인 상태로 export const revalidate 를 사용하면서
//   일부 환경에서 "Invalid revalidate value [object Object]" 런타임 오류가 재현되었습니다.
//
// The actual UI/logic lives in ApplyClient (Client Component).

import type { Metadata } from "next";
import { Suspense } from "react";
import ApplyClient from "./ApplyClient";
import ApplyGalleryClient from "./ApplyGalleryClient";

export const metadata: Metadata = {
  title: "대관 신청서 작성",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ApplyPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const roomId = Array.isArray(searchParams?.roomId) ? searchParams?.roomId[0] : searchParams?.roomId;
  const category = Array.isArray(searchParams?.category) ? searchParams?.category[0] : searchParams?.category;
  const isGallery = roomId === "gallery" || category === "gallery";

  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-gray-400">로딩 중...</div>}>
      {isGallery ? <ApplyGalleryClient /> : <ApplyClient />}
    </Suspense>
  );
}
