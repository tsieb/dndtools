# RC-DSN-1.4 run journal

## Scope

Density audit. Owns `styles/tokens/spacing.css` (density sets), `app/screen-kit.tsx`,
`tests/e2e/responsive.spec.ts`. Nav item 48/36/28, cards 16/12, list gaps; touch lock to
comfortable verified on Android. Acceptance: `responsive.spec` target-size checks. No agents,
dispatcher mutations, push or promotion.

## Attempt 1 (2026-09-12)

Base `d16482c5`. It contains the per-worktree e2e port fix `5d7bf943`.

### What the audit found

- **The nav item token never existed.** DS `NavItem` sizes itself with
  `min-height: var(--density-nav-item-height, 40px)`, but no density set defines
  `--density-nav-item-height`. Every nav item sat on the 40px fallback at all three densities. The
  48/36/28 values were already in the sets, but as `--density-nav-height`, which nothing reads
  except the Android block in `styles/index.css`.
- **Cards ignored density.** DS `Card` pads with `--component-card-padding`, a fixed `--space-4`.
  `--density-card-padding` (16/16/12) had no consumer. screen-kit `Panel`, the app's card (about
  190 call sites), defaulted to a raw 18px.
- **List gaps had no consumer.** `--density-list-gap` (8/4/2) and `--component-list-gap` were both
  defined and read nowhere.
- **The comment's touch lock claim was only half true.** `public/prepaint.js` does lock every
  viewport under 1200px to `comfortable` at boot. At 1200px and wider it honours the stored choice,
  and that includes Android landscape tablets. `html[data-android]` raises only the 48dp control
  sizes (touch target, nav, input, button). Card padding, list gap, icon size and type stayed
  compact on an Android device that had stored `compact`.

### Plan

- `spacing.css`: add `--density-nav-item-height` to each set (36/48/28). Point
  `--component-card-padding` and `--component-list-gap` at the density set. Add an
  `html[data-android]` block that pins the rest of the comfortable set. Correct the lock comment.
- `screen-kit.tsx`: a `T.density` group over the density tokens, and `Panel` padding defaults to
  the density card padding.
- `responsive.spec.ts`: target-size checks for each density on the rail (where the DS `NavItem`
  renders), the boot lock by viewport, and the Android lock with `compact` stored.

### Outside the owned paths (not changed)

- The desktop sidebar rows (`app/shell/rows.tsx` `SideRow`) are hand-rolled buttons with fixed
  `8px 10px` padding and do not read the nav item token. They measure about 36px, which matches
  standard. Making them follow density means editing `rows.tsx`, which this story does not own.
- `docs/design-package/tokens/spacing.css` is the package copy. It now lags the app copy by the
  nav item token and the Android lock (sources A → R; re-syncing the package is separate work).

### Changes

- `spacing.css`: `--density-nav-item-height` 36/48/28 in the standard, comfortable and compact
  sets. `--component-card-padding` and `--component-list-gap` now read the density set, so DS
  `Card` pads 16/16/12. New `html[data-android]` block pins nav item 48, card padding 16, list gap
  8, icon 24 and base type. The density comment now describes the prepaint lock accurately.
- `screen-kit.tsx`: a `T.density` group (touch, focus, nav, navItem, cardPad, listGap, icon, input,
  button, font). `Panel` padding defaults to `T.density.cardPad`, so 18px → 16px (12px compact).
  `pad` accepts a string so callers can pass tokens. Callers that pass a number are unchanged.
- `responsive.spec.ts`: three target-size tests.
  - Each density chosen through Settings › Appearance on the 800px rail: rail NavItem min-height
    48/36/28 and rendered height at least that, the 24px floor on every nav item and density
    option, Appearance Panel padding 16/16/12, list gap 8/4/2.
  - Boot lock: `compact` stored boots compact at 1440px (nav 28, card 12, gap 2) and comfortable
    at 800px after a reload, with rail items at least 48px tall and 44px wide.
  - Android lock: Android runtime with `compact` stored at 1280px boots `data-density="compact"`,
    yet the tokens resolve to nav 48, card 16, gap 8, icon 24. The Appearance Panel pads 16px, and
    every Primary nav button, density option and Settings category is 48dp or larger.

