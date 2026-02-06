import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { HOME_CARD_BASE, HOME_CARD_HOVER } from "@/components/ui/presets";

export default function HomeCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(HOME_CARD_BASE, HOME_CARD_HOVER, "px-6 py-8", className)}>
      {children}
    </div>
  );
}
