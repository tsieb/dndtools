# CONTENT-import-export — Completion Evidence

Epic: `CONTENT-import-export` — CONTENT: Import/export
Requirement IDs: CONTENT-007, CONTENT-008
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 2 (Cloud Sync & Offline
Model — local-first, snapshots for import/export, Obsidian source rules); Contract 3 (Role, Visibility
& Permission Grant Model) + the standing v2 architecture contracts and ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CONTENT-import-export`.

## Summary

CONTENT-007 and CONTENT-008 deliver the import/export capability branch on top of the existing CONTENT
model (`apps/v2/packages/core/src/state/content.ts`, `apps/v2/packages/core/src/queries/content-query.ts`,
`apps/v2/packages/core/src/commands/content.ts`). They REUSE — rather than re-derive — the three proven
patterns the orchestrator called out:

- The MAP-020 staged-then-commit import TRANSACTION (`apps/v2/packages/core/src/state/map-import.ts`):
  a pure read-only PREVIEW, then a pure staging reducer whose discarded result leaves prior state
  byte-identical (no partial commit).
- The PLAT write-ahead / resumable recovery discipline (`apps/v2/packages/core/src/migration/write-ahead.ts`):
  durable, replayable, idempotent steps so an interrupted import never double-writes.
- The PLAT secret/PII redaction choke-point (`apps/v2/packages/core/src/diagnostics/redaction.ts`) and
  the PERM visibility-filter read path (`apps/v2/packages/core/src/queries/content-query.ts` /
  `apps/v2/packages/core/src/permissions/visibility-filter.ts`) — composed so export FAILS CLOSED.

All parsing/conflict-resolution/redaction/staging is PURE deterministic Processing-Core policy; durable
writes go through the op-log; the GUI dispatches intents and renders preview/report models and never
touches storage (Architecture Contract 1). Boundary lint stays green; no v1 imports.

## CONTENT-007 — Import (transactional, resumable)

### Pure, deterministic markdown/Obsidian parse + serialize

`apps/v2/packages/core/src/state/markdown.ts` is the determinism keystone, following the same discipline
as `apps/v2/packages/core/src/state/calendar.ts`: every function is pure, consulting nothing ambient (no
`Date`, no locale, no filesystem). `parseMarkdownNote` tolerantly (never throwing) parses YAML-ish front
matter into an open property map and surfaces the Obsidian metadata as first-class fields —
PROPERTIES (verbatim, round-tripping), ALIASES (the `aliases` list), TAGS (the `tags` property merged
with inline `#hashtags`, deduped), and `[[wikilinks]]` (with optional `#section`/`|alias`, raw text
preserved for non-destructive re-emit). `serializeMarkdownNote` emits a deterministic `---` front-matter
block with SORTED keys plus the body.

### Transactional, resumable import reducers

`apps/v2/packages/core/src/state/content-import.ts`:

- `previewContentImport` — PURE, READ-ONLY. Parses every file, detects collisions against the existing
  vault, resolves each file's action under the chosen CONFLICT POLICY (`skip` / `overwrite` /
  `keep-both`), and reports preserved + unsupported-but-PRESERVED metadata. Nothing is mutated
  (CONTENT-007 AC1: conflicts and unsupported metadata listed before any write).
- `planContentImport` — derives the deterministic, ordered PLAN (one idempotent step per non-skipped
  file; `keep-both` collisions get a fresh deduplicated id). The SAME derivation a resume re-runs.
- `applyContentImport` — PURE and transactional: returns a NEW `VaultContentState` (a discarded result
  leaves prior state byte-identical — no partial commit). RESUMABLE: every step whose `entryId` is in
  the recorded `alreadyAppliedEntryIds` is SKIPPED, so re-running after an interruption never
  duplicates a completed safe write (CONTENT-007 AC2). DND Tools metadata stays NAMESPACED under
  `dndtools.*`; visibility FAILS CLOSED to `dm-only` unless the file sets `dndtools.visibility`.