### Gates run here

- The Android test first failed on `icon: 32` instead of 24. That was the probe, not the lock: the
  probe carried the card padding, and under `box-sizing: border-box` 16px + 16px of padding clamped
  a 24px width up to 32. The icon size is now read from `column-gap`. The lock was right as written.
- Full `responsive.spec.ts`, both projects, on the worktree-derived port: **86 passed, 0 failed**
  (`/tmp/rc-dsn-14-responsive-full.log`).
- `pnpm lint`: 0 errors, the 15 existing warnings. Raw-style count is unchanged at 2583 across 260
  files, and the `screen-kit.tsx` allowance of 20 is still exact, so no ratchet edit was needed.
  Boundary and non-text contrast gates are green.
- `pnpm --filter @dndtools/gm-react typecheck` passed.
- Unit tests `screen-kit-seg`, `screen-kit-radiogroup`, `screen-kit-loading-region` and
  `prepaint-motion` through `vitest.app.config.ts`: 21 passed.
- No other e2e spec asserts the old 18px Panel padding, the 40px nav fallback or `data-density`.
- The full Playwright suite was not run here. `Panel` padding changes on every route, so the
  central operator's full run is the check for layouts outside `responsive.spec`.

## Revision 2 — review rejection: the audited sizes never reached the rail

The independent review rejected revision 1 for two medium acceptance gaps: rail heights measured
**48/44/44** rather than the audited 48/36/28, and no production list consumed the density list-gap
token. Both were correct, and both had the same cause.

### Root cause

Revision 1 defined `--density-nav-item-height` and pointed `--component-list-gap` at the density set,
then asserted them on a **synthetic probe** — a detached `<div>` laid out with the tokens. The probe
resolved 48/36/28 and 8/4/2 honestly, but nothing in the app consumed either value:

- `ds/components/navigation/NavRail.jsx` passed every item `style={{ width: 44, height: 44 }}`. That
  fixed square sat _above_ compact's and standard's `min-height` and _below_ comfortable's, so the
  rail rendered 48/44/44 and the Density control moved nothing below Comfortable. The inline `height`
  also outranked the token, so no amount of token work in `spacing.css` could have reached it.
- The rail's scrolling list used `gap: var(--space-1)` — a hardcoded 4px, never the density gap.

Measured before the fix (`data-density` driven live through Settings › Appearance, 800×900):
`comfortable 48 · standard 44 · compact 44`, list gap `4px` at all three.

`NavItem` itself was already correct — `minHeight: var(--density-nav-item-height, 40px)`. Only the
call site overrode it. Note the DS `NavItem` is reached _only_ through `NavRail`; the desktop sidebar
is the app's own `app/shell/rows.tsx`, so the tablet rail is the single surface under this audit.

### Fix

`NavRail.jsx` — the one file both defects live in, and outside this story's declared `owns` list. The
declared paths (`screen-kit.tsx`, `spacing.css`, `responsive.spec.ts`) cannot reach an inline style,
so meeting the acceptance criteria required editing it; flagging that explicitly.

- Item box is now `width`/`height: var(--density-nav-item-height)` with `padding: 0`, so the rendered
  square follows density. `padding: 0` lets the 20px glyph centre inside the 28px compact box.
- `flex: '0 0 auto'` so a tall rail scrolls instead of shrinking items under the 24px WCAG 2.5.8
  floor — a column flex item with a fixed height is otherwise shrinkable.
- The list container's gap is now `var(--component-list-gap)`.

Measured after: `comfortable 48 · standard 36 · compact 28`, list gap `8 / 4 / 2`. Comfortable's 48px
is exactly the rail's 64px width minus its 2×8px padding, so nothing overflows.

### Test tightening

