# SRCH-result-opening-and-deterministic-diagnostics — Completion Evidence

Epic: `SRCH-result-opening-and-deterministic-diagnostics` — SRCH: Result opening and deterministic diagnostics
Requirement IDs: SRCH-007, SRCH-008
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 4 (Scene and Widget Contract);
the standing v2 architecture contracts + ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic SRCH-result-opening-and-deterministic-diagnostics`.

## Summary

This epic COMPOSES the existing SRCH/NAV surfaces rather than forking them. It completes the single
Processing-Core deep-link resolver and layers a deterministic-diagnostics read over the already
actor-filtered search result. Two capabilities, both pure + deterministic, both in the Processing Core:

- SRCH-007 — RESULT OPENING. A chosen search hit now opens into the correct route + in-target focus:
  - A POI hit focuses the MAP VIEWPORT on the POI's normalized `x`/`y` and preserves the `map`/`poi`/`x`/`y`
    parameters through navigation (AC1).
  - A note/object hit opens the Knowledge note view and restores the HEADING HASH + scroll target (AC2),
    using a deterministic heading-slug anchor.
  - The previously-incomplete `resolveDeepLink` note/object branch (the prior ranking epic noted it returned
    `not-cached`) is COMPLETED to resolve from the actor-filtered content read, and a first-class `poi`
    deep-link target was added that carries viewport focus.
  - Opening RE-CHECKS visibility AT OPEN TIME through the same actor-filtered reads, so a now-hidden/now-deleted
    target degrades to the single generic `unavailable` (no leak, no crash).
- SRCH-008 — DETERMINISTIC DIAGNOSTICS. A new `diagnoseSearchResult` produces a reproducible, inspectable
  FINGERPRINT of a search result that NORMALIZES volatile entity ids to stable content-derived keys, so two
  fresh fixture vaults with the same visible content fingerprint IDENTICALLY (AC1 — no unrelated id churn). A
  `diagnoseSavedSearchPortability` read splits a saved search's STABLE criteria (carried verbatim across
  vaults) from criteria that reference a VOLATILE id (the relationship anchor), emitting explicit REMAPPING
  diagnostics for the latter (AC2). New deterministic heading-anchor helpers (`headingAnchors`,
  `slugifyHeading`) keep heading targets stable across fixtures.

The GUI (`SavedSearches.svelte`) renders openable results + the diagnostics fingerprint and NAVIGATES the
computed resolution; `NotesWorkbench.svelte` selects the deep-linked note; the Atlas page focuses the
viewport on the carried coordinates. No GUI owns resolution, ranking, visibility, or fingerprinting
(Architecture Contract 1).

### Visibility / permission / data-safety design (the load-bearing contract)

- OPEN-TIME RE-CHECK, FAIL CLOSED (SRCH-007). `resolveSearchResultOpen` and the completed `resolveDeepLink`
  branches resolve every target through the SAME actor-filtered read the rest of the app uses (the content
  query for notes/objects, the map query for POIs, scene visibility for Scenes). Visibility is therefore
  re-evaluated AT OPEN TIME — a hit descriptor (which carries only an id + domain, never content) for a
  target that has since been hidden or deleted is simply absent from that read and resolves to the SINGLE
  generic `unavailable` message, indistinguishable from a missing target. Asserted: a player cannot open a
  `dm-only` POI or a `dm-only` note (the generic message names no entity), a deleted note opens to
  `unavailable` (no crash), an unknown actor fails closed, and a cross-kind descriptor (a `note` id opened as
  `object`) does not resolve.
- HEADING ANCHOR CANNOT NAME A HIDDEN SECTION (SRCH-007 AC2). The heading slug is matched against the actor's
  VISIBLE note body (the content read omits a hidden note entirely), so a restored hash can never address
  hidden content; an unmatched/stale anchor drops to the note root rather than 404-ing.
- DIAGNOSTICS NEVER LEAK (SRCH-008). Every diagnostics input is an ALREADY actor-filtered value — a
  `SearchResult` of visible hits, or a `SearchFilter` (which names no results and carries no content). The
  fingerprint summarizes only what the actor can already see; a player's fingerprint for a `dm-only` term is
  EMPTY and the term never appears in the serialized diagnostic (asserted by a hard JSON no-leak test). A
  saved-search remapping diagnostic echoes only the criterion + the dangling id the saved search already
  stored — never a title/snippet of the (possibly hidden) related item.

### Processing-Core changes (complete the resolver; add the diagnostics read)

- `apps/v2/packages/core/src/queries/deep-links.ts` — added a first-class `poi` deep-link target (viewport
  focus on the POI's `x`/`y`, resolved through the actor-filtered map query); COMPLETED the `note`/`object`
  branch to resolve from the actor-filtered content read with a deterministic heading-anchor selection; added
  `viewport` + `hashAnchor` to `DeepLinkRestore` and `content`/`session` to `DeepLinkStateView`.
- `apps/v2/packages/core/src/queries/result-open.ts` (NEW) — `resolveSearchResultOpen`: maps a chosen hit's
  domain to a deep-link target and composes `resolveDeepLink`; handout/session-artifact hits open the owning
  section route (no in-section target in the prototype's durable state). Re-checks visibility, fails closed.
- `apps/v2/packages/core/src/queries/search-diagnostics.ts` (NEW) — `diagnoseSearchResult` (id-normalized
  fingerprint) + `diagnoseSavedSearchPortability` (stable-criteria split + remapping diagnostics).
- `apps/v2/packages/core/src/state/markdown.ts` — added pure `slugifyHeading` + `headingAnchors`
  (deterministic, fence-aware, duplicate-disambiguating heading slugs) for the heading deep-link target.
- `apps/v2/packages/core/src/index.ts` — exports the new types + functions (`SearchResultOpenTarget`,
  `resolveSearchResultOpen`, the diagnostics surface, `DeepLinkViewportFocus`, `HeadingAnchor`,
  `headingAnchors`, `slugifyHeading`).

### GUI

- `apps/v2/app/src/lib/gui/SavedSearches.svelte` — each result is now an OPEN button that resolves through the
  core and navigates (preserving the `map`/`poi`/`x`/`y` params for a POI, or the `?note=…#<anchor>` for a
  note); a now-hidden/deleted target surfaces the generic unavailable message instead of opening. Adds a
  `Search diagnostics` panel showing the deterministic fingerprint + per-hit signal breakdown.
