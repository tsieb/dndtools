# RC-CHR-5.3 run journal

## Scope

Roster library information scent (`screens/characters`): cards with portrait/initials, class · level,
HP bar, conditions, owner chip, last played; filters by kind/owner/tag; keyboard grid. Acceptance: e2e;
`authoring-layout.spec` at 320. No agents, dispatcher mutations, push or promotion.

## Attempt 1 (2026-09-12)

Base `338e06cb`. It contains the per-worktree e2e port fix `5d7bf943`.

### Where each card field comes from

`CharacterView` carries no owner, tags or play history, so each one is read from core state that
already exists. Nothing is invented and nothing new goes into core.

- **Owner:** the player actors holding a live `owner` grant on the character (PERM-013), checked with
  core `hasGrantedCapability` so revoked or expired grants drop out. DM authority is left out because
  a DM passes every capability check. The demo seed backfills an owner grant for each PC.
- **Class · level:** `data.class` (finalize writes it from the class step) and `data.level`. A PC with
  no level is shown as level 1, the same default core `characterLevel` uses. NPCs and monsters show a
  level only when one is set.
- **Tags:** `data.tags`. `character.edit-field` stores every `data.*` value as a string, so tags are
  saved comma-separated. The roster only reads them, so a new `sheet/TagsPanel.tsx` lets the DM write
  them in the sheet's edit mode (a DS `TagInput` that saves through `edit-field`). Without it the Tag
  filter would have nothing to offer.
- **Last played:** the newest session archive whose combat included the character or whose recap
  captured it as changed. A combatant in the running combat of an active session shows "In play now".
- **Portrait:** no portrait field exists yet (upload lands with CHR-5.1). The card shows the portrait
  tone gradient with the initials `Avatar`, which takes a `src` once portraits exist.

### Changes

- `roster.ts` (new, pure): the derivations above, the kind/owner/tag filter, the filter facets, and
  `gridTargetIndex` for arrow-key moves. `roster.test.ts` covers them.
- `CharCard.tsx`: the redesigned card. Its accessible name is only the character's name and the
  details are its `aria-describedby`, so a screen reader no longer reads every chip as the name. HP or
  conditions stripped for a non-DM are left out rather than rendered as `undefined/undefined`.
- `index.tsx`: Owner and Tag selects (the Tag select only appears once some character has a tag), a
  "Showing N of M" status, and "Clear filters" in the filter row and in the filtered empty state. The
  card grid is a `ul` with one tab stop and a roving `tabIndex`. Arrow keys move by the laid-out column
  count, Home/End jump to the ends, and Enter opens the card. A visually hidden hint is attached to
  the card that holds the tab stop.
- i18n: new `characters.*` keys in `en.ts` and `es.ts`. The now-unused `characters.conditionCount`
  was removed from both.
- Raw-style ratchet: the new code uses `T.space.*` tokens. `CharCard.tsx` now has no raw values (its
  allow-list entry is removed) and `index.tsx` went from 7 to 4.
- e2e: new `characters-roster.spec.ts` covers the card content, the filters, tags written on the sheet
  reaching the filter, last played across a live session and its archive, and the keyboard grid.
  `authoring-layout.spec.ts` gains a 320px case that renders the filtered roster, then the full one,
  with the longest card content, and asserts no horizontal scroll and no clipped card.

### Fixes found while validating

- **Condition badges showed only icons.** Compact `ConditionBadge`s have no visible text, so a sighted
  user saw bare icons. The card now uses the labelled badge ("Poisoned"), and collapses conditions
  past three into "+N more".
- **The filter tests could not find the selects.** The accessible names were already right
  (`combobox "Owner"`), but each `<label>` wrapped its `<select>`, so the label's text also included
  every option label. Playwright's `getByLabel(..., { exact: true })` never matched. Each filter now
  uses a sibling `<label htmlFor>`, and the tests use `getByRole('combobox', { name })`.
- **The 320px test failed with `dispatch is not defined`.** The helper was not imported.
- **Raw-style ratchet.** The new spacing uses `T.space.*` tokens. The allow-list drops the
  `CharCard.tsx` entry (0 raw values) and lowers `index.tsx` from 7 to 4. The new `TagsPanel.tsx`
  has none.
- **An unsaved tag draft outlived edit mode.** `TagsPanel` is now keyed on the edit mode, so leaving
  it drops the draft, the same way the sheet resets its other drafts.

### Validation results

- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- `pnpm test:app`: 123 files, 1287 tests passed. Includes the new `roster.test.ts` and the i18n
  catalog tests. (A bare `npx vitest run` from `apps/gm-react` reported 92 failed files. That
  invocation is wrong: without `vitest.app.config.ts` it collects the Playwright specs and resolves
  paths from the wrong root. It is not a result.)
- `eslint` on every changed file: exit 0. `prettier --check`: clean.
- `pnpm gates`: exit 0 (6 gates). The file-size lines are warn-only and none names a file this task
  added. `CharacterSheet.tsx` was already over the 500-line target.
- Playwright, earlier run (`characters-roster`, `authoring-layout`, `a11y-axe-gate`, both projects):
  73 passed, 3 failed. The 3 failures were the `getByLabel` locator problem above, fixed afterwards.
  The whole axe gate passed, `/characters` included.
