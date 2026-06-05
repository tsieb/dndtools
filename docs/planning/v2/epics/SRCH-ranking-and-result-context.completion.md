# SRCH-ranking-and-result-context — Completion Evidence

Epic: `SRCH-ranking-and-result-context` — SRCH: Ranking and result context
Requirement IDs: SRCH-005, SRCH-006, SRCH-011
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model); the standing v2 architecture contracts + ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic SRCH-ranking-and-result-context`.

## Summary

This epic REFINES the single actor-filtered search read `searchVaultForActor`
(`apps/v2/packages/core/src/queries/search-query.ts`) rather than forking a parallel search path. Every
guarantee the earlier SRCH epics proved still holds — every candidate is drawn from an actor-filtered domain
read (content CONTENT-011, map MAP-018, handout SES-004, dice SES-003), so a hidden artifact is never even a
candidate (Cross-Contract Non-Negotiable 2). On top of that visible result set it adds three things, all in
the Processing Core, all pure + deterministic:

- SRCH-005 — DETERMINISTIC RANKING. Each hit now carries a composite `score` built from six signals
  (`recency`, `title`, `tag`, `link`, `entityType`, `sessionContext`), every signal derived from the
  actor-visible set. The score is computed BEFORE any optional AI assistance, with TOTAL stable tie-breakers
  (score → stable type order → id) so the order is reproducible across repeated runs and fresh fixtures. The
  per-signal breakdown is exposed as `hit.signals` for diagnostics.
- SRCH-006 — RESULT CONTEXT. Each hit now carries a VISIBLE `snippet` plus visibility-safe `relationships`
  (visible backlinks, date refs, folder, map context). Every context field is derived from the SAME
  actor-filtered read as the hit, so a snippet NEVER crosses a hidden section boundary and a relationship hint
  NEVER names a hidden related artifact.
- SRCH-011 — OPTIONAL SEMANTIC ASSIST. A thin, provider-agnostic `SemanticAssist` seam is OFF by default,
  SECONDARY to deterministic search, LABELLED when it changes order, and constrained so it can only RE-ORDER
  the already-visible hits — it can never add a hit/title/snippet/id. When disabled or unavailable the
  deterministic result is returned unchanged; the deterministic order is preserved as `result.deterministicOrder`
  for debugging.

The GUI (`SavedSearches.svelte`) renders the computed snippet, source/type, tags, relationship hints, and the
semantic-assist label; it owns no ranking, snippeting, or visibility (Architecture Contract 1).

### Visibility / permission / data-safety design (the load-bearing contract)

- SNIPPETS CANNOT CROSS A HIDDEN SECTION BOUNDARY (SRCH-006 AC2). A snippet is only ever built from the
  actor's VISIBLE searchable text: the visible note body, a POI's visible notes, or — for a handout — ONLY the
  sections the actor may see (`handoutSearchableBody` already joins just the visible sections from the
  actor-filtered handout read; a `dm-only`/unrevealed section is never in it). A player who searches a
  `dm-only` handout section term gets ZERO hits and the term appears NOWHERE in their serialized result
  (asserted by a hard JSON no-leak test); the player's snippet for the same handout shows only the visible
  section.
- RELATIONSHIP HINTS ARE VISIBILITY-SAFE (SRCH-006 AC3). Backlinks are computed over the actor's VISIBLE item
  graph only, so a hint never names a hidden note, and a `dm-only` linking note's title never leaks into a
  player's result (asserted by a JSON no-leak test). Date refs come from the actor-filtered content view; the
  folder/map hints mirror the already-actor-safe hit fields.
- RANKING SIGNALS NEVER LEAK. Every signal — recency (anchored to the latest VISIBLE timestamp), title, tag,
  link (visible backlinks), entity-type, and session-context (the active/projected map) — is derived from the
  actor-visible set, so no hidden artifact can influence the order, a score, or the diagnostic.
- SEMANTIC ASSIST FAILS CLOSED (SRCH-011 AC2). The re-ranker only reorders the existing visible hit ids; any
  id it returns that is not already a visible hit is IGNORED, and any visible hit it omits keeps its
  deterministic position. A malicious re-ranker that injects a hidden item's id (or a fabricated id) at the top
  changes nothing — the hidden title never enters the player's result (asserted). An unknown/unauthenticated
  actor receives an empty result even with semantic enabled (fail closed).
- DETERMINISTIC SEARCH ALWAYS WORKS (SRCH-011 AC1, AC3). Semantic assist is off by default; when the model is
  unavailable (offline) the deterministic cached results are STILL returned, in deterministic order, with a
  generic "unavailable" status — the search never fails.

### Processing-Core changes (refine the existing read; no parallel index)

- `apps/v2/packages/core/src/queries/search-query.ts` —
  - `SearchHit` gains `score` (now the deterministic COMPOSITE), `signals: RankingSignals` (the per-signal
    breakdown / diagnostic), `snippet: SearchSnippet | null`, and `relationships: SearchRelationshipHints`.
  - `SearchResult` gains `deterministicOrder: string[]` (the base order, preserved as a diagnostic even when
    semantic re-ranks) and `semanticAssist: SemanticAssistStatus`.
  - New ranking helpers: `combineScore`, `recencySignal`, `tagMatchesNeedle`, `latestVisibleTimestamp`,
    `ENTITY_TYPE_SIGNAL`; new context helpers: `bodySnippet`, `buildVisibleBacklinks`, `itemDateRefs`; new
    semantic seam: `SearchOptions`, `SemanticAssist`, `applySemanticAssist`.
  - `searchVaultForActor`'s final 7th parameter is now `options: SearchOptions | CalendarDateFormat` —
    BACK-COMPATIBLE: a bare `dateFormat` string is still accepted (the prior positional arg), so every existing
    caller (`quick-switcher-query.ts`, `saved-search-query.ts`, the GUIs) keeps working unchanged.
- `apps/v2/packages/core/src/queries/quick-switcher-query.ts` — `navigationEntries` now derives its
  title-first switcher score from `hit.signals.title` (the title signal) instead of the raw composite score,
  preserving SRCH-002 AC1 (a title hit scores 2, a body/relationship-only hit 1) now that the hit score is a
  composite.
- `apps/v2/packages/core/src/index.ts` — exports the new types (`RankingSignals`, `SearchRelationshipHints`,
  `SearchOptions`, `SemanticAssist`, `SemanticAssistStatus`, and `SearchSnippet` re-exported as
  `SearchHitSnippet` to avoid colliding with the existing `content-search.ts` `SearchSnippet`).

### GUI

- `apps/v2/app/src/lib/gui/SavedSearches.svelte` — the search results now render the per-hit RESULT CONTEXT:
  type + source, the visible snippet, tags, and the visibility-safe relationship hints (backlinks, date refs,
  folder, map). A `search-semantic-status` line surfaces the semantic-assist label (applied / reranked /
  unavailable). Read-only of the computed model; writes still dispatch command intents (Contract 1).

### Persistence / offline / sync

No new durable state, no migration, no new sync operations. Ranking, snippets, and relationship hints are a
PURE local computation over already-durable actor-filtered reads, fully available offline (local-first) and
identical on every restart. The semantic-assist seam is provider-agnostic and supplied by the caller; the core
embeds no model (the final search-architecture decision is deferred per SRCH-011).

## Tests (primary evidence)

- `apps/v2/packages/core/tests/search-ranking-context.test.ts` (18 tests) —
  - SRCH-005: AC1 deterministic title-first scoring with AI off; recency tie-break; AC2 a POI on the session
    ACTIVE map carries the session-context signal and ranks above an unrelated POI; AC3 equal-input order is
    stable across repeated runs AND two fresh fixtures; AC4 an AI re-rank cannot replace the deterministic base
    without a visible label (the deterministic order is preserved as a diagnostic).
  - SRCH-006: AC1 two similar-named notes each return source/type + a distinguishing visible snippet; a pure
    title match shows no body snippet; AC2 a handout snippet never crosses a hidden section boundary (DM matches
    the dm-only term, the recipient gets ZERO hits and the term never appears in their serialized result — hard
    no-leak); AC3 visible backlinks appear only for the linking note the actor can see (dm-only backlink note
    never leaks), and a POI carries its map context.
  - SRCH-011: AC1 deterministic search works with semantic disabled; AC2 a malicious re-ranker cannot inject a
    hidden/fabricated id (no-leak); AC3 an offline-unavailable model still returns deterministic cached results;
    AC4 a re-rank is labelled and preserves per-hit deterministic score diagnostics; annotation-only pass;
    omitted-hit retention; unknown-actor fail-closed.
- `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (+2 tests × 2 projects = +4 instances) —
  SRCH-005 AC1 / SRCH-006 AC1 (a title match renders above a body-only match, each body match shows a visible
  snippet); SRCH-006 AC3 (a visible backlink hint renders for the DM's two linking notes, and for the player
  only the player-visible backlink — the dm-only linking note never leaks). Both pass on desktop-chromium AND
  mobile-chromium.

