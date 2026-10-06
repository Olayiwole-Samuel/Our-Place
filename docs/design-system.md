# Design system

**Identity:** Black + Army Green + Soft Pink, with sky blue, red and white in support.

> Black establishes the world. Army green establishes the brand. Pink establishes the relationship. Sky blue establishes realtime play. Red establishes intensity. White establishes clarity.

**Feel:** premium console / game lobby / cinematic, but intimate and calm. Not a SaaS dashboard, dating site or glassy Web3 UI. It feels expensive because of composition, type, spacing, motion and colour discipline, not effects.

## Where tokens live

- `app/globals.css` → `@theme` — the source of truth. It generates Tailwind utilities (`bg-black-900`, `text-pink-400`, `rounded-[var(--radius-md)]`, `text-heading`) and CSS variables.
- `lib/design/tokens.js` — the same palette for three.js, the manifest and the viewport theme colour. `lib/design/tokens.test.js` **fails if the two drift** or if a colour family outside the identity appears.
- Tailwind's default palette is removed (`--color-*: initial`); a stray `bg-blue-700` or `text-gray-400` doesn't exist.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| `black-950` | `#080A09` | App background, deepest surfaces |
| `black-900` | `#101310` | Panels, HUD, modals |
| `black-800` | `#171A17` | Raised controls (secondary buttons, toasts) |
| `black-700` | `#202420` | Hover, fallback avatars, 3D floor |
| `green-700` | `#4F5F3A` | 3D environment, deep brand surfaces |
| `green-600` | `#596B40` | **Primary actions**, brand mark, selection |
| `green-500` | `#66764A` | Primary hover, focus ring, progress, active cells |
| `pink-400` | `#F3A6B9` | Relationship accents: heart, partner ring, eyebrow labels |
| `pink-500` | `#E889A2` | Relationship buttons (Copy invite), celebration heart |
| `pink-600` | `#D96F8D` | Reserved: pressed/strong relationship states |
| `blue-400` | `#7DD3FC` | Live indicators ("Waiting for your person…") |
| `blue-500` / `600` | `#67C7F2` / `#4FB6E8` | Realtime buttons, timers (later phases) |
| `red-500` | `#EF4444` | Errors, invalid input, destructive outlines |
| `red-600` | `#E5484D` | Reserved: competitive hit feedback, spicy content |
| `white` | `#FFFFFF` | Text on green buttons |
| `white-soft` | `#F5F5F2` | Primary text |
| `text-secondary` | `#D6D8D2` | Secondary text |
| `text-muted` | `#A8ADA5` | Muted text, hints, captions |

Semantic variables (`:root`): `--surface-base/panel/raised/sunken`, `--border-subtle/strong`, `--text-primary/secondary/muted`, `--focus-ring`, `--glow-brand`, `--glow-relationship`, `--shadow-tactile`.

**Balance on screen:** black ~45–50%, green ~20–25%, pink ~10–15%, blue ~5–10%, red ~3–5%.

### Contrast (WCAG AA)

| Pair | Ratio | Rule |
| --- | --- | --- |
| white on `green-600` | 5.8:1 | Primary buttons ✓ |
| white on `green-500` | 4.9:1 | Primary hover ✓ |
| `black-950` on `pink-500` | ~8:1 | Relationship buttons use **dark** text ✓ |
| `black-950` on `blue-500` | high | Realtime buttons use dark text ✓ |
| white on `red-500` | 3.8:1 | ✗ — red is never a filled button with white text; destructive is a red **outline** |
| `green-500` text on black | 4.1:1 | ✗ for small text — green is for fills, rings and icons, not small labels |

## Typography

**Geist** for everything; **Geist Mono** for invite codes and HUD figures. Both are self-hosted via `next/font`.

| Utility | Size | Use |
| --- | --- | --- |
| `text-display` | clamp 36 → 64px, 600 | One per screen at most: "You're almost home." |
| `text-heading` | clamp 24 → 40px, 600 | Screen titles |
| `text-subheading` | clamp 17 → 22px, 500 | Supporting lines, panel titles |
| `text-body` | clamp 15 → 17px | Reading text, buttons |
| `text-caption` | 13px | Hints, metadata, toasts |
| `micro-caps` | 11px, uppercase, wide tracking | Eyebrow labels ("YOUR INVITE CODE") |
| `text-hud` + `hud-numeral` | clamp 20 → 36px, tabular | Scores, timers (later phases) |
| `text-code` + `font-mono` | clamp 26 → 40px | Invite code cells |

