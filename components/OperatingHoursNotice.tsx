import { operatingNoticeLines } from "@/lib/operating";

export default function OperatingHoursNotice(props: { className?: string; variant?: "default" | "compact" }) {
  const lines = operatingNoticeLines();

  const isCompact = props.variant === "compact";
  // 대표 사이트 공지/박스 톤에 가깝게: 과하지 않은 라운드/테두리/여백
  const pad = isCompact ? "px-4 py-3" : "px-6 py-5";
  const titleCls = isCompact ? "text-[13px]" : "text-[14px]";
  const bodyCls = isCompact ? "text-[13px]" : "text-sm";

  return (
    <div
      className={
        "rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)] " +
        pad +
        " " +
        "border-l-[3px] border-l-[rgb(var(--brand-accent))]" +
        (props.className ? ` ${props.className}` : "")
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--brand-accent)/0.10)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--brand-accent))]" />
        </div>

        <div className="min-w-0">
          <div className={`font-bold tracking-[-0.01em] text-slate-900 ${titleCls}`}>※ 운영시간</div>
          <div className={`mt-2.5 space-y-1.5 text-slate-700 ${bodyCls}`}>
            {lines.map((l) => (
              <div key={l.label} className="grid grid-cols-[64px,1fr] items-start gap-x-3">
                <span className="inline-flex h-6 w-fit items-center justify-center rounded-md border border-[rgb(var(--brand-primary)/0.14)] bg-[rgb(var(--brand-primary)/0.03)] px-2 text-[11px] font-semibold text-[rgb(var(--brand-primary)/0.85)]">
                  {l.label}
                </span>
                <span className="font-medium leading-6">{l.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-slate-500">※ 운영시간 외 시간은 선택할 수 없습니다.</div>
        </div>
      </div>
    </div>
  );
}