### Commands run (results)

- `pnpm --filter @dndtools/v2-core test` — PASS (123 files, 1706 tests; +1 file, +18 new ranking/context tests;
  no existing test weakened or deleted).
- `pnpm v2:typecheck` — PASS (core `tsc --noEmit` 0 errors; app `svelte-check` 0 errors / 0 warnings, 805 files).
- `pnpm v2:lint` (boundary) — PASS (no v1 runtime imports; core has no Svelte/DOM/GUI imports).
- `pnpm lint` (FULL: `eslint .` + `lint:navigation` + `lint:tokens` + `audit:repo`) — PASS.
- `pnpm docs:validate` — PASS (includes the v2 workpack validator).
- `pnpm v2:workpack:validate` — PASS (after `set-status active` and after `complete`; no drift).
- `pnpm e2e` (from `apps/v2/app`, BOTH desktop-chromium AND mobile-chromium, WHOLE suite) — 484 passed, 21
  intentional project-scoped skips, 1 failed. The single failure is the PRE-EXISTING flaky test
  `tests/e2e/quick-switcher.spec.ts:46` ("a title match ranks above a body-only match") on mobile-chromium
  ONLY. This flake is NOT a regression from this epic: it reproduces IDENTICALLY on the clean baseline at HEAD
  `4da92a5` with ALL of this epic's changes stashed (verified via `git stash` → run → `git stash pop`), and it
  passes intermittently on re-run (1/3 on `--repeat-each=3`). Its root cause is a note-creation timing race in
  that prior-epic SRCH-002 spec on the slower mobile profile (the second note "Harbor Watch" sometimes does not
  render before the switcher reads state) — unrelated to ranking/context. The full quick-switcher spec is GREEN
  on desktop-chromium (6 passed, 1 skipped) and the search-filters spec (incl. the 2 new ranking/context tests)
  is GREEN on BOTH projects (14 passed). All other 484 tests pass on both projects.