### Durable import command

`apps/v2/packages/core/src/commands/content-import-export.ts` adds `handleCommitContentImport`, wired
through `apps/v2/packages/core/src/commands/dispatch.ts` as `content.commit-import`. It is DM-only (a
vault-level authoring act, fail closed for anyone else — mirrors the create-item authority in
`apps/v2/packages/core/src/commands/content.ts`). It re-derives the pure plan, applies it
transactionally with the resume-aware `appliedEntryIds`, rejects an empty/wholly-skipped archive (no
silent no-op, prior state untouched), and appends one durable `content.import` op recording what was
created/overwritten/resumed-skipped (reported for audit, never silently lost). Schema:
`commitContentImportInputSchema` in `apps/v2/packages/core/src/schemas/commands.ts`. Event:
`content.import-committed` in `apps/v2/packages/core/src/commands/types.ts`.

## CONTENT-008 — Export (fail-closed redaction — the security crux)

`apps/v2/packages/core/src/state/content-export.ts` (`exportContent`) composes the two existing security
choke-points rather than re-deriving privacy policy:

1. VISIBILITY. A `portable` export is built FROM the actor-filtered query
   (`getContentItemsForActor`) evaluated as a representative PLAYER, so anything `dm-only` (or a
   `shared` item not delivered to that player) is OMITTED ENTIRELY — its title, body, fields, and id
   never appear (CONTENT-008 AC1). Fail closed: an unknown portable viewer yields an empty export.
2. REDACTION. Every serialized property map and body is scrubbed by `redactValue` /
   `containsSensitiveData` from `apps/v2/packages/core/src/diagnostics/redaction.ts`, so device-local
   SECRETS (secret-named fields, bearer tokens in prose) and ABSOLUTE PATHS / file URLs become stable
   placeholders. This runs in BOTH modes.

The ONLY difference in `dm-backup` is that hidden content is INCLUDED (a backup is for the DM's own
device, not a player-readable stream — CONTENT-008 AC2), but secrets/paths are STILL scrubbed
(Architecture Contract 2: export/cloud storage must never contain raw absolute paths or secrets). Every
export carries a VALIDATION REPORT with a `clean` self-check that fails closed if any serialized file
would still contain a secret or path. DND Tools visibility is re-emitted NAMESPACED under
`dndtools.visibility` so a round-trip preserves it without polluting common properties.

`handleExportContent` (`content.export`, schema `exportContentInputSchema`) is DM-only and READ-ONLY: it
mutates no durable content, returns the export payload on a `content.exported` event for the GUI, and
appends an audit op recording only the mode + counts (never the exported content itself).

## GUI / editor integration

`apps/v2/app/src/lib/gui/ContentImportExport.svelte` (mounted on the Knowledge route via
`apps/v2/app/src/routes/knowledge/+page.svelte`) renders the import/export surface. Per ADR-014 (no real
filesystem picker) the DM pastes a `===== path.md =====`-separated archive; a live, pure PREVIEW (built
from `previewContentImport`) lists each file's title, conflict action, and preserved/unsupported
metadata before any write. Committing dispatches `content.commit-import`; export dispatches
`content.export` and renders the portable markdown files + validation report (including the `clean`
self-check). All affordances are gated on `actorCanAuthorContent` (DM-only ergonomically; the core
re-checks fail closed). Stacked form/list layout renders identically on desktop and compact profiles.

## Tests (primary evidence)

- `apps/v2/packages/core/tests/content-markdown.test.ts` — property/alias/tag/wikilink preservation,
  tolerant degradation, determinism, and stable serialize/round-trip.
- `apps/v2/packages/core/tests/content-import.test.ts` — preview (pure/read-only), conflict policy
  (skip/overwrite/keep-both), RESUMABLE no-double-write (unit + command-path idempotent replay),
  no-partial-commit on rejection (player reject + empty + all-skipped), and metadata preservation +
  fail-closed visibility through the command path.
