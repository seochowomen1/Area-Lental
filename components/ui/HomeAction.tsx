import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import {
  HOME_BUTTON_BASE,
  HOME_BUTTON_PRIMARY,
  HOME_BUTTON_SOFT,
} from "@/components/ui/presets";

export function HomeLinkButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(HOME_BUTTON_BASE, HOME_BUTTON_PRIMARY, className)}>
      {children}
    </Link>
  );
}

export function HomeDisabledButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        HOME_BUTTON_BASE,
        HOME_BUTTON_SOFT,
        "cursor-not-allowed opacity-70",
        className
      )}
      aria-disabled="true"
    >
      {children}
    </span>
  );
}
