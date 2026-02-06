"use client";

import Link, { type LinkProps } from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BUTTON_BASE, BUTTON_VARIANT, type ButtonVariant } from "@/components/ui/presets";

type Props = LinkProps & {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
};

export default function LinkButton({ children, className, variant = "primary", ...props }: Props) {
  return (
    <Link className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], className)} {...props}>
      {children}
    </Link>
  );
}
