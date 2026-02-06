import { Suspense } from "react";
import SuccessClient from "./SuccessClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessClient />
    </Suspense>
  );
}
