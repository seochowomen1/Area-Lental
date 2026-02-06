"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NOTICE_BASE, NOTICE_VARIANT, type NoticeVariant, CARD_PAD } from "@/components/ui/presets";

type Props = {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: NoticeVariant;
  pad?: keyof typeof CARD_PAD;
  icon?: ReactNode;
};

export default function Notice({
  title,
  children,
  className,
  variant = "info",
  pad = "sm",
  icon,
}: Props) {
  return (
    <div className={cn(NOTICE_BASE, NOTICE_VARIANT[variant], CARD_PAD[pad], className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--brand-primary)/0.08)]">
            {icon}
          </div>
        ) : null}

        <div className="min-w-0">
          {title ? (
            <div className="font-bold tracking-[-0.01em] text-slate-900 text-[14px]">{title}</div>
          ) : null}
          <div className={cn(title ? "mt-2" : "", "text-sm text-slate-700 leading-6")}>{children}</div>
        </div>
      </div>
    </div>
  );
}
