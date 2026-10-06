/** Liveness probe for deployment platforms. Reveals nothing about configuration. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