The reviewer's third point — "the new tests allow both gaps" — was the real defect. `responsive.spec`
asserted `min-height` exactly but only a _lower bound_ on rendered height, which 44px satisfies at
standard and compact. Now:

- `railNavItems` also reports the real list container's `rowGap`, so the gap is measured where the app
  lays rows out, not on a probe.
- Rendered `height` _and_ `width` are asserted with `toBeCloseTo(set.navItem, 1)` — exact, not a floor.
- `expect(item.listGap).toBe(set.listGap)` on the production list.
- The comfortable boot-lock test moved from `>= 47.5 / >= 43.5` to exactly 48×48 plus an 8px gap.

### Gates run here

- **Mutation-checked all three assertions** against the pre-fix code, individually:
  - full pre-fix `NavRail` → 2 failed (`rendered nav item width (comfortable)`: received 44).
  - list gap reverted alone → 1 failed (`the rail list gap (comfortable)`: expected 8, received 4).
  - `height: 44` alone, i.e. the exact 48/44/44 shape the reviewer flagged → 1 failed
    (`rendered nav item height (standard)`: expected 36, received 44).
    None of these failed before the tightening, which is why revision 1 passed 86/86 while broken.
- `responsive.spec.ts`, both projects, worktree-derived port 5417: **86 passed, 0 failed**.
- `pnpm lint` 0 errors (15 pre-existing warnings), boundary + non-text contrast gates green.
- `pnpm typecheck` clean. `pnpm build` clean (`check-prod-bundle` OK).
- `pnpm test`: 1287 passed (123 files) + 162 passed (24 files). No unit test covers `NavRail`.
- Full Playwright suite, both projects: started, but the session was torn down mid-run and the run
  was killed at **581/1108**. It is therefore NOT a completed gate and is not claimed as one. What
  it did cover: the whole `desktop-chromium` project (568 tests) finished with **one** failure,
  `sync.spec.ts:9` (see below); `mobile-chromium` only reached 13 tests. The central operator's own
  full run is the gate of record here.

### Scope note

`app/shell/rows.tsx` `SideGroup` still stacks the desktop sidebar on a deliberate `gap: 1` hairline,
and is not converted. It is a different navigation from the audited rail, is not measured by
`responsive.spec`, and moving it to 8px at comfortable would be a visual redesign rather than a
density audit. Raising it as a follow-up rather than folding it in silently.

### The one full-suite failure, and why it is not this change

`sync.spec.ts:9` — "a UI-authored scene grows the op-log and survives reload" — failed once on
`desktop-chromium` during the (incomplete) full run. Evidence that it is a load-related persistence
flake rather than a regression from the rail change:

- `RailNav` is the only consumer of the DS `NavItem`, and `AppShell.tsx:204` mounts it **only** at
  the 641–1024px `rail` viewport. `desktop-chromium` is Desktop Chrome at 1280×720, which mounts
  `Sidebar` instead. The changed component is not in the tree for this test, which never resizes.
- The failure's own `error-context.md` snapshot confirms it: the campaign button reads
  "Your campaign 2 scenes · 3 PCs · 2 NPCs", which is `app/shell/Sidebar.tsx`, not the rail.
- The assertion that failed is `persisted === true` after a reload, and the snapshot shows
  "Scenes · 2" (the seed count) — i.e. the created scene lost the race with the debounced
  `persistFullState` write. That is the op-log path, untouched here.
- `sync.spec.ts` on `desktop-chromium` with `--repeat-each=3`: **6 passed** with the change, and
  **6 passed** with `NavRail.jsx` reverted to HEAD. Identical either way.
- `playwright.config.ts` sets `retries: 0` locally (2 in CI), so a single flake fails a local run.

Stated limitation: the isolated re-runs were under light load, and the killed full run means the
failure was **not** reproduced at HEAD under full-suite parallel load. The isolated runs show no
deterministic break; they do not by themselves prove the flake pre-dates this branch.

### Final state

