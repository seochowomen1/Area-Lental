import type { Metadata } from "next";
import { Suspense } from "react";
import SuccessClient from "./SuccessClient";

export const metadata: Metadata = {
  title: "신청 완료",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-gray-400">로딩 중...</div>}>
      <SuccessClient />
    </Suspense>
  );
}
