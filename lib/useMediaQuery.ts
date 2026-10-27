"use client";

import { useEffect, useState } from "react";

/**
 * matchMedia 훅 (업무 시스템과 같은 기준 · 관리자 목록 PC=표 / 휴대폰=카드)
 * hydration 전(서버 렌더 포함)에는 `initial`을 돌려준다 — 목록은 false(카드)로 시작해
 * 휴대폰에서 표가 번쩍이지 않게 한다(01_spec ②-2-4).
 */
export function useMediaQuery(query: string, initial = false): boolean {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export const DESKTOP_QUERY = "(min-width: 900px)";
