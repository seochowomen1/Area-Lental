import type { RequestStatus } from "@/lib/types";

const STYLES: Record<RequestStatus, string> = {
  접수: "border-slate-200 bg-slate-50 text-slate-700",
  승인: "border-emerald-200 bg-emerald-50 text-emerald-800",
  반려: "border-red-200 bg-red-50 text-red-800",
  취소: "border-gray-200 bg-gray-50 text-gray-700",
};

export default function StatusBadge({ status }: { status: RequestStatus }) {
  const cls = STYLES[status] ?? STYLES["접수"];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}
