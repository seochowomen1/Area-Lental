import type { Metadata } from "next";
import { Suspense } from "react";
import ResultClient from "./ResultClient";

export const metadata: Metadata = {
  title: "신청 결과 조회",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-gray-400">로딩 중...</div>}>
      <ResultClient />
    </Suspense>
  );
}
