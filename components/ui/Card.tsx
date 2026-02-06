"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CARD_BASE, CARD_PAD } from "@/components/ui/presets";

type Props = {
  children: ReactNode;
  className?: string;
  pad?: keyof typeof CARD_PAD;
};

export default function Card({ children, className, pad = "md" }: Props) {
  return <div className={cn(CARD_BASE, CARD_PAD[pad], className)}>{children}</div>;
}