## Traceability (requirement → code + tests)

### SRCH-005 — deterministic ranking

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — AI disabled, ranking still uses deterministic scoring | `combineScore` over the six `RankingSignals`; `searchVaultForActor` ranks via `compareHits` BEFORE `applySemanticAssist`; `semantic` is undefined by default (`apps/v2/packages/core/src/queries/search-query.ts`) | `search-ranking-context.test.ts` (AC1 title-first; semantic disabled by default), `search-filters-and-saved-searches.spec.ts` (title ranks above body in the rendered list) |
| AC2 — active map ⇒ visible POIs on that map rank higher | `focusedMapIds` from `session.activeMap` + `deliveredMapIdsForActor`; POI `sessionContext` signal set when the POI's map is focused (`search-query.ts`) | `search-ranking-context.test.ts` (POI session-context signal on the active map; ranks above unrelated) |
| AC3 — equal inputs ⇒ stable order across runs + fresh fixtures | `compareHits` TOTAL tie-break (score → `TYPE_ORDER` → `id.localeCompare`) (`search-query.ts`) | `search-ranking-context.test.ts` (two fresh fixtures + repeated runs identical) |
| AC4 — optional AI cannot expose hidden content or replace base ranking without a visible label | `applySemanticAssist` only reorders visible ids, sets `semanticAssist.reranked`, preserves `result.deterministicOrder` (`search-query.ts`); GUI `search-semantic-status` label (`SavedSearches.svelte`) | `search-ranking-context.test.ts` (rerank labelled; deterministic order preserved; no-leak inject test) |

### SRCH-006 — result context

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — each result includes source/type context + visible snippet | `SearchHit.source`/`type` + `bodySnippet` over the visible searched text (`search-query.ts`); GUI renders type · source + `search-snippet-*` (`SavedSearches.svelte`) | `search-ranking-context.test.ts` (similar-named notes each get distinguishing snippet), `search-filters-and-saved-searches.spec.ts` (visible snippet rendered) |
| AC2 — a snippet crossing a hidden section boundary omits hidden text for a player | the snippet is built ONLY from the actor's visible searchable text (`handoutSearchableBody` = visible sections only) (`search-query.ts`/`handout-query.ts`) | `search-ranking-context.test.ts` (DM matches dm-only term; recipient gets 0 hits; term never in serialized player result) |
| AC3 — relationship hints (backlinks, date refs, folder, map) only if visible | `buildVisibleBacklinks` over the visible item graph; `itemDateRefs` from the actor-filtered view; folder/map mirror the actor-safe hit (`search-query.ts`); GUI `search-backlinks/dates/folder/map-*` (`SavedSearches.svelte`) | `search-ranking-context.test.ts` (player sees only visible backlink; dm-only linking note never leaks; POI map context), `search-filters-and-saved-searches.spec.ts` (backlink hint visible to DM, only the visible one to the player) |