- `responsive.spec.ts`, both projects, fresh re-run on port 5421: **86 passed, exit 0**
  (`/tmp/rc-dsn14-responsive-rev2.log`).
- Committed files: `NavRail.jsx` (the fix), `responsive.spec.ts` (the tightened acceptance checks),
  this journal. The scratch probe spec used to measure the rail was deleted; no other artifacts.
- `spacing.css` and `screen-kit.tsx` are unchanged in this revision — revision 1 already had them
  right. The defect was never in the tokens, only in the call site that ignored them.

## Revision 3 — rebase onto the integration branch (`a030055e`)

Rebased both RC-DSN-1.4 commits onto `a030055e` (RC-CAN-7.7). One conflict, in
`app/screen-kit.tsx`, and it was a context collision rather than a semantic one.

**The conflict.** `957e108f` (RC-DSN-3.4, loading/skeleton/progress states) inserted a block of new
code — `LoadingProgress`, `estimateRemainingMs`, `roundEtaMs`, `LoadingProgressMeter` — into the gap
between `LoadingRegion` and `Panel`. Revision 1 had added a doc comment to `Panel` in that same gap.
Both sides are pure additions to the same region, so git could not tell they were independent.

**Resolution:** keep both. The RC-DSN-3.4 progress machinery, then the `Panel` doc comment, which
documents the function directly below it. Nothing was dropped or rewritten from either side. The
substantive parts of revision 1's `Panel` change (`pad = T.density.cardPad` and
`pad?: number | string`) sat below the conflict region and auto-merged, as did the whole `T.density`
group; they were checked by hand afterwards, not assumed.

`spacing.css` auto-merged. The two integration commits that touched it — `b54cf4c7` (RC-SES-2.4 dice
drama) and `6f80c088` (RC-DSN-1.3 motion vocabulary) — only appended motion tokens and did not touch
the density sets. All three density blocks, the `html[data-android]` touch lock and the
`--component-*` aliases were verified present after the merge.

Nothing in the integration range touched `ds/components/navigation/`, `app/shell/` or
`responsive.spec.ts`, so revision 2's `NavRail.jsx` fix applied cleanly and is intact.

### Gates re-run on the rebased tree

- `responsive.spec.ts`, both projects, port 5433: **86 passed, exit 0**
  (`/tmp/rc-dsn14-responsive-rebased.log`).
- `pnpm typecheck` exit 0. `pnpm build` exit 0, `check-prod-bundle` OK across 83 assets.
- `pnpm lint` exit 0. Boundary and non-text contrast gates green.
- `pnpm test`: 4811 + 482 + 1441 + 187 passed, 0 failed, across 466 files.

### One pre-existing note, deliberately not acted on

`pnpm lint` now prints: "1 baseline entry is above the current count; lower
`scripts/emphasis-baseline.json`" — `display-face-below-24px` is 83 against a baseline of 84. The
ratchet only fails when the count _exceeds_ the baseline, so lint still exits 0. This arrived with
the integration branch, not with this story: the full RC-DSN-1.4 diff contains zero `Cinzel`,
`font-display` or `T.disp` references. Lowering the baseline would be an unrelated edit to a shared
ratchet file that another in-flight task may also be moving, so it is flagged here rather than
folded in.

## Revision 4 — authorized rail scope and Android rail acceptance (2026-09-19)

The operator brief dated 2026-09-18 explicitly adds
`apps/gm-react/src/ds/components/navigation/NavRail.jsx` to this task's ownership.
The prior candidate commits are already on this task branch. Their rail edits are retained:

- Token-driven width/height replace the fixed 44px square to render 48/36/28 exactly.
- Zero padding permits the compact box; non-shrinking flex sizing preserves target sizes in a
  short scrolling rail.
- The list gap consumes the density alias to render 8/4/2 in the production list.
  No further NavRail edit is necessary. The density tokens and Panel defaults are also retained.

