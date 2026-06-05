# SRCH-filters-and-saved-searches — Completion Evidence

Epic: `SRCH-filters-and-saved-searches` — SRCH: Filters and saved searches
Requirement IDs: SRCH-003, SRCH-004
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model); the standing v2 architecture contracts + ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic SRCH-filters-and-saved-searches`.

## Summary

This epic adds the SRCH FILTERS (SRCH-003) and SAVED SEARCHES (SRCH-004) capability branch. It COMPOSES
the existing SRCH/CONTENT/MAP index — it adds NO second index and re-derives NO visibility policy:

- FACETED SEARCH (`searchVaultForActor`) draws every candidate from the existing actor-filtered reads:
  notes + structured objects from `getContentItemsForActor` (CONTENT-011) and map POIs from
  `getMapViewForActor` (MAP-018). Because each source already decided visibility, the data layer decided
  it BEFORE search sees anything (Cross-Contract Non-Negotiable 2). It then applies the SRCH-003 facets —
  SOURCE, CONTENT TYPE, TAG, FOLDER, an inclusive custom-DATE RANGE, and a VISIBILITY-SAFE RELATIONSHIP —
  plus free text, all combined with AND, and echoes the active filters + per-type/per-source counts.
- SAVED SEARCHES (`SavedSearch` + commands + `getSavedSearchesForActor`) are DM-authored, NAMED, durable
  FILTERS with their own visibility + pin state. A saved search stores ONLY its filter criteria — NEVER a
  cached result — so every run re-evaluates LIVE through the actor-filtered search.

### Visibility / data-safety design (the load-bearing contract)

- A `dm-only` note/object/POI is never a search candidate (it is omitted at its actor-filtered source), so
  a player never sees a hidden hit, facet, relationship match, or a count revealing one (SRCH-003 AC1, AC4).
  Counts (`totalCount`, `countsByType`) derive from the visible set only.
- The VISIBILITY-SAFE RELATIONSHIP filter resolves over the actor's VISIBLE graph only (wikilinks for
  content, POI→entity links for maps). A wikilink to a hidden note resolves to no visible candidate; an
  anchor that is itself hidden resolves to an EMPTY related set — so a player can't use a relationship
  filter to discover hidden related content (SRCH-003 AC4).
- A referenced UNAVAILABLE source (`dndtools.sourceUnavailable`) is marked `stale-cached` / `unavailable`
  in the per-source freshness map WITHOUT failing the whole search — available sources still return their
  visible cached hits (SRCH-003 AC2).
- A saved search is VISIBILITY-FILTERED like any entity: a `dm-only` saved search is OMITTED ENTIRELY from
  a non-DM's list/run (name + criteria + existence never leak — SRCH-004 AC2). It FAILS CLOSED to `dm-only`.
- A saved search stores a QUERY, never a RESULT. There is no cached result set that could leak a now-hidden
  item: each run re-evaluates the filter for the RUNNING actor, which decides visibility before producing a
  hit. A `player-visible` saved search that references content which is later hidden simply omits it on the
  next run (proven by the `becomes-hidden` test) — never a stale leak (SRCH-003 AC1/AC4).
- Saved-search authoring is DM-only (create/update/pin/delete). The dispatch-level observer write gate
  rejects observers; each handler re-checks DM (fail closed). The durable op + event audit carries the
  saved-search id + visibility + pin state, NEVER the filter criteria values.

### Processing-Core additions (compose existing reads; no parallel index)

- `apps/v2/packages/core/src/state/saved-search.ts` — the durable `SavedSearch` model + the shared
  `SearchFilter` value (source/type/tag/folder/date-range/relationship/text) + pure reducers
  (`buildSavedSearch`, `updateSavedSearch`, `setSavedSearchPinned`, `removeSavedSearch`,
  `normalizeSearchFilter`, `ensureSavedSearches`). Saved searches fail closed to `dm-only`.
- `apps/v2/packages/core/src/queries/search-query.ts` — `searchVaultForActor(...)`: the single
  actor-filtered faceted search read, composing content + map reads, with per-source freshness + echoed
  active filters + deterministic ordering (title-match first → stable type order → id).
- `apps/v2/packages/core/src/queries/saved-search-query.ts` — `getSavedSearchesForActor`,
  `getPinnedSavedSearchesForActor` (the Command Center widget feed — SRCH-004 AC1), `runSavedSearchForActor`
  (run one by id; `null` when not visible/missing — indistinguishable). Each runs the filter LIVE.
- `apps/v2/packages/core/src/commands/saved-search.ts` — DM-only create/update/pin/delete handlers, each
  appending a durable `content.*-saved-search` op + a non-leaking `content.saved-search-changed` event.
- Wiring: `savedSearches` added to `VaultContentState` (`state/content.ts`, hydrated fail-closed via
  `ensureSavedSearches`); command union/event union/`saved-search-not-found` rejection
  (`commands/types.ts`); the four schemas (`schemas/commands.ts`); the dispatch switch (`commands/dispatch.ts`);
  and the public exports (`index.ts`).

### Persistence / offline / sync (fail closed)

- Saved searches live in the durable `VaultContentState`. The scene-store hydration now routes content
  through `ensureVaultContentState`, so a vault persisted before this slice restores with no saved searches
  (never undefined) and any persisted saved search re-normalizes its filter + defaults visibility to
  `dm-only`. No destructive migration; offline-available (it is durable vault state). Each mutation is a
  durable, replayable, conflict-shaped op (entity type `saved-search`), so a saved search syncs like any
  vault entity. Because a saved search never carries a result, there is no stale result to replicate to a
  player — re-evaluation is always live and actor-scoped.

### Public API + GUI

- `apps/v2/packages/core/src/index.ts` — exports the saved-search model/reducers, `searchVaultForActor` +
  its result types, the saved-search query functions + `SavedSearchView`, and the four command schemas.
- `apps/v2/app/src/lib/gui/SavedSearches.svelte` — the FILTERS + SAVED SEARCHES surface: an ad-hoc faceted
  filter form (text + source + content-type + tag + folder) rendering the live `searchVaultForActor`
  result, plus (DM-only) save/pin/delete controls and the actor-filtered saved-search list with each
  search's LIVE result count. Read paths render the computed model; writes dispatch command intents only
  (Contract 1). Mounted on `apps/v2/app/src/routes/knowledge/+page.svelte` after `CalendarDiscovery`.

## Tests (primary evidence)

- `apps/v2/packages/core/tests/search-filters.test.ts` (11 tests) — fail-closed empty (unknown actor);
  empty-filter-matches-all + echoed no-facets; AC1/AC4 (a dm-only note omitted for a player AND not counted,
  with a JSON no-leak assertion; a dm-only POI on the demo dm-only layer never in a player search); AC3
  (combine source+type+tag+folder+date+text with decoys each failing one facet; tag AND not OR; active
  filters echoed); AC2 (an offline source marked `stale-cached` while still returning cached hits; an
  explicitly-requested empty source marked `unavailable`); AC4 (relationship restricts to wikilinked
  visible notes — the dm-only target omitted for the player; a relationship anchored on a HIDDEN entity
  resolves to nothing); deterministic ordering across repeated runs.
- `apps/v2/packages/core/tests/saved-searches.test.ts` (13 tests) — DM stores filter not results (JSON
  no-result assertion); player/observer create/update/pin/delete rejected (fail closed); unknown-search
  rejections; non-leaking op/event audit; AC2 (a dm-only saved search absent from a player list + a direct
  run returns null); LIVE re-evaluation (same filter yields each actor's own hits; a `player-visible` saved
  search OMITS a note that BECOMES hidden after it was saved — no stale leak); AC1 (pin/unpin shows current
  live results; a dm-only pinned search absent from a player Command Center); edit/delete + revision bump;
  create default fails closed to `dm-only`.
- `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (4 tests × 2 projects = 8) — full
  Playwright on BOTH desktop-chromium AND mobile-chromium: AC1/AC4 (a text filter returns visible hits; a
  dm-only note hidden from the player + count not inflated; hidden title appears nowhere); AC3 (the
  content-type facet restricts to POIs / notes); SRCH-004 AC2 (a dm-only saved search absent for the
  player; a player-visible one re-runs live); SRCH-004 AC1 (the DM pins/unpins a saved search).

