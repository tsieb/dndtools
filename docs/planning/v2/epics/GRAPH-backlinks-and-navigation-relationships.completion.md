# GRAPH-backlinks-and-navigation-relationships — Completion Evidence

Workpack status: `complete`

Epic: GRAPH-backlinks-and-navigation-relationships
Requirement: GRAPH-002 — "A user shall be able to inspect backlinks, cross-section links, and related-note
jumps from visible content with snippets redacted according to visibility."
Architecture contract: Contract 3 (Role, Visibility & Permission Grant Model).

## Summary

Delivered the backlinks + navigation-relationship capability for notes by COMPOSING the EXISTING
actor-filtered link graph — it does NOT introduce a second relationship source:

- The visible note set comes from `getContentItemsForActor` (CONTENT-011), the single visibility-and-tombstone
  choke-point every CONTENT/SRCH/GRAPH surface already uses. A `dm-only` / `shared`-but-undelivered /
  soft-deleted note never enters the set, so it can never be a backlink source, a related target, or the
  subject of a relationship.
- It produces the SAME reverse edges that `search-query.ts` already exposes as a relationship HINT
  (`buildVisibleBacklinks`), and adds the navigable detail GRAPH-002 needs: per-source cross-section
  resolution and a visibility-redacted context snippet.
- Snippet redaction reuses the SAME PERM visibility-filter (`filterEntityForActor`) the granular detail read
  uses, so a backlink from a partially-hidden source still appears but WITHOUT a snippet (never quote a
  possibly-hidden section).

Processing/Display decoupling (Contract 1) is preserved: derivation + traversal live in the Processing Core
(`state/note-relationships.ts` pure engine, `queries/note-relationships.ts` actor-filtered surface); the GUI
(`NotesWorkbench.svelte`) renders the computed model and navigates by re-selecting through the same
actor-filtered read.

## User-visible demo path

1. `pnpm --filter @dndtools/v2-app dev` (or `pnpm e2e` preview) and open `/knowledge/`.
2. As the DM create three player-visible notes:
   - `Highmoor` with body `# History\nAn ancient keep.`
   - `Quest Log` with body `The party set out for [[Highmoor#History]] at dawn.`
   - `Town Crier` with body `News of [[Highmoor]] reached the square.`
3. Open `Highmoor` (search `Highmoor`, click the title). The **Relationships** panel shows:
   - **Backlinks**: `Quest Log` (with `→ #History` cross-section + a context snippet quoting "set out for")
     and `Town Crier` (with a snippet).
   - **Related notes**: empty (Highmoor links to nothing).
