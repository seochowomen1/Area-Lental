import type { Metadata } from "next";
import { Suspense } from "react";
import MyClient from "./MyClient";

export const metadata: Metadata = {
  title: "내 예약 조회",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ★ audit-fix-1 [1][10][결2]: 조회는 메일로 받은 링크(토큰)로만.
//   메일 링크의 ?token= 은 클라이언트가 sessionStorage로 옮기고 주소에서 지운다(MyClient).
export default function MyPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-slate-500">로딩 중...</div>}>
      <MyClient />
    </Suspense>
  );
}
