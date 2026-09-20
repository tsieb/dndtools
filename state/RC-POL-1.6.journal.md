# RC-POL-1.6 — Character builder polish

Task branch implementation; no publication, promotion or dispatcher-state changes.
Owned surfaces: `apps/gm-react/src/app/charBuilder` and `app/charImport`.
Supporting changes: EN/ES messages, scoped style-ratchet removal, browser/visual tests,
FEATURE-GAPS inventory and this journal. Headroom tools were not available in this session.

## Changes and findings

- Split the 621-line wizard into orchestration and `WizardFrame`; split the 1,081-line
  importer into entry point, types, helpers, native mapper, DDB mapper/fields and system fit.
  Public importer exports and dispatch payloads remain compatible.
- Replace the hand-built discard alert with the shared DS Dialog. Isolate the outer
  wizard from the page; nested confirmation owns keyboard focus and Escape. Unmount the
  confirmation before closing the parent, restoring isolation in reverse order.
- Replace the misleading “Saved to your local vault” with the actual save boundary in
  EN/ES. No persistence is implied while editing a draft.
- Move spacing/radii/type onto DS tokens; remove all owned style-ratchet exemptions.
  Small headings use the body face, not undersized Cinzel. Character-entry illustration,
  status error icon, wrapped import filenames, large-text scrolling and larger touch targets.
- Tests scan the roster, entry, all six wizard steps, discard, failed import and import
  preview with axe on desktop/mobile; exercise successful creation, failure/retry,
  focus trapping/restoration, player projection and large text.
- Initial tests exposed an axe scan during the dialog opacity animation and nested modal
  isolation cleanup. Scans now wait for finite animations; the discard/reopen test guards
  the actual isolation defect. Existing builder tests passed before these fixes as well.

## Embedded §20.2–§20.5 checklist

A checked waiver is an explicit scope/applicability decision, not a claim of testing it.

### §20.2 Design fidelity

- [x] DS/screen-kit composition and zero raw color/spacing exceptions: token migration and
      scoped ESLint check. Waiver: intrinsic geometry (portrait canvas, overlay maximum size,
      one-pixel borders) retains prototype dimensions; these are not spacing/color tokens.
      Custom tiles and numeric input retain their required pressed/spinbutton semantics.
- [x] Prototype/template match: retained entry choice, six steps, step rail, selectable
      tiles and bounded footer. Deviations: core-supported PC classes, point-buy validation,
      required owner, and explicit import preview remain necessary core constraints.
- [x] One gold primary per region; supporting choices flat, raised panel uses shadow-md.
- [x] Token typography: body/meta/title scale; Cinzel only at the 24px title; numeric
      readouts retain mono. Waiver: dice/ability figures retain their dedicated numeric scale.
- [x] Status colors have check/error/hidden icons; DM-only visibility uses the shared chip.
- [x] All five themes × desktop/rail/phone: the full ten-state matrix (150 images) was
      re-baselined and strictly compared in the pinned container on loop/rc `69f40349` and
      reviewed as contact sheets. Committed: one text-free entry-illustration crop per theme
      and tier (15 images, 23.6 KiB). Waiver: the shared baseline cap has ~35 KiB left, and the
      full matrix costs ~9.6 MiB. Character-roster parchment baselines are also updated because
      its portrait swatch shares the builder gradient.
- [x] Named motion tokens; reduced motion is supplied by the DS token contract and visual profile.
- [x] Blank entry has the characters-empty illustration. Validation/unavailable notes,
      creating/importing feedback and recoverable import errors remain visible. Waiver: no
      local-file error/loading illustration exists; connection-lost would falsely imply a network failure.

### §20.3 Interaction and UX

- [x] Local edits update synchronously; dispatch actions expose Creating/Importing immediately
      and completion toasts or inline errors. Native file picker owns its selection feedback.
- [x] Discard is explicitly confirmed; confirmation identifies the character draft.
      Waiver: removing an unsaved attack row edits a draft, not a persisted entity.
- [x] Honest save boundary in EN/ES; create errors retain the editable draft and retry action.
- [x] Back and Cancel routes preserved; Escape dismisses only the top confirmation;
      existing Android fullscreen/overlay back-handler ordering retained. Waiver: this is an
      overlay with no URL of its own; browser history belongs to the roster route.
- [x] No hover-only actions; tile, range and DS button targets use the 48px spacing token.
- [x] Compact footer has one primary action. Waiver: the wizard has no top-bar overflow
      menu; adding a second sheet would duplicate its existing bounded editing surface.
- [x] EN/ES save/discard copy reread and updated through t(). Waiver: imported field reports
      and core rejection messages remain diagnostic payload text; translating their schema is
      a separate contract change, intentionally avoided in this visual polish pass.
- [x] Existing inline help explains PC limits, owners, points and import mapping before
      actions. Waiver: persistent inline guidance is more discoverable than duplicating it
      in HelpTip; no new shortcut was introduced.

### §20.4 Accessibility

- [x] Axe clean on route and all owned overlays, both profiles; zero violations; register unchanged.
- [x] Keyboard-only creation uses Tab, Space, typing and Enter from roster to completion;
      confirmation traps Tab and restores focus on Escape, on both profiles.
      Existing step-rail test records keyboard return to the step heading.
