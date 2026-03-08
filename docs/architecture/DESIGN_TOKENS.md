# Design Token Architecture

> Established by Epic 15.1 — Design Token Architecture

All visual decisions in the application — color, spacing, typography, motion,
elevation — are expressed as CSS custom properties defined in `src/app.css`.

---

## Token Hierarchy

```
Raw Palette tokens   (hex values, named after their visual identity)
        │
        └─► Semantic tokens  (purpose-named, light defaults in @theme,
                               preset overrides in html.theme-* { })
                    │
                    └─► Component tokens  (built on space/semantic scale,
                                           e.g. --component-nav-item-px)
```

Components **must** reference semantic tokens. They must **not** reference raw
palette tokens or Tailwind color names. The `dark:` Tailwind prefix is abolished
from structural and component styling — preset mode is handled by semantic
token overrides in `html.theme-* { }`.

The only permitted `dark:` usage is for content-specific status-indicator colors
(e.g. `dark:text-emerald-300` for difficulty levels, `dark:text-amber-400` for
warnings) that intentionally use different color shades for legibility in each mode.

---

## S15.1.1 — Semantic Color Tokens

Defined in `src/app.css` `@theme` block (Parchment defaults) and overridden by
theme preset classes:

- `html.theme-tavern` (dark default)
- `html.theme-scholar` (light high-contrast)
- `html.theme-dungeon` (dark high-contrast)

| Token                       | Light value | Dark value | Role                                      |
| --------------------------- | ----------- | ---------- | ----------------------------------------- |
| `--color-bg`                | `#faf6f0`   | `#1a1410`  | Page background                           |
| `--color-surface`           | `#ffffff`   | `#2c2420`  | Card / panel background                   |
| `--color-surface-elevated`  | `#ffffff`   | `#352d28`  | Floating elements (dropdowns, tooltips)   |
| `--color-surface-alt`       | `#f5f0e8`   | `#352d28`  | Alternate surface (inputs, table headers) |
| `--color-border`            | `#e5ddd3`   | `#3d3530`  | Standard dividers                         |
| `--color-border-strong`     | `#c4b8a8`   | `#5a4f48`  | Emphasis dividers                         |
| `--color-ink`               | `#2c1810`   | `#e8ddd0`  | Primary body text                         |
| `--color-ink-muted`         | `#6b5b4f`   | `#a89888`  | Secondary text                            |
| `--color-ink-faint`         | `#635345`   | `#b5a38f`  | Disabled / decorative text                |
| `--color-accent`            | `#8b4513`   | `#d4a76a`  | Brand / accent (saddle brown → warm gold) |
| `--color-accent-hover`      | `#a0522d`   | `#e0be85`  | Darkened accent for hover states          |
| `--color-accent-subtle`     | `#f0e6d8`   | `#3a2e22`  | Low-saturation accent fill (active nav)   |
| `--color-accent-foreground` | `#ffffff`   | `#1a1410`  | Text on accent backgrounds                |
| `--color-success`           | `#2e7d32`   | `#66bb6a`  | Success status                            |
| `--color-warning`           | `#e65100`   | `#ffa726`  | Warning status                            |
| `--color-error`             | `#b71c1c`   | `#ef5350`  | Error status                              |
| `--color-error-hover`       | `#991b1b`   | `#f47171`  | Error hover state (danger button)         |
| `--color-focus-ring`        | `#8b4513`   | `#d4a76a`  | Keyboard focus ring                       |

Raw palette tokens (`--color-parchment-*`, `--color-tavern-*`) remain available for
reference by the body background gradient and handout effects, but are not used
in structural or component styling.

---

## S15.1.2 — Typography Scale Tokens

Defined in `src/app.css` `@theme` block. These override Tailwind's default
font-size utilities to create a consistent scale:

| Token         | Value            | Use                          |
| ------------- | ---------------- | ---------------------------- |
| `--text-2xs`  | 10px (0.625rem)  | Badge counts, micro labels   |
| `--text-xs`   | 12px (0.75rem)   | Helper text, timestamps      |
| `--text-sm`   | 13px (0.8125rem) | Secondary body, nav items    |
| `--text-base` | 15px (0.9375rem) | Primary body                 |
| `--text-md`   | 17px (1.0625rem) | Emphasized body, subheadings |
| `--text-lg`   | 20px (1.25rem)   | Section headings             |
| `--text-xl`   | 24px (1.5rem)    | Page titles                  |
| `--text-2xl`  | 30px (1.875rem)  | Display use                  |

