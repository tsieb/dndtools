# RC-DSN-1.2 run journal

## Scope

Five themes: add Scholar (light, cooler, navy accent, for long writing) and Dungeon (dark, near-black,
brighter accent for dim tables), harmonised in OKLCH in the warm family; system light/dark maps to
parchment/tavern; the forced-colors block covers all five. Acceptance: both lints green ×5, a visual
snapshot ×5, the design package readme and `docs/design/README.md` updated in the same PR. No agents,
dispatcher mutations, push or promotion.

## Attempt 1 (2026-09-12)

Base `338e06cb`. No Headroom/dispatch MCP tools were used; output below is from direct runs.

### Decisions

- Palettes were derived in OKLCH from the existing ramps (tavern ground H 70, parchment H 80) and
  written as hex with the OKLCH coordinates in comments. The token lint only measures hex, and
  `windowChrome.ts` and `electron/main.cjs` need hex for native chrome. Chroma was trimmed wherever the
  first cut fell outside sRGB, so the documented OKLCH is the colour actually painted.
  - Scholar: paper at H 95, C ≤ 0.014; navy-black ink and a navy accent at H 262; parchment's status
    cuts, except info, turned to teal (H 220) so it is not confused with the accent; the layer ramp
    reuses parchment's light-surface cut.
  - Dungeon: ground at H 70, L 0.10–0.24; the accent, ink and status colours all step up (accent L 0.85
    C 0.135 vs tavern's L 0.79 C 0.10); tile accents lifted to L 0.80; borders stay warm brown.
- "System light/dark maps to parchment/tavern" is an explicit **System** choice (stored as `system`),
  not a new default. `prepaint.js` deliberately keeps a first launch on tavern whatever the OS says, and
  Playwright defaults to a light scheme, so a changed default would move every e2e run onto parchment.
  System resolves pre-paint and then follows live OS flips (`bindSystemTheme` in `main.tsx`).
- Electron: `applyWindowTheme` sets `nativeTheme.themeSource`, which also drives the renderer's
  `prefers-color-scheme`. Pinning it to the preset's scheme would lock a System user on whichever
  preset was painted first, so the bridge now passes a `followSystem` flag and main leaves the
  source on `system` in that case.
- The preset list lives once in the new `src/platform/theme.ts`. `prepaint.js`, both preloads and
  `WINDOW_THEMES` in `main.cjs` cannot import it; `theme.test.ts` scans them and fails on drift.
- Lint hardening: the token lint now fails (rather than skipping) on a non-hex value in a checked
  pair, and both lints fail on a `[data-theme='…']` block they do not know. The non-text lint also
  checks that the forced-colors block's selector reaches every named theme.
- Visual snapshot: a swatch board of every semantic token per theme, inside the real app document
  after prepaint restored the theme from storage. It has no text and no shadows because baselines are
  written on this Fedora host and compared on the Ubuntu CI runner. Pixel-exact (`threshold: 0`),
  desktop project only (the board has no responsive layout).

### Paths outside the literal `owns` list

The story's `Owns:` names "Settings › Appearance", and its acceptance names both design readmes, but
the dispatcher's owned-path list only carries the three file paths. Everything below is needed for
the two themes to work end to end or is required by the acceptance:

- `apps/gm-react/src/screens/settings/{Appearance,Accessibility,shared}.tsx`: the picker, the
  high-contrast restore point (a System reader comes back to System), and theme application.
- `apps/gm-react/src/platform/theme.ts` (new), `platform/windowChrome.ts`, `src/main.tsx`: the one
  preset list, `system` resolution, live OS following, browser `theme-color` and Android bar style
  for the new presets.
- `apps/gm-react/public/prepaint.js`: without it a reload boots Scholar/Dungeon as tavern.
- `apps/gm-react/electron/{main,preload,window-preload}.cjs`: the title bar rejected unknown names.
- `apps/gm-react/src/screens/settings-validation.ts`: restore Scholar/Dungeon/System after high contrast.
- `apps/gm-react/src/screens/extensions/ThemeStudio.tsx`: mirrors Settings › Appearance's presets.
- `docs/design/README.md`, `docs/design-package/readme.md` (acceptance), and
  `docs/adr/011-theme-preset-architecture.md` (said "two more planned (RC-DSN-1.2)").
- `apps/gm-react/tests/e2e/themes.spec.ts-snapshots/*.png`: the visual baselines. Playwright's default
  snapshot directory is not the `*/__snapshots__/*` companion glob.

## Validation results

- `pnpm tokens:contrast`: exit 0, 101 pair checks across 5 themes (tavern 20, parchment 20, scholar
  20, dungeon 20, high-contrast 21). Before this change: 61 checks across 3 themes.
- `pnpm a11y:contrast`: exit 0, 319 pair checks across 5 themes (tavern 64, parchment 64, scholar 64,
  dungeon 64, high-contrast 63), 16 forced-colors remap checks, forced-colors scope reaches all 5.
  Before: 191 checks across 3 themes.
- `pnpm typecheck` (core, cloud-fns, gm-react): exit 0.
- `pnpm test:app`: 123 files, 1294 tests passed, including the new `platform/theme.test.ts`,
  `settings-validation.test.ts` and `prepaint-motion.test.ts`. The first run of `theme.test.ts` failed
  4 cases with `window is not defined`: the app vitest project defaults to `node`, so the file now
  carries the `@vitest-environment jsdom` pragma.
- `vitest run tests/unit/a11y-nontext-contrast.test.ts`: 14 passed (new coverage case plus two
  negative probes: an unknown theme block, and a forced-colors selector narrowed to tavern).
- `pnpm test:tooling`: 164 passed, 1 failed. `tests/unit/electron-hardening.test.ts` ("keeps privileged
  window and persistence controls fail-closed") expects two `devTools: !app.isPackaged` in `main.cjs`.
  HEAD `338e06cb` already has three (lines 489, 551, 612), so it fails on the base as well. This diff
  only shifts those lines. Not fixed here; outside this story.
- `pnpm lint`: exit 0; 15 warnings, all in files this task did not touch.
- `pnpm gates`: exit 0 (warn-only file-size notes, none on task files). `git diff --check`: clean.
- `pnpm --filter @dndtools/gm-react build`: built; `check-prod-bundle` OK.
- Prettier `--write` on every changed file; ESLint on every changed TS file: clean (the `.cjs` files
  are on ESLint's ignore list).
- Playwright on the per-worktree port:
  - `themes.spec.ts --update-snapshots` wrote the five baselines: 13 passed, 5 skipped (mobile
    snapshot runs, by design).
  - Rerun of `themes.spec.ts settings.spec.ts` without updating: 29 passed, 5 skipped, and the five
    baselines matched pixel for pixel.
  - The scholar, dungeon and tavern boards were inspected by eye.
- Not run here: the full Playwright suite (the operator's browser gate runs it).

## Attempt 2 (2026-09-19): expanded ownership and fresh verification

Starting HEAD: `6a6d824a5f1114cedde89ad5774de67381880a92`; working tree clean. The previous
implementation, tests and five baselines are already committed on this task branch. The operator's
2026-09-18 brief now explicitly owns the paths named in the prior scope rejection. The path
justifications above still apply; no implementation or baseline changes were needed in this attempt.
No dispatch Headroom tools are available in this session; all results below were read directly from
the commands' original output, including their successful final exit status.

### Minimal changes and justification

- `docs/design/README.md`: add the reproducible theme browser command, desktop/mobile coverage,
  exact-pixel comparison policy and visual review requirement for intentional baseline updates.
- `docs/design-package/readme.md`: record the two five-theme lint requirements and link to that
  verification procedure, keeping the design package aligned with the app guide.
- `state/RC-DSN-1.2.journal.md`: update the explicitly requested run journal with current evidence.

### Fresh validation

- `pnpm tokens:contrast`: exit 0; 101 pair checks across all five themes
  (tavern/parchment/scholar/dungeon: 20 each; high-contrast: 21).
- `pnpm a11y:contrast`: exit 0; 319 pair checks across all five themes
  (tavern/parchment/scholar/dungeon: 64 each; high-contrast: 63), 16 forced-colors remap checks,
  with forced-colors selectors reaching all five.
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/platform/theme.test.ts
  apps/gm-react/src/screens/settings-validation.test.ts`: exit 0; 23 tests passed.
- `pnpm exec vitest run tests/unit/a11y-nontext-contrast.test.ts
  tests/unit/electron-hardening.test.ts`: exit 0; 23 tests passed. The prior Electron test failure
  does not recur; its existing fix is in ancestor commit `d16482c5`.
- `pnpm typecheck`: exit 0 for core, cloud-fns and gm-react.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/themes.spec.ts
  tests/e2e/settings.spec.ts --workers=1`: exit 0; 29 passed, 5 intentionally skipped mobile
  swatch duplicates. All five desktop baselines matched exactly without updating snapshots.
  Both browser projects passed preset switching, new-preset reload persistence, live/reloaded
  System mapping and forced-colors coverage. Inspected all five committed swatch images visually.
- `git diff --check`: clean. Documentation formatting checked with the repository Prettier setup.

Full central gates and independent review remain the operator's responsibility. No push, promotion,
additional loop, sub-agent or dispatcher control-state mutation was performed.
