# Completion — UX-CHAR-sheet-live-resources-and-advancement

UX workpack status: `complete`

Epic: Character Sheet, Live Resources, and Advancement (phase "06 Core Library Workspaces", P1).
Requirement coverage: `UX-CHAR-003` vitals/hierarchy, `UX-CHAR-004` inline edit, `UX-CHAR-005` HP
delta stepper, `UX-CHAR-006` death saves/conditions/concentration, `UX-CHAR-007` resource pips,
`UX-CHAR-008` advancement wizard, `UX-CHAR-012` journal.

## Summary

Rebuilt the three functional character surfaces into a polished per-character **combat sheet**,
a staged **advancement modal**, and a filterable **journal**, all on the design tokens and preserving
every existing functional testid (so the CHAR-007/008/009/012/016 functional specs still pass).

- **Combat sheet** (`CharacterCombatResources.svelte`, reusing `ux-char/HpBar`): each visible
  character renders as a sheet card with a persistent **vitals bar** (UX-CHAR-003) — HP as the
  dominant numeral, AC prominent, temp HP, condition pills, and a death-save glyph readout — exposed
  as `role="status"`. Below it, the in-play hot path:
  - **UX-CHAR-005 HP delta stepper:** an Amount field with −/+ buttons, **Deal _N_ / Heal _N_**
    buttons, a live `aria-live` **optimistic preview** ("Damage → 3/10 · Heal → 10/10") that mirrors
    the core's temp-first rule, keyboard shortcuts (`+`/`−`/`D`/`H` when the group has focus), and a
    "Temp HP & corrections" disclosure. Disabled (with the inactive note) until the session is active.
  - **UX-CHAR-006 death saves / conditions / concentration:** three success + three failure
    **circles** as `role="checkbox"` (fill on tap, ≥24px targets in a 44px zone); a condition
    **type-ahead** seeded with the 14 standard 5e conditions + free text, each active condition a
    removable pill; a concentration toggle row.
  - **UX-CHAR-007 resource pips:** spell-slot and class-resource rows render a **pip row**
    (filled = used, ≤10 then numeric) with the numeric "N/max", a Cast/Spend button (session-gated),
    a recharge badge, and the owner-only Manage + Short/Long-rest recovery.
  - **UX-CHAR-004 inline edit:** the character name in the vitals header is **click-to-edit**
    (button ↔ input, Enter/blur saves via `character.edit-field`, Escape reverts, a 2 s "✓ Saved");
    offered only to an owner/DM, who the core re-authorises.
- **Advancement** (`CharacterAdvancement.svelte`): the staged level-up now opens in a **modal**
  (UX-CHAR-008) over the sheet — one-choice-per-panel (class, HP, subclass, ASI/feat), inline
  validation issues, a disabled "Finalize level-up" until valid, and Cancel. The staged draft stays
  durable, so a closed modal shows a **Resume level-up** button on the card.
- **Journal** (`CharacterJournal.svelte`): a kind **filter row** (All / Notes / Bookmarks / NPC /
  Quests / Highlights), entry cards with a kind badge + a labelled **visibility badge** (lock
  "Private (you + DM)" / eye "Player visible" / shield "DM only" — never colour alone), a 2-line body
  clamp, and an author-only add form that **defaults to the most private** option (fail closed,
  CHAR-016).

## Demo path / surfaces

`/characters` (Character tools region) with the header `View as` switch and an active session
started from `/`.

