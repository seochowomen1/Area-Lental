import type { RequestStatus } from "@/lib/types";

const STYLES: Record<RequestStatus, string> = {
  접수: "border-slate-200 bg-slate-50 text-slate-700",
  검토중: "border-amber-200 bg-amber-50 text-amber-800",
  승인: "border-emerald-200 bg-emerald-50 text-emerald-800",
  반려: "border-red-200 bg-red-50 text-red-800",
  취소: "border-gray-200 bg-gray-50 text-gray-700",
  완료: "border-indigo-200 bg-indigo-50 text-indigo-800"
};

export default function StatusBadge({ status }: { status: RequestStatus }) {
  const cls = STYLES[status] ?? STYLES["검토중"];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}