### SRCH-011 — optional, visibility-filtered, source-cited, secondary semantic search

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — semantic disabled/unavailable ⇒ deterministic full-text/facet/title/tag/graph/date search still works | `applySemanticAssist` returns `disabled` and leaves the deterministic order untouched when `semantic` is absent (`search-query.ts`) | `search-ranking-context.test.ts` (deterministic search works with semantic disabled) |
| AC2 — semantic suggestions are source-cited and cannot introduce hidden titles/snippets/ids/counts | the re-ranker only reorders existing visible hit ids; invented/hidden ids are ignored (`applySemanticAssist`) | `search-ranking-context.test.ts` (inject hidden + fabricated id → ignored, no leak; omitted hit retained) |
| AC3 — model unavailable offline ⇒ marked unavailable, deterministic cached results still returned | `applySemanticAssist` returns `unavailable` with a generic reason and the deterministic order (`search-query.ts`) | `search-ranking-context.test.ts` (offline unavailable still returns deterministic cached results) |
| AC4 — semantic ranking change ⇒ UI labels it and deterministic score diagnostics preserved | `semanticAssist.reranked` + `result.deterministicOrder` + per-hit `signals` (`search-query.ts`); GUI `search-semantic-status` (`SavedSearches.svelte`) | `search-ranking-context.test.ts` (rerank labelled; deterministic order + per-signal diagnostics preserved) |

## Demo path

1. `pnpm v2:dev`, open `/knowledge/`.
2. As the DM, create two player-visible notes: "Dragon Cult" (body "A secretive order of dragon worshippers.")
   and "Harbor Watch" (body "A dragon was sighted off the coast."). In the "Filters & saved searches" panel,
   type "dragon" and check the Note facet.
   - SRCH-005 AC1: "Dragon Cult" (TITLE match) ranks ABOVE "Harbor Watch" (BODY-only match) WITHOUT any AI.
   - SRCH-006 AC1: each result shows its type · source, and "Harbor Watch" shows a visible body SNIPPET around
     "sighted" for fast disambiguation.
3. Create "Castle Keep" (player-visible), then "Village Road" (player-visible, body links `[[Castle Keep]]`)
   and "Secret Siege Plan" (dm-only, body links `[[Castle Keep]]`). Search "Castle Keep".
   - SRCH-006 AC3: the DM sees the Castle Keep result with backlinks "Village Road" and "Secret Siege Plan".
     Switch "View as" to a player: only "Village Road" shows as a backlink; the dm-only "Secret Siege Plan"
     never appears anywhere.
4. Author a handout with a player-visible section and a dm-only section, deliver it to a player. As the DM,
   search a term from the dm-only section — a snippet from it appears. As the recipient, the same search returns
   NOTHING and the term appears nowhere (SRCH-006 AC2).
5. SRCH-005 AC2: with a Scene's active map projected, a POI on that map ranks above an unrelated POI of equal
   text strength (proven in the core test; the GUI search list reflects the same ranking).
6. SRCH-011: with semantic assistance OFF (the default), deterministic search works fully. When a caller
   enables semantic assist and it re-orders results, the `search-semantic-status` line labels the contribution
   and the deterministic order remains available for diagnostics; when the model is offline the line marks it
   unavailable and the deterministic cached results still show (AC1/AC3/AC4).

## Quality review

- Correctness: all four SRCH-005, three SRCH-006, and four SRCH-011 acceptance criteria implemented + unit +
  (where visible) e2e covered.
- Architecture: a refinement of the SINGLE actor-filtered `searchVaultForActor` read — no second index, no
  re-derived visibility/permission/ranking, no v1 runtime imports, core imports no Svelte/DOM. The GUI renders
  the computed model and dispatches intents (Contract 1). Boundary lint green.
- Tests: 18 new core unit tests (deterministic ranking, session-context, stable tie-breaks, snippets,
  section-boundary no-leak, visible backlinks, semantic fail-closed/offline/labelled) + 2 new e2e tests on both
  profiles, with hard JSON no-leak assertions.
- Accessibility: the result context renders as plain text spans inside the existing labelled results list;
  svelte-check reports 0 a11y warnings.
- Performance: pure O(visible artifacts) work over already-computed actor-filtered reads; the backlink index is
  built once per search; snippets are a single substring window. No new dispatch-hot-path work.
