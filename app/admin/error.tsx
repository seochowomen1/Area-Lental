"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/logger";
import {
  AUTH_STORE_BUSY_CODE,
  AUTH_STORE_BUSY_PAGE_BODY,
  AUTH_STORE_BUSY_PAGE_TITLE,
} from "@/lib/adminConstants";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // R3: 세션 폐기 목록 확인 지연(503 성격) — 로그인은 유지되므로 로그인 화면으로 보내지 않는다.
  // 운영 빌드에서는 message가 가려지므로 digest로 판별(03_api 1-6).
  const busy = error.digest === AUTH_STORE_BUSY_CODE;
  const router = useRouter();

  // 서버 컴포넌트 오류는 reset()만으로는 다시 불러오지 않으므로 refresh와 함께 실행
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  useEffect(() => {
    logger.error(busy ? "관리자 접속 확인 지연" : "관리자 페이지 오류", { message: error.message, digest: error.digest });
  }, [error, busy]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 text-center">
        <h2 className="text-xl font-bold text-ink">
          {busy ? AUTH_STORE_BUSY_PAGE_TITLE : "관리자 페이지 오류"}
        </h2>
        <p className="mt-2 text-base text-ink-2">
          {busy ? AUTH_STORE_BUSY_PAGE_BODY : "페이지를 불러오는 중 문제가 발생했습니다."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={retry}
            className="min-h-[48px] w-full whitespace-nowrap rounded-xl bg-brand px-5 py-2.5 text-base font-semibold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 sm:w-auto sm:min-h-[44px] sm:text-[15px]"
          >
            다시 시도
          </button>
          {!busy && (
            <a
              href="/admin"
              className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-[15px] font-medium text-ink transition hover:bg-slate-50"
            >
              관리자 홈으로
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
