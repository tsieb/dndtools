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
                               dark overrides in html.dark { })
                    │
                    └─► Component tokens  (built on space/semantic scale,
                                           e.g. --component-nav-item-px)
```

Components **must** reference semantic tokens. They must **not** reference raw
palette tokens or Tailwind color names. The `dark:` Tailwind prefix is abolished
from structural and component styling — dark mode is handled by the semantic
token override in `html.dark { }`.

The only permitted `dark:` usage is for content-specific status-indicator colors
(e.g. `dark:text-emerald-300` for difficulty levels, `dark:text-amber-400` for
warnings) that intentionally use different color shades for legibility in each mode.

---

## S15.1.1 — Semantic Color Tokens

Defined in `src/app.css` `@theme` block (light defaults) and overridden in
`html.dark { }`:

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

Components must not use arbitrary Tailwind spacing values for structural sizing.
Use the space scale tokens via `var()` in component CSS.

---

## S15.1.4 — Motion and Elevation Tokens

Defined in `src/app.css` `:root` block.

### Duration tokens

| Token                | Value | Use                                      |
| -------------------- | ----- | ---------------------------------------- |
| `--duration-instant` | 0ms   | Used when reduced-motion is active       |
| `--duration-fast`    | 100ms | Micro-interactions: button press, toggle |
| `--duration-medium`  | 200ms | Panel transitions, dropdown open         |
| `--duration-slow`    | 350ms | Sheet slide-in, page transition          |

The `@media (prefers-reduced-motion: reduce)` block sets all three duration
tokens to `0ms`, globally collapsing CSS transitions.

### Easing tokens

| Token                 | Value                          | Use                      |
| --------------------- | ------------------------------ | ------------------------ |
| `--easing-standard`   | `cubic-bezier(0.4, 0, 0.2, 1)` | Default transitions      |
| `--easing-decelerate` | `cubic-bezier(0, 0, 0.2, 1)`   | Elements entering screen |
| `--easing-accelerate` | `cubic-bezier(0.4, 0, 1, 1)`   | Elements leaving screen  |

### Elevation (shadow) tokens

| Token         | Value                         | Use                |
| ------------- | ----------------------------- | ------------------ |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)`  | Subtle card shadow |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.12)` | Panels, dropdowns  |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.18)` | Modals, overlays   |

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
```

### Using motion tokens in CSS

```css
.my-panel {
	transition: transform var(--duration-medium) var(--easing-decelerate);
}
```

### Using elevation tokens

```css
.my-dropdown {
	box-shadow: var(--shadow-md);
}
```
