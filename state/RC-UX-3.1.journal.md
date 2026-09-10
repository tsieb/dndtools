# RC-UX-3.1 run journal

## Scope

HelpTip placements beside vault privacy mode, projection pill, visibility chips, staged-proposal
counter, calendar, custom types, system picker, widget trust review and recovery key. Acceptance:
an e2e opens one; copy in the Lamplight voice. Owned path: `apps/gm-react/src/app/help`. No agents,
dispatcher mutations, push or promotion.

## Progress

- Located the DS `HelpTip` (in-flow note from RC-DSN-2.2), `Popover`, `Tooltip`, the Help menu and
  the nine target surfaces.
- Design: `app/help/ContextHelp.tsx` is a toggletip (DS `IconButton` trigger with
  `aria-expanded`/`aria-controls`, DS `Popover` anchored to the trigger so its viewport clamp
  applies, DS `HelpTip` as the body). `HelpBeside` keeps a badge and its tip on one line.
  `app/help/helpTopics.ts` is the single registry of nine topics; copy is in `help.tip.*` (EN + ES).
- Trigger labels are "About …" (precedent: "About advanced drawing"); checked the e2e suite for
  substring collisions with existing `getByRole('button', { name })` lookups; none found. Avoided
  "Help" in labels because `help-menu.spec` looks up `{ name: 'Help' }` by substring.
- Placements (screen edits are one import plus one wrapper each, tokens only, so the raw-style
  ratchet counts are unchanged): SyncPrivacy (vault privacy badge, recovery key panel),
  ProjectionControl (non-compact status pill, shown in the phone table-controls sheet), Campaign
  faction detail (visibility chip), AiBatchReview (staged count badge), Calendar (list panel
  action), CustomTypes (defined-count badge), System (picker panel action), TrustReviewSheet
  (recommendation badge).
- Tests: `ContextHelp.test.tsx` (open/aria/toggle/Escape), `helpTopics.test.ts` (voice rules from
  `docs/design-package/readme.md` and full ES coverage), e2e `tests/e2e/help-tips.spec.ts`
  (opens the vault privacy and recovery key tips on Settings › Sync).

- Touch targets: DS `IconButton size="sm"` is a fixed 28px and ignores density, but the design
  package asks for ≥44px targets on touch profiles. `IconButton` spreads `style` after its own
  width/height, so the trigger takes `var(--density-touch-target)`: 32px standard, 44px comfortable
  (the phone/tablet lock), 28px compact. Edit held until the first browser run finished so Vite HMR
  did not land mid-test.

## Validation results

- `pnpm --filter @dndtools/gm-react typecheck`: passed.
- `vitest run --config vitest.app.config.ts` on `src/app/help`, `src/i18n`, DS `HelpTip.test.tsx`:
  6 files, 71 tests passed (includes the ES ≥ 95% coverage and placeholder-consistency checks).
- ESLint on every touched file: exit 0. `pnpm lint:raw-style-count`: exit 0 (2,596 across 261 files,
  allowances unchanged). Prettier: `ContextHelp.tsx` needed a reflow; rewritten, then all changed
  files pass `--check`.
- Browser run 1 (port 15491; help-tips, help-menu, settings, custom-types, systems,
  widget-trust-review, campaign-calendar, campaign, ai-batch-review, a11y-axe-gate × desktop/mobile
  Chromium): 132 passed, 2 failed. Both failures were `campaign.spec.ts:166` (desktop + mobile):
  `getByLabel('Visibility')` resolved to the select AND four "About visibility" buttons, one per
  faction card. A real regression from this change: Playwright label/name matching is a
  case-insensitive substring, and `IconButton` also sets `title`, which `getByLabel` reads.
- Fix: the visibility tip moved from every `FactionCard` to one trigger in the Factions tab header
  (shown to players too, since they see the chips), and its label became "What {gm} only and
  Players mean", with no "visibility" substring. `helpTopics.test.ts` no longer requires a label to
  repeat its title; it requires unique labels that differ from the panel title, with a comment on
  why.
- Wrote a scan of every `getByLabel`/`getByTitle`/`getByRole('button', { name })` lookup in
  `tests/` and `src/**/*.test.tsx` against the tip labels (the earlier check only covered
  `getByRole('button')`). Remaining hits were reviewed one by one: `getByLabel('To')`
  (campaign-relationships) only substring-matches the custom-types label, which renders on
  `/extensions`, not the campaign page; `widget-generate:196` is scoped to the builder stepper;
  `map-editor:1181` ("DM only") runs in the map editor, which has no visibility tip; help-tips
  matches itself by design.
- Round 2 static checks after the fixes: typecheck passed; unit tests 6 files / 73 tests passed
  (new density-size case included); ESLint exit 0; raw-style count unchanged (2,596); Prettier
  clean.
- Browser run 2 (port 15492) was cut off when the previous session ended: it reached 52/228 with no
  failures and left no summary, so it is not counted as evidence.
- Gate feedback on the retry: uncommitted work. Committed the implementation as `3211404f`
  before re-running the browser suite, so another interruption could not strand it again.
- Browser run 3 on `3211404f` (port 15493; campaign, campaign-relationships, help-tips, help-menu,
  responsive, ux-audit, a11y-axe-gate, settings, custom-types, systems, widget-trust-review,
  campaign-calendar, ai-batch-review × desktop/mobile Chromium): 228 passed (4.6m), Playwright
  exit 0. This covers the fixed `campaign.spec.ts:166`, the new `help-tips.spec.ts` on both
  projects, and the phone table-controls sheet (reachability, overflow, axe) where the projection
  tip renders.
- Removed this task's disposable run logs from `/tmp`. No push, promotion, loop, agent delegation
  or dispatcher control changes.
