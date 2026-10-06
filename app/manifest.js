import { palette } from "@/lib/design/tokens";

/** Web App Manifest, served by Next.js at /manifest.webmanifest. */
export default function manifest() {
  return {
    id: "/",
    name: "Our Place",
    short_name: "Our Place",
    description: "A place for just you two.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: palette.black950,
    theme_color: palette.black950,
    categories: ["lifestyle", "social", "games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
