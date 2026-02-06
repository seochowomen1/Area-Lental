import { Suspense } from "react";
import ResultClient from "./ResultClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ResultPage() {
  return (
    <Suspense>
      <ResultClient />
    </Suspense>
  );
}