- `apps/v2/app/src/lib/gui/NotesWorkbench.svelte` — reads the `?note=` deep-link param and selects that note
  within the Knowledge section (re-resolved through the actor-filtered read — fail closed).
- `apps/v2/app/src/routes/atlas/+page.svelte` — parses a search-opened POI deep link (`map`+`poi`+`x`/`y`),
  resolves it as a POI target first (falling back to the original region target), and centers the viewport on
  the carried/resolved coordinate.

### Persistence / offline / sync

No new durable state, no migration, no new sync operations. Result opening and diagnostics are a PURE local
computation over already-durable actor-filtered reads, fully available offline (local-first) and identical on
every restart. The fingerprint is stable across fresh fixtures by construction (volatile ids normalized to
content-derived keys).

## Tests (primary evidence)

- `apps/v2/packages/core/tests/search-result-opening.test.ts` (NEW — 13 tests) — SRCH-007: AC1 a visible POI
  result focuses the viewport on its `x`/`y` and preserves the map/poi params (incl. a round-trip from the
  rendered search hit); a dm-only POI fails closed for a player (no name leak); a POI without a map id opens
  the Atlas section. AC2 a note result restores a matching heading hash + label; a stale anchor degrades to
  the note root; a no-anchor note opens at the root. Open-time re-check: a dm-only note, a DELETED note, an
  unknown actor, and a cross-kind descriptor all fail closed. The deep-link primitive resolves POI + note
  targets directly; a note link without a content slice reports `not-cached`.
