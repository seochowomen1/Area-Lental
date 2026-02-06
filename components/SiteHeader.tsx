"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { BUTTON_BASE, BUTTON_VARIANT } from "@/components/ui/presets";

export default function SiteHeader({
  title,
  backHref,
  backLabel = "목록으로",
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/seochowomen-ci.png"
              alt="서초여성가족플라자 서초센터"
              width={260}
              height={52}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </div>

        <div className="pb-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--brand-accent))]" />
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              </div>
            </div>

            {backHref ? (
              <Link
                href={backHref}
                className={cn(BUTTON_BASE, BUTTON_VARIANT.outline, "rounded-full px-4 py-2 text-sm shadow-sm")}
              >
                ← {backLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
