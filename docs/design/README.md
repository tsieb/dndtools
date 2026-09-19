# Design

Lamplight's design is the warm "candle-lit" system: an espresso brown-black neutral ramp under one
warm-gold accent, behind a single `data-theme` swap. It is defined once in the design package and
realized in the React app.

## 1. Where the design lives

| Source                                     | What it is                                                                                                                                                         | Edited by                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** — the design system                  | claude.ai/design project `8ae04609-d2e8-47b6-8989-7bac8fce7edf`: tokens, guidelines, components, templates, the published `_ds_bundle.js`, and the handoff runbook | Claude Code through the DesignSync MCP, or the UI                                                                                                                                                                                                                                                                                                                                       |
| **B** — the prototype                      | claude.ai/design project `20316ed7-4fd5-4edd-8294-48f899b74252`: the click-through app (`app.jsx`, `views/*.jsx`, `campaign-data.js`) consuming a pinned copy of A | The claude.ai/design UI only (read-only to DesignSync)                                                                                                                                                                                                                                                                                                                                  |
| **R** — this repo                          | `apps/gm-react`: the shipping product, reskinned toward A and B                                                                                                    | Claude Code directly                                                                                                                                                                                                                                                                                                                                                                    |
| [`../design-package/`](../design-package/) | The vendored copy of A: `tokens/`, `components/`, `templates/`, `handoff/APPLY.md`, `readme.md` (content voice, visual foundations, iconography)                   | Re-vendored from A. Prose — `readme.md`, `SKILL.md`, `handoff/APPLY.md` — may be corrected in place when A is unreachable; record it under _Vendored bundle version_ below and push it upstream on the next sync. Generated output is never hand-edited: `tokens/`, `components/`, `templates/`, `styles.css`, `support.js`, `handoff/redesign.tokens.css`, `handoff/before-after.html` |

B depends on A; the repo depends on A; A depends on nothing. Never invert this. B pins a frozen
bundle of A, so A can drift ahead until the bundle is re-imported. DesignSync is available only in
the `ux-ui-reviewer` agent, not to general agents.

### Vendored bundle version

`../design-package/` was last re-vendored from A on 2026-07-03, repo commit `ff07b838`
(`chore(design-package): re-sync vendored design reference from claude.ai/design`). **That commit is
the only version identifier we have.** Source A publishes `_ds_bundle.js`, but no bundle file or
`SOURCES.md` is vendored into this repo, so there is no upstream version string to quote here, and
the live version could not be read — DesignSync returns `DesignSync needs design-system
authorization` in non-interactive sessions, and `/design-login` must be run once from an interactive
Claude Code session on this machine before a headless run can reach A. Re-check and replace this
paragraph with the real upstream version as part of the next successful re-vendor.

Where the package and the app disagree, **the app is the truth — except on the system picker**,
where each side is ahead on a different half. Current known drift, tracked by RC-DSN-2.4:

| Point          | Package                                                                                                                                            | App                                                                                               | Truth   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| Branding       | prose swept to Lamplight in place (`readme.md`, `SKILL.md`, `handoff/APPLY.md`); 10 `DND Tools` strings remain in re-vendor-only files — see below | Lamplight                                                                                         | app     |
| Themes         | documents five app themes; vendored tokens still carry three                                                                                                    | five ship: `tavern` default, `parchment`, `scholar`, `dungeon`, `high-contrast`                                        | app     |
| Fonts          | `tokens/fonts.css` genuinely `@import`s Google Fonts, and its caveat says so                                                                       | self-hosted `@fontsource/*`                                                                       | app     |
| Forced colors  | no `@media (forced-colors: active)` block in `tokens/colors.css`                                                                                   | `styles/tokens/colors.css`                                                                    | app     |
| Tile tokens    | absent                                                                                                                                             | 48 `--color-tile-*` in `styles/tokens/colors.css` (RC-CAN-2.1)                                    | app     |
| Widget builder | no `templates/widget-builder/`                                                                                                                     | `src/screens/extensions/WidgetBuilder.tsx`                                                        | app     |
| System picker  | `templates/system-package-picker/SystemPackagePicker.dc.html` (gallery ↔ detail layout); no `components/system/SystemPackageCard.jsx`              | `src/ds/components/system/SystemPackageCard.jsx`, consumed by `src/screens/extensions/System.tsx` | neither |

