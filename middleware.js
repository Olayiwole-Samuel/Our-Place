import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request) {
  // Development-only pages (/dev/hud, /dev/ludo, …) are a real 404 in production.
  // Their own notFound() still renders the not-found page, but with a 200 status
  // once the response has started streaming.
  if (process.env.NODE_ENV === "production" && /^\/dev(\/|$)/.test(request.nextUrl.pathname)) {
    return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return updateSession(request);
}

export const config = {
  // Skip static assets, PWA files and images — they never need a session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|models/|textures/|audio/|sw.js|offline.html|manifest.webmanifest|.*\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|ktx2|mp3|ogg)$).*)",
  ],
};
