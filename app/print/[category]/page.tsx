import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintForm from "./PrintForm";

const TITLES: Record<string, string> = {
  lecture: "강의실 대관 신청서",
  studio: "E-스튜디오 대관 신청서",
  gallery: "우리동네 갤러리 대관 신청서",
};

export function generateMetadata({
  params,
}: {
  params: { category: string };
}): Metadata {
  const title = TITLES[params.category];
  if (!title) return { title: "대관 신청서" };
  return { title };
}

export default function PrintPage({
  params,
}: {
  params: { category: string };
}) {
  const { category } = params;
  if (!TITLES[category]) notFound();
  return <PrintForm category={category as "lecture" | "studio" | "gallery"} />;
}
