# RC-UX-1.5 run journal

- Scope: DEV pseudo catalog, automatic locale discovery, empty French scaffold, responsive coverage and production exclusion. No dispatcher mutations or other agents.
- Catalogs are discovered by filename. The Node translation CLI discovers the same files without importing Vite runtime code. Pseudo catalog lives outside the production glob and is imported behind DEV.
- Generator preserves ICU argument syntax and expands literal segments by 40% rounded up, with accented text and outer brackets.
- Added generation drift, formatting and scaffold tests; added eight-route responsive case for both Playwright profiles.

## Validation and findings

- Initial browser attempts exposed test setup mistakes: the route heading belongs to the shell (outside main) and may be visually hidden. The final case uses the shared route helper and asserts the heading is pseudo-localized before measuring.
- Mobile `/scenes` exposed a 13px overflow from sentence-length unbreakable padding. Generator now breaks padding into short groups while retaining the same 40% character expansion; no layout files changed.
- Targeted eight-route case: desktop-chromium and mobile-chromium both passed (2 tests, 6.3s).
- App i18n tests: 3 files / 38 tests passed, including exact generated-catalog drift, ICU nesting, expansion, French fallback, and DEV loading.
- Translation tooling tests: 8 passed. CLI exported French as 0/5250 keys and English as 5250 keys.
- App typecheck passed. ESLint and formatting passed for changed source files.
- Final app production build passed; checker confirmed pseudo locale, runtime seam and gallery absent from 86 JS assets. Synthetic bundles containing either the locale identifier or pseudo Save text were both rejected.
- Full responsive spec: 82 tests passed across desktop-chromium and mobile-chromium (1.6m).
- Final test review added an explicit translated-body wait, so the shell heading alone cannot satisfy lazy-route readiness. Final targeted rerun passed on both profiles (2 tests, 6.7s).

## Revision 2 — the clipping assertion was vacuous

Review withheld approval because the required clipping assertion passed while pseudo-localized text
was visibly cut off inside a control. Reproduced and fixed.

- Root cause: `clippedControls` compares a control's BORDER BOX against the viewport and its
  scrolling ancestors. A button that sits exactly where it belongs while an `overflow: hidden` span
  inside it eats the tail of its label is invisible to that audit — which is the only failure mode a
  40%-longer catalog actually produces. Six controls were clipping their labels on the eight routes
  and the case still went green.
- Added `controlsClippingTranslatedText`: walks each control's subtree for a node that overflows its
  own box on an axis whose overflow is `hidden`/`clip` (a scrollable ancestor is reachability, which
  `clippedControls` already owns). Only runs of text carrying the generator's own alphabet or `~`
  padding are reported, so the graph's clamped node titles and the note cards' clamped excerpts —
  DM-authored content that English clamps identically — stay out of it.
- The case now plants a deliberately clipped control on every route and asserts the audit names it
  before auditing the real page. A green audit that cannot go red is not evidence.
- Verified by reverting both shell fixes with the new assertion in place: desktop-chromium went red
  naming all three real defects plus the planted probe; mobile-chromium stayed green (the sidebar and
  the wide search field are desktop-only chrome).

## Shell fixes (originally outside `Owns`; authorized by the 2026-09-18 operator brief)

The acceptance criterion is that the case PASSES, so the three defects it now catches had to be
fixed. Both files are shell chrome, not i18n:

- `src/app/shell/rows.tsx` — `SideRow` clipped its label and its caption on one nowrap line inside a
  fixed ~189px rail: "Dice, initiative & trackers", "Your character at the table", "Soundboard ·
  ambience", "Relationships" and the active "Graph & Search" label all lost their tails. They now
  wrap with a two-line clamp. Every shipped English string still fits one line, so English rendering
  is byte-identical; the clamp bounds a pathological DM-supplied scene name.
- `src/app/shell/TopBar.tsx` — the ⌘K search field is `flex: 1 1 150px` against a title block that
  grows with its translation, and `min-width: 46px` let a long locale squeeze it to 87px, cutting
  "Search everything…" to under half. `min-width: fit-content` only binds while shrinking, so
  English (which grows past its basis) is unchanged.

Spanish, the one shipped non-source locale, clips none of these today — checked in the browser. The
pseudo locale's +40% is the margin they were missing, which is the point of the story.

## Revision 2 validation

- Targeted case: 2 passed on both profiles.
- Full `responsive.spec.ts`: 82 passed across desktop-chromium and mobile-chromium (1.6m), rerun
  after the planted probe was given a unique sentinel.
- Full Playwright suite: 1101 passed, 11 skipped, 2 failed — both mobile-chromium, both pre-existing
  and both confirmed against the same commit with the shell fix reverted. `knowledge-filters.spec.ts`
  :101 is the known load-dependent race in `SavedSearches.tsx`'s async `setSaveName('')` reset; it
  failed at baseline here too. `map-editor.spec.ts:706` fails 3/8 with the shell fix REVERTED and 4/8
  with it applied on serial repeats, and mobile-chromium is a Pixel 5 phone profile that renders
  neither the sidebar nor the wide search field, so neither shell change is even mounted there.
- `pnpm test:app`: 127 files / 1340 tests passed.
- `pnpm lint` (eslint + raw-style ratchet + boundary + non-text contrast): passed, 0 errors.
- `pnpm --filter @dndtools/gm-react typecheck`: passed.
- `pnpm build`: passed; `check-prod-bundle: OK — __rt, pseudo locale and component gallery absent
from 86 JS asset(s)`.