- `apps/v2/packages/core/tests/content-export.test.ts` — HARD non-leak assertions: a portable export of
  a vault with dm-only content contains none of that content's values/titles, no absolute paths, no
  secrets; the DM-backup mode includes the hidden content but still scrubs secrets/paths; export is
  DM-only and mutates no durable content.
- `apps/v2/app/tests/e2e/content-import-export.spec.ts` — preview-before-write, import + dm-only hidden
  from a player, player has no import/export affordances, portable export omits dm-only and is clean,
  DM backup includes hidden content but scrubs secrets/paths. Runs on BOTH desktop-chromium and
  mobile-chromium.

### Results

- `pnpm lint` (eslint + `lint:navigation` + `lint:tokens` + `audit:repo`): PASS.
- `pnpm docs:validate`: PASS.
- `pnpm v2:typecheck`: PASS (0 errors, core + app).
- `pnpm v2:lint` (boundary): PASS (no v1 / GUI imports in core).
- `pnpm v2:gates`: PASS (7 gates).
- Core unit suite (`@dndtools/v2-core`): 991 passed (73 files).
- App unit suite (`@dndtools/v2-app`): 55 passed (12 files).
- `pnpm --filter @dndtools/v2-app exec playwright test`: 294 passed, 18 intentional project-scoped
  skips, 0 failed — on BOTH desktop-chromium and mobile-chromium (base 284 + 10 new).
- `pnpm v2:workpack:validate`: PASS (before and after `complete`).

## Traceability

| Requirement | Implementation | Tests |
| --- | --- | --- |
| CONTENT-007 (import: preview, conflict policy, resumable, no-partial-commit, property/alias/tag/link preservation) | `apps/v2/packages/core/src/state/markdown.ts`, `apps/v2/packages/core/src/state/content-import.ts`, `apps/v2/packages/core/src/commands/content-import-export.ts` (`handleCommitContentImport`), `apps/v2/packages/core/src/schemas/commands.ts` (`commitContentImportInputSchema`), `apps/v2/packages/core/src/commands/dispatch.ts`, `apps/v2/app/src/lib/gui/ContentImportExport.svelte` | `apps/v2/packages/core/tests/content-markdown.test.ts`, `apps/v2/packages/core/tests/content-import.test.ts`, `apps/v2/app/tests/e2e/content-import-export.spec.ts` |
| CONTENT-008 (export: portable markdown + validation report, fail-closed redaction, portable vs DM-backup) | `apps/v2/packages/core/src/state/content-export.ts` (`exportContent`, composing `redactValue`/`containsSensitiveData` + `getContentItemsForActor`), `apps/v2/packages/core/src/commands/content-import-export.ts` (`handleExportContent`), `apps/v2/packages/core/src/schemas/commands.ts` (`exportContentInputSchema`), `apps/v2/packages/core/src/commands/dispatch.ts`, `apps/v2/app/src/lib/gui/ContentImportExport.svelte` | `apps/v2/packages/core/tests/content-export.test.ts`, `apps/v2/app/tests/e2e/content-import-export.spec.ts` |

## Demo path

1. `pnpm v2:dev`, open `/knowledge/` as the default DM.
2. (Optional) click "Define the demo calendar (Harptos)" so the content item list renders all visible
   items.
3. Under "Import & export", paste an archive (e.g. the placeholder shows the format:
   `===== lore/Highmoor.md =====` headers separating files). The live PREVIEW lists each file's title,
   conflict action, preserved tag/alias/link counts, and any preserved-but-unsupported properties —
   before any write. Choose a conflict policy, then click "Import".
4. Switch "View as" to "Demo Player": a `dm-only` import (default) is omitted; a file with
   `dndtools.visibility: player-visible` is shown.