- Security/permissions: every ranking signal, snippet, and relationship hint is derived from the actor-visible
  set; snippets never cross a hidden section boundary; relationship hints never name a hidden artifact; semantic
  assist can never add a hit; an unknown actor receives an empty result (fail closed).
- Persistence: no new durable state and no migration.
- Sync/offline: a pure local computation, fully available offline; deterministic results returned even when the
  optional semantic model is unavailable; no new sync operations.
- UX: per-hit type/source, snippet, tags, and relationship hints for fast disambiguation; a clear
  semantic-assist label; empty/error states preserved from the prior surface.
- Maintainability: all changes are cohesive within the existing `search-query.ts` read + a one-line
  quick-switcher adjustment + an additive GUI render; back-compatible signature change; no speculative
  abstractions; no unrelated refactors.
- Docs: this completion doc; the module/GUI docs cite SRCH-005/006/011 and the deterministic-ranking,
  visibility-safe-context, and optional-secondary-semantic contracts.

## Known gaps / deferred items

- SEMANTIC MODEL IS A SEAM, NOT AN IMPLEMENTATION (intentional per SRCH-011). The core embeds NO semantic model
  or embedding store; `SemanticAssist` is a provider-agnostic re-ranker the caller supplies, deferred until the
  search-architecture decision promotes semantic/entity expansion. The core constrains it so it can never leak
  or replace deterministic ranking unseen; wiring a concrete model is a future epic.
- SECTION-LEVEL SNIPPET REDACTION USES THE EXISTING MODEL. The v2 content model treats a note body as one
  visible blob with granular visibility authored on DECLARED section ids (not markdown-heading substrings), so
  the clearest "snippet crosses a hidden section boundary" case is the handout (whose sections ARE per-section
  visible bodies) — that case is fully covered. A future CONTENT epic that maps note-body substrings to declared
  sections would let note snippets be redacted at sub-body granularity; until then a note is searched/snippeted
  over its visible body (a `dm-only` note is omitted entirely, so no hidden note body is ever snippeted).
- PRE-EXISTING MOBILE E2E FLAKE (NOT this epic): `tests/e2e/quick-switcher.spec.ts:46` flakes on mobile-chromium
  due to a note-creation timing race in that prior-epic spec; it reproduces identically on the clean baseline
  with this epic's changes stashed, and passes on desktop + on re-run. No test was weakened to accommodate it.

## Stop conditions

None hit. ADR-014 supports the approach (a Processing-Core refinement over actor-filtered reads, browser-local,
SvelteKit GUI); no v1 runtime imports were required; the visibility/permission model was unambiguous (every
ranking signal, snippet, and relationship hint is derived from an existing actor-filtered read, and the semantic
seam fails closed both by membership and on invocation); the generated workpack validates; and the working tree
showed no unrelated overlapping changes.

## Git

Branch: `epic/SRCH-ranking-and-result-context` (chained off the prior epic tip
`epic/SRCH-quick-switcher-and-command-discovery` @ `4da92a5`, per the v2 epic-branching convention — NOT from
master).
Commit SHA (feat): `69147ab` (`feat(v2): complete SRCH-ranking-and-result-context epic`).
The completion-evidence SHA is recorded by this follow-up `docs(v2): record commit SHA …` commit.

### Changed files (full repo-relative paths)

- `apps/v2/packages/core/src/queries/search-query.ts` (refined: ranking, result context, semantic seam)
- `apps/v2/packages/core/src/queries/quick-switcher-query.ts` (title-first score from `hit.signals.title`)
- `apps/v2/packages/core/src/index.ts` (export new ranking/context/semantic types)
- `apps/v2/packages/core/tests/search-ranking-context.test.ts` (NEW — 18 unit tests)
- `apps/v2/app/src/lib/gui/SavedSearches.svelte` (render snippet, tags, relationship hints, semantic label)
- `apps/v2/app/tests/e2e/search-filters-and-saved-searches.spec.ts` (+2 ranking/context e2e tests)
- `docs/planning/v2/epics/SRCH-ranking-and-result-context.yaml` (generated — status)
- `docs/planning/v2/status.yaml` (generated — status/metrics)
- `docs/planning/v2/workpack-state.yaml` (workpack state)
- `docs/planning/v2/epics/SRCH-ranking-and-result-context.completion.md` (this file)

### Final `git status --short`

After the completion `feat` commit and the SHA follow-up, the working tree is clean:

```
(empty — clean working tree)
```
