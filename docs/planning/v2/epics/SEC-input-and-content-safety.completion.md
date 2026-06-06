# Completion Evidence: SEC-input-and-content-safety

- Epic: `SEC-input-and-content-safety` — SEC: Input and content safety
- Requirements: SEC-002, SEC-003, SEC-006
- Git branch: `epic/SEC-input-and-content-safety` (chained off the prior tip `412c892`)
- Workpack status: `complete`

## Summary

This branch adds three small, pure, fail-closed Processing-Core security modules that COMPOSE the existing
validation/sanitization + rendering pipeline — no parallel validation framework, no v1 runtime import, no new
mutation path:

1. **Path-like input safety** (`apps/v2/packages/core/src/security/path-safety.ts`, SEC-002) — the pure
   `validatePathInput` / `validateIdInput` gate every path-like input (an import archive path, a note/object
   id, a folder name) passes BEFORE any read or write. It rejects `..` traversal (slash/backslash/`%2e%2e`),
   NUL bytes, control characters, excessive length (whole path + per segment), unsupported URL schemes
   (`file:`/`http:`/`javascript:`…), and absolute/drive/UNC paths. `resolveWithinVaultRoot` is the
   defence-in-depth SECOND gate: it normalizes `.`/`..`/`//` against an explicit vault root and rejects a
   resolved path that escapes the root even if earlier validation missed it (AC2).

2. **Content safety** (`apps/v2/packages/core/src/security/content-safety.ts`, SEC-003) — the pure
   `sanitizeMarkdownContent` (and its parts `stripRawHtml`, `neutralizeMarkdownLinks`, `isSafeUrl`/`safeUrl`)
   strips raw HTML/script to inert text and neutralizes dangerous URL schemes (`javascript:`/`data:`/
   `vbscript:`/`file:`, robust to whitespace/case evasion) while preserving legitimate markdown, safe links,
   and `[[wikilinks]]`. This is the SECOND layer atop the already-structural safety of the block-model
   renderer (which never emits raw HTML and binds escaped text), so safety does not depend on one mechanism
   never regressing.

3. **Boundary payload limits** (`apps/v2/packages/core/src/security/payload-limits.ts`, SEC-006) — explicit
   size/count ceilings (`validateImportLimits`, `validateBodyLimit`, byte-accurate `byteLength`) enforced
   BEFORE allocation-heavy processing, layered on top of Zod's existing schema validation + enum allowlists +
   field-path-bearing structured rejections. An oversized import (entry count, per-file, or total) or body is
   rejected with a structured error that names the offending field path.

### How it composes the existing infrastructure (not duplicates it)

- The import command (`apps/v2/packages/core/src/commands/content-import-export.ts` `handleCommitContentImport`) now runs
  `validateImportLimits` (SEC-006) and `validatePathInput` per file (SEC-002) BEFORE `planContentImport`, and
  rejects with the new `payload-too-large` / `unsafe-path-input` rejection codes. The import remains
  transactional: a single unsafe path or an over-limit archive rejects the WHOLE import with no partial commit.
- `apps/v2/packages/core/src/state/content-editor.ts` `renderMarkdownPreview` now sanitizes the body via `sanitizeMarkdownContent`
  before block segmentation, and `apps/v2/packages/core/src/state/content-import.ts` `buildImportedItem` sanitizes imported source
  content at the trust boundary so the durable item is safe at rest. Both reuse the ONE sanitizer; the GUI
  (`NotesWorkbench`, `HandoutDelivery`, knowledge page) already binds escaped text and uses no `{@html}`.
- Structured rejection field paths reuse the established `parseInput`/Zod `issues: [{ path, message }]` shape,
  so the boundary error identifies the field (SEC-006 AC2) consistently with every other command.

No GUI component changed: the existing render path was already structurally safe (no `{@html}` anywhere), and
the new content-level sanitization flows through the unchanged Svelte text bindings.

## Requirement coverage / traceability

### SEC-002 — path-like input validation + vault containment

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1: `../` in a note id/folder input is rejected before storage access | `security/path-safety.ts` `validatePathInput`/`validateIdInput`; wired into `apps/v2/packages/core/src/commands/content-import-export.ts` (per-file path check before `planContentImport`) | `apps/v2/packages/core/tests/security-path-safety.test.ts` (traversal/byte/scheme/absolute/length rejection); `apps/v2/packages/core/tests/security-import-boundary.test.ts` (`unsafe-path-input` rejection, no partial commit) |
| AC2: a resolved path that escapes the vault root is rejected even if earlier validation missed it | `security/path-safety.ts` `resolveWithinVaultRoot` (normalize + containment, fail closed) | `apps/v2/packages/core/tests/security-path-safety.test.ts` (`vault containment is a SECOND gate`) |

