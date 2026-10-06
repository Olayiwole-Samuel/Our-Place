import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT / BENCHMARK ONLY: serves a local .glb from assets-src/ (git-ignored)
 * so the benchmark can load real imported characters. 404 in production and for
 * anything that isn't a plain .glb file name.
 */
export async function GET(_request, { params }) {
  const { name } = await params;
  if (process.env.NODE_ENV === "production" || !/^[\w .-]+\.glb$/.test(name) || name.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const bytes = await readFile(join(process.cwd(), "assets-src", name));
    return new Response(bytes, { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
