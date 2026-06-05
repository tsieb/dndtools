# CONTENT-templates-and-snippets — Completion Evidence

Epic: `CONTENT-templates-and-snippets` — CONTENT: Templates and snippets
Requirement IDs: CONTENT-003, CONTENT-004
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model) + the standing v2 architecture contracts and ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CONTENT-templates-and-snippets`.

## Summary

This epic delivers the TEMPLATES + SNIPPETS capability branch ENTIRELY on top of the EXISTING CONTENT
model, validation, sanitization, and visibility path — it introduces NO parallel write, validation, or
sanitization pipeline:

- **CONTENT-003 (templates):** an authorized editor creates content FROM STARTER PRESETS with
  VARIABLES (pure deterministic substitution). The generated content is VALIDATED through the EXISTING
  note/object validators BEFORE writing; a missing required variable or invalid generated content is
  rejected fail-closed and NOTHING is written. A template's visibility is explicit or fails closed to
  `dm-only` — a template can never silently widen visibility.
- **CONTENT-004 (snippets — security crux):** an authorized editor inserts and reuses SNIPPETS, and a
  snippet CANNOT bypass note validation, visibility metadata, or markdown sanitization. Inserting a
  snippet produces content that funnels through the SAME validator (`validateMarkdownDraft`), the SAME
  safe block-model renderer (`renderMarkdownPreview`, which never emits raw HTML), and INHERITS the
  host note's visibility (it can never widen it).

All policy is PURE deterministic Processing-Core code; durable writes funnel through the EXISTING
`content.create-item` / `content.create-object` / `content.update-item` / `content.update-object`
commands (op-log + lifecycle), so the durable write still re-validates fail-closed. The GUI dispatches
intents and renders computed render/validation/preview models; it never touches storage (Architecture
Contract 1). Boundary lint stays green; no v1 imports.

## Reused existing building blocks (no re-implementation)

- The validation + sanitization path (the explicit reuse target):
  `apps/v2/packages/core/src/state/content-editor.ts` — `validateMarkdownDraft` (frontmatter/wikilink
  validation, fail closed) and `renderMarkdownPreview` (the safe heading/paragraph/list-item block
  model that never emits raw HTML = the sanitization path).
- The Vault Object schema validation: `apps/v2/packages/core/src/state/vault-object.ts`
  (`validateObjectFrontmatter`, `readObjectSubtype`, `syncNoteToObject`) and
  `apps/v2/packages/core/src/state/vault-object-schema.ts` (the subtype registry).
- The markdown engine: `apps/v2/packages/core/src/state/markdown.ts` (`parseMarkdownNote`,
  `extractWikilinks`) — reused transitively by the validators above.
- The canonical visibility model: `apps/v2/packages/core/src/permissions/visibility-filter.ts`
  (`normalizeVisibilityLevel`, `VisibilityLevel`) — the single coercion point, so an unknown
  visibility fails closed to `dm-only`.
- The durable content commands these handlers DELEGATE to (no parallel write path):
  `apps/v2/packages/core/src/commands/content.ts` (`handleCreateContentItem`,
  `handleUpdateContentItem`) and `apps/v2/packages/core/src/commands/vault-object.ts`
  (`handleCreateVaultObject`, `handleUpdateVaultObject`).
- The content state + actor-filtered read path: `apps/v2/packages/core/src/state/content.ts` and
  `apps/v2/packages/core/src/queries/content-query.ts` (`getContentItemsForActor`,
  `actorCanAuthorContent`).
- The command + durable-write plumbing: `apps/v2/packages/core/src/commands/helpers.ts`,
  `apps/v2/packages/core/src/commands/types.ts`, `apps/v2/packages/core/src/commands/dispatch.ts`,
  and the grant model `apps/v2/packages/core/src/permissions/grants.ts`.

## CONTENT-003 — Templates (pure render + validate-before-write)

`apps/v2/packages/core/src/state/content-templates.ts`: the pure template engine.

- `ContentTemplate` / `ContentTemplateVariable` model a titled, variable-driven starting point.
  `templatePlaceholders` reports the `{{variable}}` references; `renderTemplate` performs DETERMINISTIC
  substitution (no clock/locale/DOM) so the same template + values always render the same bytes.
- VALIDATE BEFORE WRITE: `renderTemplate` runs the generated body through `validateMarkdownDraft`, and
  for an `object` template it additionally reads the subtype and runs `validateObjectFrontmatter` over
  `syncNoteToObject`. A missing required variable (`missing-variable`) or any validation failure
  (`generated-content-invalid`) forces `valid: false` so invalid generated content is rejected, not
  written.
- VISIBILITY (AC2): the resolved visibility is `normalizeVisibilityLevel(template.defaultVisibility ??
  'dm-only')` — fail closed; a template can never silently widen visibility.
- STARTER PRESETS: `CONTENT_TEMPLATE_PRESETS` publishes `session-recap` (player-visible note),
  `npc-statblock` (dm-only schema-validated handout object), and `location-lore` (dm-only note);
  `contentTemplatePreset` / `listContentTemplatePresets` resolve and summarize them.

`apps/v2/packages/core/src/commands/content-templates.ts` (`handleCreateFromTemplate`): renders the
preset, gates on `render.valid` (fail closed — rejects `template-render-invalid` with per-issue
findings; rejects `template-not-found` for an unknown preset; DM-only authoring), then DELEGATES the
generated content to the EXISTING `content.create-object` (objects) / `content.create-item` (notes)
command so the durable write re-validates fail-closed and appends the op-log record.

## CONTENT-004 — Snippets (no bypass of validation / sanitization / visibility)

`apps/v2/packages/core/src/state/content-snippets.ts`: the pure snippet engine.

- `ContentSnippet` is a named markdown fragment carrying NO visibility of its own.
- `insertSnippet` inserts the snippet body at `before` / `after` / `at-caret` and validates the RESULT
  through `validateMarkdownDraft` — a snippet that makes the draft invalid yields `valid: false`,
  exactly as the same content typed by hand (no free pass).
- `previewInsertedSnippet` renders the inserted text through `renderMarkdownPreview` (the SAME safe
  block-model renderer), so a snippet containing `<script>` / raw HTML is reduced to inert text
  IDENTICALLY to hand-typed content — it cannot smuggle unsanitized markdown into the rendered output.
- `snippetCanInsertIntoVisibility` is the VISIBILITY GUARD: it permits a narrower-or-equal resulting
  visibility and refuses a wider one (both normalized through the canonical model, so an unknown value
  fails closed). `inheritedSnippetVisibility` returns the host note's own visibility — insertion is
  visibility-preserving by construction.
- LIBRARY: `CONTENT_SNIPPET_LIBRARY` publishes `read-aloud`, `stat-line`, `secret-door`;
  `contentSnippet` / `listContentSnippets` resolve and summarize them.

`apps/v2/packages/core/src/commands/content-templates.ts` (`handleInsertSnippet`): resolves the host
item + snippet (fail closed — `content-item-not-found`, `snippet-not-found`, `content-item-deleted`),
enforces the authorized-editor model (DM or a player with a write-capable grant on the content-item;
observer never qualifies), enforces the visibility guard (`snippet-widens-visibility`), inserts +
validates (`snippet-content-invalid` rejects an invalid result), then DELEGATES the resulting body to
the EXISTING `content.update-object` / `content.update-item` command (which re-validates and appends
the op-log record). The note's visibility is NOT changed.

## GUI

`apps/v2/app/src/lib/gui/TemplatesAndSnippets.svelte`, wired into the Knowledge section in
`apps/v2/app/src/routes/knowledge/+page.svelte`. It renders the computed render/validation/preview
models and dispatches `content.create-from-template` / `content.insert-snippet` intents; it never
touches storage (Contract 1). The authoring surface is gated by `actorCanAuthorContent` (an ergonomic
hint; the core re-checks fail-closed), so a player sees no template/snippet affordances. The same
stacked form/list surface renders on desktop and compact profiles.

## Wiring (new command surface)

- `apps/v2/packages/core/src/schemas/commands.ts`: `createFromTemplateInputSchema`,
  `insertSnippetInputSchema`.
- `apps/v2/packages/core/src/commands/types.ts`: the `content.create-from-template` /
  `content.insert-snippet` command variants and the new rejection codes (`template-not-found`,
  `template-render-invalid`, `snippet-not-found`, `snippet-content-invalid`,
  `snippet-widens-visibility`).
- `apps/v2/packages/core/src/commands/dispatch.ts`: the two new command cases.
- `apps/v2/packages/core/src/index.ts`: public exports for the template + snippet engines and schemas.

## Traceability (requirement → code → tests)

- **CONTENT-003** → `apps/v2/packages/core/src/state/content-templates.ts` +
  `apps/v2/packages/core/src/commands/content-templates.ts` →
  `apps/v2/packages/core/tests/content-templates.test.ts` (deterministic substitution; starter
  presets; AC1 missing-required-variable block at the pure layer AND the command rejecting it;
  AC2 dm-only default / player-visible default / explicit override / unknown-coerce; validate-before-
  write rejecting invalid generated markdown and invalid object frontmatter; DM-only authoring) and
  `apps/v2/app/tests/e2e/content-templates-and-snippets.spec.ts` (AC1 blocking message; valid create;
  AC2 dm-only default; player sees no affordances).
- **CONTENT-004** → `apps/v2/packages/core/src/state/content-snippets.ts` +
  `apps/v2/packages/core/src/commands/content-templates.ts` →
  `apps/v2/packages/core/tests/content-snippets.test.ts` (AC1 inserted-as-note-content via the unified
  pipeline; AC2 sanitization parity between inserted and hand-typed — the block model is identical and
  never raw HTML; no-skip-validation parity; the visibility guard refusing any widening and the
  command preserving dm-only / player-visible; authorized-editor + grant + fail-closed authority) and
  `apps/v2/app/tests/e2e/content-templates-and-snippets.spec.ts` (snippet inherits + cannot widen
  visibility; safe block-model preview).

## Tests run

- `pnpm lint` (FULL: `eslint . && lint:navigation && lint:tokens && audit:repo`): PASS (0 errors;
  navigation lint 132 files; token lint 132 files; repo audit 5 tests passed).
- `pnpm docs:validate`: PASS.
- `pnpm v2:typecheck`: PASS (0 errors; core `tsc --noEmit`; app `svelte-check` 700 files, 0 errors).
- `pnpm v2:lint` (boundary): PASS.
- `pnpm v2:gates`: PASS (7 gates owned, budgeted, wired).
- Core unit suite (`@dndtools/v2-core` vitest): PASS — 81 files, 1131 tests (includes the 2 new files,
  40 new tests).
- App unit suite (`@dndtools/v2-app` vitest): PASS — 12 files, 55 tests.
- `pnpm --filter @dndtools/v2-app exec playwright test` (FULL, BOTH projects desktop-chromium AND
  mobile-chromium): PASS — 326 passed, 18 intentional project-scoped skips, 0 failed. The new spec
  `apps/v2/app/tests/e2e/content-templates-and-snippets.spec.ts` runs 6 tests × 2 projects = 12,
  all passing.
- `pnpm v2:workpack:validate`: PASS before and after `complete`.

## Demo path

1. Run `pnpm v2:dev` and open `/knowledge/` (the Knowledge section). The "Templates and snippets"
   surface (`data-testid="templates-and-snippets"`) renders for the DM.
2. CONTENT-003 (templates): in "Create from a template", pick `Session recap`, fill `Session number`
   but leave `One-line summary` blank — the render preview shows a fail-closed validation message and
   the create button is disabled (AC1). Fill the summary; the preview reports the generated title +
   `player-visible` and the button enables. Pick `Location lore` to see a `dm-only` default (AC2).
   Creating round-trips the new note into the NotesWorkbench search list.
3. CONTENT-004 (snippets): create a `dm-only` note in NotesWorkbench, then in "Insert a snippet" pick
   that note + a snippet. The surface states the inserted content inherits the note's `dm-only`
   visibility and cannot widen it; the preview is the SAFE block model (no raw HTML). Insert it — the
   note stays `dm-only`. Switch the header "view as" control to a player; the templates/snippets
   surface disappears (authoring is DM-only, enforced fail-closed in the core).

## Quality review

- **Correctness:** every mapped acceptance criterion is implemented and test-covered (AC1 missing-
  required-variable block; AC2 explicit-or-dm-only visibility; snippet markdown saved via the unified
  pipeline; snippet raw-HTML/script sanitized). Validate-before-write and the visibility guard are
  proven with hard negative assertions.
- **Architecture:** pure Processing-Core policy; no parallel validation/sanitization/write path — the
  handlers compose the existing validators and DELEGATE durable writes to the existing content
  commands. GUI dispatches intents only (Contract 1). Boundary lint green; no v1 imports.
- **Tests:** 40 new core unit tests + 6 new e2e tests on both profiles; full core/app/Playwright
  suites green.
- **Accessibility:** the GUI uses labelled form controls, `role="alert"` on error messages, and a
  typed block-model preview list. It runs identically on desktop and compact profiles (both Playwright
  projects pass).
- **Performance:** rendering/insertion/validation are pure O(n) string transforms over note text; no
  new storage, indexes, or network. No new quality-gate budgets needed.
- **Security:** the snippet security crux is the headline — a snippet cannot skip validation
  (re-validated through the existing validator), cannot smuggle unsanitized markdown (the safe
  block-model renderer never emits raw HTML, proven by block-model parity with hand-typed content), and
  cannot widen visibility (fail-closed guard + visibility-preserving insertion).
- **Permissions:** creating from a template is DM-only vault authoring; inserting a snippet allows the
  DM or a granted authorized editor (write-capable grant on the content-item); observers and ungranted
  players are rejected fail-closed.
- **Persistence:** durable writes go through the existing op-log via the delegated content commands; a
  rejected render/insert writes nothing (verified: no item created, no op appended, body unchanged).
- **Sync/offline:** no new sync surface — the delegated commands append the same `content.*`
  operations; rendering/insertion are local-first pure functions.
- **UX:** loading/empty/error/disabled states are handled (disabled create/insert buttons when the
  computed model is invalid; alert messages; inherited-visibility and preview affordances).
- **Maintainability:** two small cohesive pure state modules + one thin composing command module + one
  GUI component; no speculative abstraction; no unrelated refactors.
- **Docs:** this completion file; module-level doc comments explain the reuse-not-reimplement stance.

## Known gaps / deferred items

- The starter presets and snippet library are a curated built-in catalog (the data artifact a reviewer
  inspects). User-authored/custom templates and snippets, and persisting a user's own template/snippet
  library, are intentionally out of scope for this capability branch (the existing requirements scope
  templates/snippets to authored starting points + reuse, not a template authoring CMS).
- Live external-source write-back of generated/inserted content remains deferred per ADR-014 (no
  Obsidian/Google Docs transport); the existing CONTENT-012 constraint path already governs that.

## Stop conditions

None hit. ADR-014 supports the approach; no v1 runtime imports were required; no hidden
visibility/permission/sync/persistence behavior was ambiguous (the existing visibility + content
commands cover it); the generated workpack validates; `git status --short` showed no unrelated
overlapping changes.

## Git evidence

Branch: `epic/CONTENT-templates-and-snippets` (created from `epic/CONTENT-structured-objects-and-wikilinks`
HEAD `e149bd5`).
Commit SHA: recorded in the follow-up docs commit after the implementation commit.

Final `git status --short` (clean slate):

```
(clean — no untracked or unstaged files)
```
