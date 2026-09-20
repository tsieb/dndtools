# RC-POL-1.5 — Characters roster polish

## Scope and implementation

Current task branch only. No agents, push, promotion, or dispatcher control changes. Headroom tools
were not exposed in this session; command output is retained in local `/tmp/pol15-*.log` files.

- Compact and rail roster actions use the DS bounded Sheet. New character remains the primary action.
- Combat start has immediate pending feedback, disables repeated activation, catches persistence
  failure with a recovery instruction, and translates pending/success/recovery copy in EN and ES.
- Roster empty and no-match states use the existing characters-empty and search-none illustrations.
- Sheet spell editing extracted without changing command semantics; preview disables DM controls.
- Added roster overlay axe, persistence failure/retry, preview and large-text reachability coverage.
- Extended golden roster coverage to Scholar and Dungeon; existing three themes remain covered.

## Embedded §20.2–§20.5 checklist

### §20.2 Design fidelity

- [x] DS primitives/screen-kit: roster actions now Button/IconButton/Sheet and feedback Callout.
      `index.tsx` raw-style allowance reduced from 4 to zero; directory ESLint clean. **Waiver:** literal
      typography/grid dimensions and older sheet panel allowances remain in the inherited card/sheet
      styling. Replacing the entire character-sheet design is outside the roster polish, and would
      change dense editing controls with no corresponding new feature requirement. No allowance raised.
- [x] Prototype/template: retained the existing information-rich card grid and list/detail tiers.
      **Waiver:** live prototype B cannot be fetched without the DesignSync-only reviewer capability
      described in `docs/design/README.md` §4. The vendored template is a character sheet, not a roster;
      the roster's existing card/HP/owner structure is retained. Compact overflow is a deliberate
      deviation to preserve space and touch access.
- [x] One primary New character; empty-state duplicate remains secondary. Supporting cards are flat.
      **Waiver:** a roster grid has no separate primary raised panel; adding one would wrap flat cards
      without adding hierarchy. The sheet continues to use screen-kit Panel.
- [x] Roster hierarchy reviewed: name, body, metadata, mono HP; no display face in cards.
      **Waiver:** legacy 11/11.5/12/14.5px card metrics remain, rather than changing density across every
      sheet panel in this roster task. New filter labels/count use text tokens.
- [x] Feedback pairs success/check and failure/error icons with text; card kind badges and conditions
      retain labelled shapes. DM-only content remains marked by VisibilityChip. **Waiver:** no new purple
      stripe is added to character cards; the existing explicit visibility chip supplies that distinction.
- [x] Five themes × three tiers captured in the pinned image. Scholar/Dungeon roster cases added;
      existing Tavern/Parchment/High contrast captures updated. Review details below.
- [x] No new local animation. DS Sheet owns named motion tokens and reduced-motion handling.
- [x] Empty roster uses characters-empty; filtered empty uses search-none. Persistence error has
      recoverable inline feedback; unavailable detail explains its absence. Loading and load-error
      belong to App's Boot/FailScreen, before Characters mounts (`App.tsx:481`); there is no asynchronous
      roster fetch to skeletonize. The illustration registry has no roster-loading/error/unavailable key.

### §20.3 Interaction and UX

- [x] Filters and overlays update synchronously; combat start sets pending before awaiting dispatch,
      disables the action and presents completion/rejection. Durable sheet edits retain their feedback.
- [x] Roster has no delete action. Import uses the existing preview before commit; clearing filters
      changes only local UI state. **Waiver:** destructive replacement controls deeper in the inherited
      sheet editors are not redesigned by this roster change; extracted spell handlers are unchanged.
- [x] Combat persistence failure now says to check storage and retry; completion is visible. **Waiver:**
      the roster has no auto-persisted editor, so no permanent Saved badge is added. Existing sheet success
      live region and validation stay in place; a universal sheet save indicator remains separate work.
- [x] Detail routes retain BackBar and URL navigation; creation dismisses back to roster. New action
      Sheet uses the shared overlay Back handler/focus trap. **Waiver:** no physical Android device
      walkthrough performed; the shared handler contract is reused, not independently reimplemented.
- [x] No new hover-only discovery: ellipsis is a visible labelled button with tooltip; sheet actions
      are text buttons. New overflow target is lg/44px, and touch-density buttons use the DS floor.
      **Waiver:** physical 48dp Android measurement and inherited dense desktop controls were not changed.
- [x] Compact/rail expose New character plus a bounded secondary-action Sheet; keyboard Escape returns
      focus to its opener. A 320px/200%-text test proves Import remains reachable inside the new region.
- [x] Re-read the roster strings against the calm stage-manager voice in design-package/readme.md.
      New pending/success/recovery/overflow and structural headings use t() with ES entries. Existing
      roster copy already uses t(). **Waiver:** core rejection text and inherited sheet editor feedback
      remain in their existing language; the spell extraction intentionally does not rewrite commands
      or their copy, and this task adds no new untranslated product strings.
- [x] Existing grid hint describes arrow keys and Enter; new ellipsis is named and tooltip-backed.
      No new non-obvious parameter or shortcut needs a HelpTip. Import still opens its explanatory flow.

### §20.4 Accessibility

- [x] Strict axe (zero violations, no register exceptions) covers populated roster, compact action
      Sheet, creation chooser, import overlay, persistence error, empty projection and unavailable detail
      on desktop/mobile. Existing axe gate additionally covers the wizard. Register unchanged.
