# Design Token Architecture

All visual decisions in the React app — color, typography, spacing, radius, elevation,
motion, iconography, density — are expressed as CSS custom properties in
`apps/gm-react/src/styles/tokens/*`, aggregated by `apps/gm-react/src/styles/index.css`.
Components consume semantic `var(--…)` tokens (via the `T` shorthand in
`apps/gm-react/src/app/screen-kit.tsx`) and never reference raw hex.

The standalone design-system package documentation lives at `docs/design/` (owned
separately — link to it, do not edit it here).

## Import order

`index.css` imports the token layers in a load-bearing order, then a thin reset:

```
fonts.css → colors.css → typography.css → spacing.css → base.css
```

## Token sources

### `tokens/colors.css` — color and elevation

- Raw palette hex values live **only** in this file. Every other file/component consumes
  semantic `--color-*` tokens.
- Themes are selected by a single `data-theme` attribute on `<html>`:
  - **tavern** (default, on `:root`) — warm candle-lit dark; the hero theme.
  - **parchment** — warm light (ink on vellum).
  - **high-contrast** — AAA black/white, forced-colors compatible.
- Token families: surfaces (`--color-bg`, `--color-surface`, `--color-surface-raised`,
  `--color-surface-overlay`, `--color-surface-sunken`, `--color-surface-alt`), borders
  (`--color-border`, `--color-border-strong`, `--color-border-focus`), text
  (`--color-text-primary/secondary/tertiary/inverse/link`), accent (`--color-accent`,
  `-hover`, `-active`, `-subtle`, `-foreground`, `-border`), status
  (`--color-status-{success,warning,error,info}` each with `-text` / `-subtle`), the
  safety-critical `--color-dm-only-*`, interactive states, and `--shadow-{sm,md,lg}`.
- Map/layer hues (`--layer-*`, `--map-*`) are re-harmonised in OKLCH to stay in the warm
  brand family.
- A `@media (forced-colors: active)` block remaps semantic tokens onto system color
  keywords for OS high-contrast.

### `tokens/typography.css`

Families `--font-sans` (Inter), `--font-display` (Cinzel), `--font-mono` (JetBrains Mono);
type scale `--text-2xs … --text-3xl`; weights `--font-weight-*`; line heights
`--leading-*`; letter spacing `--tracking-*`. Display serif is used at `--text-xl` (24px)
and above only.

### `tokens/spacing.css`

The 4px-grid spacing scale (`--space-*`, with a 2px half-step), component structural
tokens (`--component-*`), radius (`--radius-*`), shadow shape, z-index layers (`--z-*`),
motion (`--duration-*`, `--easing-*`; durations collapse to 0 under
`[data-motion='reduced'|'none']`), iconography (`--icon-size-*`, `--icon-stroke-width`),
focus ring, touch targets, and the density sets (`--density-*`, selected by
`data-density`).

### `tokens/fonts.css`

Self-hosted `@fontsource/*` `@font-face` imports (Inter / Cinzel / JetBrains Mono, latin
subsets) — no CDN, so the desktop/offline shell renders the real brand faces with no
network.

### `tokens/base.css`

Minimal reset plus the one decorative brand surface (a warm candle-glow radial on
`<body>`) and the global `:focus-visible` ring.

## Contrast lints

- `pnpm tokens:contrast` (`scripts/token-contrast-lint.ts`) — text-contrast lint over the
  token color pairings.
- `pnpm a11y:contrast` (`scripts/a11y-nontext-contrast-lint.ts`) — non-text (UI/graphic)
  contrast lint, including the forced-colors remap. It is wired into `pnpm lint`.

## Rules

- Components reference semantic tokens (or the `T` map), never raw hex or a specific
  theme's value.
- A full theme swap is a single `data-theme` change on `<html>` with zero component edits.
- Raw palette values are confined to `tokens/colors.css`.
