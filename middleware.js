import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request) {
  return updateSession(request);
}

export const config = {
  // Skip static assets, PWA files and images — they never need a session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|models/|textures/|audio/|sw.js|offline.html|manifest.webmanifest|.*\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|ktx2|mp3|ogg)$).*)",
  ],
};