- `apps/v2/packages/core/tests/search-deterministic-diagnostics.test.ts` (NEW — 10 tests) — SRCH-008: AC1 two
  fresh vaults with the SAME visible content but DIFFERENT ids produce an IDENTICAL fingerprint (the raw ids
  differ, the normalized keys do not); the same vault fingerprints identically across runs; a player and the
  DM fingerprint only their OWN visible hits (a dm-only term is EMPTY for the player + never in the serialized
  diagnostic — hard no-leak). Deterministic heading slugs (punctuation/spacing, duplicate disambiguation, code
  fences). AC2 stable criteria carry across verbatim (fully portable); a relationship-anchor emits an explicit
  remapping diagnostic + is stripped from the stable filter; the diagnostic names no content; empty filters
  are portable.
- `apps/v2/app/tests/e2e/search-result-opening.spec.ts` (NEW — 4 tests × 2 projects = 8 instances) — SRCH-007
  AC1 (opening a POI result navigates to the Atlas with `map`/`poi`/`x`/`y` preserved + the viewport centered
  on the coordinate); AC2 (opening a note result selects the note in Knowledge + restores the heading hash,
  synchronizing on the editor showing the note); SRCH-008 (the diagnostics fingerprint is visible +
  content-derived); a player cannot open a dm-only POI result (the open button is absent, nothing leaks). All
  pass on desktop-chromium AND mobile-chromium.

### Commands run (results)

- `pnpm --filter @dndtools/v2-core test` — PASS (125 files, 1731 tests; +2 files, +23 new tests; no existing
  test weakened or deleted).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` 0 errors; app `svelte-check` 0 errors / 0 warnings, 808 files).
- `pnpm v2:lint` (boundary) — PASS (no v1 runtime imports; core has no Svelte/DOM/GUI imports).
- `pnpm lint` (FULL: `eslint .` + `lint:navigation` + `lint:tokens` + `audit:repo`) — PASS.
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:workpack:validate` — PASS (after `set-status active` and after `complete`; no drift).
- `pnpm e2e` (from `apps/v2/app`, BOTH desktop-chromium AND mobile-chromium, WHOLE suite) — 493 passed, 21
  intentional project-scoped skips, 0 failed. Green across two consecutive full runs. (+8 instances vs. the
  prior 485 baseline = the 4 new SRCH-007 e2e tests × 2 projects.)

## Traceability (requirement → code + tests)

### SRCH-007 — result opening

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — a POI result with `x`/`y`/`poi` focuses the map viewport and preserves parameters through redirects | `resolvePoiDeepLink` + `DeepLinkRestore.viewport` (`deep-links.ts`); `resolveSearchResultOpen` maps a POI hit → POI target (`result-open.ts`); GUI builds `?map=&poi=&x=&y=` + the Atlas page centers on it (`SavedSearches.svelte`, `atlas/+page.svelte`) | `search-result-opening.test.ts` (viewport x/y, round-trip, fail-closed); `search-result-opening.spec.ts` (AC1 params preserved + viewport coords) |
| AC2 — a note-heading result preserves hash navigation + scroll semantics | completed `resolveContentDeepLink` + `headingAnchors`/`slugifyHeading` deterministic slug (`deep-links.ts`, `markdown.ts`); GUI navigates `?note=…#<anchor>` + `NotesWorkbench` selects it (`SavedSearches.svelte`, `NotesWorkbench.svelte`) | `search-result-opening.test.ts` (heading hash restored, stale anchor degrades); `search-result-opening.spec.ts` (AC2 note selected + hash) |
| Open-time re-check + fail closed (cross-cutting) | every branch resolves through the actor-filtered read (`deep-links.ts`, `result-open.ts`) | `search-result-opening.test.ts` (dm-only POI/note, deleted note, unknown actor, cross-kind); `search-result-opening.spec.ts` (player cannot open a dm-only POI) |

### SRCH-008 — deterministic diagnostics

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — volatile IDs do not create unrelated fingerprint churn across fresh fixtures | `diagnoseSearchResult` normalizes ids to content-derived keys + a stable `fingerprint` (`search-diagnostics.ts`); deterministic heading slugs (`markdown.ts`) | `search-deterministic-diagnostics.test.ts` (two fresh vaults → identical fingerprint; stable across runs; per-actor no-leak), `search-result-opening.spec.ts` (fingerprint visible + content-derived) |
| AC2 — exported/imported saved search preserves stable criteria or surfaces explicit remapping diagnostics | `diagnoseSavedSearchPortability` splits stable criteria from the volatile relationship-anchor + emits a remapping diagnostic (`search-diagnostics.ts`) | `search-deterministic-diagnostics.test.ts` (stable criteria portable; relationship-anchor remapping; no content leak; empty filter portable) |

