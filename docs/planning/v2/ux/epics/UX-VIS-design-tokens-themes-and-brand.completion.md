# Completion — UX-VIS-design-tokens-themes-and-brand

UX workpack status: `complete`

Epic: Design Tokens, Themes, and Brand Mood (phase "01 Foundations", P0).
Requirement coverage: UX-VIS-001, UX-VIS-002, UX-VIS-003, UX-VIS-004, UX-VIS-005, UX-VIS-006,
UX-VIS-007, UX-VIS-008, UX-VIS-012, UX-VIS-013.

## Summary

This foundational epic replaces the prototype "narrow slice" stylesheet with the production
semantic design-token system that later epics consume. The v2 stylesheet
(`apps/v2/app/src/routes/styles.css`) is restructured into four layers: (1) theme-invariant tokens
(typography, spacing, radius, elevation shape, z-index, motion), (2) per-theme colour tokens for
all five named themes, (3) a legacy alias bridge so the existing component rules resolve per active
theme, and (4) a token-only component layer (no bare colour / radius / spacing literals). A
device-local theme store plus a no-FOUC boot script make theme switching a single `data-theme`
attribute swap; a settings radiogroup exposes the choice; a contrast-validation CLI guards every
theme. No surface regresses to a document-list home; all changes are token infrastructure plus a
settings control.

## Demo path / surfaces

- Desktop / Tablet / Mobile (identical token behaviour; density follow-up is UX-VIS-011):
  - Open `/settings`. The new **Theme** panel is a WAI-ARIA `radiogroup` with `System`, `Tavern`,
    `Parchment`, `Dungeon`, `Scholar`, and `High contrast`. Selecting an option applies the theme
    instantly (one `data-theme` swap on `<html>`), persists it on the device, and emits a polite
    live-region announcement ("Theme changed to Dungeon"). Keyboard: arrow keys move and select
    within the group (roving tabindex); Space/Enter selects the focused option; a visible focus ring
    appears in every theme.
  - First paint: the inline boot script in `app.html` reads the saved preference (or the OS
    colour-scheme for `System`) and sets `data-theme` + `color-scheme` before hydration, so there is
    no flash of the wrong theme. Dark-first: a fresh install on a dark OS opens in `tavern`.
  - The command palette overlay, mobile local-nav sheet, and modal scrims now read elevation,
    z-index, and surface-tone tokens (e.g. the palette is `--color-surface-raised` + `--shadow-lg`
    at `--z-command`).
- Demonstrable artifacts:
  - `pnpm tokens:contrast` — validates 96 foreground/background pair ratios across all five themes
    (UX-VIS-012).
  - `pnpm --filter @dndtools/v2-app exec vitest run tests/unit/theme-tokens.test.ts tests/unit/theme-store.test.ts`
    — token-matrix completeness, no-raw-literal component layer, forced-colors mapping, and store
    behaviour.

## Requirement coverage / traceability

| Requirement | How satisfied | Evidence |
|---|---|---|
| UX-VIS-001 (dark-first default, instant + persisted switch, a11y, forced-colors) | `tavern` is the default; `system` resolves dark→tavern / light→parchment; theme store applies/persists/announces; `app.html` boot script prevents FOUC; `@media (forced-colors: active)` maps tokens to system keywords | theme store + `app.html` + `ThemeSelector.svelte`; `theme-store.test.ts`; forced-colors test in `theme-tokens.test.ts` |
| UX-VIS-002 (semantic colour token set; no raw hex in components) | Full token set defined in the token layer; component layer uses `var(--…)` only | `theme-tokens.test.ts` "no raw hex/rgb/hsl in component layer"; tavern text/bg AAA check |
| UX-VIS-003 (full five-theme matrix) | Every theme block defines all 42 semantic colour tokens; light themes also override shadow + color-scheme | `theme-tokens.test.ts` "every theme defines every token"; `pnpm tokens:contrast` |
| UX-VIS-004 (typography scale + font stack) | Inter/Cinzel/JetBrains-Mono stacks; Major-Third scale tokens; display serif reserved for ≥24px headings (route `h1`) | `theme-tokens.test.ts` font-size + display-font-≥24px checks |
| UX-VIS-005 (4/8px spacing scale) | Spacing scale + component structural tokens; component padding/margin/gap use tokens only | `theme-tokens.test.ts` spacing-compliance check |
| UX-VIS-006 (radius tokens) | Five radius tokens; all component `border-radius` reference `--radius-*` | `theme-tokens.test.ts` radius check |
| UX-VIS-007 (elevation/shadow) | Three shadow levels; dark themes use reduced-opacity shadows + tonal surface steps; light themes override | shadow tokens per theme; palette/sheet/dialog rules consume them |
| UX-VIS-008 (z-index system) | Named z-index scale incl. `--z-dm-boundary`; component `z-index` references `--z-*` | `theme-tokens.test.ts` z-index check |
| UX-VIS-012 (contrast per theme; AAA high-contrast) | Contrast CLI validates AA/AAA floors across all themes; tavern text/bg ≥7:1; high-contrast ≥21:1 | `pnpm tokens:contrast` (96 checks); `theme-tokens.test.ts` AAA + 21:1 assertions |
| UX-VIS-013 (visual language / brand mood) | Warm-dark default, single warm-gold accent, subtle radial body gradient as the only decoration, Cinzel display heading, no textures on contrast-bearing surfaces, brand-font discipline | `theme-tokens.test.ts` font-family + no-`url()` checks |

