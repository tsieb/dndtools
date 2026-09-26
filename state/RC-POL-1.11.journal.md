# RC-POL-1.11 — Notes (Knowledge) polish

## Scope

Owned: `apps/gm-react/src/screens/knowledge`, `apps/gm-react/src/app/editor`,
`apps/gm-react/src/app/markdown`. Companion edits are limited to the manifest's grants: EN/ES
catalogs, e2e specs, visual specs and baselines, the raw-style allow-list, FEATURE-GAPS, and this
journal. Base `ddd2498e` (local `loop/rc`, which includes RC-KNW-5.2). The previous attempt was a
provider deferral four seconds after claim and did no work. No push, promotion, loop, extra agent,
or dispatcher-state edit.

## What changed

- **File size.** Four owned files were over 500 lines. `NoteViewer.tsx` (583) now keeps the
  reading panel and its writes; sharing, history and links moved to `NoteSidePanels.tsx`.
  `NoteEditor.tsx` (583) moved its write path (autosave, save-and-close, conflict detection) into
  `useNoteAutosave.ts` unchanged, the conflict box into `ConflictNotice.tsx`, and restore into
  `RestoreNoteRevision.tsx`. `render.tsx` (537) moved callouts and the secret blur into
  `callouts.tsx`. `Templates.tsx` (526) moved "Your templates" into `TemplateAuthoring.tsx`.
  `Filters.tsx` moved its pure draft/filter model into `filterModel.ts`. Largest owned file is now
  `render.tsx` at 465 lines.
- **Tokens.** All 127 raw spacing/radius findings in the 13 owned files are gone, and their
  allow-list entries are deleted (`pnpm lint:raw-style-count` now reports 1262 across the app). Type is on the
  `--text-*` scale.