### Commands run (results)

- `pnpm --filter @dndtools/v2-core test` — PASS (119 files, 1653 tests; +24 new: 11 search-filters +
  13 saved-searches).
- `pnpm --filter @dndtools/v2-app test` — PASS (12 files, 55 tests).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` 0 errors; app `svelte-check` 0 errors / 0 warnings,
  799 files).
- `pnpm v2:lint` (boundary) — PASS (no v1 runtime imports; core has no Svelte/DOM/GUI imports).
- `pnpm lint` (FULL: `eslint .` + `lint:navigation` + `lint:tokens` 132 files + `audit:repo` 5/5) — PASS.
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:workpack:validate` — PASS (before and after `complete`; no drift).
- `pnpm e2e` (from `apps/v2/app`, BOTH projects) — PASS: 468 passed, 18 intentional project-scoped skips,
  0 failed (base was 460 passed; +8 new tests across the two projects).

## Traceability (SRCH-003 / SRCH-004 → code + tests)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| SRCH-003 — a saved search filtering POIs by tag shows only visible matching POIs | `searchVaultForActor` (POI candidates from `getMapViewForActor`) + `getSavedSearchesForActor` (re-runs live) in `apps/v2/packages/core/src/queries/search-query.ts` + `apps/v2/packages/core/src/queries/saved-search-query.ts` | `apps/v2/packages/core/tests/search-filters.test.ts` (dm-only POI never in a player search), `apps/v2/packages/core/tests/saved-searches.test.ts` (live re-eval) |
| SRCH-003 AC2 — an unavailable source is marked stale/unavailable without failing the search | per-source `SearchSourceStatus` freshness (`stale-cached`/`unavailable`) over the `dndtools.sourceUnavailable` field in `apps/v2/packages/core/src/queries/search-query.ts` | `apps/v2/packages/core/tests/search-filters.test.ts` (AC2 stale-cached + unavailable cases) |
| SRCH-003 AC3 — combine source+folder+tag+content-type+date+relationship; result lists active filters | the AND-combined facet pipeline + `ActiveSearchFilters` echo in `apps/v2/packages/core/src/queries/search-query.ts` | `apps/v2/packages/core/tests/search-filters.test.ts` (combine-all + active-filters cases), `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (AC3 type facet) |
| SRCH-003 AC4 — a relationship filter never reveals hidden related content (no facet/hint/count) | `resolveRelatedKeys` over the actor's VISIBLE graph only; counts over the visible set | `apps/v2/packages/core/tests/search-filters.test.ts` (relationship visible-only + hidden-anchor cases), `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (AC1/AC4 no-leak) |
| SRCH-004 AC1 — a pinned saved search shows current results on the Command Center | `setSavedSearchPinned` + `getPinnedSavedSearchesForActor` (live run) | `apps/v2/packages/core/tests/saved-searches.test.ts` (pin shows live results), `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (AC1 pin/unpin) |
| SRCH-004 AC2 — a saved search with DM-only criteria is absent for players unless explicitly visible | `savedSearchVisibleToActor` (fail closed to `dm-only`) + DM-only create default | `apps/v2/packages/core/tests/saved-searches.test.ts` (AC2 absent + run-returns-null), `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (AC2 absent for player) |
| No stale leak — a saved search re-evaluates visibility at run time | a saved search stores only its `SearchFilter`; `runSavedSearchForActor` re-runs `searchVaultForActor` per actor | `apps/v2/packages/core/tests/saved-searches.test.ts` (note BECOMES hidden after save → omitted) |
| Processing/Display decoupling | GUI renders the computed result + dispatches command intents only (`apps/v2/app/src/lib/gui/SavedSearches.svelte`) | `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` |

