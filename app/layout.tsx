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
        {children}
      </body>
    </html>
  );
}