- **Type scale.** Surface chrome uses four sizes (`--text-xs` meta, `--text-sm` body, `--text-base`
  card titles, `--text-xl` the open note's title). Cinzel now appears only at `--text-xl`: the note
  title (was 22px) and a markdown `#` heading (was 22px). Markdown `##`–`######` and the side panel
  headings are Inter semibold (they were Cinzel at 18/15/14/13/12px). Prose body is `--text-sm` (was 13.5px)
  at the relaxed leading, so the reading-width measure stays close to the line it was tuned for.
- **Hierarchy.** The reading panel is raised with `--shadow-md`; the side column stays flat.
  DM-only notes carry the purple inline-start stripe on the list card and the open note. "New note"
  is gold only while no disclosure is open, so an open panel's own action (Create, Import, Save) is
  the single gold button.
- **States.** The empty vault uses the `knowledge-empty` illustration. Filters with no hits show
  the `search-none` illustration with a reason that depends on whether any filter is set. Hits past
  the 40 listed now say so ("Showing the first 40 of N"). The result count is the panel's polite
  live region.
- **Destructive actions.** Deleting a template or a saved search now asks first and names it; both
  had deleted on one click with no undo. Template delete also handles a thrown persist failure,
  which used to escape unhandled.
- **Feedback.** Saving a template or search, deleting one, adding a snippet, and restoring a
  revision each confirm with a toast. Restore shows "Saving…" while it runs and an inline alert
  that keeps the button enabled for a retry when it fails.
- **History.** Rows show who made each change by display name; they showed the raw actor id. The
  current revision is labelled, the delta reads "3 lines added, 1 removed" (was "+3 / −1 lines in
  changed span"), and each Restore button names its revision.
- **Accessibility.** The note body `<textarea>` carried `role="combobox"`, which ARIA does not
  allow on a textarea (axe `aria-allowed-role`); it is now a textbox with `aria-autocomplete`,
  `aria-controls` and `aria-activedescendant`. The list is a labelled `<ul>` under a counted `<h2>`
  ("12 notes"); Import and Saved searches have headings. Toolbar buttons and related-note rows meet
  the density touch target. On the phone tier the four secondary header toggles (Search, Sources,
  Import vault, Templates) show their icon only, with the word kept as the accessible name and
  tooltip, so the header fits two rows instead of three. Bold and Italic show their shortcut in the tooltip and
  `aria-keyshortcuts`. The composer wraps at 200% text.
- **Correctness.** The snippet target picker read the raw item table; it now reads the same
  actor-filtered projection as the list.
- **Copy.** Every new string goes through `t()` with EN and ES. The Related row dropped its
  redundant "Note" kind label.

## Embedded §20.2–§20.5 checklist

Every item is checked or waived. A waiver states the boundary; it is not a claim that the waived
work was done.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory). — ESLint over all three owned directories is clean with no allowance; the 13 allow-list entries are deleted. Native elements remain where the DS has no equivalent and says so in the source: the note body `<textarea>` (the editor needs the element for caret placement and DS `Textarea` forwards no ref), the formatting toolbar's roving-tabindex buttons, the renderer's inline wikilink/roll/secret controls, and the related-note rows. Border hairlines (`1px`) and the 3px callout rule are strokes, not spacing, and the lint allows them.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale. — Waiver: no Notes template exists in the design-package catalog. The list/detail composition, the side column, and the RC-UX-4.3 rail split are unchanged. Deviations from the earlier build are listed under "What changed" (panel headings in Inter, not Cinzel; Related rows without the kind label).
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`. — Header "New note" is gold only while no disclosure is open; each disclosure has one gold action; the reading panel is raised with `--shadow-md`, the side panels are flat. `lint:emphasis` passes with no count above baseline. Waiver: the static lint still sums the mutually exclusive `panel === …` panes (it only recognises `tab === …`), so its Knowledge entry stays at the baseline's 5 even though at most one gold button shows at a time now.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono. — Chrome uses `--text-xs`/`sm`/`base`/`xl`. Cinzel only at `--text-xl` (note title, markdown `#`). History deltas and saved-search counts are mono. `lint:emphasis` no longer finds a display-face-below-24px case in `render.tsx` (baseline 6, now 0); lowering `scripts/emphasis-baseline.json` is outside this claim and left for `pnpm lint:emphasis --write`. Waiver: the shell title and DS badges keep their shared typography.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable. — Callouts pair accent with glyph (scroll, warning, sparkle, mask); the conflict box, save error and import result carry warning/check glyphs; DM-only notes carry the purple stripe on the card and the open note, plus the existing DM-only chip.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed. — The nine `knowledge--{tavern,parchment,high-contrast}` golden captures were re-baselined (the list layout changed). New `tests/visual/knowledge-polish.spec.ts` pins a text-free DM-only card corner (stripe, edge, accent glyph) in all five themes × three tiers (15 PNGs, ~0.45 KiB each). Full-state review captures (list, filters with no results, templates, populated note with callouts/table/secret, history, editor) were taken in all five themes × three tiers from a throwaway spec and inspected, not committed (budget). Waiver: those full states are not committed baselines; the budget has ~160 KiB left and the e2e polish spec covers them with strict axe on both profiles.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`. — The secret blur transition uses `--duration-fast` (0ms under reduced/none); cards and buttons use the DS transitions. Visual captures run with reduced motion.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists. — Empty vault: `knowledge-empty` illustration, DM and player copy. No filter results: `search-none` illustration with a reason. Errors: note save/delete/visibility alert above the body, restore alert with retry, import result tone + glyph, toasts for panel failures. Unavailable: date facet explains that a calendar is needed. Waiver: note reads are synchronous after runtime load; the shell owns the boot loading state and there is no knowledge loading key.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state. — Disclosures toggle synchronously; filters recount on each keystroke in a polite status; editor status reads Saving…/Saved; restore shows Saving… and then a toast; template/search save and delete, snippet insert, visibility change and note delete toast.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing. — Note delete: toast Undo (existing). Reveal to players: confirm names the note (existing). Overwrite import: confirm (existing). Template delete and saved-search delete: new confirms naming the item. Restore: undoable, since it writes a new revision and the replaced one stays in history. Removing a variable row in the template draft is unsaved form state.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next. — The editor's role=status line (Saving/Saved at/Unsaved/Not saved/changed elsewhere) and the conflict box's two choices; failures end in "try again" copy.
- [x] One clear route back; browser back works; Android Back follows the documented order. — BackBar and `/knowledge/:id` routing; browser back returns to the list. Waiver: native Android Back is shell-owned and was not device-tested here; this surface adds no back-stack handler.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android). — No hover-only controls; the related-row underline is decoration on an always-visible link colour. Toolbar buttons, related rows and the secret Show button use the density touch target (asserted in e2e against the resolved token). Waiver: DS `size="sm"` Buttons are DS-sized (28px at Standard density); every viewport under 1200px boots into comfortable density (44px) and Android is locked to 48dp by the shell.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet. — Waiver: this surface adds nothing to the top bar. Its in-page header on phone is one gold action (New note) plus four icon-only toggles; each disclosure opens in-flow, not in a sheet, because the panels are forms the DM works in.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present. — 22 new keys EN+ES, two reworded (history delta without "changed span" jargon, history empty). No literal DM/GM in catalogs. Toolbar shortcut legends follow the palette registry's untranslated `Ctrl/⌘+B` form.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips. — Bold/Italic tooltips carry `Ctrl/⌘+B`/`I` and `aria-keyshortcuts`; the editor hint line explains `[[`, `/` and the shortcuts; field help explains tags, linked-to and template variables; the import intro explains the header format. Waiver: no HelpTip component added; the existing inline help already sits beside each non-obvious control.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged. — `knowledge-polish.spec.ts` runs strict axe (WCAG 2.2 AA + best-practice, nothing excluded, `toEqual([])`) on: note list, filters with results, filters with no results, all three template tabs, overwrite confirm, composer, note viewer, history, editor, reveal confirm, failed restore, player list, player note, empty vault. Both profiles pass. The shared `a11y-axe-gate.spec.ts` passes on both. It found and fixed `aria-allowed-role` (combobox on `<textarea>`). No register entry added or changed.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere. — Recorded in e2e: focus New note (focus indicator asserted) → Enter → title field focused → type → Enter opens the note → Edit → toolbar ArrowRight → Tab to body (through Write/Preview on phone) → type → Save note → text rendered. This journal is the review record; no PR is published by this task.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled. — Shell h1 "Notes"; list h2 "N notes"; note title h2; panel titles h2 via screen-kit; Import and Saved searches h2; EmptyState h3 now follows an h2. The list is a labelled `<ul>`. Strict axe includes heading-order.
- [x] Live regions announce operations; no announcement spam. — Filter count is one polite status; editor save status is one status; import result is a status; errors are alerts; completions go through the toast's permanent polite region. The result list itself is not live.
- [x] Screen-reader spot check on one platform noted. — Waiver: no NVDA/VoiceOver/Orca is available in this headless task. Accessible names, roles, expanded/pressed states, keyboard focus and live regions are asserted in e2e; this is not a claimed auditory check.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions. — e2e doubles the root size on both profiles: the list, the open note and the editor have no horizontal overflow, Create and Save note are reachable, toolbar buttons meet the touch target. No new scroll region; the renderer's table region was already focusable and labelled.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering. — All writes are `runtime.dispatch`. The snippet picker's raw `content.items` read was replaced with `getContentItemsForActor`. History is `getContentHistoryForActor`; filters and saved searches are the core's actor-filtered queries.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly. — e2e enters player preview: New note, Templates, Edit and Push are absent; a direct `content.create-item` is rejected.
- [x] Player projection of this surface verified through an actor read in an e2e. — Same test: the player list shows "Campaign Primer" and never "The Sunken Crypt — DM notes"; the existing filters spec proves a DM-only saved search is absent for a player.
- [x] e2e on both profiles covers the primary task and one failure path. — Create/edit/save (keyboard test and existing specs) and a failed restore (thrown persist) that stays retryable and then succeeds.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression. — Waiver: no ENG-1.1 budget covers Knowledge rendering. The nearest, `search`, measures the core `searchVaultForActor`, which this change does not touch, so an A/B of it would measure nothing this story did. The render path gained no new per-note work: the list still memoizes facets, and the editor's write path moved into a hook unchanged.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved. — Notes row updated: the two gaps it listed (reading width, list scent) have shipped, so they are replaced by the remaining one (no live co-editing presence) and the history retention limit; tests column adds the polish and reading-width specs. No architecture contract moved.

