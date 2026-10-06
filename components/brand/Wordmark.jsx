import { BrandMark } from "./BrandMark";

/** Mark + "OUR PLACE" lockup. The text carries the accessible name. */
export function Wordmark({ size = "md", className = "" }) {
  const mark = size === "sm" ? 22 : 28;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={mark} />
      <span className="text-caption font-semibold tracking-[0.32em] text-white-soft uppercase">Our Place</span>
    </span>
  );
}