Letter-spacing tokens: `--tracking-tight` (-0.01em), `--tracking-normal` (0),
`--tracking-wide` (0.05em for uppercase labels).

Font-weight tokens: `--font-weight-normal` (400), `--font-weight-medium` (500),
`--font-weight-semibold` (600), `--font-weight-bold` (700).

Font family tokens: `--font-sans`, `--font-serif`, `--font-mono`.

Arbitrary pixel sizes (`text-[10px]`, `text-[11px]`) are **banned** — the
`pnpm lint:tokens` gate enforces this. Use `text-2xs` or `text-xs`.

---

## S15.1.3 — Spacing Scale Tokens

Defined in `src/app.css` `:root` block. 4px base unit:

| Token         | Value | Token        | Value |
| ------------- | ----- | ------------ | ----- |
| `--space-0.5` | 2px   | `--space-6`  | 24px  |
| `--space-1`   | 4px   | `--space-8`  | 32px  |
| `--space-1.5` | 6px   | `--space-10` | 40px  |
| `--space-2`   | 8px   | `--space-12` | 48px  |
| `--space-3`   | 12px  | `--space-16` | 64px  |
| `--space-4`   | 16px  |              |       |
| `--space-5`   | 20px  |              |       |

**Component token layer** (built on space scale):

| Token                      | Value                    | Use                         |
| -------------------------- | ------------------------ | --------------------------- |
| `--component-nav-item-px`  | `var(--space-3)` (12px)  | Nav item horizontal padding |
| `--component-nav-item-py`  | `var(--space-1.5)` (6px) | Nav item vertical padding   |
| `--component-card-padding` | `var(--space-4)` (16px)  | Card padding                |

The `.primary-nav-item` CSS class in `app.css` directly applies
`padding: var(--component-nav-item-py) var(--component-nav-item-px)`, making
these tokens the authoritative source for nav item structural padding.

Components that need component-level token consumption should use `var()` calls
in their `<style>` blocks or via Tailwind arbitrary-value syntax
`px-[var(--component-nav-item-px)]`.

---

## S15.1.4 — Motion and Elevation Tokens

Defined in `src/app.css` `@theme` block (so Tailwind generates utility classes).

### Duration tokens

| Token                | Value | Tailwind utility   | Use                                      |
| -------------------- | ----- | ------------------ | ---------------------------------------- |
| `--duration-instant` | 0ms   | `duration-instant` | Used when reduced-motion is active       |
| `--duration-fast`    | 100ms | `duration-fast`    | Micro-interactions: button press, toggle |
| `--duration-medium`  | 200ms | `duration-medium`  | Panel transitions, dropdown open         |
| `--duration-slow`    | 350ms | `duration-slow`    | Sheet slide-in, page transition          |

Because these are in `@theme`, components use them as Tailwind utilities:
`transition-[colors] duration-fast`. The `@media (prefers-reduced-motion: reduce)`
block sets all three duration tokens to `0ms` in `:root`, globally collapsing
CSS transitions regardless of how they are applied.

### Easing tokens

| Token                 | Value                          | Use                      |
| --------------------- | ------------------------------ | ------------------------ |
| `--easing-standard`   | `cubic-bezier(0.4, 0, 0.2, 1)` | Default transitions      |
| `--easing-decelerate` | `cubic-bezier(0, 0, 0.2, 1)`   | Elements entering screen |
| `--easing-accelerate` | `cubic-bezier(0.4, 0, 1, 1)`   | Elements leaving screen  |

Easing tokens are used via `var()` in `transition:` CSS shorthand in `app.css`
global rules (`.primary-nav-item`, wikilinks, skip-nav).

### Elevation (shadow) tokens

