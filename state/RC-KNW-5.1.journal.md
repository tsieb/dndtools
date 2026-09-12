# RC-KNW-5.1 run journal

## Scope and findings

- Implement markdown folder/ZIP export and additive re-import in owned paths; preserve current branch and unrelated changes. No agents, push, promotion or dispatcher mutations.
- Headroom tools are not available in this session; native commands provide original output.
- Existing legacy markdown import trims bodies and skips asset files. Its parser and command are outside ownership. The new round-trip codec will use the owned Obsidian adapter with an explicit exact-body option, and re-import through existing content.create-item commands. Existing folder-source pull semantics remain intact.
- Dates, tags, visibility and structured note metadata travel in front matter. Only explicitly selected DM exports include private notes. Image assets must be collected only from selected notes.
- ZIP is the web folder transport. Use stored ZIP entries (no dependency changes); validate paths, size, checksums and assets before import.

## Validation

Completed below.

## Implementation and evidence

- Settings → Vault now offers ZIP export/import everywhere and empty-directory export/import where File System Access is available. Import is additive through core commands, with an explicit unchecked private-copy checkbox for export.
- Core folder codec emits valid YAML front matter with visibility, tags, aliases, original timestamps, custom dates and rule metadata. Exact body mode in the owned Obsidian adapter preserves whitespace, CRLF, wikilinks and embeds. Referenced image URLs become adjacent asset paths and restore to their original content-addressed references on import.
- Referenced calendars accompany the notes. A conflicting destination calendar fails before any notes are imported. Protected notes are created private, their granular rules restored, and only then their entity visibility restored.
- The existing list/detail query retains raw section prose even when section metadata is restricted. Public export therefore omits notes with non-public section/field rules; it uses the existing player projection for secret callouts. Private export preserves the rules. This is explicitly described in the UI.
- Portable export rejects source content requiring security redaction/sanitization rather than silently changing an exported body. Import validates schema, paths, aggregate/per-file limits, asset content hashes and ZIP CRCs. ZIP reader accepts the standard stored ZIP format this exporter writes, not arbitrary compressed ZIPs.
- New core functions are imported directly from owned core export modules because the package barrel is outside this task's ownership. No changes to legacy import commands or their whitespace semantics.
- Native directory export refuses nonempty destinations. Binary and text bytes were tested through real temporary filesystem handles.

## Validation results

- Core codec and existing sync-source-adapters: 2 files, 47 tests passed (including 10 folder codec cases). Core typecheck passed.
- App targeted suites (markdown-folder, fsSource, backup): 3 files, 36 tests passed.
- Browser folder ZIP acceptance: desktop and mobile Chromium passed (2 tests), including default exclusion of the private note/image, explicit private export, deleting the original note/blob, re-import, byte comparison and rendered image naturalWidth > 0. Final rerun after hardening passed on both profiles (2 tests).
- App typecheck and scoped ESLint passed.
- Boundary lint passed.
- Final production build passed, including check-prod-bundle (85 JS assets; no test runtime or gallery). The standard chunk-size advisory remains.

## Corrections found by tests

- Sanitization initially blocked a restored asset: URL. Fixed by sanitizing the portable body first and restoring only validated image mappings afterward; unit and browser round trips passed.
- Playwright initially could not import the ZIP helper because it pulled in core system JSON via the note codec. Separated the archive code's runtime dependencies; the browser tests subsequently loaded and passed.
- E2E cleanup initially used a nonexistent content.delete-item command. Corrected to the actual content.remove-item command, and both profiles passed.
- Granular public-export test exposed the raw-prose behavior described above; public filtering was tightened and the test now passes.

## Deliberate boundaries

This is note-folder portability, not a whole-vault replacement: re-import creates fresh note IDs/revisions and retains original timestamps in front matter fields. Structured object records and typed cross-object embed relationships remain the full-vault JSON backup's responsibility. Literal markdown wikilinks and embeds are preserved. Existing legacy source pull/write-back APIs are unchanged.

Final source review: diff whitespace check passed. Only owned implementation files plus companion tests, English messages and this journal were changed. Central operator gates and independent review remain external to this run.
