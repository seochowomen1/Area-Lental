import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "서초여성가족플라자 대관 신청",
    template: "%s | 서초여성가족플라자 대관",
  },
  description: "서초여성가족플라자 서초센터 강의실·E-스튜디오·갤러리 대관 신청",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen text-gray-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-[rgb(var(--brand-primary))]"
        >
          본문 바로가기
        </a>
        {children}
      </body>
    </html>
  );
}
