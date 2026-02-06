import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "강의실 대관 신청",
  description: "서초여성가족플라자 서초센터 강의실 대관 신청"
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