## Out of claim, noted

- `apps/gm-react/src/styles/tokens/typography.css` comments still describe the renderer's old
  22/18/15px heading scale and 13.5px body. They are comments only; the file is not in this claim.
- `scripts/emphasis-baseline.json` can drop `render.tsx` display-face 6 → 0 with
  `pnpm lint:emphasis --write`. Not in this claim, and the lint passes without it.

## Validation (base `ddd2498e`, 2026-09-26)

- `pnpm --filter @dndtools/gm-react typecheck`: exit 0. `pnpm --filter @dndtools/gm-react build`: exit 0.
- `pnpm test:app`: **1657 passed** (147 files). The first run failed one test: the i18n argument
  checker reads `=0 {No notes}` as an argument, so `knowledge.listHeading` uses plain `one`/`other`.
- `pnpm test:tooling`: **220 passed**.
- `pnpm lint` (raw-style count, ESLint, boundary, emphasis, contrast): exit 0.
- `pnpm gates`: exit 0. 34 `file-size-warn` lines, **none for an owned file**. Largest owned files:
  `render.tsx` 465, `NoteViewer.tsx` 438, `index.tsx` 430.
- e2e, both profiles (`DNDTOOLS_E2E_PORT=6311`, 3 workers): `knowledge`, `knowledge-filters`,
  `knowledge-reading-width`, `knowledge-templates`, `knowledge-polish`, `note-depth`,
  `markdown-folder`, `player-private-notes`, `share-import`, `inline-roll`, `player-inbox`, `wiki`,
  `wiki-v2`, `wiki-reader-polish`, `a11y-axe-gate`: **195 passed, 1 failed**. The failure was the new
  200% case asserting the phone composer's Create button was in the viewport without scrolling;
  it is a reachability check, so it now scrolls first. `knowledge-polish.spec.ts` then passed
  **28/28** with `--repeat-each=2` on both profiles.
