# RC-UX-4.3 run journal

## Scope

Two-pane list/detail on the rail tier for Characters, Knowledge, Campaign and Atlas, plus the right
detail panel contract. Owned: `app/screen-kit.tsx`, `app/useViewport.ts`, `screens/Campaign.tsx`,
`screens/campaign`, `screens/characters`, `screens/knowledge`, `screens/atlas`,
`tests/e2e/responsive.spec.ts`. Acceptance: `responsive.spec` at 1024×768 and 820×1180. No agents,
dispatcher mutations, push or promotion.

## First pass (0793fed6)

`ListDetail` in screen-kit is the contract: on the rail tier at ≥768px the list keeps a left column
and the open detail takes a labelled, independently scrolling right panel; off that tier the detail
replaces the list as a full page, as these screens always behaved. `useListDetailSplit()` answers the
tier question, `useSingleColumn()` lets content inside a pane lay out as one column, and with a
`detailKey` the pane takes focus on open and hands it back to the opener on close. Characters and
Knowledge open the routed sheet / note in the pane (and mark the open card `aria-current`), Campaign
opens the quest / faction editor there, Atlas keeps the map library on the left and the canvas plus
inspectors on the right. `responsive.spec` covers placement, focus in and out, `<main>` not
scrolling, and no clipping at both tablet sizes.

## Rejected: a rotation discarded typed work

Independent review reproduced a silent data loss on the candidate: at 820×1180 open Campaign › New
quest, type a title, rotate to 1180×820, and the editor is still open but empty. The cause was
structural, not cosmetic — three separate places replaced a whole subtree at the breakpoint:

- `ListDetail` returned a bare fragment when not split and a grid when split, so the detail was a
  different position in the tree on either side of the line and every descendant remounted.
- `Campaign` moved the editor element between the card list (inline) and the detail pane.
- `Atlas` had two entire `return`s, so the "New map" form and the `MapEditor` overlay (tool, zoom,
  undo history) were rebuilt from scratch on a rotation.

Underneath all three sat a fourth, which is what made the first fix attempt fail: every consumer of
`useListDetailSplit` had its OWN `useState` and its OWN `matchMedia` listener. Those fire as separate
events, which React cannot batch, so a rotation produced one commit where the screen had already
stopped opening a detail while `ListDetail` still believed it was split — and in that half-state the
list pane unmounted, taking the form inside it. A DOM-node probe (`data-probe` markers up the
ancestor chain, compared across the resize) is what isolated it: the outer wrapper survived the
rotation and its child pane did not.

## Second pass

- `useViewport.ts`: `useListDetailSplit` is now one module-level store read through
  `useSyncExternalStore` — one subscription, one snapshot, so every consumer flips in the same
  render. The store drops its cached answer when the last subscriber leaves.
- `screen-kit.tsx`: `ListDetail` renders the same two slots in both modes; off the split tier the
  wrappers collapse to `display:contents` and the `<section>` is nameless and not focusable, so the
  full-width page keeps the layout and accessibility tree it had before this component existed. Only
  the list is dropped when a detail is open off-tier — the detail IS the page there, as always.
- `Campaign.tsx`: `useDraftSlot` holds the quest / faction draft in `Campaign` (a ref, so typing does
  not re-render the card grid), keyed by the editor's identity and cleared when it closes. The editor
  seeds itself from the slot on mount, so moving between inline and pane costs nothing. Cancel still
  discards.
- `atlas/index.tsx`: one `ListDetail` for both tiers. The map library page is a single element whose
  first three children (switcher, notice, create form) hold their position across the tier change,
  and the `MapEditor` overlay sits outside the pane entirely — it is `position:fixed`, so that is
  visually identical and it now rides out a rotation.
- `responsive.spec.ts`: two tests at the rotation. One types a quest title and hook and a map name,
  rotates both ways and asserts every value survives (and that Cancel still empties the draft); one
  puts a character sheet into edit mode and asserts the mode — sheet-local state, cleared by a
  remount — survives the round trip, along with the roster's `aria-current` marker.

