/**
 * Shown only on phones held in portrait (pure CSS — see `.rotate-prompt` in
 * globals.css), because browsers can't reliably lock orientation outside an
 * installed PWA. Content marked `.landscape-content` is hidden meanwhile.
 */
export function RotateDevicePrompt() {
  return (
    <div
      role="status"
      className="rotate-prompt app-viewport z-50 flex-col items-center justify-center gap-6 bg-black-950 text-center safe-inset"
    >
      <svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="12" y="20" width="40" height="24" rx="5" stroke="var(--color-text-secondary)" strokeWidth="2" />
        <circle cx="46" cy="32" r="1.6" fill="var(--color-text-secondary)" />
        <path d="M18 12a18 18 0 0 1 26-1" stroke="var(--color-green-500)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="m41 6 3.5 5-5.5 2.5" stroke="var(--color-green-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex flex-col gap-2">
        <p className="text-subheading text-white-soft">Turn your phone sideways</p>
        <p className="text-body text-text-muted">Our Place works best in landscape.</p>
      </div>
    </div>
  );
}