### SEC-003 — sanitize/neutralize rendered + imported content

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1: a note with `<script>` or `javascript:` URL content is removed/neutralized when rendered | `security/content-safety.ts` `sanitizeMarkdownContent`; composed into `apps/v2/packages/core/src/state/content-editor.ts` `renderMarkdownPreview` and `apps/v2/packages/core/src/state/content-import.ts` `buildImportedItem` | `apps/v2/packages/core/tests/security-content-safety.test.ts` (HTML strip, scheme neutralization, render path end-to-end); `apps/v2/app/tests/e2e/content-safety.spec.ts` (malicious note renders inert, no dialog, no script/img element, no `javascript:` href, no `__pwned` flag) |
| AC2: custom widget renders user-authored markup under widget-host constraints, not unrestricted DOM | Pre-existing — the widget host contract (Contract 4) and the no-`{@html}` block-model render path constrain widget/embed content; this epic adds the content sanitizer that the same render path composes | Covered by existing widget-host/data-exposure tests; SEC-003 content sanitizer proven by the tests above. See Known gaps for scope note. |

### SEC-006 — boundary size limits + structured rejection

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1: an import with more entries than the configured maximum is rejected before allocation-heavy processing | `security/payload-limits.ts` `validateImportLimits` (count + per-file + total, byte-accurate); wired into `handleCommitContentImport` before `planContentImport` | `apps/v2/packages/core/tests/security-payload-limits.test.ts`; `apps/v2/packages/core/tests/security-import-boundary.test.ts` (`payload-too-large` with `files` path) |
| AC2: an unknown enum value yields a structured rejection identifying the field path | Pre-existing Zod enum allowlists + `parseInput` `issues: [{ path, message }]`; the new limit/path rejections reuse the same structured `issues` shape and name `files` / `files[i].path` / `files[i].text` | `apps/v2/packages/core/tests/security-payload-limits.test.ts` / `apps/v2/packages/core/tests/security-import-boundary.test.ts` (field-path assertions); existing `apps/v2/packages/core/tests/schemas.test.ts` covers Zod enum rejection paths |

## Demo path

- Programmatic (core): `pnpm --filter @dndtools/v2-core test -- security-path-safety security-content-safety security-payload-limits security-import-boundary` exercises every vector with hard negative assertions.
- User-visible (SEC-003): open `/knowledge/`, create a note, and paste a body containing
  `<script>alert(1)</script>`, `<img src=x onerror="alert(1)">`, and `[x](javascript:alert(1))`. The preview
  renders the payload as inert text: no dialog fires, no `<script>`/`<img>` element is created, and the
  `javascript:` link is neutralized to `about:blank#blocked`. This is asserted by
  `apps/v2/app/tests/e2e/content-safety.spec.ts` on BOTH desktop-chromium and mobile-chromium.

## Quality gates (all run, all green)

| Gate | Command | Result |
| --- | --- | --- |
| Core unit/integration + adversarial | `pnpm --filter @dndtools/v2-core test` | 161 files, 2337 tests passed |
| App unit | `pnpm --filter @dndtools/v2-app test` | 12 files, 60 tests passed |
| Typecheck (core tsc + app svelte-check) | `pnpm v2:typecheck` | 0 errors, 0 warnings |
| Boundary lint | `pnpm v2:lint` | passed |
| Full ESLint (CI) | `pnpm lint` | passed (eslint + nav + tokens + repo audit) |
| Docs validate (CI) | `pnpm docs:validate` | passed |
| Workpack validate | `pnpm v2:workpack:validate` | passed |
| Full E2E, desktop + mobile chromium | `pnpm e2e` (from `apps/v2/app`) | 523 passed, 21 skipped (incl. the new content-safety spec on both projects; the known `sync-conflict-lifecycle.spec.ts:71` parallel-contention case passed) |

## Adversarial tests added (each vector neutralized, with proof)