## Validation results

- Reviewer's own `resize-probe.cjs`, re-pointed at this tree: exit 0, title intact after the
  rotation ("Unsaved tablet quest" before and after), where it asserted and failed on the candidate.
- DOM-identity probe after the fix: every ancestor of the map-name input, input included, is the same
  node before and after the rotation.
- `tsc -p apps/gm-react` and ESLint on all changed files: exit 0. Prettier `--check`: clean.
- `raw-style-count`: 2,583 across 260 files, ratchet passed. `boundary-lint`: passed.
- `vitest run --config vitest.app.config.ts`: 126 files, 1,327 tests passed.
- `responsive.spec.ts`, desktop-chromium + mobile-chromium: 92 passed, exit 0 — including the
  acceptance sizes 1024×768 and 820×1180, the four-screen pane contract, and the two new rotation
  tests.
- Full Playwright suite, both projects (ListDetail is on four shared routes, so the whole suite ran,
  not just the acceptance spec): 1,109 passed, 11 skipped, 2 failed in 18.1m, with retries off. Both
  failures are the two the gate on the first candidate also hit, and neither is this change:
  `knowledge-filters.spec.ts:101` fails at every commit on the async `setSaveName('')` reset in
  `SavedSearches.tsx` (not an owned file), and `map-editor.spec.ts:342` (the POI arrow-key nudge) is
  the known load-dependent flake — re-run alone on desktop-chromium with `--repeat-each=3` it passed
  3/3. Total count checks out: the gate's run was 1,118 tests, this one 1,122, and this change adds
  exactly 4 (two tests × two projects).
- Disposable run logs removed from `/tmp`; the probe dev server was stopped. No push, promotion,
  loop, agent delegation or dispatcher control changes.

## Third pass — the file-size gate

`pnpm gates` rejected the fix: `Campaign.tsx` reached 1,064 lines, past its grandfathered RC-STB-2.7
baseline of 988 ("Grandfathering caps growth; it does not permit more"). The draft plumbing was what
pushed it over, so the file was split the way the gate asks for, into the `screens/campaign/` folder
that already holds Calendar and Relationships:

- `campaign/draftSlot.ts` — `DraftSlot` / `useDraftSlot`.
- `campaign/QuestEditor.tsx`, `campaign/FactionEditor.tsx` — the two editors and their draft types.
- `Campaign.tsx` is 608 lines and now composes rather than contains; the move is verbatim apart from
  the imports and two `gap: 12` literals that became `T.space.three` (var(--space-3) IS 12px).

Reading the gate code first mattered: `auditFileSizes` fails a stale exception only when the file no
longer EXISTS, not when it drops under the 800-line limit, so shrinking past the limit is safe. The
exception entry itself lives in `packages/core/src/platform/quality-gates.ts`, which is neither owned
nor a companion path, so it stays as-is.

The `dsn/no-raw-style-values` ratchet had to move with the code — it fails when an allowance exceeds
the real count. `scripts/eslint-rules/*.allow.js` is a declared companion path, so:
`Campaign.tsx` 24 → 20, and the two editors carry 1 each (the `gap: 10` that has no token — 10px is
off the 4px grid). 24 → 22 overall, so the list still only shrinks.

- `tsx scripts/quality-gates.ts`: quality-gate check passed (6 gates), docs check passed, exit 0.
- `tsc`, ESLint and Prettier on every changed file: clean. `raw-style-count`: 2,578 across 261 files.
- `vitest --config vitest.app.config.ts`: 133 files, 1,464 tests passed (the count rose with the
  commits this branch was rebased onto).
- `responsive.spec` + `campaign.spec` + `campaign-relationships.spec` + `campaign-calendar.spec`,
  both Chromium projects: 116 passed, exit 0 — the acceptance sizes and both rotation tests included.
- Full Playwright suite on the split, both projects: 1,153 passed, 11 skipped, 0 failed in 19.2m.
  The two known flakes from the previous run (`knowledge-filters.spec.ts:101`,
  `map-editor.spec.ts:342`) both passed this time.
