# RC-ENG-15.2 — Vocabulary and table controls

Base: `f79675059` (task branch `dispatch/dndtools/e0af8fe0bbce0add6acd`).
Spec: `docs/planning/IA_REVIEW.md` findings table ("Four unlabeled icons", "Footer player view and
top-bar view-as", Maps/Story/Notes, `{gm} screen`), RC_ROADMAP Epic ENG-15.

## Plan

- Tiers: wide = desktop ≥1280px (`viewport === 'desktop' && !compactToolbar`) shows the four table
  controls inline with visible labels: **Host table**, **Preview as {player}**, **Start session /
  End session**, **Account**. Constrained (1025–1279 compact desktop, rail, phone) shows one
  labelled **Table controls** trigger (text from rail up, icon on phone) opening a `Table controls`
  sheet whose rows are the same four controls with their full labels. Help keeps its location.
- Distinct glyphs: Host `players`, Preview `visibility-players`, Start `play` / End `close`,
  Account `characters-person`, Table controls `session-bolt`.
- Host/Account copy moves into the catalogs (was hard-coded English). Account signed in opens a
  small menu (Account settings → `/settings?tab=account`, Sign out) instead of signing out on one
  click under an "Account" label; signed out opens sign-in.
- Preview: returning from a companion preview that the top bar opened puts focus back on the
  trigger that started it (Preview as player inline, or Table controls when constrained).
- Visible copy audit: section names Maps / Story / Notes in messages that name the section
  (Atlas/Knowledge/Campaign used as section labels), `{gm}` vocabulary; stored screen names untouched.
- New keys appended at the end of en.ts (past every FEATURE-GAPS line anchor, max 5606).

## Log

- 2026-10-24: implemented. `TopBar.tsx` tiers (wide = `!compact && (min-width: 1440px)`), `layout`
  prop (`inline` | `row` | `icon`, `tableControlBox` in `SessionPanel.tsx`) on Host / ViewAs /
  Projection / Account; Account menu (DS `Menu`, portaled outside dialogs like ViewAsControl);
  `takePreviewReturnFocus` marker in `ViewAsControl.tsx` consumed by the inline trigger or the
  TopBar's Table controls wrapper on return. Projection pill dropped its "Session" word (the button
  beside it says it).
- Threshold measured with a probe (Playwright, `/tmp/eng152/probe*.mjs`): at 1280 (1016px bar) the
  labelled row left the h1 83px ("Scre…") and wrapped Start session; at 1440 EN fits "Command
  Center" (199/204px). ES at exactly 1440 still ellipsizes the title (79/240px, "Cen…") — the
  title ellipsizes by design and carries `title`; recorded, not fixed (raising the cut-off further
  would push the common 1440–1600 laptops into the sheet).
- Copy (value-only edits, no en.ts line shifts before 7695; anchors 936…5606 untouched):
  viewAs.label/trigger → "Preview as {playerLower}", session.end.label → "End session",
  session.end.liveLabel → "End session (live)" (keeps `name: 'End session', exact` on /session
  unambiguous), Atlas → Maps / Knowledge → Notes in 17 messages that named the section
  (`mapEditor.backToAtlas` "Back to Maps", `settings.vault.manageInKnowledge` "Manage in Notes",
  empty-state captions, broken-link hints), `campaign.title`/`campaign.sections` → Story. "Campaign"
  left where it names the user's campaign (Campaign name, Campaign calendar/timeline, Data Hub tab).
  New keys appended at the end of en.ts/es.ts. `docs/user/getting-started.md:106` "Atlas import
  dialog" → "Maps import dialog" (one word; the guide renders in Help).
- Raw-style allow-list: ViewAsControl 13 → 9 (its sizing moved to `tableControlBox`).
- qps-ploc regenerated (`npx tsx scripts/i18n-catalog.ts pseudo`); `vitest src/i18n` 54 passed.
- New `src/app/shell/TableControls.test.tsx` (app config; `net/*.test.tsx` runs under neither
  config): Account signed out/in (menu, settings navigation, no sign-out on first press), Host
  states, row layout, Spanish — 5 passed.
- New `tests/e2e/table-controls.spec.ts`: labels at 1600/1440, sheet rows at 1280/1100/834/641/393,
  distinct glyphs, Escape focus return; preview write rejection + exit focus return (banner and
  Escape, wide and constrained); co-DM preview blocks Start session in the sheet; End session
  confirm; Spanish; 5e vs Generic vocabulary; Story sections. Both profiles `--repeat-each=2`: 64
  passed.
- Specs updated for the names and for 1280 now being a sheet tier: campaign-identity,
  companion-preview, screen-visibility, collab, demo-vault, player-join-first, party-summary,
  combat, responsive, atlas-polish, map-onboarding, settings-polish.
- Batch (32 nav/top-bar/copy specs, both profiles, `DNDTOOLS_E2E_PORT=5419 --workers=4`): 685
  passed, 5 failed — responsive "rail/compact desktop top bar keeps one primary-weight action" ×4
  (encoded the old inline-icon contract) → rewritten: rail and compact desktop show a labelled Table
  controls opener and no filled action, Start session is the one filled action in the sheet; a new
  wide-desktop (1600) case keeps Start session as the bar's one filled action. session-start-default
  opened Table controls on mobile only → opens it whenever visible. Re-run 10/10.
- typecheck, lint (0 errors; the AppShell multiple-accent-primaries warning is in the baseline),
  feature-audit (0 stale), `CI=true pnpm test:app --maxWorkers=2` 200 files / 2412 passed,
  `test:cloud` 48 / 644 passed, build, `check:bundle-budget` 776.3 KiB pass.
- Full e2e (`--workers=4 --retries=1`, both profiles, 2438 tests): 2386 passed, 51 skipped, 1
  failed: scene-surfaces:196 desktop (failed its retry too). A/B with
  `git checkout f79675059 -- apps/gm-react/src`: base 3/3 pass, candidate 3/3 fail → mine. Cause:
  the 44px Table controls trigger left the 44.6px title block as the tallest header item, so the
  1280 bar went 75 → 71.6px and the bounded board's scrolled backdrop fell 0.4px short. Trigger
  `minHeight: var(--space-12)` (the 48px icon-only Start session footprint) → bar 75/71px, equal to
  base at 1280/1100/834 (measured). scene-surfaces + table-controls + responsive: 202 passed.
- Visual: `run-in-container.sh --update-snapshots=changed --workers=2` 588 passed (12.1m), rewrote
  175 goldens (90 desktop, 82 rail, 3 phone Settings for "Manage in Notes"); budget 43,516 KiB →
  zopfli (`zopfli.png.optimize`, filters `0me`, 5 iterations, lossless) with pngjs RGBA equality
  asserted for all 175 → 34,944.8 / 37,888 KiB (−6,606.5 KiB). Strict `--update-snapshots=none
--workers=2`: 588 passed (12.0m).
- Not covered by e2e by design: Account (the e2e server is never cloud-configured); held by
  `TableControls.test.tsx`.
