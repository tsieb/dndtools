# CHAR-party-and-player-records — Completion Evidence

Epic: `CHAR-party-and-player-records` — CHAR: Party and player records
Requirement IDs: CHAR-011, CHAR-012, CHAR-015, CHAR-016
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CHAR-party-and-player-records`.

## Summary

Delivered the party-and-player-records capability branch for CHAR, built entirely on the existing
v2 patterns:

- the PERM-002/003 visibility filter and the PERM-011 OBSERVER CEILING
  (`apps/v2/packages/core/src/permissions/consistency.ts` `decideCharacterDataRead`),
- the MAP-018 single actor-filtered read-model template
  (`apps/v2/packages/core/src/queries/map-query.ts` `getMapViewForActor`),
- the character model `resources` block and the grant model,
- the capability-cache / visibility-cache fingerprint invalidation pattern.

Two new actor-filtered read models are the non-leak keystones: the party overview
(`apps/v2/packages/core/src/queries/party-overview.ts` `getPartyOverviewForActor`) and the character
journal (`apps/v2/packages/core/src/queries/character-journal-query.ts` `getCharacterJournalForActor`).
Both are the ONLY sanctioned read paths for their surface, so a hidden character / inventory item /
journal entry cannot leak through one surface while being blocked on another. All durable mutations
enter through Processing-Core commands that append op-log records; the GUI dispatches intents and
renders the computed model (Contract 1).

## Demo path

1. `pnpm v2:dev`, open `/characters/` (aliases `/party`, `/pcs` redirect here).
2. As the DM (default actor), quick-create two `player-visible` characters and one `dm-only`
   character. The **Party overview** panel lists visible members with HP/status/resource summaries
   and a marching order, plus a DM-only "hidden from players" count. Add a `player-visible` and a
   `dm-only` party-inventory item; reorder the marching order with "Move up".
3. Use the header **view as** control to switch to `Demo Player`: the `dm-only` character and item
   disappear from the party overview (omitted, not redacted).
4. Switch to `Demo Observer`: the party overview shows the empty state and the journal shows the
   empty state — no member, item, or entry data is present (CHAR-015).
5. Back as the DM, grant `owner` on a character to `Demo Player`. View as that player and add journal
   entries (bookmark / NPC impression / personal quest / session highlight) in the **Character
   journal** panel with explicit per-entry visibility. A `shared` (default) or `dm-only` entry is
   invisible to `Demo Player 2`; flipping an entry to `player-visible` reveals it to `Demo Player 2`
   immediately, and flipping it back to `dm-only` hides it again (CHAR-016 data-layer enforcement).

## Implementation → requirement traceability

### CHAR-011 — party overview (filtered)

- Durable party-record state (marching order + party inventory with per-item visibility) and pure
  reducers: `apps/v2/packages/core/src/state/character-state.ts`
  (`PartyRecord`, `setMarchingOrder`, `upsertPartyInventoryItem`, `removePartyInventoryItem`,
  `partyRecordOf`, `EMPTY_PARTY_RECORD`).
- THE single actor-filtered party-view query (MAP-018 pattern):
  `apps/v2/packages/core/src/queries/party-overview.ts` (`getPartyOverviewForActor`). Members are
  exactly the characters the viewer may see (reusing `listCharactersForActor`, which strips DM-only
  fields and omits dm-only characters); summaries derive from the redacted view + resources; the
  marching order is restricted to visible members; inventory is filtered by per-item visibility; the
  DM additionally receives hidden-from-players counts.
- DM-only authoring commands: `apps/v2/packages/core/src/commands/character-party.ts`
  (`handleSetMarchingOrder`, `handleUpsertPartyInventoryItem`, `handleRemovePartyInventoryItem`).
- GUI: `apps/v2/app/src/lib/gui/PartyOverview.svelte`, mounted in
  `apps/v2/app/src/routes/characters/+page.svelte`.

### CHAR-012 — player journal (owner-scoped)

- Durable journal model + pure reducers: `apps/v2/packages/core/src/state/character-journal.ts`
  (`CharacterJournal`, `buildJournalEntry`, `addJournalEntry`, `updateJournalEntry`,
  `removeJournalEntry`). Embedded on the character slice as `CharacterState.journals`
  (`apps/v2/packages/core/src/state/character-state.ts` `journalsOf`).
- Owner/DM write authority (fail closed; a non-owner player is rejected `actor-not-authorized`):
  `apps/v2/packages/core/src/commands/character-journal.ts` (`handleAddJournalEntry`,
  `handleUpdateJournalEntry`, `handleRemoveJournalEntry`).
- GUI: `apps/v2/app/src/lib/gui/CharacterJournal.svelte`.

### CHAR-015 — observer denied by default on EVERY surface (hard)

- Both new read models call the PERM-011 `decideCharacterDataRead` guard and return an EMPTY result
  for an observer / unknown / unauthenticated actor — no members, no marching order, no inventory, no
  journal entries, no counts, no ids — indistinguishable from absent
  (`apps/v2/packages/core/src/queries/party-overview.ts`,
  `apps/v2/packages/core/src/queries/character-journal-query.ts`).
- Defense-in-depth: `character-journal` is added to the observer-ceiling character-entity set in
  `apps/v2/packages/core/src/permissions/base-roles.ts`, so an adversarial observer journal grant is
  dropped at the role ceiling.
- GUI renders the journal surface for every role so an observer sees the empty surface
  (`apps/v2/app/src/routes/characters/+page.svelte`).

### CHAR-016 — per-entry journal visibility (data-layer enforced)

- Per-entry canonical visibility (`dm-only` / `player-visible` / `shared`) with a fail-closed
  `shared`-to-owner default (CHAR-016 AC1): `apps/v2/packages/core/src/state/character-journal.ts`
  (`buildJournalEntry`, `setJournalEntryVisibility`).
- DM access, owner access, and OTHER-PLAYER FILTERING enforced in the query layer (a hidden entry is
  omitted entirely — no title/snippet/id/count/edge):
  `apps/v2/packages/core/src/queries/character-journal-query.ts` (`entryVisibleToActor`).
- CROSS-SURFACE INVALIDATION enforced by the data layer: the visibility-change command emits a
  `character.journal-changed` event carrying the invalidation audience (the UNION of the previous and
  next delivery audiences plus the owner), so the runtime re-evaluates exactly those actors' cached
  views before new content is delivered — not the GUI
  (`apps/v2/packages/core/src/commands/character-journal.ts` `handleSetJournalEntryVisibility`;
  event type in `apps/v2/packages/core/src/commands/types.ts`).

### Wiring

- Command schemas: `apps/v2/packages/core/src/schemas/commands.ts`
  (`setMarchingOrderInputSchema`, `upsertPartyInventoryItemInputSchema`,
  `removePartyInventoryItemInputSchema`, `addJournalEntryInputSchema`, `updateJournalEntryInputSchema`,
  `setJournalEntryVisibilityInputSchema`, `removeJournalEntryInputSchema`).
- Command types + events + dispatch cases: `apps/v2/packages/core/src/commands/types.ts`,
  `apps/v2/packages/core/src/commands/dispatch.ts`.
- Public API exports: `apps/v2/packages/core/src/index.ts`.
- `ensureCharacterStateSlice` now delegates to `ensureCharacterState` so the new `party`/`journals`
  fields hydrate everywhere: `apps/v2/packages/core/src/commands/helpers.ts`.

## Tests

- New core unit suite (18 tests, all passing):
  `apps/v2/packages/core/tests/character-party-and-player-records.test.ts` — per-viewer party-overview
  filtering, journal owner-scoping + write authority, observer-denied-on-every-surface (hard
  non-leak), per-entry other-player journal filtering, and cross-surface invalidation on a visibility
  change (asserts the invalidation audience and the now-hidden data-layer read).
- New e2e suite (8 tests × 2 projects = 16, all passing on desktop-chromium AND mobile-chromium):
  `apps/v2/app/tests/e2e/character-party-and-player-records.spec.ts`.

Results:

- `pnpm lint` (eslint + lint:navigation + lint:tokens + audit:repo) — PASS.
- `pnpm docs:validate` — PASS.
- `pnpm v2:typecheck` — 0 errors.
- `pnpm v2:lint` (boundary) — PASS.
- `pnpm v2:gates` — PASS (7 gates owned/budgeted/wired).
- Core unit suite — 892 passed (67 files), including the 18 new tests.
- App unit suite — 55 passed (12 files).
- `pnpm --filter @dndtools/v2-app exec playwright test` — 264 passed, 18 skipped (intentional
  project-scoped skips), 0 failed, on BOTH desktop-chromium and mobile-chromium.
- `pnpm v2:workpack:validate` — passed before and after `complete`.

## Quality review

- Correctness: every mapped acceptance criterion is covered by a unit and/or e2e test; non-leak
  negative cases are asserted (omitted not redacted; serialized output never contains hidden names).
- Architecture: pure Processing-Core read models + reducers; durable writes via commands + op-log;
  GUI consumes the computed model and dispatches intents; no v1 imports; boundary lint green.
- Tests: unit + e2e on both profiles; hard non-leak assertions on party / journal / observer
  surfaces and on the cross-surface invalidation trigger.
- Accessibility: the new surfaces are stacked `section`/`ol`/`ul`/`form` with labelled controls,
  aria-labels, and `role="alert"` errors; render identically on desktop and compact profiles (e2e on
  both); navigation + token lints pass.
- Performance: pure O(members + entries + inventory) projections; no new heavy work.
- Security / permissions: observer denied wholesale via the PERM-011 ceiling on every surface, plus
  the role-ceiling drop for adversarial journal grants; write authority is fail-closed (owner/DM).
- Persistence / sync: party + journal state persist on the existing character document; every
  mutation appends a durable op; older vaults hydrate safe defaults (no destructive migration).
- Offline: pure local-first reducers/queries; no network dependency introduced.
- UX: empty / hidden / error states present; DM authoring affordances are role-gated ergonomically
  (authority re-checked in the core).
- Maintainability: small typed modules that EXTEND the character model (no parallel model), reusing
  existing helpers; no unrelated refactors.
- Docs: this completion file; generated planning files updated via the workpack commands.

## Gaps / deferred

- The cross-surface invalidation is surfaced as a command event carrying the affected-actor audience
  (and proven against the data-layer read). Wiring it into a live runtime subscription/sync-stream
  cache is deferred to the sync/collaboration epics per ADR-014 (the first prototype is single-device
  and local-first); the data-layer enforcement (a stale view is never served because the filtered
  read recomputes from durable state) is complete.
- Marching order / party inventory are modeled minimally for the prototype (text detail, simple
  reorder). Richer inventory semantics are out of scope for this branch.

## Git

- Branch: `epic/CHAR-party-and-player-records` (created from the prior epic HEAD `9d0fd00`, not
  master).
- Commit: `cfb7857` ("feat(v2): complete CHAR-party-and-player-records epic"). A follow-up commit
  records this exact SHA in the evidence.
- Final `git status --short`: clean (empty) after the completion commit.
