"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 서버 액션(redirect + toast 쿼리스트링) 이후,
 * 최신 목록이 확실히 반영되도록 한 번 router.refresh()를 호출합니다.
 *
 * - 무료 티어 비용 영향 없음(단순 SSR 재요청)
 * - 성공 토스트가 있을 때만 동작하도록 페이지에서 조건부 렌더링
 */
export default function RefreshOnSuccessToast() {
  const router = useRouter();

  useEffect(() => {
    // strict mode/재마운트 환경에서도 과도한 루프를 막기 위해 microtask로 한 번만
    const id = window.setTimeout(() => {
      router.refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [router]);

  return null;
}