- `apps/v2/packages/core/tests/security-path-safety.test.ts` (SEC-002): `../`, `..\`, `%2e%2e`, bare `..`/`/..` traversal; NUL byte;
  control character; `file:`/`http:`/`javascript:` schemes; POSIX-absolute, Windows-drive, UNC paths; over-length
  whole path + over-length segment — each REJECTS with the precise reason. Vault containment normalizes and
  rejects an escape. Legitimate paths (`lore/factions/The Black Hand.md`, `note..md`) still pass.
- `apps/v2/packages/core/tests/security-content-safety.test.ts` (SEC-003): `<script>`, `<img onerror>`, `<iframe>`, `<svg onload>`,
  HTML comment, `<a href="javascript:">` stripped to inert text; `javascript:`/`data:`/`vbscript:`/`file:` link
  targets neutralized to the sentinel (link text kept); whitespace/case scheme-evasion defeated; safe
  http/https/mailto/relative/fragment/wikilink targets preserved; sanitization idempotent; render path proven
  safe end-to-end while benign notes render unchanged.
- `apps/v2/packages/core/tests/security-payload-limits.test.ts` (SEC-006): over-count import rejected at `files`; oversized single
  file rejected at `files[i].text`; collectively-oversized archive rejected at `files`; oversized body rejected
  at the named path; UTF-8 byte measurement proven (multi-byte not undercounted); under-limit payloads pass.
- `apps/v2/packages/core/tests/security-import-boundary.test.ts` (SEC-002/003/006 wired end-to-end): the `content.commit-import`
  command rejects a `../`/absolute/scheme path (`unsafe-path-input`, structured issue, no partial commit),
  rejects an over-count archive (`payload-too-large`), sanitizes a `<script>`/`javascript:` payload smuggled via
  import so it never reaches the stored item body, and still imports a legitimate archive.
- `apps/v2/app/tests/e2e/content-safety.spec.ts` (SEC-003): a malicious note body does NOT execute when rendered — no
  dialog, no injected `<script>`/`<img>`, no dangerous event-handler attribute, no `javascript:` href, the
  `__pwned` sentinel stays false — on both desktop and mobile profiles.

## Changed files (full repo-relative paths)

New (core security modules):
- `apps/v2/packages/core/src/security/path-safety.ts`
- `apps/v2/packages/core/src/security/content-safety.ts`
- `apps/v2/packages/core/src/security/payload-limits.ts`

New (tests):
- `apps/v2/packages/core/tests/security-path-safety.test.ts`
- `apps/v2/packages/core/tests/security-content-safety.test.ts`
- `apps/v2/packages/core/tests/security-payload-limits.test.ts`
- `apps/v2/packages/core/tests/security-import-boundary.test.ts`
- `apps/v2/app/tests/e2e/content-safety.spec.ts`

Modified (compose the new modules into existing pipelines):
- `apps/v2/packages/core/src/commands/content-import-export.ts` (SEC-002 path + SEC-006 limit gates before plan)
- `apps/v2/packages/core/src/commands/types.ts` (`unsafe-path-input`, `payload-too-large` rejection codes)
- `apps/v2/packages/core/src/state/content-editor.ts` (`renderMarkdownPreview` sanitizes before render)
- `apps/v2/packages/core/src/state/content-import.ts` (`buildImportedItem` sanitizes imported content at rest)
- `apps/v2/packages/core/src/index.ts` (export the three security modules)

Generated planning files (workpack commands; not hand-edited):
- `docs/planning/v2/epics/SEC-input-and-content-safety.yaml`
- `docs/planning/v2/status.yaml`
- `docs/planning/v2/workpack-state.yaml`

## Known gaps / deferred

- SEC-003 AC2 (custom-widget host constraints) is satisfied by the pre-existing widget-host contract
  (Contract 4) plus the no-`{@html}` block-model render path; this epic's content sanitizer is the additional
  content-level neutralization that the same render path composes. The dedicated widget-host sandbox
  enforcement is owned by the SEC renderer-isolation capability branch (SEC-001/SEC-007) and the widget-host
  network/exfiltration branch (SEC-007/SEC-011), which are out of this epic's requirement set.
- `resolveWithinVaultRoot` is a pure, deterministic string-resolution containment gate (per ADR-014 there is
  no live filesystem in `apps/v2` yet). When the real storage adapter lands, it composes this gate before any
  native read/write; the seam is in place and test-covered now.
- Sanitization deliberately removes raw HTML tags while PRESERVING their inner text (a `<script>payload</script>`
  becomes the visible, inert text `payload`). This is safe (it is escaped text, never markup) and keeps
  human-readable content; it is not an HTML-passthrough renderer (none exists in v2).

## Git

- Branch: `epic/SEC-input-and-content-safety`
- Base/chained off: `412c892`
- Implementation commit SHA: `70da9610e41677584e09a1a22207cf7499c2ebd1` (`feat(v2): complete SEC-input-and-content-safety epic`)
- Workpack-complete commit SHA: `4a43b283308c9f9bbfc0f54a2f3f6076581ce814` (`docs(v2): mark SEC-input-and-content-safety complete`)

### Final `git status --short`

After the SHA-recording commit, the working tree is clean (empty `git status --short`). At the point the
implementation + completion evidence were committed, `git status --short` was:

```
A  apps/v2/app/tests/e2e/content-safety.spec.ts
M  apps/v2/packages/core/src/commands/content-import-export.ts
M  apps/v2/packages/core/src/commands/types.ts
M  apps/v2/packages/core/src/index.ts
A  apps/v2/packages/core/src/security/content-safety.ts
A  apps/v2/packages/core/src/security/path-safety.ts
A  apps/v2/packages/core/src/security/payload-limits.ts
M  apps/v2/packages/core/src/state/content-editor.ts
M  apps/v2/packages/core/src/state/content-import.ts
A  apps/v2/packages/core/tests/security-content-safety.test.ts
A  apps/v2/packages/core/tests/security-import-boundary.test.ts
A  apps/v2/packages/core/tests/security-path-safety.test.ts
A  apps/v2/packages/core/tests/security-payload-limits.test.ts
A  docs/planning/v2/epics/SEC-input-and-content-safety.completion.md
M  docs/planning/v2/epics/SEC-input-and-content-safety.yaml
M  docs/planning/v2/status.yaml
M  docs/planning/v2/workpack-state.yaml
```
