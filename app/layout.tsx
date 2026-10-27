import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

// Pretendard Variable — KS X 1001(2,350자)+기호 서브셋 1개(약 650KB) · 같은 출처라 CSP 변경 없음.
// 원본 2.0MB가 첫 방문 기준(800KB)을 넘어 01_spec ⑧ Q3대로 서브셋 사용. 라이선스: app/fonts/OFL.txt
const pretendard = localFont({
  src: "./fonts/PretendardVariable.subset.woff2",
  display: "swap",
  weight: "45 930",
  variable: "--font-pretendard",
  fallback: ["-apple-system", "Malgun Gothic", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "서초여성가족플라자 대관·전시 신청",
    template: "%s | 서초여성가족플라자 대관·전시",
  },
  description: "서초여성가족플라자 서초센터 강의실·E-스튜디오 대관 및 우리동네 갤러리 전시 신청",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="min-h-screen font-sans text-ink">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-brand"
        >
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
