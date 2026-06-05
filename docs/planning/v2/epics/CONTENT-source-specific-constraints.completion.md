# CONTENT-source-specific-constraints — Completion Evidence

Epic: `CONTENT-source-specific-constraints` — CONTENT: Source-specific constraints
Requirement IDs: CONTENT-012
Architecture contracts: Contract 2 (Cloud Sync & Offline Model — Sync Source Contract, Obsidian and
Google Docs rules); Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model) + the standing v2 architecture contracts and ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CONTENT-source-specific-constraints`.

## Summary

CONTENT-012 delivers SOURCE-SPECIFIC NOTE CONSTRAINTS for the three note sources — LOCAL MARKDOWN,
OBSIDIAN, and GOOGLE DOCS — as typed CAPABILITY DESCRIPTORS plus a PURE pre-write CONSTRAINT CHECK that
reports, BEFORE a write commits, exactly which formatting, properties, links, or unsupported embedded
structures would be LOST or DOWNGRADED. It REUSES — rather than re-deriving — the two patterns the
orchestrator called out, so there is no parallel adapter system:

- The TYPED CAPABILITY DESCRIPTOR pattern (`apps/v2/packages/core/src/platform/support-matrix.ts` /
  `apps/v2/packages/core/src/platform/support-status.ts` and the MAP-020 adapter descriptor in
  `apps/v2/packages/core/src/state/map-import.ts`): each note source declares per-feature support
  (`supported` / `lossy` / `unsupported`); an unknown source/feature fails closed to `unsupported`.
- The MAP-020 PRE-COMMIT UNSUPPORTED-ELEMENT DIAGNOSTIC (`previewMapImport` in
  `apps/v2/packages/core/src/state/map-import.ts`): a read-only, non-leaking per-element classification
  produced before any write, with the loss surfaced and the write gated.

The note's detected structures come straight from the existing structure detector
`apps/v2/packages/core/src/state/markdown.ts` (`parseMarkdownNote`: front matter properties, aliases,
tags, inline `#tags`, `[[wikilinks]]`); the DND Tools namespace constant is reused from
`apps/v2/packages/core/src/state/content-import.ts`. All constraint policy + lossy-detection is PURE
deterministic Processing-Core code; the durable write goes through the op-log; the GUI renders the
pre-write diagnostic and dispatches an ACKNOWLEDGED write intent and never touches storage (Architecture
Contract 1). The Google Docs / Obsidian TRANSPORTS themselves remain deferred per ADR-014 — this epic
delivers the typed constraint descriptors + pre-write visibility, and the descriptors are the seam a
future transport plugs into. Boundary lint stays green; no v1 imports.

## CONTENT-012 — Source-specific constraints

### Typed capability descriptors + pure pre-write constraint check

`apps/v2/packages/core/src/state/content-constraints.ts`:

- `CONTENT_SOURCE_DESCRIPTORS` — the published, immutable per-source capability descriptors. OBSIDIAN is
  the superset (every detected feature `supported`, including resolved `[[wikilinks]]`); LOCAL MARKDOWN is
  the baseline (properties/aliases/tags `supported`, `[[wikilinks]]` `lossy` — literal text survives but
  loses resolved-link semantics); GOOGLE DOCS is the constrained rich-text target (front matter,
  wikilinks, aliases, tags, and DND Tools metadata `unsupported`/dropped; inline-tag text `lossy`).
- `detectNoteStructures` — counts the structures `parseMarkdownNote` detected, counting user properties
  separately from the interpreted `title`/`aliases`/`tags` and the `dndtools.*` namespace so no feature is
  double-counted.
- `checkContentSourceConstraints` / `checkDetectedStructuresAgainstSource` — the PURE, READ-ONLY pre-write
  check. For every feature PRESENT in the note it emits a non-leaking diagnostic (feature + outcome, never
  raw property values or link targets) and partitions present features into `lossyFeatures` /
  `droppedFeatures`. A feature not present in the note is never flagged. FAIL CLOSED: any lossy/dropped
  feature sets `requiresAcknowledgment: true` and a stable, deterministic `acknowledgmentToken`; an
  unknown source classifies every present feature `unsupported`.