Fluid sizes use `vmin`, so a landscape phone (height-constrained) never gets oversized headings.

## Layout and responsiveness

Mobile-first, **landscape-first**.

| Breakpoint | Min width | Device class |
| --- | --- | --- |
| (base) | — | Small phone landscape (568×320) and below |
| `sm` | 568px | Small phone landscape |
| `md` | 740px | Large phone landscape — two-column layouts start |
| `lg` | 1024px | Tablet (`--control-size` grows to 48px) |
| `xl` | 1280px | Desktop |
| `2xl` | 1600px | Large desktop |
| `short:` | height ≤ 480px | Compact landscape phones — tighter vertical rhythm, secondary copy hidden |

- `app-viewport` — full-screen `100dvh` surface.
- `safe-inset` — safe-area inset + `--edge-gap` on all sides (notches, rounded corners, home indicator).
- `--control-size` — minimum touch target (44px; 48px from `lg`) for HUD controls.
- Portrait phones (≤600px wide, touch) get `RotateDevicePrompt`; tablets and desktop work in either orientation.
- Future HUD zones in the world: top-left brand, top-right couple badge and menu (exists), bottom-left context (exists), bottom-right reserved for movement and actions, with chat, voice and the game menu docking at the edges inside `safe-inset`.

## Surfaces, radius, depth

- `panel` — dark translucent (`black-900` at 86%), hairline border, 12px blur. Use it for overlays that sit on the world; it isn't a default card.
- Radii by purpose: `--radius-xs` 4px (chips), `--radius-sm` 8px (inputs, code cells), `--radius-md` 12px (buttons, cards), `--radius-lg` 20px (major surfaces). No pills.
- `--shadow-tactile` — one top highlight + one soft drop. Buttons press down 1px on `:active`.
- `Atmosphere` — the cinematic backdrop: a slow army-green light, faint pink warmth and a vignette. CSS only, no images.

## Components

| Component | Notes |
| --- | --- |
| `Button` | `primary` (green), `secondary` (dark + border), `relationship` (pink, dark text), `realtime` (blue, dark text), `destructive` (red outline), `ghost`. Sizes `sm`/`md`/`lg`. `pending` shows `PulseDots`, sets `aria-busy` and blocks repeats. |
| `CodeInput` | Six cells over one real input: native typing, paste, backspace, mobile keyboards and screen readers. Uppercases and filters to the code alphabet; explains dropped characters. |
| `Toaster` / `toast(msg, tone)` | Top-centre, inside the safe area. Tones: neutral (green), success, relationship (pink), error (red, `role="alert"`). |
| `LoadingScreen` | Brand mark + "OUR PLACE" + `PulseDots` (a green and a pink light) + label. `screen` / `inline`. |
| `ErrorState` | Category copy + one recovery action; never raw messages. |
| `BrandMark` / `Wordmark` | Army-green home with a pink heart; same artwork as the PWA icons. |
| `Avatar`, `CoupleBadge` | Green ring = you, pink ring = partner; initial fallback. |

## Motion

**Framer Motion** (`motion` package) using `LazyMotion` + `m` components with `domAnimation` features (smaller than the full `motion` component).

- Ease `--ease-out-soft` / `[0.22, 1, 0.36, 1]`; durations 150–600ms; springs only for small, tactile things (toasts, the celebration heart).
- Fade + small rise for entrances; quick fade for exits; `AnimatePresence mode="wait"` between screens.
- The only ambient motion is the very slow atmosphere drift and the pulsing live dots.
- **Reduced motion:** `MotionConfig reducedMotion="user"` removes transform and size animation (opacity only), the CSS rule stops ambient animation, and the 3D camera holds still.

## Icons and PWA

`public/icons/icon.svg` → 192, 512, maskable 512 (artwork inside the safe zone), and 180 Apple touch icon. Black foundation, green home, pink heart; legible at 32px. Manifest and `theme-color` use `black-950`.
