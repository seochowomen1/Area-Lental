"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("관리자 페이지 오류", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="text-lg font-bold text-gray-900">관리자 페이지 오류</h2>
      <p className="mt-2 text-sm text-gray-600">
        페이지를 불러오는 중 문제가 발생했습니다.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition"
        >
          다시 시도
        </button>
        <a
          href="/admin"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          관리자 홈으로
        </a>
      </div>
    </div>
  );
}
