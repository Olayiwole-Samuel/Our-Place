import Link from "next/link";
import { Atmosphere } from "@/components/brand/Atmosphere";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="app-viewport">
      <Atmosphere />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 text-center safe-inset">
        <p className="micro-caps text-text-muted">404</p>
        <h1 className="text-heading text-white-soft">This room doesn&apos;t exist.</h1>
        <Link
          href="/"
          className="mt-2 inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-4 text-body text-pink-400 underline-offset-4 hover:underline"
        >
          Back to Our Place
        </Link>
      </div>
    </main>
  );
}