## Actor-safety / no-leak evidence

- This epic is presentation-token infrastructure; it adds no data queries and no actor-conditional
  rendering. The DM-only visibility tokens (`--color-dm-only-badge`, `--color-dm-only-subtle`,
  `--color-hidden-content-stripe`) and the top `--z-dm-boundary` layer are **defined** here for the
  later content/canvas epics to consume; no DM-only content is rendered or exposed by this epic.
- The full Playwright suite (including the player/observer no-leak specs) passed on both profiles
  after the change, confirming theme/token swaps did not alter any actor-filtered behaviour.
- The theme preference is device-local (Contract 1) and never enters the vault or sync stream.

## Tests / gates run

- `pnpm v2:ux-workpack:validate` — PASS.
- `pnpm docs:validate` — PASS.
- `pnpm lint` (eslint + lint:navigation + **lint:tokens** + audit:repo) — PASS (lint:tokens green;
  the v1 token-compliance lint targets repo `src/` and is unaffected; v2 token compliance is
  enforced by the new vitest token test + `pnpm tokens:contrast`).
- `pnpm tokens:contrast` — PASS (96 pair checks across 5 themes; new dedicated UX-VIS-012 gate).
- `pnpm v2:lint` (platform/boundary lint) — PASS (theme store registered in
  `platform-access-exceptions.json` for `localStorage` + `viewport-sniff`, mirroring nav-history).
- `pnpm --filter @dndtools/v2-app test` — PASS (90 tests, incl. 21 new theme tests).
- `pnpm --filter @dndtools/v2-app typecheck` (svelte-check) — 0 errors (972 files; one pre-existing
  `@types/node` warning unrelated to this epic).
- `pnpm --filter @dndtools/v2-app exec playwright test` — PASS on **desktop-chromium** and
  **mobile-chromium**: 525 passed, 21 profile-conditional skips, 0 failures.

## Quality review summary

- Correctness/architecture: token layering (palette→semantic→component) per the UX doc; theme swap
  is a single attribute change; device-local preference store follows the established platform-store
  pattern.
- Tests: non-vacuous — the token test fails closed on any raw literal or missing theme token; the
  contrast CLI computes real WCAG ratios.
- Accessibility: radiogroup with keyboard parity + visible focus ring + live announcement; AA/AAA
  contrast verified; forced-colors mapped; reduced-motion floor present.
- Performance/persistence/offline: no-FOUC boot, instant swap, localStorage-only persistence, fully
  offline (no web-font network dependency — see gaps).
- Security/permissions: no actor-conditional logic; DM-boundary tokens defined for later epics.
- Maintainability/docs: heavily commented stylesheet sections keyed to requirement IDs; new
  `pnpm tokens:contrast` script.

## Known gaps / deferred

- **Web fonts not network-loaded** (deliberate, ADR-014 local-first): font stacks list Inter /
  Cinzel / JetBrains Mono first with full system fallbacks, so typography works offline and renders
  immediately. Self-hosting the web fonts (so the genre display serif always appears) is a small
  follow-up; the UX-VIS-004 fallback acceptance path is satisfied today.
- **Motion system (UX-VIS-010)** and **density modes (UX-VIS-011)** are out of this epic's scope;
  this epic ships the foundational motion duration/easing tokens plus an OS reduced-motion floor,
  but the `data-motion`/`data-density` resolvers and precedence rules belong to those epics.
- **Iconography (UX-VIS-009)** is out of scope.
- Legacy short-name aliases (`--bg`, `--fg`, `--accent`, …) are retained as a semantic bridge so the
  existing component rules consume the new tokens without churn; a later pass may rename usages to
  the canonical `--color-*` names.

## Git evidence

- Branch: `ux/UX-VIS-design-tokens-themes-and-brand` (off chain tip
  `ux/UX-ARCH-product-architecture-and-ia-reconciliation`).
- Commit: recorded in the orchestrator handoff (committed after this evidence file and the
  regenerated UX state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/v2/app/platform-access-exceptions.json
 M apps/v2/app/src/app.html
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/settings/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M docs/planning/v2/ux/epics/UX-VIS-design-tokens-themes-and-brand.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M package.json
?? apps/v2/app/src/lib/gui/ThemeSelector.svelte
?? apps/v2/app/src/lib/platform/theme.svelte.ts
?? apps/v2/app/tests/unit/theme-store.test.ts
?? apps/v2/app/tests/unit/theme-tokens.test.ts
?? docs/planning/v2/ux/epics/UX-VIS-design-tokens-themes-and-brand.completion.md
?? scripts/token-contrast-lint.ts
```
