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
