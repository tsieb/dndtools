# Design

Lamplight's design is the warm "candle-lit" system: an espresso brown-black neutral ramp under one
warm-gold accent, behind a single `data-theme` swap. It is defined once in the design package and
realized in the React app.

## 1. Where the design lives

| Source                                     | What it is                                                                                                                                                         | Edited by                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **A** — the design system                  | claude.ai/design project `8ae04609-d2e8-47b6-8989-7bac8fce7edf`: tokens, guidelines, components, templates, the published `_ds_bundle.js`, and the handoff runbook | Claude Code through the DesignSync MCP, or the UI      |
| **B** — the prototype                      | claude.ai/design project `20316ed7-4fd5-4edd-8294-48f899b74252`: the click-through app (`app.jsx`, `views/*.jsx`, `campaign-data.js`) consuming a pinned copy of A | The claude.ai/design UI only (read-only to DesignSync) |
| **R** — this repo                          | `apps/gm-react`: the shipping product, reskinned toward A and B                                                                                                    | Claude Code directly                                   |
| [`../design-package/`](../design-package/) | The vendored copy of A: `tokens/`, `components/`, `templates/`, `handoff/APPLY.md`, `readme.md` (content voice, visual foundations, iconography)                   | Re-vendored from A; not hand-edited                    |

B depends on A; the repo depends on A; A depends on nothing. Never invert this. B pins a frozen
bundle of A, so A can drift ahead until the bundle is re-imported. DesignSync is available only in
the `ux-ui-reviewer` agent, not to general agents.

The vendored package is behind the app on three points the roadmap tracks as RC-DSN-2.4: it still
says "DND Tools", claims five themes, and loads fonts from a CDN. The app is the truth for all
three: three themes ship (`tavern` default, `parchment`, `high-contrast`), fonts are self-hosted, and
the product is Lamplight.

## 2. Tokens

All visual decisions are CSS custom properties under `apps/gm-react/src/styles/tokens/`, aggregated
by `styles/index.css` in a load-bearing order: `fonts.css → colors.css → typography.css →
spacing.css → base.css`. Token names match the design package one to one, so a treatment transfers
by matching values, never contracts.

- `colors.css` holds every raw palette value; nothing else may. Themes are selected by `data-theme`
  on `<html>`. Families: surfaces (`--color-bg`, `--color-surface*`), borders, text
  (`--color-text-primary/secondary/tertiary/inverse/link`), accent (`--color-accent*`), status
  (`--color-status-{success,warning,error,info}` with `-text` / `-subtle`), the safety-critical
  `--color-dm-only-*`, map and layer hues re-harmonised in OKLCH, and `--shadow-{sm,md,lg}`. A
  `@media (forced-colors: active)` block remaps semantic tokens to system colours.
- `typography.css`: `--font-sans` (Inter), `--font-display` (Cinzel, 24px and up only),
  `--font-mono` (JetBrains Mono, all numerals and dice); scale `--text-2xs … --text-3xl`.
- `spacing.css`: the 4px grid (`--space-*`), radius, z-index, motion (`--duration-*`,
  `--easing-*`, and the `--motion-*` timing pairs; durations collapse to 0 under
  `[data-motion='reduced'|'none']`), icon sizes, focus ring, touch targets, and the `--density-*`
  sets selected by `data-density`.
- `fonts.css`: self-hosted `@fontsource/*` faces, no CDN.
- `base.css`: reset, the one decorative candle-glow on `<body>`, and the global `:focus-visible` ring.

Rules: components reference semantic tokens (or `T` in `screen-kit.tsx`), never raw hex or a theme's
value; a theme swap is one attribute change with zero component edits. Lints: `pnpm tokens:contrast`
(text pairs) and `pnpm a11y:contrast` (non-text, wired into `pnpm lint`).

### Motion