- [x] Keyboard walkthrough automated on both profiles: one grid tab stop, arrows/Home/End, Enter opens
      detail (`characters-roster.spec.ts`); Escape from actions restores opener focus. Visible focus uses
      existing DS/global rules. This journal is the review record; no PR is published by this task.
- [x] Shell owns the sole h1/navigation labels. Added hidden h2 group headings before the shared
      EmptyState h3, fixing real heading-order violations in empty/unavailable states.
- [x] One persistent polite combat-operation host plus the existing filter result status. Failures
      announce assertively; pending clears on settlement, and no stale success survives a new action.
- [x] **Waiver — human screen-reader spot check:** no speech-enabled NVDA/VoiceOver/TalkBack session is
      available in this worker. Chromium accessible-name/description, heading, live-region and keyboard
      checks are exercised, but are not claimed as a human screen-reader test.
- [x] Existing 320px authoring-layout roster case passes; new 200%-text action-sheet reachability
      passes on both profiles. **Waiver:** this is CSS large-text coverage, not an OS magnifier/device test.

### §20.5 Core discipline and correctness

- [x] All writes remain runtime.dispatch. Roster reads use listCharactersForActor before local
      kind/owner/tag filtering; no client-side visibility implementation added.
- [x] Roster and sheet DM controls also require !runtime.readOnly; preview dispatch rejection tested.
- [x] Player projection test invokes the real core actor query in the browser, verifies Sera included
      and private Mira omitted, then checks rendered roster and read-only sheet controls.
- [x] Roster/sheet primary tasks and persistence failure/retry pass on both profiles; related character
      specs also run. No fake success result is injected: the retry reaches the real core rejection.
- [x] **Waiver — before/after roster performance budget:** ENG-1.1's current budget-registry has startup,
      vault, scene, widget, map, search, graph, sync and live-session budgets, but no roster scenario or
      reference fixture. No rendering performance improvement/non-regression is claimed from wall-clock
      e2e timings. This change adds no roster data query, dependency, animation or per-card effect; the
      Sheet stays closed until requested. Adding a new governed perf budget belongs with its harness.
- [x] FEATURE-GAPS Characters row updated with implemented polish and regression specs. No core/runtime
      contract moved, so no architecture doc change is required. Every owned file is under 500 lines.

## Validation

- `pnpm --filter @dndtools/gm-react typecheck`: passed.
- ESLint on the whole owned directory, both catalogs, new e2e, visual spec and ratchet: passed.
- Prettier on every changed text file and `git diff --check`: passed.
- `pnpm gates`: passed, six gates and docs audit; **zero owned file-size warnings**. All 19 files
  under screens/characters are below 500 lines; CharacterSheet is the largest at 498.
- `pnpm test:app`: **144 files / 1,584 tests passed**. After adding the structural headings,
  focused roster + i18n tests: **3 files / 38 passed**.
- Playwright roster, sheet, authoring-layout and initial polish cases: **44 passed**, both profiles.
  This includes the existing 320px roster layout and roving keyboard grid.
- Final `characters-polish.spec.ts`: **10 passed**, both profiles, after adding the explicit core
  actor read and empty/unavailable axe scans. These scans require **zero violations** including
  best-practice findings, without the known-violations register.
- Related surface specs (rest, resources, levelup, journal/downtime, history): **24 passed**,
  both profiles. Existing axe route + character-builder gate: **4 passed**, both profiles.
- Baseline budget: **141 PNGs, 13,813.1 KiB / 32,768 KiB**, passed.
- Full pinned-container strict comparison: **141 passed (2.6m), exit 0**, including all 15 roster
  theme/tier combinations. Command: `CI=1 apps/gm-react/tests/visual/run-in-container.sh
--update-snapshots=none --retries=0 --workers=2`.

### Findings resolved during validation

1. New mobile Sheet initially failed axe contrast (4.13:1) for ghost actions over the raised
   background. Secondary actions now use the DS secondary variant within the Sheet; the final
   strict overlay scan passes. No accessibility exception added.
2. Empty/unavailable states exposed a pre-existing h1 → h3 jump from shared EmptyState. Owned
   group headings now supply h2 without changing the DS component; both state scans pass.
3. Importing core into the Node Playwright runner hit sample JSON import-attribute requirements.
   The actor-read test now imports the actual query through Vite inside the browser, matching the
   existing player-preview/isolation tests; this is the app's real runtime query, not a test copy.
4. A visual update run overlapped a host browser run and timed out waiting for runtime on its
   first two pages. That incomplete update is not counted as validation. Browser runs are now
   sequential; the strict comparison uses CI=1 and retries=0.

### Visual review

All 15 roster captures reviewed together by theme and tier. Phone keeps readable card content and
one visible primary action, with the ellipsis beside the tabs; rail retains the two-column grid;
desktop retains three columns and inline secondary actions. High contrast preserves boundaries,
Scholar/Parchment retain legible light surfaces, and Dungeon/Tavern retain legible dark surfaces.
The ellipsis replaced a long overflow label after visual review found an unnecessary extra row.
The initial nine captures changed only for roster toolbar/type adjustments; six new captures cover
Scholar/Dungeon. No other route baselines are changed.

Local raw logs: `/tmp/pol15-{typecheck-final,lint-final,format,gates-final,app,focused-unit,e2e-final,
polish-final,character-related,axe-gate,visual-compare,baseline-budget}.log`.
No hosted CI, push, promotion, or physical-device screen-reader result is claimed.