The branding residue is header comments and one generated demo, in files this repo re-vendors
rather than hand-edits: `styles.css`, `tokens/{colors,typography,spacing,fonts,base}.css`,
`components/core/Icon.{jsx,d.ts}`, `handoff/redesign.tokens.css`, `handoff/before-after.html`. They
clear on the next export from A; `grep -rn 'DND Tools' docs/design-package/` is the check.

**Not drift.** All eleven RC-DSN-2.2 supporting primitives are vendored on both sides — `Stepper`,
`ListItem`, `RadioCard`, `Menu`, `Toolbar`, `Callout`, `Kbd`, `HelpTip`, `FeatureSpotlight` in
`../design-package/components/core/`, `TagInput` in `components/forms/`, `Figure` in
`components/data/` — each with a `.jsx` + `.d.ts` in the package, and a `.jsx` + colocated
`.test.tsx` under `apps/gm-react/src/ds/components/{core,forms,data}/`. A 2026-09-16 revision of
this table listed them as package-side prose only; that was wrong and is corrected here.

The G1 finding in [`../planning/RC_ROADMAP.md`](../planning/RC_ROADMAP.md):146 says the package
"ships a `system-package-picker` template that nothing implements". That was the state when the
finding was written; `System.tsx` implements it now, and the roadmap's own status row at :186
already records G1 as closed. Read :146 as a snapshot, not as current state.

RC-DSN-1.2 implements `scholar` and `dungeon` in the app, taking the set to five (see
[Themes](#themes)). The package readme describes the shipped app presets; its generated
`tokens/colors.css` still carries three. This prose correction must be carried upstream on the
next successful re-vendor, along with the two new token ramps.

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

### Themes

Five themes, each a set of `[data-theme='…']` blocks in `colors.css`, all harmonised in OKLCH in the
warm family. The core semantic tokens are written as hex with their OKLCH coordinates in comments, so
the lints and the native window chrome measure the exact colour the browser paints.

| `data-theme`    | Scheme | For                                             | Ground and accent (OKLCH)                                       |
| --------------- | ------ | ----------------------------------------------- | --------------------------------------------------------------- |
| `tavern`        | dark   | The default and hero: a candle-lit table        | espresso ramp at H 70; gold accent at L 0.79, C 0.10            |
| `parchment`     | light  | Warm reading and prep                           | vellum at H 80; burnt-sienna accent                             |
| `scholar`       | light  | Long writing: a quieter, cooler page            | paper at H 95 with C ≤ 0.014; navy ink accent at H 262          |
| `dungeon`       | dark   | Dim tables: the least glow, the brightest marks | near-black at H 70, L 0.10–0.24; gold accent at L 0.85, C 0.135 |
| `high-contrast` | dark   | The accessibility floor                         | black and white, AAA text                                       |

Settings › Appearance also offers **System**. It is a stored preference, not a theme: it paints
`parchment` when the device is light and `tavern` when it is dark, at boot (`public/prepaint.js`) and
live afterwards (`src/platform/theme.ts`). With nothing stored the app opens on `tavern` whatever the
device says. The preset list is spelled once in `src/platform/theme.ts`; the boot script, the
Electron preloads, and the Electron window palette keep copies that `src/platform/theme.test.ts`
holds in step.

Both lints check all five themes and fail on any `[data-theme='…']` block they do not know. The
forced-colors block is scoped `:root, [data-theme]` so it reaches every theme, and the non-text lint
fails if that scope narrows. Visual baselines: `apps/gm-react/tests/e2e/themes.spec.ts` renders a
swatch board of every semantic token per theme (no text, so the pixels match across Linux hosts).

Rules: components reference semantic tokens (or `T` in `screen-kit.tsx`), never raw hex or a theme's
value; a theme swap is one attribute change with zero component edits. Lints: `pnpm tokens:contrast`
(text pairs) and `pnpm a11y:contrast` (non-text, wired into `pnpm lint`).

Verify palette changes from the repository root with both contrast commands, then run
`pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/themes.spec.ts`.
The desktop project compares all five swatch baselines with zero pixel tolerance; both desktop and
mobile check theme selection, reload persistence, live System changes, and forced-colors coverage.
Review intentional palette changes visually before updating the five committed PNG baselines.

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
case, verbs first, explicit safety language: name every visibility that differs from GM-only, no engine jargon, no
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
