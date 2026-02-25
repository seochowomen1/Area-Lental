"use client";

import type { ReactNode } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Providers({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