This revision extends the existing Android acceptance test to resize from the wide sidebar to
an 800x480 rail without reloading. It checks that compact remains selected while every real
rail destination stays 48x48 with an 8px list gap. This exercises the Android override and
non-shrinking targets on a short viewport, rather than relying only on synthetic token metrics.
Only the owned responsive spec and this explicitly requested run journal change in this revision.
No agents, dispatcher state edits, push, promotion or additional loop.

Validation in progress: full responsive.spec.ts on both Chromium projects with two workers.

### Current validation results

- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/responsive.spec.ts --workers=2`:
  **86 passed (1.7m), exit 0**, covering desktop-chromium and mobile-chromium. Raw output:
  `/tmp/rc-dsn-1.4-current-responsive.log` (read directly after process completion).
- `pnpm exec prettier --check apps/gm-react/tests/e2e/responsive.spec.ts`: passed, exit 0.
- `pnpm exec eslint apps/gm-react/tests/e2e/responsive.spec.ts`: passed, exit 0; raw output
  `/tmp/rc-dsn-1.4-current-eslint.log` is empty.
- `git diff --check`: passed. Full repository gates and independent review remain with the
  central operator; older journal results above are historical, not rerun in this revision.

## Revision 5 — changed-file formatting gate repair (2026-09-19)

Read the original failed gate output at
`/home/trinkle/Programming/agent-dispatcher/.state/attempts/120016cd-9178-440f-8f53-db67c361e735/output.log`.
The gate checked all five candidate files against `loop/rc` and identified only
`NavRail.jsx` and this journal. Revision 4 checked only the responsive spec's formatting,
which did not cover the earlier candidate changes.

Applied the repository's Prettier to those two files only. The authorized NavRail edits
are formatting only: expand the function arguments, scrolling-list style and footer JSX
into the required multiline layout. No values, props or density behavior changed.
The journal receives Prettier's Markdown whitespace and indentation normalization.

Validation: `pnpm format:check:changed --base loop/rc` passed for all five candidate
files (exit 0). The final journal is formatted and the same gate rerun before commit.
The 86 passing responsive checks in revision 4 remain historical evidence; they are
not rerun for this formatting-only repair. Central gates and independent review remain
with the operator. No push, promotion, agents, loop launch or dispatcher state changes.

## Revision 6 — preserve the default widget-kit card token contract

Read the original app-test failure from attempt
`08a83a65-bcdb-4745-9e04-4dd4605e0ca1/output.log`. There was one failure among 1551 tests:
`widgetKit.test.ts` compares the kit's default token declarations with the app and found
`--component-card-padding: var(--space-4)` in the kit versus `var(--density-card-padding)`
in the app. Both resolve to 16px in standard density, but the declaration contract differs.

The scoped fix in `spacing.css` restores the shared default declaration and places the
component alias in each explicit comfortable/compact set and the Android lock. Standard
cards remain 16px; compact cards remain 12px; comfortable and Android cards remain 16px.
The explicit comfortable and Android aliases also override compact when those selectors
apply. Panel still consumes the density token directly. No widget-kit file or test is changed,
and no NavRail edit is needed. This keeps the shared default scale stable while expressing
variable card spacing in the density sets this task owns.

Validation in progress: full app tests and responsive.spec.ts on both Chromium profiles.

### Large-text regression discovered during verification

The first full responsive run had 108 passes and two failures: atlas main content grew
from 360px to 374px at 200% text size, in both projects. Replacing only the three candidate
production files with their integration-base versions (`16dd3e7e`) made those two tests
pass. All candidate files were restored immediately after the baseline check.

The Panel default had changed from fixed 18px padding to a rem-based density token,
which becomes 32px with enlarged text. In the owned `screen-kit.tsx`, bound the default
with `min(var(--density-card-padding), 16px)`. Normal comfortable/standard/compact
padding stays 16/16/12; enlarged text gets room inside the card without enlarged gutters.
Explicit caller padding overrides remain unchanged. This is a layout fix, not a weakened
assertion. The focused density and large-text checks passed 8/8 across both projects.

Raw verification logs: `/tmp/rc-dsn14-rev6-app.log` (1551 passed),
`/tmp/rc-dsn14-rev6-responsive.log` (108 passed, 2 failed),
`/tmp/rc-dsn14-rev6-baseline-responsive.log` (2 passed), and
`/tmp/rc-dsn14-rev6-focused.log` (8 passed). Full app and responsive suites are now
being rerun with the final Panel fix.

### Final revision 6 verification

- `pnpm test:app`: 142 files, **1551 tests passed**, exit 0. Raw log:
  `/tmp/rc-dsn14-rev6-final-app.log`.
- Full `responsive.spec.ts`, both Chromium projects, two workers: **110 passed**, exit 0.
  Raw log: `/tmp/rc-dsn14-rev6-final-responsive.log`.
- `pnpm lint`: exit 0; raw log `/tmp/rc-dsn14-rev6-lint.log`.
- `pnpm format:check:changed --base loop/rc`: all five candidate files pass.
- `git diff --check`: clean. Final journal formatting and the changed-file format gate
  are checked again before commit. Only spacing.css, screen-kit.tsx and the requested
  journal change in this revision. No push, promotion or dispatcher state mutation.

## Revision 7 — keep the DS Card in step with the sandbox kit (2026-09-23)

Read the original gate failure in attempt `38e001fd-435c-4141-b7f7-714f938c5b88/output.log`.
The full e2e run had 1238 passes and two failures, `widget-kit.spec.ts:238` on both
profiles. In `tavern/compact`, the DS Card from the gallery rendered 12px of padding and
the Torchlight kit Card rendered 16px. Revision 6 had set `--component-card-padding` in the
comfortable/compact sets and the Android lock. The kit (`public/widget-kit.css`, not owned)
copies each density set separately and has no such override, so the two copies diverged.

Fix, inside owned paths only:

- `spacing.css`: remove the three `--component-card-padding` density overrides. The DS
  Card (and the kit copy) go back to their base 16px in every density. The story's card
  density lives on `--density-card-padding`, which the Panel reads (the app's card, used by
  every Settings section). The audit comment now says which token carries the 16/16/12.
- `responsive.spec.ts`: the density probe reads `--density-card-padding` instead of
  `--component-card-padding`. Everything else stays the same, including the Panel
  `padding-top` checks (16/16/12, and 16 under the Android lock).

Declined alternative: adding a compact card override to `widget-kit.css`. That would make
the DS Card follow density too, but the file is outside `Owns`, and the acceptance
criterion (`responsive.spec` target-size checks) is met without it. If the DS Card should
also follow 16/12, that needs a follow-up that owns the kit and `widgetKit.test.ts` together.
No NavRail or screen-kit edit in this revision.

### Revision 7 verification

- `pnpm test:app` (it ran the full app suite; the file filter was ignored): 142 files,
  **1551 passed**, exit 0. This includes `widgetKit.test.ts`.
- `widget-kit.spec.ts` + `responsive.spec.ts`, both Chromium projects, two workers, port
  5611: **113 passed, 1 failed**, raw log `/tmp/rc-dsn14-rev7-e2e.log`. `widget-kit.spec.ts:238`
  passed on both profiles, as did every density and target-size test. The one failure was
  `responsive.spec.ts:1523` (standalone `/play` skip link, desktop): the first Tab press
  left the link `inactive`. Re-run alone with `--repeat-each=3`, it passed **6/6**
  across both profiles. `/play` renders neither the rail nor a Panel, so this is a
  focus-timing flake on a loaded machine (load average ~9–11), not caused by this change.
- `pnpm lint` exit 0 (`/tmp/rc-dsn14-rev7-lint.log`); `eslint` on the spec clean;
  `pnpm format:check:changed -- --base loop/rc` passes all five files; `git diff --check` clean.
- `git merge-tree --write-tree loop/rc HEAD` merges cleanly (loop/rc is 57 commits ahead
  of this branch's base, including a 6-line `responsive.spec.ts` change).