Five named transitions cover the app's motion. Each one is a `@keyframes motion-<name>` in
`styles/index.css`, a `--motion-<name>` timing token (`<duration> <easing>`) in `spacing.css`, and a
`.motion-<name>` class that applies both.

| Name          | For                               | Timing                                         |
| ------------- | --------------------------------- | ---------------------------------------------- |
| `fade-in`     | scrims, tooltips, swapped content | `--duration-fast`, decelerate                  |
| `rise`        | toasts, dialogs, cards arriving   | `--duration-standard`, decelerate, up from 8px |
| `sheet-slide` | sheets and drawers                | `--duration-moderate`, decelerate              |
| `shimmer`     | loading skeletons                 | `--duration-loop-shimmer` (1.4s), repeats      |
| `pulse`       | live or pending status            | `--duration-loop-pulse` (1.8s), repeats        |

`sheet-slide` enters from the bottom. A side sheet sets `--motion-sheet-from: translateX(100%)` (or
`-100%` for the left edge). Where a class won't do, write `animation: motion-rise var(--motion-rise)
both`. Check this list before adding a new `@keyframes`.

`--easing-spring` overshoots, so only dice results and celebrations get it. The dice-drama story's
files (`DiceResult.jsx`, `DiceTray.tsx`, `QuickPanel.tsx`) are the only ones allowed to reference it,
and none of the five named transitions uses it.

Reduced motion comes down to one attribute. `public/prepaint.js` weighs the stored preference against
`prefers-reduced-motion` and writes `data-motion` on `<html>` before first paint. Under `reduced` or
`none`, `spacing.css` zeroes every duration token, loop periods included, and `index.css` clamps every
animation and transition to a single ~0ms run. Entrances end on their resting frame and the pulse
starts and ends on it, so a collapsed run leaves content in place instead of half-faded. No component
needs its own `prefers-reduced-motion` query. `apps/gm-react/src/screens/prepaint-motion.test.ts`
enforces all of this.

The DS `Dialog`, `Sheet`, `Toast`, `Tooltip`, `CommandPalette`, `StatusDot`, `Skeleton`, and
`ProgressMeter` still inline their own `dnd*` keyframes, and `base.css` still defines the older
`dnd-shimmer`. The global clamp covers them. Moving them onto the vocabulary is for the stories that
own those files.

## 3. Components

The React design system is `apps/gm-react/src/ds/components/<group>/`, imported through the `../ds`
barrel and typed loosely by `src/ds/index.d.ts`. Groups mirror the package: core, forms, feedback,
overlay, navigation, command, domain, creature, condition, spell, campaign, map, data, system.
The `creature`, `condition`, `spell`, and `domain` groups are the D&D 5e reference package's
realization of the System Package contract; feed them another package's vocabulary for another game.
`Dialog.jsx` owns modal semantics (trap, Escape, scroll lock, focus restore); `Icon.jsx` owns the
Lucide registry ([`../reference/ICON_VOCABULARY.md`](../reference/ICON_VOCABULARY.md)).

Content voice, visual foundations, and the iconography rules are in the vendored
[`../design-package/readme.md`](../design-package/readme.md) and are binding for copy: sentence
case, verbs first, explicit safety language (DM only · Shared · Player visible), no engine jargon, no
emoji, no exclamation marks.

## 4. Porting from the prototype

When reskinning a screen, fetch the matching `views/<group>.jsx` from B (DesignSync `get_file`,
256 KiB cap per file) and copy the visual structure using DS components and token styles. Data is
wired through `useRuntime()` and the actor-filtered core queries; mutations go through
`runtime.dispatch`. Translation rules: `window.DNDToolsDesignSystem_8ae046.X` → `import { X } from
'../ds'`; `A.Page` / `A.Panel` / `T` → `../app/screen-kit`; data globals → demo-seed commands; store
reads → local state; `go(id)` → `navigate(path)`. Be null-safe for an empty vault. The theme,
density, and motion attributes on `<html>` are set from `localStorage` on boot and from Settings ›
Appearance.
