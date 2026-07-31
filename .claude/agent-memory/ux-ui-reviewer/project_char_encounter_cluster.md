---
name: char-encounter-cluster
description: Char/encounter cluster (Characters.tsx, CharBuilder.tsx, EncounterBuilder.tsx) — FIXED-vs-STILL-OPEN split re-verified 2026-07-30 @ 016b696c (run #15), plus the e2e spec-coupling map
metadata:
  type: project
---

# Char/Encounter cluster — state at HEAD 016b696c (2026-07-30, run #15)

Line counts at HEAD: `Characters.tsx` 1877, `CharBuilder.tsx` 2470, `EncounterBuilder.tsx` 709.
Run #15 re-read all three end to end. NOTE: run #14/#15 commits (`7b4d2850`, `016b696c`) touched
AppShell / SpellSlots / screen-kit / Settings / Community / Extensions — **none of the three cluster
files changed since run #11**, so every run-#11 OPEN item below is still open verbatim.

## FIXED (do not re-chase)
- `CharBuilder.create()` `:1183-1202` try/catch/finally — frozen "Creating…" is dead.
- Phone attack-editor grid in `Characters.tsx:916` (`gridColumn:'1 / -1'` on Name).
- `key={phase}` Overlays, `NumStepper` spinbutton, Tile/PathCard hover + `aria-pressed`,
  point-buy soft-disable, phone slab height, `key={detailId}` on CharacterSheet, per-field
  validation routing (`error.field`), `hpDraft`/`typedHpAmount`, `crDrafts`/`qtyDrafts` reset,
  `backdropDismissible={rows.length===0}`, quick-add HP floor of 1, DataTable overflow wrapper.
- DS-layer: `SpellSlots` read-only `role="img"` pips + 24px hit box (shipped `016b696c`);
  `screen-kit.radioGroupKeyDown` Home/End + skip-disabled; `screen-kit.BackBar` 24px + hover;
  new `screen-kit.LoadingRegion` helper (⚠️ it STILL mounts with its text — see OPEN #8 note).

## STILL OPEN — ranked, line numbers verified at 016b696c

1. **`EncounterBuilder` start mode ORPHANS a durable encounter on every retry.** `:284-328`:
   `encounter.build` succeeds durably → `combat.start` rejected ("start a session first" is the
   likely case) → `setError` + return with rows intact. Pressing Start again re-runs
   `encounter.build`. No UI lists or deletes encounters. Fix: hold the built `encounterId` in a ref,
   skip the rebuild on retry, invalidate on any roster/title edit.
2. **`Characters.tsx` announces NO successful write.** Grep confirms zero `role="status"` in the
   whole file except the roster `notice` `:1786` (and that's `status` only on the ok branch).
   Damage/Heal/Set AC/Add condition/rename/toggle prepared/Set slots/Save attacks/Apply
   sharing/Set XP/Finish level-up are all silent. Copy `Player.tsx:475-477` (persistent, EMPTY
   `role="status" className="visually-hidden"` node).
3. **`Characters.tsx:1784` roster `notice` MOUNTS WITH its text** ⇒ "Combat started" is unreliably
   announced. Only the `role="alert"` error branch works.
4. **`Characters.tsx:403-411` `dispatch()` calls `setError(null)` FIRST, then bare `await`.** On a
   rethrown persist the previous message is already gone and nothing replaces it (only the global
   `main.tsx:17` toast). `startCombat()` `:1704-1731` also has NO busy flag ⇒ double-click.
5. **`Characters.tsx:714-718` Edit→Done silently discards drafts** (`setAttackRows(null)` +
   `setShareDraft(null)`), no confirm, no undo. Same at the attack editor's own Cancel `:959`.
6. **`CharBuilder` step change is invisible.** `next`/`back` `:976-981` move no focus, reset no
   scroll, announce nothing. `step.title` `:1587` is a styled `div`, never an `<h*>` — the wizard
   dialog has NO heading. "Step i of n" `:2381-2383` is inert. StepRail is `!isPhone` only `:1577`,
   so a phone user has ZERO progress signal.
7. **`CharBuilder.tsx:2413-2464` discard alertdialog shares the wizard's Tab trap.** Rendered inside
   `panelRef`, and `Overlay`'s Tab sweep `:768-770` filters only on `offsetParent !== null`, so Tab
   from "Keep editing" walks into the scrim-obscured wizard. Also no `aria-modal`, no
   `aria-describedby` pointing at the body copy `:2447`.
8. **`CharBuilder` blocked Continue is a silent dead button on touch.** `:2383-2392` — `aria-disabled`
   makes `ds/Button` strip `onClick`; `blockedReason` `:1563-1570` lives ONLY in `title`. Name Input
   `:1630-1636` has no `aria-invalid`/`aria-describedby`. **Do NOT use hard `disabled`** —
   `command-palette.spec.ts:149-155` pins the EncounterBuilder twin as natively enabled.
9. **PC-with-no-players is a contradiction.** `blockedReason` `:1565` says "choose who plays it"
   while `:1660-1672` renders a `HonestNote` INSTEAD of the owner Select — there is nothing to choose.
10. **`CharBuilder` `dirty` `:985-987` requires `phase==='scratch'`**, but `back()` `:978` at i===0
    sets `phase:'choose'` ⇒ X from the choose screen throws a typed name away with no confirm.
11. **`EncounterBuilder` focus dies + the error is scrolled away.** `:495` quick-add Add is hard
    `disabled={!qName.trim()}` and `quickAdd()` clears `qName` `:241` ⇒ disables itself under focus.
    `:638-644` per-row Remove unmounts itself. Start combat `:360` is hard `disabled={submitting}`
    ⇒ focus → `<body>`, while `error` `:377-381` renders at the TOP of Dialog's scrolling body
    (`ds/.../Dialog.jsx:326`) with the button pinned in the fixed footer `:336`. Net: on a full
    roster the DM presses Start and sees/hears nothing.
12. **`EncounterBuilder` has no `role="status"`.** "Combatants · N" `:504` is inert.
13. **Duplicate accessible names in every attack editor.** `Characters.tsx:910/925/933`
    ("Attack name"/"Attack detail"/"Remove attack" × N rows) and `CharBuilder.tsx:2082-2135`
    (5 labels + "Remove attack" × N). Suffix with the row's name or index.
14. **`CharBuilder.tsx:2066-2139` phone attack rows are visually merged** — the row grid's `gap:8`
    equals the container's inter-row `gap:8` `:2066`, and the 6th cell (Remove) lands beside
    *Damage type* on row 3. Raise the container gap and/or box each row.
15. **`Characters.tsx:1058/1067/1101` hard-`disabled` with no reason** ("Save choices",
    "Finish level-up", "Level up (XP)") while `Player.tsx:2058-2060` renders `xpEligible.message`
    for the SAME `EligibilityResult`.
16. **Sub-24px pill (WCAG 2.5.8):** `Characters.tsx:1330-1352` Prepared/Not prepared
    (`3px 9px` + 11px ⇒ ~21px). Template: `Player.tsx:1144-1146`
    (`padding:'6px 10px'; minHeight:24; boxSizing:'border-box'`). Sharing chips `:1531` (4px 10px,
    12px) already clear 24px.
17. **Tile groups are N unrelated toggle buttons.** `:1611`, `:1682`, class/background grids: no
    accessible group name, no "1 of 4". **`role="radio"` breaks `authoring-layout.spec.ts:78,96`** —
    the spec-safe fix is `role="group" aria-label="Kind"` etc. on each grid wrapper.
18. **Zero hover feedback on hand-rolled buttons.** No global `button:hover` exists.
    `Characters.tsx:249` (breadcrumb Back), `:1330` (Prepared), `:1517` (sharing chips);
    `EncounterBuilder.tsx:413` (roster picker). `Characters.tsx:1590` is the only one with handlers.
19. **`EncounterBuilder.tsx:478` quick-add HP advertises `min={0}`** while `quickAdd` `:232` floors at 1.
20. Smaller, re-verified: `role="alert"` on the draft-issues `<ul>` `:1959`; points-left pill not a
    live region; `FieldLabel` `:427` is a `<span>` not a `<label>` (~15 fields); `declareSlots`
    `:511` empty guard is dead (`:1428` hard-disables on the same condition); `Characters` `notice`
    survives navigating into a sheet and back; rename `:668-693` drops focus to `<body>`;
    `CharBuilder` `error` isn't cleared by `back()`; initiative `:551` allows `-` anywhere ("1-2");
    `CharBuilder` create button `:2396` also hard-`disabled={submitting}` (same focus drop as #11).

## VERIFIED NON-DEFECTS (stop re-flagging)
- `ds/IconButton.jsx` DOES swallow the click on truthy `aria-disabled`.
- `role="alertdialog" aria-label` `:2415-2416` does not erase its subtree.
- `Card interactive` (CharCard) gets role/tabIndex/Enter-Space from `ds/Card.jsx`.
- `Seg` (`app/screen-kit.tsx`) is a correct radiogroup with roving tabindex + (new) Home/End.
- `Icon name="UserCircle"` is registered.
- EncounterBuilder roster picker `:413-453` is genuine multi-select with `aria-pressed`.
- `app/charImport/**` and `app/compendium/**` are PURE `.ts` — no UI surface.
- `Overlay`'s backdrop `onMouseDown` calls `requestClose`, so the discard confirm gates it correctly.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`)
| spec:line | selector | source |
|---|---|---|
| authoring-layout:37 | 320px no-h-scroll sweep incl. `/characters` | roster grid `Characters.tsx:1840` |
| authoring-layout:62,90,127 | `button 'New character' exact` | `Characters.tsx:1773`, `:1828` |
| authoring-layout:63,91,128 | `button /Build from scratch/` | `CharBuilder.tsx` choose phase |
| authoring-layout:65,92,130 | `dialog 'New character wizard'` (aria-label) | `CharBuilder.tsx:1573` |
| authoring-layout:78,96 | `button 'PC'/'NPC' exact` | `Tile` via `KINDS` |
| authoring-layout:79,97 | `getByLabel('Name')` | `CharBuilder.tsx:1630` |
| authoring-layout:98-100,131-133 | `button 'Continue'` (always after filling Name) | `:2383-2392` |
| authoring-layout:104,105 | `getByLabel('Attack kind')` / `('Damage type')` | `:2094` / `:2124` |
| authoring-layout:135+ | `getByRole('spinbutton', {name:'hit points'})` | NumStepper `:2036-2044` |
| character-sheet:45,47,57 | `button 'Edit'/'Done' exact` — toggled with NO drafts open | `:710-721` |
| character-sheet:94-121 | "Set AC" blank ⇒ `getByRole('alert')` count **1**, within 80px | `:1194` |
| command-palette:110 | `dialog 'Build encounter'` | `EncounterBuilder.tsx:339` |
| command-palette:125,149-155 | Start combat keeps `aria-disabled="true"` + `title` /combatant/i AND `el.disabled === false` | `:356-372` |
| command-palette:126-129 | `getByLabel('Quick add' exact)`, `button 'Add' exact` | `:465-499` |
| command-palette:132,138-141 | `getByLabel('Bandit quantity')` | `:579` |
| command-palette:145 | `button /from the draft$/` | `:640` |
| a11y-axe-gate:28 | axe on `/characters` (roster only) | — |

Blast-radius rules:
- **Do NOT convert Start combat / Continue to hard `disabled`** (command-palette:151 asserts
  `el.disabled === false`). Render a VISIBLE reason instead.
- **Tile → `role="radio"` breaks authoring-layout:78 AND :96.** Use `role="group"` on the wrapper.
- Adding a **`role="status"`** node to the sheet is safe; adding a second `role="alert"` is NOT
  (character-sheet:113 asserts `toHaveCount(1)` on a filtered alert — filter protects it, but
  an unfiltered `getByRole('alert')` elsewhere in that file does not).
- A confirm gated on `attackRows || shareDraft` is SPEC-SAFE.
- `getByLabel('Name')` / `('Attack kind')` survive adding `aria-invalid`/`aria-describedby` and
  survive a row suffix (Playwright `getByLabel` is substring by default, and the kit step seeds
  exactly one attack).
- `responsive.spec.ts` ROUTES covers `/characters` but never `/characters/:id`.

## Genuine strengths (don't "fix")
`Overlay`'s Escape/back-handler/scroll-lock/focus-restore contract; the dirty-close discard confirm
itself; the fail-closed import preview; `HonestNote`; the string-draft pattern
(`crDrafts`/`qtyDrafts`/`hpDraft`); `applyAc`/`setXp`'s explicit empty-field errors routed to their
own control; `NumStepper`'s full spinbutton contract (reuse it for PlayerView's dice modifier).
See [[completion-pass-ux-patterns]], [[ds-layer-audit]], [[player-char-scene-display-cluster]].