- [x] Roster owns the single h1; overlay headings are h2 and step navigation is labelled.
- [x] Step live region announces progress once; errors use alerts; completion uses shared toasts.
- [x] Waiver: no interactive screen reader is available in this headless worker. Automated
      accessible-name, focus and axe checks are recorded; no NVDA/TalkBack listening claim is made.
- [x] 200% text and discard/reopen reachability regression passed on both profiles; no new scroll region.

### §20.5 Core discipline and correctness

- [x] Durable writes remain runtime.dispatch; draft changes are component-local state.
      No client visibility filter was added and pure importer tests cover unchanged mapping.
- [x] Player preview hides launchers; browser assertion proves quick-create is rejected read-only.
- [x] Created NPC player projection and private-note exclusion verified through the real roster/sheet actor read.
- [x] Both-profile primary task and import failure/retry browser suite passed.
- [x] Waiver: ENG-1.1 defines no character-builder-specific measured budget. No new network
      reads, effects in the editing loop or runtime scans were introduced; no quantitative
      before/after performance claim is made from functional timings.
- [x] FEATURE-GAPS builder row updated; no architecture/runtime contract moved, so no ADR change.

## Validation

- Initial focused pure tests: 5 files, 47 tests passed.
- Intermediate both-profile browser run: 16 passed (22.0s), including all-step axe,
  import recovery and confirmation keyboard checks.
- Final `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/char-builder-polish.spec.ts tests/e2e/char-builder-steps.spec.ts tests/e2e/authoring-layout.spec.ts --workers=2 --max-failures=2`: **34 passed (36.1s)**. Includes zero-violation axe checks on both profiles, full keyboard-only creation, preview write refusal, private-note redaction, failed import/retry, 320px layout and 200% text.
- `apps/gm-react/tests/visual/run-in-container.sh -g 'character builder| /characters$' --update-snapshots=changed --workers=2 --max-failures=2`: **24 passed (54.6s)**.
- Same pinned-container command without `--update-snapshots=changed`: **24 passed (37.9s)**. Reviewed theme contact sheets for all 150 builder images: bounded phone footers, readable theme surfaces, no clipped primary action or overlapping dialog content.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: **285 files, 22521.7 KiB / 32768 KiB**, passed. (old base; superseded below)
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/charImport apps/gm-react/src/app/charBuilder`: **5 files / 47 tests passed** after the split.
- Scoped ESLint for both owned trees and the new specs: **exit 0**, no style exemptions remain for the builder.
- `pnpm --filter @dndtools/gm-react typecheck`: **exit 0**.
- Scoped Prettier check: **All matched files use Prettier code style**.
- `pnpm gates`: **exit 0**, six configured gates and docs check passed. Existing file-size warnings remain outside these owned paths; **none** concern charBuilder/charImport. Direct count: **36 owned files, maximum 476 lines**, none at or above 500.
- `git diff --check`: **exit 0**.

### Rebase onto loop/rc `69f40349` (2026-09-24)

The first attempt was built on `2d9f566d`, 133 commits behind. On loop/rc the full 150-image
matrix put the baseline set at **42,381.8 KiB / 32,768 KiB** (over the cap). Owned source had
no conflicts. FEATURE-GAPS now takes loop/rc's table: builder notes and an anchored limit go
into the existing Characters row, not a new row. Roster parchment PNGs were regenerated on the new base.

- Strict container compare of the committed full matrix on the new base: the choice, bio and
  import-preview states differed only by base copy (the import card description changed on
  loop/rc). Re-baselined with `--update-snapshots=changed`, then strict re-run: **24 passed**.
  Desktop/phone contact sheets reviewed: phone footers bounded, primary actions unclipped,
  no overlapping dialog content, readable in all five themes. Playwright clears `test-results/`
  on the next run, so those review copies are not retained.
- Replaced the spec with a text-free crop (`character-builder-entry--{theme}.png`, 23.6 KiB).
- loop/rc then advanced to `fe6d64e3` (RC-POL-1.5 roster polish), so I rebased again. The
  Characters row conflict was resolved on 1.5's text. The roster parchment goldens were
  regenerated on the new base; only the card-header portrait swatch changed (fixed dark brown → themed
  sunken/bg), and the files shrank 4.8 KiB.
  Results on `fe6d64e3`:
  - Container strict run, `char-builder` + `characters-polish` + golden `/characters`, all
    themes and tiers: **39 passed**.
  - Budget: **459 files, 32,765.3 KiB / 32,768 KiB**, passed (2.7 KiB left).
  - Both-profile `char-builder-polish`, `char-builder-steps`, `authoring-layout`,
    `characters-polish`, `characters-roster`, `a11y-axe-gate`, `share-import`: **118 passed (3.0m)**.
  - `pnpm test:app`: **146 files / 1641 tests passed**. Owned vitest: 47 passed.
  - `typecheck` exit 0; scoped ESLint exit 0; `format:check:changed -- --base loop/rc` clean.
  - `pnpm gates`: exit 0; **0** file-size warnings under charBuilder/charImport (max 476 lines).
  - `scripts/validate/feature-audit.ts`: 47 declared limits, **0 stale** anchors.

All results above are local candidate evidence. Central independent review, integration and CI are not claimed.