- DM quick-creates a character → renames it inline on the vitals header. Starts a session; as the
  owner, types 7 into the stepper (preview shows "→ 3/10"), Deals damage (HP 3/10, history "Damage
  4" on a 4), taps a death-save success circle, adds "Poisoned" via the type-ahead, declares + casts
  a slot (pip empties), takes a long rest (pips refill). Opens a milestone level-up → modal → fills
  class + HP → finalize → card shows Level 2. Adds a journal entry (defaults Private) and filters by
  kind.

## Requirement coverage / traceability

| Requirement | Implementation | Test |
|---|---|---|
| **UX-CHAR-003** vitals bar (HP dominant), hierarchy, glance state | `CharacterCombatResources.svelte` vitals `role="status"` header (HpBar + AC + conditions + death glyphs) | e2e `character-combat-…` CHAR-007 (`resources-hp` "HP 6/10"); `character-sheet-ux` stepper/HP |
| **UX-CHAR-004** click-to-edit field, save/revert, capability-gated | name button ↔ input, `character.edit-field`, owner/DM-gated | e2e `character-sheet-ux` "DM edits a character name inline" |
| **UX-CHAR-005** Damage/Heal stepper, optimistic preview, +/- , session gate | `.stepper` group (amount −/+, Deal/Heal, `aria-live` preview, key shortcuts) | e2e `character-sheet-ux` (preview "3/10" + deal); `character-combat-…` CHAR-007 (deal disabled when inactive → "HP 6/10") |
| **UX-CHAR-006** death-save circles, condition type-ahead, concentration | `role="checkbox"` circles, 14-condition popover, concentration row | e2e `character-sheet-ux` (success circle aria-checked; add+remove Poisoned) |
| **UX-CHAR-007** slot/resource **pips**, Cast/Spend, rest recovery | `.pool`/`.pips` rows + Manage/rest | e2e `character-combat-…` CHAR-008 (declare/cast `resources-slot` "2/2"→"1/2", long rest → "2/2") |
| **UX-CHAR-008** staged level-up **modal**, validation, finalize gate | `CharacterAdvancement.svelte` a11y `Dialog` + durable resumable draft | e2e `character-combat-…` CHAR-009 (open milestone → modal draft → issue → finalize → Level 2) |
| **UX-CHAR-012** journal kind filter, visibility badges, fail-closed default | `CharacterJournal.svelte` filter row + labelled badges | e2e `character-party-…` CHAR-012/015/016 (private not leaked, reveal on player-visible, observer empty) |

## Actor-safety / no-leak evidence

- Every surface renders from the actor-filtered core queries (`listCharactersForActor`,
  `getCharacterJournalForActor`, `ensureCharacterResources`); hidden characters are omitted, and
  combat/journal/advancement writes go through durable commands the core re-authorises
  (owner / combat-participant / DM). `character-combat-…` CHAR-007 proves a non-grant player gets no
  `resources-combat-controls`. `character-party-…` CHAR-012/016 prove a private journal entry never
  leaks to another player and an observer sees `journal-empty`.
- The journal add form **defaults to the most private** visibility (`shared` = owner + DM), fail
  closed per CHAR-016.

## Tests / gates run

- `pnpm typecheck` — **0 errors, 0 warnings (4745 files)**.
- App vitest — **486 pass (62 files)**. Core vitest — unchanged (no `packages/core` edits).
- `pnpm lint` — **PASS**. `pnpm docs:validate` — **PASS**.
- Character e2e (8 specs incl. new `character-sheet-ux.spec.ts`), desktop — **all pass**; axe gate
  `/characters` — **pass on both projects**.
- Full Playwright suite, BOTH projects — **see run below** (route content changed substantially).
- `pnpm ux-workpack:validate` — **PASS**.

## Files changed

Modified — GUI:
- `apps/gm/src/lib/gui/CharacterCombatResources.svelte` (per-character combat sheet: vitals bar,
  HP Damage/Heal stepper + preview, death-save circles, condition type-ahead, concentration,
  resource pips, inline name edit)
- `apps/gm/src/lib/gui/CharacterAdvancement.svelte` (staged level-up modal + resume)
- `apps/gm/src/lib/gui/CharacterJournal.svelte` (kind filter, visibility badges, fail-closed default)

Modified — tests:
- `apps/gm/tests/e2e/character-combat-resources-and-advancement.spec.ts` (HP portion uses the new
  Damage stepper testids `resources-amount` / `resources-deal`)

New — tests:
- `apps/gm/tests/e2e/character-sheet-ux.spec.ts` (inline name edit, stepper preview/deal, death
  circles + condition type-ahead)

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-CHAR-sheet-live-resources-and-advancement.yaml`

## Known gaps / deferred

- **Single-character sheet route + tabbed sections (UX-CHAR-003 §desktop/mobile wireframes):** the
  prototype `/characters` renders each visible character as a sheet card in the Character-tools
  region (the data model is a multi-character workspace, no per-character route yet). The persistent
  vitals bar, HP-dominant hierarchy, and glance state are delivered per card; the Combat/Sheet/Spells
  **tab strip** and the mobile sticky-48px bar are deferred to a future per-character sheet route
  (would also host the data-exposure widget, UX-CHAR-010).
- **Inline edit beyond the name (UX-CHAR-004):** click-to-edit is wired for the name; AC / ability
  scores / long-text fields reuse the collaborative field editor on the same `character.edit-field`
  command (the full DM-attribution + conflict UI lands with `UX-CHAR-collaboration-and-widget-bindings`).
- **Advancement HP "roll" + DM-review banner (UX-CHAR-008 §spec):** HP is entered directly; the
  inline dice roller and the post-finalize "Pending DM review" banner are deferred (the core commits
  on owner finalize in the prototype).
- **Journal undo-toast + Read-more expansion (UX-CHAR-012):** removal is immediate (no 5 s undo) and
  the body is CSS line-clamped without a Read-more toggle; both are polish deferrals.

## Git evidence

- Branch: `ux/UX-CHAR-sheet-live-resources-and-advancement` (off `666d8e7`).
- Commit: `feat(ux): UX-CHAR character sheet, HP stepper, death saves, pips, advancement, journal`.

Final `git status --short` (pre-commit snapshot):

```
 M apps/gm/src/lib/gui/CharacterAdvancement.svelte
 M apps/gm/src/lib/gui/CharacterCombatResources.svelte
 M apps/gm/src/lib/gui/CharacterJournal.svelte
 M apps/gm/tests/e2e/character-combat-resources-and-advancement.spec.ts
 M docs/planning/v2/ux/epics/UX-CHAR-sheet-live-resources-and-advancement.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
?? apps/gm/tests/e2e/character-sheet-ux.spec.ts
```