- `isContentWriteAcknowledged` — the fail-closed write gate. Returns true only when the check requires no
  acknowledgment (faithful write) OR the supplied token EXACTLY matches the recomputed check's token. A
  missing/empty/stale token returns false, so a lossy write can never commit silently. The check is
  recomputed from the note text + source, so a caller cannot bypass the gate with a fabricated value.
- `summarizeContentSourceCapabilities` / `listContentSourceCapabilities` — the read-only reference-table
  data the GUI renders (what each source can / can't represent).

The whole module is exported from `apps/v2/packages/core/src/index.ts` (public core API).

### Durable acknowledged-write command (fail-closed enforcement seam)

`apps/v2/packages/core/src/commands/content-import-export.ts` adds `handleWriteContentToSource`
(command `content.write-to-source`, wired in `apps/v2/packages/core/src/commands/dispatch.ts`; types in
`apps/v2/packages/core/src/commands/types.ts`; schema `writeContentToSourceInputSchema` in
`apps/v2/packages/core/src/schemas/commands.ts`):

- DM-only authoring (mirrors the import/export authority); fail closed for anyone else.
- Fails closed on an unknown source (`content-source-unknown`; an out-of-enum source is rejected earlier
  by the zod schema as `invalid-payload`).
- Re-runs the PURE constraint check in the core and REJECTS a lossy/destructive write unless the payload
  carries the matching `acknowledgmentToken` (`content-write-loss-unacknowledged`). On rejection the
  durable state is returned untouched — the local draft/item content is byte-identical (CONTENT-012 AC3:
  unsupported/lossy status reported without losing local draft content).
- An accepted (faithful or acknowledged) write appends one durable op recording the source + the
  dropped/downgraded feature lists, and emits a `content.written-to-source` event — so a lossy write is
  AUDITED, never silently lost. The transport itself is deferred per ADR-014; the op records the
  acknowledged write intent.

### GUI

`apps/v2/app/src/lib/gui/ContentSourceConstraints.svelte`, mounted in
`apps/v2/app/src/routes/knowledge/+page.svelte`:

- Renders the source-capability reference table and, for a selected note + target source, the PURE
  pre-write diagnostic computed in the core (lossy/faithful status + per-feature rows).
- FAIL CLOSED: a lossy write disables the write button until an explicit acknowledgment checkbox is
  ticked; switching the note or source re-derives the diagnostic/token and resets the acknowledgment, so
  an acknowledgment is always for exactly the currently-shown loss.
- DM-only: a player/observer rendering the page sees no source-constraints affordances (the AUTHORITATIVE
  enforcement is still the Processing Core). The GUI dispatches the acknowledged `content.write-to-source`
  intent and never reaches storage.

## Tests

Primary evidence is automated tests.

- Core unit (`apps/v2/packages/core/tests/content-constraints.test.ts`, 23 tests): per-source descriptors
  + fail-closed unknown source; structure detection (counting + plain-note nothing-flagged); the pre-write
  check (nothing flagged when the source supports the structure for Obsidian; wikilinks downgraded for
  local markdown; properties/aliases/wikilinks/dndtools dropped for Google Docs; non-leaking messages;
  unknown-source fail-closed); the acknowledgment gate (faithful needs no token; lossy rejected without a
  token; accepted with the exact token; STALE token after the note changes; deterministic token); and the
  `content.write-to-source` command (faithful accept + audit; lossy reject with draft untouched; lossy
  accept with the token; stale-token reject; unknown source; DM-only fail-closed for player/observer;
  missing item). All pass.
- E2E (`apps/v2/app/tests/e2e/content-source-constraints.spec.ts`, 5 tests × 2 projects = 10): the
  capability reference table; AC1 — a Google Docs write reports formatting-loss BEFORE write and is
  fail-closed behind acknowledgment with a loss-audited summary; a faithful Obsidian write (nothing
  flagged, no acknowledgment); switching the source re-derives the diagnostic and resets the
  acknowledgment; AC3 — a player has no affordances. Runs on BOTH `desktop-chromium` and `mobile-chromium`.

Commands run (all 0 failures):

- `pnpm lint` (FULL: `eslint . && lint:navigation && lint:tokens && audit:repo`) — passed.
- `pnpm docs:validate` — passed (this completion doc references files with full repo-relative paths).
- `pnpm v2:typecheck` — 0 errors. `pnpm v2:lint` (boundary) — passed. `pnpm v2:gates` — passed.
- Core unit suite — 76 files, 1043 tests passed (includes the 23 new). App unit suite — 12 files, 55 passed.
- `pnpm --filter @dndtools/v2-app exec playwright test` — FULL on BOTH projects: 316 passed, 18
  intentional project-scoped skips, 0 failed (base was 306 passed; +10 new CONTENT-012 tests).
- `pnpm v2:workpack:validate` — passed before and after `complete`.

## Traceability

| Requirement | Acceptance criterion | Implementation | Tests |
| --- | --- | --- | --- |
| CONTENT-012 | AC1: a Google Docs write reports formatting-loss risk before destructive write-back | `apps/v2/packages/core/src/state/content-constraints.ts` (`checkContentSourceConstraints`, Google Docs descriptor); `apps/v2/packages/core/src/commands/content-import-export.ts` (`handleWriteContentToSource`); `apps/v2/app/src/lib/gui/ContentSourceConstraints.svelte` | `apps/v2/packages/core/tests/content-constraints.test.ts`; `apps/v2/app/tests/e2e/content-source-constraints.spec.ts` |
| CONTENT-012 | AC2: user-authored Obsidian frontmatter stays intact and DND Tools metadata stays namespaced | `apps/v2/packages/core/src/state/content-constraints.ts` (Obsidian descriptor `supported`; `dndtools-namespaced-metadata` feature via `DNDTOOLS_PROPERTY_NAMESPACE` reused from `apps/v2/packages/core/src/state/content-import.ts`); the check is read-only (never mutates the note) | `apps/v2/packages/core/tests/content-constraints.test.ts` (Obsidian faithful; dndtools metadata detection) |
| CONTENT-012 | AC3: when source capabilities are unavailable, the write reports unsupported status without losing local draft content | `apps/v2/packages/core/src/state/content-constraints.ts` (fail-closed unknown source; `isContentWriteAcknowledged`); `apps/v2/packages/core/src/commands/content-import-export.ts` (rejection returns state byte-identical) | `apps/v2/packages/core/tests/content-constraints.test.ts` (unknown source; lossy reject leaves `content` reference + body unchanged); `apps/v2/app/tests/e2e/content-source-constraints.spec.ts` (player has no affordances; fail-closed write button) |

## Demo

Path a reviewer can use to see the behavior:

1. Run `pnpm v2:dev` and open `/knowledge/` (default actor is the DM).
2. In the Notes workbench create a note (e.g. "Highmoor") and save its body with front matter, an
   `aliases` list, a `tags` property, an inline `#fortress` tag, and a `[[Bane]]` wikilink.
3. Scroll to the "Source constraints" section. Expand "Note-source capabilities" to see what each source
   can / can't represent.
4. Select the note and choose target source "google-docs": the pre-write diagnostic shows the dropped
   structures (wikilinks, front matter, aliases, …) BEFORE any write, and the "Write to source" button is
   DISABLED. Tick the acknowledgment checkbox to enable it; writing reports the acknowledged loss.
5. Switch the target source to "obsidian": the diagnostic shows a faithful write with no acknowledgment
   required; writing reports "no loss".
6. Use the header "view as" control to switch to a player: the entire source-constraints surface is
   absent (DM-only, fail closed).

Requirement IDs exercised by the demo: CONTENT-012.

## Quality review

- Correctness: every CONTENT-012 acceptance criterion is implemented and covered by unit + e2e tests,
  including the lossy/faithful/unsupported branches and the fail-closed acknowledgment gate.
- Architecture: pure Processing-Core policy (constraint descriptors + lossy-detection are pure
  deterministic functions); the GUI renders the diagnostic and dispatches the acknowledged write intent;
  no GUI reaches storage; the descriptors reuse the capability-descriptor + MAP-020 diagnostic patterns
  (no parallel adapter system). ADR-014 honored — no live transport, no v1 runtime imports; v2 boundary
  lint green.
- Tests: 23 core unit + 10 e2e (both projects); deterministic token and stale-token behavior verified.
- Accessibility: the diagnostic and acknowledgment use a real `<label>`/checkbox, an `<details>`
  disclosure for the reference table, and `role="alert"` for errors; renders on both desktop and compact
  profiles (e2e on both). No new design-token or navigation-lint violations.
- Performance: pure synchronous functions over a single note's parsed structures; no I/O, no new budgets.
- Security/permissions: DM-only authoring enforced in the core (fail closed for player/observer); the
  read path is the actor-filtered content query; diagnostics are non-leaking (feature + outcome only,
  never raw property values or link targets).
- Persistence/sync/offline: the check mutates nothing; an accepted write appends one durable op recording
  the source + loss for audit. Offline-capable (`Offline: yes`); the live Google Docs/Obsidian transport
  is deferred per ADR-014 and Contract 2, with the descriptors as the seam.
- Data safety (fail closed): a lossy write never commits without the matching acknowledgment token; a
  rejected/unsupported write leaves the local draft byte-identical.
- UX: pre-write visibility, explicit acknowledgment, faithful/lossy/no-structure states, error/summary
  feedback, and source-capability reference table; player sees no affordances.
- Maintainability: one small typed core module + one command + one GUI component; reuses
  `markdown.ts`/`content-import.ts`/op-log; no speculative abstractions or unrelated refactors.
- Docs: this completion file; workpack regenerated via the programmatic complete command.

## Known gaps / deferred items

- Per ADR-014 and Contract 2 there is NO live Google Docs / Obsidian transport, sync, or filesystem
  picker. This epic delivers the typed CONSTRAINT DESCRIPTORS + the pre-write visibility/diagnostic + the
  acknowledged write-intent command and op record; the descriptors are the seam a future transport plugs
  into. The `content.write-to-source` command records the acknowledged intent rather than performing a
  network round-trip.
- The feature set is exactly the structures `apps/v2/packages/core/src/state/markdown.ts` detects today
  (properties, aliases, tags, inline tags, wikilinks, dndtools metadata). Additional embedded structures
  (e.g. CONTENT-010 embeds/object cards) are added to the feature list once the parser detects them, with
  per-source support declared then.
- Source descriptors model representational fidelity per source; they are not a behavioral round-trip
  simulator. The fail-closed posture (drop = reported, lossy = reported, unknown = unsupported) is the
  safety contract, not a guarantee about a future transport's exact serialization.

## Stop conditions

None hit. ADR-014 supports the approach (typed descriptors + pre-write diagnostic, no live transport, no
v1 imports, pure core + op-log); no ambiguous hidden visibility/permission/sync behavior; the generated
workpack validates.

## Git evidence

- Branch: `epic/CONTENT-source-specific-constraints` (created from `epic/CONTENT-notes-and-editor` HEAD
  `1e114b26273996b489bd26ade9d54364a9b60ea6`, not master).
- Epic commit: recorded by a follow-up docs commit (see below).
- Final `git status --short`: clean.

```
(clean)
```