- Earlier, the first surface run failed `knowledge.spec.ts` "a [[wikilink]] in a note body…" on both
  profiles: the Related panel now names its row by the bare note title, so the page-wide lookup found
  two buttons. The spec is about the link in the body and is now scoped to `.knowledge-prose`.
- Existing specs changed for intended behaviour only: the template and saved-search delete tests
  confirm the new named dialog (and check nothing was deleted before confirming), and the history
  test addresses "Restore revision N".
- Visual, pinned container (`run-in-container.sh`): a full compare before re-baselining ran 393 tests,
  **384 passed and 9 failed, all nine the `/knowledge` golden captures**. No other route moved,
  including the markdown renderer's other consumers (board, /play, wiki). After re-baselining and
  adding the 15 crops, `-g knowledge --update-snapshots=none`: **24 passed**.
- PNGs were losslessly re-deflated (IDAT only, pixel data unchanged; the compare above ran after).
  `check-baseline-budget.mjs`: **486 files, 32,607.8 KiB of 32,768 KiB**, 48.6 KiB below the base's
  32,656.4 KiB.
- `pnpm format:check:changed -- --base loop/rc` (run after committing, since it reads the committed diff): 31 changed files, all Prettier-clean. `git diff --check`: clean.

## Reproduce

```sh
pnpm --filter @dndtools/gm-react typecheck
pnpm test:app
pnpm lint
pnpm gates
cd apps/gm-react && DNDTOOLS_E2E_PORT=<free port> pnpm exec playwright test \
  tests/e2e/knowledge.spec.ts tests/e2e/knowledge-filters.spec.ts \
  tests/e2e/knowledge-reading-width.spec.ts tests/e2e/knowledge-templates.spec.ts \
  tests/e2e/knowledge-polish.spec.ts tests/e2e/a11y-axe-gate.spec.ts \
  --project=desktop-chromium --project=mobile-chromium
bash apps/gm-react/tests/visual/run-in-container.sh -g knowledge --update-snapshots=none
node apps/gm-react/tests/visual/check-baseline-budget.mjs
```

## Gate retry: browser acceptance (2026-09-26)

The operator's full e2e run on `f479e572` (1498 tests, `--retries=2`) failed one test on all three
tries: `widget-kit.spec.ts:238` "Torchlight, restyled with the kit, matches the DS Button…" on
mobile-chromium, `kit Button in high-contrast/compact`, background `rgb(18, 18, 18)` expected and
`rgb(0, 0, 0)` received. 1470 passed. All the Knowledge specs passed.

- The change touches nothing outside the Knowledge surface, the catalogs, specs and docs, so I
  checked the base first. On a `/tmp` worktree at `ddd2498e`, `--repeat-each=4` of that test failed
  **2 of 4 on mobile** with the same message. On this branch it failed 2 of 4 as well, once as
  `tavern/compact`. It is a pre-existing flake.
- Cause: the expected value is read from the DS gallery's Button specimen, and DS `Button` paints
  its hover background from `onMouseEnter` (`--color-surface-overlay`, rgb(18,18,18) in
  high-contrast). A density switch reflows the gallery under the stationary pointer, Chromium fires
  a synthetic mouseenter, and the reference is sometimes the hover look while the kit button inside
  the frame is at rest.
- Fix, in the spec only (`tests/e2e/*.spec.ts` is a companion path): before each reference
  reading, move the pointer to a corner the specimen does not cover and wait until the inline hover
  background is gone. No product code or expectation changed.
- After the fix: `widget-kit.spec.ts --repeat-each=8` on both profiles **32 passed**; the
  Torchlight case alone `--repeat-each=12` on mobile **12 passed**. The base worktree was removed.
