import { notFound } from "next/navigation";
import { BenchClient } from "@/components/dev/BenchClient";

export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT / BENCHMARK INFRASTRUCTURE — not part of the product.
 * /dev/bench renders the real living room (same World, players, characters and
 * performance system) without auth, for repeatable measurements. 404 in production.
 */
export default function BenchPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BenchClient />;
}