5. Choose Export mode "portable", a "Share as" player, and click "Export": the report shows the exported
   file count, hidden-omitted count, redaction count, and a `clean` flag; the rendered files contain no
   dm-only titles, secrets, or absolute paths. Switch to "DM backup": hidden content is included, but
   secrets/absolute paths still render as `[redacted]` / `[redacted-path]`.

## Quality review

- Correctness: both acceptance criteria for CONTENT-007 (preview-before-write, resumable no-double-write)
  and CONTENT-008 (portable omits dm-only + secrets; DM-backup includes content + report) are
  implemented and test-covered, including hard negative cases.
- Architecture: pure Processing-Core policy (parse/serialize/conflict/staging/redaction); durable writes
  via the op-log; GUI dispatches intents only. ADR-014 + Contracts 1/2/3 honored; boundary lint green;
  no v1 runtime imports; no real filesystem dependency.
- Tests: unit (markdown, import, export) + e2e on both profiles; hard non-leak security assertions.
- Accessibility: form labels for every control; live `role="alert"` error region; stacked layout works
  on compact profiles; verified on mobile-chromium.
- Performance: parsing/staging/export are O(files) pure reducers over in-memory text; no new budgets
  needed.
- Security: export is the crux — fail closed by composing the visibility filter + redaction; `clean`
  self-check; DM-backup still scrubs secrets/paths. Findings: `redaction.ts` scrubs secret-NAMED fields
  and bearer-token-shaped / absolute-path strings; a bare unstructured secret embedded in arbitrary note
  PROSE (not bearer/path/secret-key shaped) is user-authored content, not a device-local secret, and is
  intentionally not over-redacted (see Known gaps).
- Permissions: import and export are DM-only and fail closed; imported items default `dm-only`.
- Persistence: import appends durable ops; resume is idempotent; durable persistence verified by the
  existing knowledge-route reload path. Export is read-only.
- Sync/offline: import/export operate on local state and are offline-capable (CONTENT-007/008
  `Offline: yes`); snapshots are used for import/export per Contract 2 (not the sync unit).
- UX: live preview, validation report, empty/error states, summary feedback; player sees no affordances.
- Maintainability: small typed modules; reuses existing redaction/visibility/op-log patterns; no
  speculative abstractions or unrelated refactors.
- Docs: this completion file; workpack regenerated via the programmatic complete command.

## Known gaps / deferred items

- Per ADR-014 there is no real filesystem/Obsidian-vault picker; import/export operate on provided text
  content and return the portable markdown payload in-memory (no file download/zip). A platform-service
  file adapter is deferred to a later platform/source-adapter epic.
- The markdown front-matter parser is a deterministic YAML-ish SUBSET (scalars, inline lists, block
  lists), sufficient for properties/aliases/tags/links preservation; full YAML (nested maps, anchors,
  multi-line scalars) is out of scope and not required by the acceptance criteria.
- Bare, unstructured secrets embedded in free-form note PROSE that are not bearer/path/secret-key shaped
  are intentionally not redacted (avoiding destructive over-redaction of user-authored content); the
  threat model for "device-local secrets" is structured fields + bearer/path shapes, which are scrubbed.
- Wikilink RESOLUTION/repair (CONTENT-006) and Google Docs round-trip constraints (CONTENT-012) are
  separate requirements/epics; this epic PRESERVES wikilinks/properties but does not resolve or
  reconcile them against a graph.

## Stop conditions

None hit. ADR-014 supports the approach (text-content import/export, no v1 imports, pure core +
op-log + visibility/redaction reuse); no ambiguous hidden visibility/permission/sync behavior; the
generated workpack validates.

## Git evidence

- Branch: `epic/CONTENT-import-export` (created from `epic/CONTENT-calendar-custom-time-content` HEAD
  `4c6b2dfc09e99f12289e14793047dd77748ceb5f`, not master).
- Commit: recorded in the follow-up docs commit.
- Final `git status --short`: clean (recorded below after the final commit).

```
(clean)
```