4. Open `Hub` (a note with `[[Town]]`): the **Related notes** list shows `Town`; clicking it jumps to Town's
   relationship view (Town's backlinks then list `Hub`).
5. Create a `dm-only` note `Secret Plot` containing `[[Highmoor]]`. As the DM, `Highmoor`'s backlinks include
   `Secret Plot`. Switch the header "view as" to the player: `Secret Plot` is ABSENT from the backlinks (it is
   omitted, not redacted) — only the player-visible sources remain.

Requirement IDs exercised by the demo: GRAPH-002.

## Requirement coverage / traceability (GRAPH-002)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| Given a visible note has three backlinks, when the user opens backlinks, then visible backlinks and context snippets appear. | `computeNoteRelationships` (`apps/v2/packages/core/src/state/note-relationships.ts`); `getNoteRelationshipsForActor` (`apps/v2/packages/core/src/queries/note-relationships.ts`); GUI panel in `apps/v2/app/src/lib/gui/NotesWorkbench.svelte`. | `apps/v2/packages/core/tests/graph-backlinks-and-relationships.test.ts` ("surfaces THREE visible backlinks with snippets", "a player opening a visible note sees the visible backlinks and context snippets", pure-engine backlink + snippet cases); `apps/v2/app/tests/e2e/graph-backlinks-and-relationships.spec.ts` ("AC1: opening a note shows its visible backlinks with context snippets and a cross-section"). |
| Given a backlink source is hidden, when a player opens backlinks, then that backlink is absent. | `buildRelationshipRecords` composes `getContentItemsForActor` (hidden/tombstoned sources never enter the set). | `apps/v2/packages/core/tests/graph-backlinks-and-relationships.test.ts` ("a dm-only source ... is absent for a player; present for the DM", "a related-note jump never resolves to a hidden target"); e2e ("AC2: a player never sees a dm-only backlink source"). |

Story GRAPH-002-S01 ("inspect backlinks, cross-section links, and related-note jumps ... with snippets
redacted according to visibility") tasks T01–T04: design (interface shape composing the existing graph) →
implementation (pure engine + actor-filtered query + GUI) → tests (unit/integration + e2e) → demo notes
(above) — all complete.

Additional GRAPH-002 surface beyond the two literal ACs (cross-section links + snippet redaction, named in the
story title):
- Cross-section links: `resolveCrossSection` resolves `[[Target#Section]]` to the target's heading anchor, or
  reports `section-missing` (graceful degrade) — covered by the pure-engine cross-section tests + the e2e
  cross-section assertion.
- Snippet redaction by visibility: `actorSeesFullBody` suppresses a snippet for a partially-hidden source —
  covered by "a backlink from a partially-hidden source still appears, but WITHOUT a snippet (fail closed)".

## Visibility / data-safety review (hidden-node/edge leakage)

- A hidden backlink SOURCE is OMITTED (never redacted) because it never enters the `getContentItemsForActor`
  set — no count, label, or dangling edge reveals it.
- A related-note jump to a hidden TARGET is dropped (the forward edge resolves only against visible notes).
- Relationships of a hidden/deleted TARGET fail closed: `getNoteRelationshipsForActor` returns the generic
  empty `{ backlinks: [], related: [] }`, indistinguishable from "no relationships", so a player cannot probe
  the graph to learn a hidden note exists. An unknown/unauthenticated actor gets the same empty result.
- A stale link to a now-hidden/now-deleted target degrades gracefully (the target is simply absent from the
  visible set ⇒ empty result, no crash) — covered by the "now-DELETED target" test.
- A context snippet can never quote a hidden section: a source note with any actor-redacted section/field is
  marked `snippetable: false`, so its backlink appears WITHOUT a snippet. The redaction decision reuses the
  existing PERM `filterEntityForActor` precedence; no new visibility policy was authored.

No v1 runtime imports. No new durable state, command, or sync unit — this is a pure read/derivation surface
over existing state, so there are no persistence/migration/conflict implications.

## Quality gates (all run; all green)

- `pnpm --filter @dndtools/v2-core test` → 126 files, **1751 passed** (18 new in
  `apps/v2/packages/core/tests/graph-backlinks-and-relationships.test.ts`).
- `pnpm v2:typecheck` (core `tsc --noEmit` + app `svelte-check`) → **0 errors, 0 warnings** (810 files).
- `pnpm v2:lint` (boundary script) → **passed**.
- `pnpm lint` (full eslint + nav-layer + token-compliance + repo-boundary audit) → **passed** (132 Svelte
  files; guardrail tests 5 passed).
- `pnpm docs:validate` → **passed**.
- `pnpm v2:workpack:validate` → **passed**.
- `pnpm e2e` (full Playwright suite, BOTH `desktop-chromium` and `mobile-chromium`) →
  **499 passed, 21 skipped, 0 failed** (was 493 passed; +6 = 3 new GRAPH-002 specs × 2 projects).

## Changed files

- `apps/v2/packages/core/src/state/note-relationships.ts` (new) — pure GRAPH-002 engine (backlinks,
  cross-section resolution, related-note jumps, context snippets).
- `apps/v2/packages/core/src/queries/note-relationships.ts` (new) — actor-filtered surface
  (`getNoteRelationshipsForActor`) composing `getContentItemsForActor` + `filterEntityForActor`.
- `apps/v2/packages/core/src/index.ts` — export the new engine + query surface.
- `apps/v2/packages/core/tests/graph-backlinks-and-relationships.test.ts` (new) — 18 unit/integration tests.
- `apps/v2/app/src/lib/gui/NotesWorkbench.svelte` — the read-only Relationships panel (backlinks +
  cross-section + related jumps) for the open note.
- `apps/v2/app/tests/e2e/graph-backlinks-and-relationships.spec.ts` (new) — 3 e2e tests (×2 projects).
- `docs/planning/v2/epics/GRAPH-backlinks-and-navigation-relationships.yaml`,
  `docs/planning/v2/status.yaml`, `docs/planning/v2/workpack-state.yaml` — generated workpack status updates.
- `docs/planning/v2/epics/GRAPH-backlinks-and-navigation-relationships.completion.md` (this file).

## Known / deferred gaps

- The relationship graph is over NOTE↔NOTE wikilinks (the GRAPH-002 scope: backlinks, cross-section,
  related-note jumps). Object↔note, note↔POI, calendar/date, and cross-source relationships are owned by other
  GRAPH capability branches (GRAPH-001 source indexing, GRAPH-009 calendar references, GRAPH-004
  visualization, GRAPH-005/006 incremental APIs) and are intentionally out of this epic. The
  `NoteRelationshipRecord` shape and the `getContentItemsForActor` composition are the seam those epics extend.
- Cross-section navigation surfaces the resolved heading anchor + label; wiring the anchor into a hash-scroll
  deep-link from the backlink panel can compose the existing `resolveDeepLink` note-heading branch in a future
  navigation pass without changing this contract.

## Git evidence

- Branch: `epic/GRAPH-backlinks-and-navigation-relationships`
- Commit SHA (feature + tests + completion evidence + regenerated workpack): `53f1a62`
  This `docs(v2): record commit SHA ...` follow-up writes that SHA into this evidence file.

### `git status --short` (after the feature commit; before this SHA-recording commit)

```
 M docs/planning/v2/epics/GRAPH-backlinks-and-navigation-relationships.completion.md
```

After this SHA-recording commit lands the working tree is clean — no untracked or unstaged files.
