import type { Metadata } from "next";
import { Suspense } from "react";
import MyClient from "./MyClient";

export const metadata: Metadata = {
  title: "내 예약 조회",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MyPage({
  searchParams,
}: {
  searchParams: { token?: string; email?: string };
}) {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-gray-400">로딩 중...</div>}>
      <MyClient
        token={searchParams.token ?? ""}
        initialEmail={searchParams.email ?? ""}
      />
    </Suspense>
  );
}
