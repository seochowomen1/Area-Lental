"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="text-xl font-bold text-gray-900">오류가 발생했습니다</h2>
      <p className="mt-2 text-sm text-gray-600">
        페이지를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition"
      >
        다시 시도
      </button>
    </div>
  );
}