## Demo path

1. `pnpm v2:dev`, open `/knowledge/`.
2. SRCH-007 AC1 — in "Filters & saved searches", type `Harbor Town` and check the Map POI facet. Click the
   "Harbor Town" result: it navigates to `/atlas/?map=map-western-reaches&poi=poi-harbor-town&x=0.62&y=0.34`
   and the map viewport is centered at `(0.62, 0.34)`.
3. SRCH-007 AC2 — create a player-visible note "Harbor Lore" with body
   `# Overview\n\n…\n\n## Hidden Cove\n\n…`. Search `Harbor Lore`, check the Note facet, and click the result:
   it opens `/knowledge/?note=<id>#hidden-cove`, the editor shows the note, and the hash scrolls to the
   heading. (Switch "View as" to a player and open a dm-only note → the generic "unavailable" message; the
   title never appears.)
4. SRCH-008 AC1 — create "Dragon Cult" (title) and "Harbor Watch" (body mentions "dragon"), search `dragon`,
   and expand "Search diagnostics": the fingerprint reads `1=note:dragon cult@… | 2=note:harbor watch@…` —
   content-derived keys, stable across fresh fixtures regardless of the underlying ids. As a player, a
   `dm-only` term yields an EMPTY diagnostic and the term appears nowhere.
5. SRCH-008 AC2 — (core/test demo) `diagnoseSavedSearchPortability` on a saved search with a relationship
   filter returns `portable: false` with an explicit remapping diagnostic naming only the criterion + the
   dangling id; a text/tag/folder/source/type/date-only saved search is fully portable.

## Quality review

- Correctness: both SRCH-007 acceptance criteria (POI viewport focus + param preservation; note-heading hash)
  and both SRCH-008 acceptance criteria (id-normalized fingerprint; saved-search remapping) implemented + unit
  + (for the visible flow) e2e covered.
- Architecture: a COMPLETION of the single `resolveDeepLink` resolver + a thin diagnostics read over the
  already actor-filtered search result — no second index, no re-derived visibility/ranking, no v1 runtime
  imports, core imports no Svelte/DOM. The GUI navigates/renders computed results and dispatches intents
  (Contract 1). Boundary lint green.
- Tests: 23 new core unit tests (viewport focus, heading anchors, open-time fail-closed, id-normalized
  fingerprint, per-actor no-leak, saved-search portability) + 4 new e2e tests on both profiles, with hard
  JSON no-leak assertions.
- Accessibility: results are real `<button>` open controls (keyboard + touch reachable); the diagnostics is a
  native `<details>`/`<summary>`; svelte-check reports 0 a11y warnings.
- Performance: pure O(visible hits) work over already-computed actor-filtered reads; the fingerprint is a
  single map + join; heading anchors a single line scan. No new dispatch-hot-path work.
- Security/permissions: opening re-checks visibility at open time through actor-filtered reads and fails
  closed; a stale/hidden/deleted descriptor opens to the generic unavailable; diagnostics summarize only the
  actor-visible result/filter and never expose a hidden hit, key, count, or related title.
- Persistence: no new durable state and no migration.
- Sync/offline: pure local computation, fully available offline; the fingerprint is stable across restarts and
  fresh fixtures; no new sync operations.
- UX: results are openable to the precise route/viewport/heading; an inspectable diagnostics fingerprint;
  empty/error/unavailable states preserved.
- Maintainability: cohesive additions (`result-open.ts`, `search-diagnostics.ts`, two markdown helpers) + a
  completed resolver branch + additive GUI; back-compatible (`DeepLinkStateView.content`/`session` optional);
  no speculative abstractions; no unrelated refactors.
- Docs: this completion doc; the new modules + GUI cite SRCH-007/008 and the open-time-re-check,
  visibility-safe-heading, and id-normalized-no-leak contracts.

## Known gaps / deferred items