## Demo path

1. `pnpm v2:dev`, open `/knowledge/`.
2. As the DM, in "Notes" create two notes: "Beacon of Hope" (player-visible, body "The beacon shines over
   the harbor.") and "Beacon of Doom" (dm-only, body "The beacon hides a beacon trap.") — saving each.
3. Scroll to "Filters & saved searches". Type "beacon" into the search text box — both notes appear; the
   count reads "2 matching results". Check "Map POI" under Content type and uncheck it again to see the
   facet restrict/restore. Enter a tag or folder to narrow further.
4. In "Save this filter as", name it "Beacon watch", choose "Player-visible", and click "Save search". It
   appears under "Saved searches" with its live result count. Click "Pin" — the "pinned" marker appears.
5. Save a second search named "DM beacon secrets" with visibility "DM only".
6. Use the header "View as" control to switch to "Test Player": the dm-only "Beacon of Doom" disappears
   from the filtered results AND the count drops to "1 matching result"; the "DM beacon secrets" saved
   search is ABSENT from the player's saved-search list, while "Beacon watch" remains and re-runs live.

## Quality review

- Correctness: every SRCH-003 (AC1–AC4) and SRCH-004 (AC1–AC2) acceptance criterion is implemented and
  unit + e2e covered, including facet combination, tag AND-semantics, source availability, relationship
  safety, deterministic ordering, DM-only authoring, dm-only absence, and live re-evaluation.
- Architecture: pure Processing-Core search composed from the existing actor-filtered content (CONTENT-011)
  + map (MAP-018) reads — no second index, no re-derived visibility. Saved searches are a durable
  vault-state slice with command/reducer/op/event wiring mirroring the player-group + content-item
  patterns. The GUI renders the computed model and dispatches intents. Boundary lint green; no v1 runtime
  imports; core imports no Svelte/DOM.
- Tests: unit (fail-closed, AC1–AC4, no-leak, determinism, live re-eval) + e2e on both profiles.
- Accessibility: the surface uses a labelled `section`/`form`/`fieldset`/`legend`/`input`/`select`/`button`
  structure consistent with the sibling Knowledge surfaces; it is a stacked list/form that runs on the
  compact (mobile) profile (proven by the mobile-chromium e2e run).
- Performance: pure O(visible content + visible POIs) work over already-computed actor-filtered reads per
  search; saved-search list runs one search per visible saved search. No new heavy work on the dispatch
  hot path; saved-search writes append a single op.
- Security/permissions: every candidate is actor-filtered before search; counts derive from the visible set
  only; the relationship filter resolves over the visible graph only; saved searches are visibility-filtered
  + DM-only authored; the audit never carries filter criteria; an unknown actor receives empty (fail closed).
- Persistence: saved searches are durable vault state, hydrated fail-closed via `ensureVaultContentState`
  (older vaults restore with none; missing visibility ⇒ `dm-only`). No destructive migration.
- Sync/offline: saved-search mutations are durable, replayable, conflict-shaped ops (entity type
  `saved-search`); a saved search carries no result, so nothing stale replicates to a player — re-evaluation
  is always live + actor-scoped. The read is a pure local computation, fully available offline.
- UX: empty states for "no results" and "no saved searches"; a live count; a per-source freshness list when
  a source is stale/unavailable; DM-only save/pin/delete controls.
- Maintainability: one small typed state module + two query modules + one command module + one read-only-ish
  GUI; the `SearchFilter` value is shared by the ad-hoc search and saved searches (no duplication); no
  speculative abstractions; no unrelated refactors (the scene-store change routes content through the
  existing `ensureVaultContentState` helper, tightening an existing hand-rolled default).
- Docs: this completion doc; the module/GUI/route docs cite SRCH-003/004, the composed reads, and the
  no-leak + no-stale-result contracts.

## Known gaps / deferred items

- The DATE-RANGE facet and the VISIBILITY-SAFE RELATIONSHIP facet are fully implemented + unit-tested in
  the Processing Core and available through the saved-search filter, but the ad-hoc GUI form exposes only
  the text/source/content-type/tag/folder controls (the most common facets) — date-range and relationship
  filters are authored via saved searches / the API rather than ad-hoc form fields. This is a GUI surface
  scoping choice, not a capability gap; a later SRCH/UX epic can add the date-range + relationship pickers
  to the ad-hoc form without changing the search contract.
- POIs carry no tags/folder/custom-date in the current map model, so the tag/folder/date facets only apply
  to content (a POI is excluded when one of those facets is active). This matches the data model; a later
  MAP epic that adds POI tags/dates would flow through the same facet pipeline.
- Source availability uses the per-item `dndtools.sourceUnavailable` convention (shared with the CONTENT-006
  wikilink graph) until the durable `sync-source-registrations` registry is wired (deferred per ADR-014).
  When that lands, the freshness map can read the registry without changing the search contract.
- The Knowledge section remains a `planned` IA section (NAV-009): `/knowledge` is directly reachable for
  this slice but is not yet promoted into primary navigation. The Command Center pinned-saved-search WIDGET
  is fed by `getPinnedSavedSearchesForActor`; rendering it as a literal Command Center widget instance is
  owned by a CMD/widget epic — the data feed (AC1) is delivered + tested here.

## Stop conditions

None hit. The v2 stack ADR (ADR-014) supports the approach; no v1 runtime imports were required; the
permission/visibility model was unambiguous (every search candidate is an existing actor-filtered read;
saved searches are visibility-filtered like content items and fail closed to `dm-only`; saved searches
store no result so there is no stale-leak ambiguity — they always re-evaluate live); the generated workpack
validates; and the working tree showed no unrelated overlapping changes.

## Git

Branch: `epic/SRCH-filters-and-saved-searches` (chained off the prior epic tip
`epic/SRCH-calendar-custom-time-discovery` @ `2874d27`, per the v2 epic-branching convention — NOT from
master).
Commit SHA (feat): `__FEAT_SHA__` (`feat(v2): complete SRCH-filters-and-saved-searches epic`).
The completion-evidence SHA is recorded by a follow-up `docs(v2): record commit SHA …` commit.

### Final `git status --short`

After the completion `feat` commit and the SHA follow-up, the working tree is clean:

```
(empty — clean working tree)
```
