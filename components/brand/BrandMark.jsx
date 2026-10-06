/**
 * The Our Place mark: an army-green home with a small pink heart inside.
 * Same artwork as the PWA icons (public/icons/icon.svg). Decorative by default;
 * pass `title` when it stands alone and must be announced.
 */
export function BrandMark({ size = 28, title, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <path
        d="M15.1 3.7a1.4 1.4 0 0 1 1.8 0l10.6 9.1c.3.3.5.7.5 1.1V26a2.6 2.6 0 0 1-2.6 2.6H6.6A2.6 2.6 0 0 1 4 26V13.9c0-.4.2-.8.5-1.1Z"
        fill="var(--color-green-600)"
      />
      <path
        d="M16 24.2c-.4 0-5-3-5-6.3a2.8 2.8 0 0 1 5-1.7 2.8 2.8 0 0 1 5 1.7c0 3.3-4.6 6.3-5 6.3Z"
        fill="var(--color-pink-400)"
      />
    </svg>
  );
}
