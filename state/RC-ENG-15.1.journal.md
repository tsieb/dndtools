# RC-ENG-15.1 — Primary grouping and phone Screens access

Base: `e3d90eee3` (task branch `dispatch/dndtools/9aa4705d496e0ffcc063`).
Spec: `docs/planning/IA_REVIEW.md` IA-1 and its route table; ADR-013 amendment text.

## Plan

- `nav.ts`: `PRIMARY` (Screens, Characters, Maps, Story, Notes, Tools), `ROUTE_OWNERS` + `routeOwner`
  (one owner per shelled route, `settings` as the secondary utility), `LOCAL_ENTRIES` (player sheet
  under Characters, Graph under Notes), `TOOLS`. Run/Library/Platform kept for palette + home widgets.
- Shell: desktop Primary (6) + section-local nav + `Screen shortcuts` (Command Center, GM screen,
  Session) + `Pinned screens` as separate labelled landmarks; footer Settings utility only (Plans &
  cloud reached from Settings › Subscription). Rail: four DS NavRails, same grouping. Phone tabs
  Screens / Characters / Maps / More; Screens opens a chooser sheet (live screen first, shortcuts,
  All screens, pins); More lists pins, Story, Notes, Tools, local pages, vaults, Settings.
- `/tools` landing (`screens/Tools.tsx`), additive; `/audio`, `/extensions`, `/community` unchanged.
- `App.tsx` (companion path): the `/tools` route only.

## Log

- 2026-10-24: implemented nav/shell/Tools; `tsc --noEmit` clean, `vitest src/app/nav.test.ts
src/app/shell` 15 passed, `pnpm lint` 0 errors (after tokenising three zero spacings in Tools).
- Batch 1 (15 nav-touching specs, both profiles, `DNDTOOLS_E2E_PORT=5391 --workers=3`): 144 passed,
  22 failed — all expected IA fallout: rail vault launcher no longer inside the Primary landmark
  (shell-polish ×2, demo-vault, shell-pin-bounds), pins moved to the `Pinned screens` landmark and
  All screens left the pin group (pinned-screens ×3), the retired sidebar More disclosure / phone
  More listing of Graph and Extensions (maturity-signals ×2, settings-tiers, ux-audit ×2 incl.
  the `Home` tab). Specs updated to the IA-1 shape (Graph = Notes local page, Extensions counted on
  `/tools`, vault launcher by page-level role).
- Added `tests/e2e/primary-sections.spec.ts` (six rendered sections on desktop/rail, phone tabs and
  More, chooser with no pins / 24 pins / live session, axe on the chooser, landmark-unique) and
  `/tools` to `responsive.spec.ts` ROUTES/MORE_SHEET_ROUTES and the axe gate route list.
- Section rows now carry `aria-current="true"` while a shortcut, pin or local page under them is
  the `page` (one `page` per landmark); rail column drops side padding so Primary is 64px at x=0
  (responsive.spec tier check).
- Batch 2 (9 specs incl. a11y-axe-gate, both profiles): 133 passed, 2 failed (my own chooser
  assertion read a tab the modal sheet had made inert) → fixed; primary-sections `--repeat-each=2`
  24/24. `CI=true pnpm test:app --maxWorkers=2`: 199 files / 2407 tests passed. qps-ploc
  regenerated (`tsx scripts/i18n-catalog.ts pseudo`); `vitest src/i18n` 54 passed.
- Visual: `run-in-container.sh --update-snapshots=changed --workers=2` 588 passed (12.1m) and
  rewrote 234 shell-bearing goldens (every full-page desktop/rail/phone capture, shell, shell-more);
  budget went to 42,573 KiB (fresh Chromium PNGs) → zopfli refilter (lossless, pixels asserted
  equal) → 35,196.1 / 37,888 KiB. Gate command `--update-snapshots=none --workers=2`: 588 passed
  (11.9m).
- Feature audit failed on 8 en.ts line-pinned anchors my inserted keys shifted → moved the new keys
  beside the existing `nav.screens` block (past every anchor, max 5606); `pnpm feature-audit` 0
  stale; qps-ploc regenerated.
- `pnpm gates`, `format:check:changed --base loop/rc`, `pnpm typecheck`, `pnpm lint` (0 errors),
  `pnpm build`, `check:bundle-budget` (775.5 KiB, pass): all passed.
- Full e2e, 8 shards (`--workers=3 --retries=1`, both profiles, 2394 tests): 2338 passed, 1 flaky.
  Real failures: friction-budgets Help inventory (needs `/tools` in its route list → added),
  responsive 640/641 tier check (rail Primary no longer full height; desktop "Run the table" is in
  Screen shortcuts → test reads the `nav-rail` column and the shortcuts landmark). Shard 1's
  campaign-relationships ×3 hit `useI18n must be used inside I18nProvider` at 17:57:28, the moment I
  edited en.ts under the live dev server (HMR split modules) — re-run clean.
- Re-run (campaign-relationships, friction-budgets, primary-sections, pinned-screens,
  widget-full-disclosure): 118 passed, 1 failed = widget-full-disclosure:21 mobile builder footer
  color-contrast; A/B with `git checkout e3d90eee3 -- apps/gm-react/src`: base fails 3/3 the same
  way (`--repeat-each=3`) → base issue, not this change.
- `responsive.spec.ts` both profiles: 164 passed. `pnpm a11y:axe` (incl. new `/tools`): 63 passed;
  `pnpm a11y:report`: PASS.

## Attempt after review (Settings on the tablet rail)

- Review finding: the rail dropped the Settings utility (641–1024px had no Settings entry; `/upgrade`
  had no current rail entry). Fix: `RailNav.tsx` renders a `Settings` NavRail landmark below the
  scroll, beside Search, outside Primary; current when `routeOwner` is `settings` (`/settings`,
  `/upgrade`). NAVIGATION.md rail paragraph updated.
- New `primary-sections.spec.ts` test at 1440/641/834/1024: Primary has 6 buttons and no Settings;
  the `Settings` landmark's button is visible, navigates, and is the only current entry on
  `/settings` and `/upgrade`.
- primary-sections + responsive, both profiles: 184 passed. a11y-axe-gate + 17 nav/Settings-touching
  specs (pinned-screens, phone-navigator, settings, upgrade, friction-budgets, ux-audit, …), both
  profiles: 381 passed, 1 skipped.
- Visual: `run-in-container.sh --project=visual-rail --update-snapshots=changed` rewrote 75 rail
  goldens (Settings gear above Search) → zopfli refilter (8,185 → 5,664 KB) → strict
  `--update-snapshots=none` 196 passed; screenshots dir 35,240 KiB / 37,888.
- `CI=true pnpm test:app --maxWorkers=2`: 199 files / 2407 passed. typecheck, eslint and prettier on
  the changed files: clean.