| Token         | Value                         | Tailwind utility | Use                |
| ------------- | ----------------------------- | ---------------- | ------------------ |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)`  | `shadow-sm`      | Subtle card shadow |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.12)` | `shadow-md`      | Panels, dropdowns  |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.18)` | `shadow-lg`      | Modals, overlays   |

Because these override Tailwind's built-in `shadow-sm/md/lg` via `@theme`,
all uses of the standard Tailwind shadow utilities already consume the semantic
token values. Use `shadow-sm`, `shadow-md`, `shadow-lg` in components.
`shadow-xl` is not a defined token — use `shadow-lg` for the largest semantic
elevation level.

---

## Epic 15.5 — Density and Reading Width Tokens

Density and reading-width preferences are applied at the document root and consumed
as component-level tokens.

### Root data attributes

- `html[data-density="standard" | "compact"]`
- `html[data-note-reading-width="comfortable" | "wide" | "full"]`

### Density tokens

| Token                         | Standard | Compact | Use                             |
| ----------------------------- | -------- | ------- | ------------------------------- |
| `--density-nav-item-height-*` | 36px     | 28px    | shared nav/list controls        |
| `--density-card-padding-*`    | 16px     | 12px    | card-like surfaces              |
| `--density-list-gap-*`        | 4px      | 2px     | stacked list spacing            |
| `--component-card-padding`    | 16px     | 12px    | consumed by `Card` + `NoteCard` |
| `--component-list-gap`        | 4px      | 2px     | consumed by `.density-list`     |

### Sidebar density contract

- Primary section rail items use `--sidebar-primary-nav-height` (`48px`).
- Folder-tree rows use `--sidebar-tree-item-height` (`32px`).
- Tag pills use `--sidebar-tag-pill-height` (`24px`).
- Open Thread rows use `--sidebar-open-thread-height` (`32px`).

### Reading width token

- `--component-note-reading-width` resolves by preset:
  - `comfortable` → `68ch`
  - `wide` → `90ch`
  - `full` → `none`

Prose surfaces (`NoteViewer`, `NoteHeader`, editor preview/body containers) consume
`max-width: var(--component-note-reading-width)` so the preference applies in both
viewer and editor mode.

---

## Token Compliance Lint

`pnpm lint:tokens` (wired into `pnpm lint` / `pnpm check`) enforces:

1. **No arbitrary pixel font sizes** — `text-[Npx]` is banned; use the scale.
2. **No structural `dark:` prefixes** — `dark:bg-surface`, `dark:text-ink` etc.
   are banned; theme presets are handled by `html.theme-* { }` in `app.css`.

Permitted `dark:` patterns (status-indicator colours for legibility):
`dark:text-emerald-*`, `dark:bg-amber-*`, `dark:text-rose-*`, etc.

---

## Authoring Guide

### Adding a new component that uses dark mode

```svelte
<!-- WRONG: dual dark: prefix -->
<div class="bg-surface border-border dark:bg-tavern-surface dark:border-tavern-border">

<!-- CORRECT: semantic token; dark mode handled automatically -->
<div class="bg-surface border-border">
```

### Using the accent color

```svelte
<!-- Primary action button -->
<button class="bg-accent text-accent-foreground hover:bg-accent-hover"> Save </button>

<!-- Danger button — uses error-hover token, no dark: needed -->
<button class="bg-error text-white hover:bg-error-hover"> Delete </button>
```

### Using motion tokens in components

```svelte
<!-- Via Tailwind utility (preferred) -->
<div class="transition-[colors] duration-fast">...</div>

<!-- Via CSS var in a style block -->
<style>
	.my-panel {
		transition: transform var(--duration-medium) var(--easing-decelerate);
	}
</style>
```

### Using elevation tokens

```svelte
<!-- Floating overlay — use surface-elevated + shadow-lg -->
<div class="bg-surface-elevated shadow-lg border border-border">...</div>

<!-- Card — use surface + shadow-sm -->
<div class="bg-surface shadow-sm border border-border">...</div>
```

### Using typography scale

```svelte
<!-- WRONG: arbitrary size -->
<span class="text-[11px] text-ink-muted">timestamp</span>

<!-- CORRECT: scale token -->
<span class="text-xs text-ink-muted">timestamp</span>
```
