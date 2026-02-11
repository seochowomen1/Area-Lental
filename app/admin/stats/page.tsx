import { assertAdminAuth } from "@/lib/adminAuth";
import StatsClient from "./StatsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatsPage() {
  await assertAdminAuth();

  return <StatsClient />;
}
