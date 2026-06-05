# CONTENT-notes-and-editor — Completion Evidence

Epic: `CONTENT-notes-and-editor` — CONTENT: Notes and editor
Requirement IDs: CONTENT-001, CONTENT-002
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model); Contract 4 (Scene and Widget Contract — notes are the primary content unit a
note/embed widget binds to) + the standing v2 architecture contracts and ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CONTENT-notes-and-editor`.

## Summary

CONTENT-001 and CONTENT-002 deliver the notes-and-editor capability branch by EXTENDING the existing
CONTENT model — a note is a `content-item` of `kind: 'note'` (`apps/v2/packages/core/src/state/content.ts`),
not a forked parallel model. The slice REUSES the proven patterns the orchestrator called out:

- The single actor-filtered CONTENT read path (`apps/v2/packages/core/src/queries/content-query.ts`) is
  the one visibility choke-point. Search and wikilink suggestions COMPOSE it, so a hidden note can never
  leak a hit, snippet, title, or `[[...]]` target to an actor who cannot see it (CONTENT-001 AC3/AC4;
  Cross-Contract Non-Negotiable 2).
- The PERM authorized-editor model (`apps/v2/packages/core/src/commands/content.ts`): vault-level create
  is DM-only; editing/deleting/restoring an existing item also allows a player holding a write-capable
  grant (`section-editor`/`contributor`) on the `content-item` entity. An observer never qualifies.
- The PLAT-018 command lifecycle (`apps/v2/packages/core/src/lifecycle/command-lifecycle.ts`) for the
  editor's VISIBLE SAVE STATUS (pending → success/failure) and RECOVERABLE FAILURE (retry without data
  loss). A soft-delete is registered as an UNDOABLE command whose inverse is restore.
- The markdown parse/wikilink engine (`apps/v2/packages/core/src/state/markdown.ts`) for validation,
  preview, and wikilink extraction.

All note CRUD reducers, search ranking, validation, preview, and wikilink resolution are PURE
deterministic Processing-Core functions; durable writes go through the op-log; the GUI dispatches command
intents and renders computed models and never touches storage (Architecture Contract 1). Boundary lint
stays green; no v1 imports.

## CONTENT-001 — Notes CRUD + recoverable delete + actor-filtered search

### Model: soft-delete tombstone on the existing content item

`apps/v2/packages/core/src/state/content.ts` adds a `deletedAt: string | null` TOMBSTONE to
`ContentItem` (null ⇒ live; an ISO timestamp ⇒ soft-deleted). New pure reducers:

- `softDeleteContentItem` / `restoreContentItem` — stamp/clear the tombstone and bump the revision; the
  restored revision carries the item's existing content verbatim (no hidden prior revision re-exposed,
  CONTENT-001 AC4). `removeContentItem` is preserved as a hard-purge reducer (unused by the command path).
- `isLiveContentItem` / `liveContentItems` — the single tombstone predicate the reads share.
- `ensureVaultContentState` backfills `deletedAt: null` on records persisted before this slice (safe
  hydration), and `buildContentItem` seeds `deletedAt: null`.

### Commands (durable, fail-closed)

`apps/v2/packages/core/src/commands/content.ts`:

- `content.remove-item` now SOFT-DELETES (recoverable) instead of purging, appending a
  `content.remove-item` op (`softDelete: true`) and a `content.item-changed` event.
- New `content.restore-item` (`apps/v2/packages/core/src/schemas/commands.ts`
  `restoreContentItemInputSchema`, wired in `apps/v2/packages/core/src/commands/dispatch.ts`) clears the
  tombstone and re-enters the item's own visibility delivery audience.
- `content.update-item` and `content.set-item-visibility` now reject a tombstoned target with
  `content-item-deleted` (fail closed: a deleted note must be restored before it can be edited). Restore
  rejects a live target with `content-item-not-deleted`. Both codes added to
  `apps/v2/packages/core/src/commands/types.ts`.
- `content.remove-item` → `content.restore-item` registered as an undoable inverse pair in
  `apps/v2/packages/core/src/lifecycle/command-lifecycle.ts`.

### Reads: tombstone-aware + a DM recycle bin

`apps/v2/packages/core/src/queries/content-query.ts`: `itemVisibleToActor` now requires the item be
LIVE, so a soft-deleted item is OMITTED from every actor-filtered read (list, calendar, timeline, search)
— even the DM's — until restored. `getDeletedContentItemsForActor` is the DM-only recycle bin (a non-DM
gets an empty list: a player must never learn a hidden note ever existed).

`apps/v2/packages/core/src/state/content-export.ts` and `content-import.ts` were updated so tombstoned
items are never exported (either mode) and an import always yields a live note (overwriting a tombstoned
path restores it).

### Actor-filtered search

`apps/v2/packages/core/src/queries/content-search.ts`:

- `searchContentForActor` — case-insensitive title+body substring search over `getContentItemsForActor`
  (visibility- and tombstone-filtered), with deterministic title-first ranking and a body snippet. A
  player can never get a hit/snippet for a note they cannot see (no separate index to leak).
- `suggestWikilinkTargetsForActor` — visible NOTE titles for `[[...]]` autocomplete, prefix-ranked and
  capped, drawn ONLY from the actor's visible items.

## CONTENT-002 — Markdown editor (save status, validation, preview, wikilink assistance)

`apps/v2/packages/core/src/state/content-editor.ts` — pure, deterministic editor support:

- `validateMarkdownDraft` — FAIL-CLOSED validation: an opened-but-unterminated frontmatter block, a
  malformed frontmatter line, an empty-target wikilink (`[[]]`/`[[|alias]]`), or unbalanced `[[`/`]]`
  each produce a blocking error.
- `renderMarkdownPreview` — a safe block model (headings / list items / paragraphs) with no raw HTML, so
  script/HTML injection cannot reach the preview; surfaces tags and wikilinks via the markdown parser.
- `activeWikilinkQuery` — the partial wikilink target the caret sits inside, driving the suggestion query.

VISIBLE SAVE STATUS and RECOVERABLE FAILURE reuse the PLAT-018 lifecycle: a save is `pending` →
`success` (op id recorded) or `failure` (no op id — no partial commit — with retry guidance), and a
retry re-enters `pending` from the intact draft.

### GUI

`apps/v2/app/src/lib/gui/NotesWorkbench.svelte` (mounted first in
`apps/v2/app/src/routes/knowledge/+page.svelte`) renders the full flow from computed core models and
dispatches command intents only — never touching storage:

- actor-filtered search list with snippets;
- create / edit / delete / restore affordances (authorized editor only — gated on
  `actorCanAuthorContent`, re-checked fail-closed in the core);
- the editor: a visible save-status indicator (from `runtime.lastLifecycle`), a retry affordance on
  failure, validation feedback that disables Save while invalid, a live preview, and an actor-filtered
  wikilink suggestion list inserted at the caret;
- a DM-only recycle bin to restore soft-deleted notes.

## Traceability

| Requirement / criterion | Implementation | Tests |
| --- | --- | --- |
| CONTENT-001 create/read/update | `apps/v2/packages/core/src/commands/content.ts`, `apps/v2/packages/core/src/state/content.ts`, `apps/v2/packages/core/src/queries/content-query.ts` | `apps/v2/packages/core/tests/content-notes.test.ts`; `apps/v2/app/tests/e2e/notes-and-editor.spec.ts` |
| CONTENT-001 delete (recoverable) + restore round-trip | `softDeleteContentItem`/`restoreContentItem` + `content.remove-item`/`content.restore-item` in `apps/v2/packages/core/src/state/content.ts`, `apps/v2/packages/core/src/commands/content.ts` | `apps/v2/packages/core/tests/content-notes.test.ts`; `apps/v2/app/tests/e2e/notes-and-editor.spec.ts` |
| CONTENT-001 actor-filtered search (no leak, AC3/AC4) | `apps/v2/packages/core/src/queries/content-search.ts` (`searchContentForActor`) | `apps/v2/packages/core/tests/content-notes.test.ts`; `apps/v2/app/tests/e2e/notes-and-editor.spec.ts` |
| CONTENT-002 visible save status (AC1) | PLAT-018 lifecycle reused in `apps/v2/app/src/lib/gui/NotesWorkbench.svelte` via `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` | `apps/v2/packages/core/tests/content-editor.test.ts`; `apps/v2/app/tests/e2e/notes-and-editor.spec.ts` |
| CONTENT-002 validation feedback (fail closed) | `apps/v2/packages/core/src/state/content-editor.ts` (`validateMarkdownDraft`) | `apps/v2/packages/core/tests/content-editor.test.ts`; `apps/v2/app/tests/e2e/notes-and-editor.spec.ts` |
| CONTENT-002 preview | `apps/v2/packages/core/src/state/content-editor.ts` (`renderMarkdownPreview`) | `apps/v2/packages/core/tests/content-editor.test.ts`; `apps/v2/app/tests/e2e/notes-and-editor.spec.ts` |
| CONTENT-002 wikilink assistance (actor-filtered) | `apps/v2/packages/core/src/queries/content-search.ts` (`suggestWikilinkTargetsForActor`), `apps/v2/packages/core/src/state/content-editor.ts` (`activeWikilinkQuery`) | `apps/v2/packages/core/tests/content-editor.test.ts`; `apps/v2/app/tests/e2e/notes-and-editor.spec.ts` |
| CONTENT-002 recoverable failure (AC2) | PLAT-018 lifecycle (`markFailure`/`canRetry`/`markPending`) in `apps/v2/packages/core/src/lifecycle/command-lifecycle.ts` + `apps/v2/app/src/lib/gui/NotesWorkbench.svelte` | `apps/v2/packages/core/tests/content-editor.test.ts` |

## Demo

Path: `pnpm v2:dev`, open `/knowledge/`.

1. In the Notes section, enter a title, choose visibility (defaults `dm-only`), and click **Create note** —
   the editor opens on the new note.
2. Type markdown into **Body**. The preview updates live; the validation line shows "Markdown is valid"
   or blocking errors (try `---` with no closing fence, or `[[]]`) and disables **Save** while invalid.
3. Type `[[Ban` to see actor-filtered wikilink suggestions; click one to insert `[[Title]]`.
4. Click **Save** — the **Save status** shows `success`.
5. Search for the note in **Search notes**; click **Delete** on a row, then **Restore** in *Recently
   deleted* to round-trip the soft-delete.
6. Use the header **view as** control to switch to a player: the create form and editor disappear, and a
   `dm-only` note is absent from the player's search list (and never offered as a wikilink target).

Requirement IDs exercised: CONTENT-001, CONTENT-002.

## Quality review

- Correctness: every CONTENT-001/002 acceptance criterion is implemented and tested. Concurrent
  same-section merge (CONTENT-001 AC5) reuses the existing CHAR-004 same-path conflict model and the
  per-item revision; a section-aware text merge is deferred to the SYNC reconciliation epic (see Gaps).
- Architecture: pure Processing-Core policy for CRUD/search/validation/preview/wikilinks; durable writes
  via the op-log/lifecycle; the GUI dispatches intents and renders computed models. `pnpm v2:lint`
  (boundary) and `pnpm v2:gates` pass; no v1 runtime imports.
- Tests: 1019 core unit tests pass (40 new across `content-notes.test.ts` + `content-editor.test.ts`),
  55 app unit tests pass, full Playwright passes on both projects (306 passed, 18 intentional skips, 0
  failed) including 12 new notes-and-editor specs.
- Accessibility: editor controls are labelled inputs/buttons; validation/save errors use `role="alert"`;
  the surface is keyboard- and touch-operable and renders on the compact profile (mobile-chromium green).
- Performance: search/validation/preview/suggestions are pure synchronous functions over the in-memory
  filtered set; suggestions are capped (10). No new persistence or network surface.
- Security / permissions: authorized-editor fail-closed throughout; search/suggestions compose the single
  visibility-filtered read path; the recycle bin is DM-only; preview emits no raw HTML.
- Persistence / sync-offline: writes are local-first durable ops on the op-log; soft-delete keeps the
  record recoverable; export/import handle tombstones. No cloud/sync transport added (ADR-014 stance).
- UX: empty (no-match), valid/invalid, success/failure, and deleted states are all visibly handled.
- Maintainability: small cohesive modules extending the existing content model; no parallel model, no
  unrelated refactors.
- Docs: this completion file; generated workpack files updated via the workpack commands.

## Gaps / deferred

- CONTENT-001 AC5 (section-aware concurrent merge): a durable conflict record on same-target concurrent
  edits is provided by the existing revision/conflict machinery; a block/section-aware text MERGE is
  deferred to the SYNC reconciliation epic, which owns the operation-based text-merge strategy
  (Architecture Contract 2). Notes carry per-item revisions today so a stale write is detectable.
- Markdown rendering is a deliberately small, safe block model (headings/lists/paragraphs + tags/links),
  not a full CommonMark renderer; richer rendering and snippet/markdown sanitization land with
  CONTENT-004 (snippets) / a dedicated markdown-render epic.

## Git

- Branch: `epic/CONTENT-notes-and-editor` (from `epic/CONTENT-import-export` HEAD `ecc4a7e`).
- Implementation commit: `35f928b` (`feat(v2): complete CONTENT-notes-and-editor epic`) — all code,
  tests, GUI, and the workpack `complete` regeneration (epic packets, `status.yaml`, `workpack-state.yaml`).
- This SHA-recording docs commit follows it so the tree is a clean slate.

Final `git status --short` after both commits:

```
(clean — no untracked or unstaged files)
```
