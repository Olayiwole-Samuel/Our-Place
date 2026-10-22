import { notFound } from "next/navigation";
import { DogPreviewClient } from "@/components/dev/DogPreviewClient";

export const dynamic = "force-dynamic";

/** DEVELOPMENT ONLY — the dog on its own (components/dev/DogPreview.jsx). 404 in production. */
export default function DogPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DogPreviewClient />;
}