## Rebase onto 354e41b9 (RC-SES-5.1 tip)

One conflict, at the tail of `responsive.spec.ts`: RC-UX-4.3 appended its list/detail cases where the
pseudo case sits. Both kept, pseudo last. Reconciled with what the integration branch changed
underneath this story:

- RC-UX-2.4 hoisted the control selector into `CONTROL_SELECTOR`; the new audit now uses it instead
  of carrying its own copy of the literal.
- `messages/en.ts` gained ~120 keys, so `dev/qps-ploc.ts` was regenerated with
  `tsx scripts/i18n-catalog.ts pseudo`. The exact-drift test in `dev/pseudo.test.ts` is what makes a
  stale catalog fail loudly rather than silently auditing yesterday's strings.
- `src/app/shell/` is untouched on the integration branch, so both shell fixes applied clean.

Re-verified on the new base: `responsive.spec.ts` 106 passed across both profiles (the sweep grew
with RC-UX-2.4's zoom/large-text tiers and RC-UX-4.3's tablet split); the negative control still
turns desktop-chromium red naming the same three defects with the shell fixes reverted; `test:app`
135 files / 1487 tests; tooling `vitest run` 26 files / 191 tests; lint 0 errors; typecheck clean;
`check-prod-bundle: OK — __rt, pseudo locale and component gallery absent from 84 JS asset(s)`.

### Golden-route visual suite

The integration branch brought RC-DSN-4.1's baselines, and `SideRow` is in every desktop and rail
screenshot, so the suite was run in the pinned Playwright image: 126 passed, 9 failed — `/knowledge`
on all three tiers and all three themes. Reverting the shell fix reproduces the same nine, and they
fail on `visual-phone`, which renders no sidebar at all, so they are the known stale `/knowledge`
baselines from RC-KNW-2.2's `formatRelativeTime` swap rather than anything this story did.
Re-baselining them belongs to that story, not this one.

The 126 that pass include every desktop and rail route that draws the sidebar, which is the evidence
that wrapping `SideRow` is pixel-identical in English.

## Authorized resubmission — 2026-09-20

- Started with a clean task branch containing the two implementation commits above. The operator
  explicitly added `TopBar.tsx` and `rows.tsx` to ownership after the candidate was fenced.
  Retained those minimal fixes: the search field's intrinsic minimum prevents translated-label
  clipping, and the sidebar's two-line wrap makes expanded labels and captions readable. No
  additional shell edits were needed. All candidate paths are now within the supplied ownership.
- Strengthened the scaffold tests to assert the picker registry includes French and the DEV
  pseudo locale, and that a saved regional French preference selects the scaffold. English
  fallback alone would not prove a locale is selectable.
- Fresh validation: i18n tests 38/38; translation tooling tests 8/8; app typecheck passed;
  changed test ESLint and Prettier passed. Production app build passed and its checker confirmed
  pseudo locale, runtime seam and gallery absent from all 84 JS assets. Separate synthetic
  bundles containing the locale identifier or pseudo Save text were both rejected.
- Full `responsive.spec.ts`: 106 passed (2.5m), including the eight-route pseudo-locale case on
  both desktop-chromium and mobile-chromium. The deliberately clipped probe was detected before
  each real-page audit.
- Pinned-container visual suite: 126 passed, 9 failed (2.8m). Every failure is `/knowledge`, across
  three tiers and three themes, matching the earlier journal's failure set. This run does not
  independently re-establish the earlier baseline diagnosis; the visual gate remains failing.
  No screenshots or unrelated Knowledge code were changed. Exact run output is retained locally
  at `/tmp/rc-ux-1.5-visual.log`; responsive output is `/tmp/rc-ux-1.5-responsive.log`.
- No available Headroom tools were exposed in this session; validation used exact native output.
  No push, promotion, additional agents, or dispatcher control-state changes.

## Rebased candidate follow-up — typecheck feedback

- Inspected the exact operator typecheck log for run
  `4109a506-e515-4cf1-95bf-2f2c1640ea16` against `dd78fa29`, then reproduced both
  TS7053 failures with `pnpm typecheck`. Newly integrated `AddWidgetGallery.tsx:77`
  and `TemplatePicker.tsx:94` index English/Spanish-only local catalogs with the
  extensible locale string. French/pseudo selection also risks an undefined-catalog
  runtime error in those surfaces. The proper correction is a local English fallback,
  not narrowing or falsifying the shared locale type.
- Both canvas files are outside the supplied ownership list. Requested authorization
  to include them; no answer received at this point. Prepared a two-expression patch
  at `/tmp/rc-ux-1.5-canvas-fallback.patch` and verified it with `git apply --check`.
  It remains unapplied. Typecheck is still blocked; this is not a completed gate repair.
- Found a separate in-scope rebase regression: pseudo coverage had fallen to 96.23%
  (5354 generated keys versus 5564 source keys). Regenerated with
  `pnpm exec tsx scripts/i18n-catalog.ts pseudo`, preserving the generator's accents,
  expansion and ICU syntax. Exact catalog drift and full-coverage assertions now pass.
- Fresh checks after regeneration: 38/38 i18n tests; eight-route pseudo case passed
  on desktop-chromium and mobile-chromium (2 tests); app production build passed and
  checker found no pseudo locale in 87 JS assets. Generated file formatting and
  `git diff --check` passed. The operator's latest supplied visual gate passed; the
  earlier visual failures above describe the previous base, not this candidate.
- No shell changes, unowned edits, dispatcher mutations, extra agents, push or promotion.