- HANDOUT / SESSION-ARTIFACT RESULT OPENING OPENS THE SECTION ROUTE, not a per-entity focus. The prototype's
  durable state has no in-section deep-link target for a specific handout or recorded roll yet, so opening one
  routes to the Session section (the user lands on the right surface). `resolveSearchResultOpen` is shaped so a
  future SES deep-link epic plugs a precise handout/roll target into the same contract without a GUI change.
- KNOWLEDGE IS A SINGLE SECTION SURFACE (no per-note route). A note deep link selects the note WITHIN
  `/knowledge/` via a `note` param + heading hash (mirroring the Atlas `?map=` convention), rather than a
  `/knowledge/<id>/` route. If a future NAV epic adds per-note routes, the note resolution route can change
  without altering the result-open contract.
- SAVED-SEARCH EXPORT/IMPORT REMAPPING IS A DIAGNOSTIC, not an auto-remap. `diagnoseSavedSearchPortability`
  reports exactly what needs re-pointing (the relationship anchor); applying the remap (re-selecting the
  related item in the new vault) is a DM action, deferred to a saved-search import command epic.
- CALENDAR IDS TREATED AS STABLE. A date-range filter's `calendarId` is a vault-level config id (stable, named
  configuration in v2), so it carries across as stable criteria. If a future epic makes calendar ids volatile
  per-vault, a remapping plugs into `diagnoseSavedSearchPortability` without changing its contract.

## Stop conditions

None hit. ADR-014 supports the approach (a Processing-Core completion + a pure diagnostics read, browser-local,
SvelteKit GUI); no v1 runtime imports were required; the visibility/permission model was unambiguous (every
open path resolves through an existing actor-filtered read and fails closed at open time; diagnostics summarize
only actor-filtered values); the generated workpack validates; and the working tree showed no unrelated
overlapping changes.

## Git

Branch: `epic/SRCH-result-opening-and-deterministic-diagnostics` (chained off the prior epic tip
`epic/SRCH-ranking-and-result-context` @ `1c6b408`, per the v2 epic-branching convention — NOT from master).
Commit SHA (feat): `c7b1e87` (`feat(v2): complete SRCH-result-opening-and-deterministic-diagnostics epic`).
The completion-evidence SHA is recorded by the follow-up `docs(v2): record commit SHA …` commit.

### Changed files (full repo-relative paths)

- `apps/v2/packages/core/src/queries/deep-links.ts` (completed: POI target + viewport, note/object resolution + heading)
- `apps/v2/packages/core/src/queries/result-open.ts` (NEW — `resolveSearchResultOpen`)
- `apps/v2/packages/core/src/queries/search-diagnostics.ts` (NEW — `diagnoseSearchResult`, `diagnoseSavedSearchPortability`)
- `apps/v2/packages/core/src/state/markdown.ts` (NEW helpers: `slugifyHeading`, `headingAnchors`)
- `apps/v2/packages/core/src/index.ts` (export the new opening + diagnostics surface)
- `apps/v2/packages/core/tests/search-result-opening.test.ts` (NEW — 13 unit tests)
- `apps/v2/packages/core/tests/search-deterministic-diagnostics.test.ts` (NEW — 10 unit tests)
- `apps/v2/app/src/lib/gui/SavedSearches.svelte` (openable results + diagnostics panel)
- `apps/v2/app/src/lib/gui/NotesWorkbench.svelte` (select a deep-linked note via `?note=`)
- `apps/v2/app/src/routes/atlas/+page.svelte` (parse + focus a search-opened POI viewport)
- `apps/v2/app/tests/e2e/search-result-opening.spec.ts` (NEW — 4 e2e tests × 2 projects)
- `docs/planning/v2/epics/SRCH-result-opening-and-deterministic-diagnostics.yaml` (generated — status)
- `docs/planning/v2/status.yaml` (generated — status/metrics)
- `docs/planning/v2/workpack-state.yaml` (workpack state)
- `docs/planning/v2/epics/SRCH-result-opening-and-deterministic-diagnostics.completion.md` (this file)

### Final `git status --short`

After the completion `feat` commit and the SHA follow-up, the working tree is clean:

```
(empty — clean working tree)
```
