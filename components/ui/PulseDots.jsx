/**
 * The product's activity indicator: a green and a pink light breathing in turn —
 * two people, one place. Used inside buttons and loading states instead of a
 * generic spinner.
 */
export function PulseDots({ size = "sm", className = "" }) {
  const dot = size === "lg" ? "size-2.5" : "size-1.5";
  return (
    <span aria-hidden="true" className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`${dot} animate-pulse-live rounded-full bg-green-500`} />
      <span className={`${dot} animate-pulse-live rounded-full bg-pink-400 [animation-delay:0.45s]`} />
    </span>
  );
}
