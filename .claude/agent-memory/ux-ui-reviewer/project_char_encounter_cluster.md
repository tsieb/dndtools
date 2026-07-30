---
name: char-encounter-cluster
description: Char/encounter cluster (Characters.tsx, CharBuilder.tsx, EncounterBuilder.tsx, charImport, compendium) — FIXED-vs-STILL-OPEN split re-verified 2026-07-30 @ 9aeebdde (run #11), plus the e2e spec-coupling map
metadata:
  type: project
---

# Char/Encounter cluster — state at HEAD 9aeebdde (2026-07-30, run #11)

Line counts at HEAD: `Characters.tsx` 1873, `CharBuilder.tsx` 2470, `EncounterBuilder.tsx` 709.
Cluster last moved in `7bdf2908` (Characters + CharBuilder) and `8fa95d31` (EncounterBuilder).

## FIXED since run #10 (do not re-chase)
- **`CharBuilder.create()` now has `try/catch/finally`** (`:1183-1202`). The frozen-"Creating…" wizard
  is dead. `runImport()` `:1230-1286` and `EncounterBuilder.launch()` `:249-333` still have
  `try/finally` with **no catch** — see OPEN #1.
- **Phone attack-editor grid fixed** — `Characters.tsx:916` puts `gridColumn:'1 / -1'` on the Name
  input, so row 1 is Name and row 2 is Detail + remove. Stop citing the 2-tracks/3-children bug.
- Everything in run #10's FIXED list still holds (`key={phase}` Overlays, `NumStepper` spinbutton,
  Tile/PathCard hover, point-buy soft-disable + reasons, phone slab height, `key={detailId}`,
  per-field validation routing, `hpDraft`/`typedHpAmount`, `crDrafts`/`qtyDrafts` reset,
  `backdropDismissible`, quick-add HP floor of 1, DataTable overflow wrapper).

## STILL OPEN — ranked, line numbers verified at 9aeebdde

1. **No `catch` on any dispatch in `Characters.tsx`.** `dispatch()` `:403-411` and `startCombat()`
   `:1704-1731` both `await runtime.dispatch` bare. `SceneRuntime.dispatchNow` **rethrows** on a
   failed durable write, and `dispatch()` calls `setError(null)` FIRST — so a storage failure loses
   both the write and the previous message. `startCombat` also has no busy state (double-click ⇒ the
   second dispatch is rejected). `EncounterBuilder.launch()` `:256-332` and `CharBuilder.runImport()`
   `:1234-1285` un-freeze their buttons but still render nothing.
2. **`EncounterBuilder` start mode ORPHANS an encounter on every retry.** `:284-328`:
   `encounter.build` succeeds → `combat.start` is rejected → `setError` + return with the dialog
   open. Pressing Start combat again re-runs `encounter.build`, minting a second durable encounter.
   No UI deletes them. Hold the built `encounterId` and skip the rebuild (invalidate on roster edit).
3. **`Characters.tsx:714-718` Edit→Done silently discards drafts** — `setEditMode(v=>!v)` also does
   `setAttackRows(null)` + `setShareDraft(null)`.
4. **`Characters.tsx` announces NO successful write.** Only live regions: `role="alert"` `:287`,
   `:652`, and the roster `notice` `:1780`. Damage/Heal/Set AC/Add condition/rename/toggle
   prepared/Set slots/Save attacks/Apply sharing/Set XP/Finish level-up are all silent.
   `Player.tsx:475-477` is the in-repo pattern.
5. **`Characters.tsx:1778-1808` the notice `role="status"` MOUNTS WITH its text** ⇒ the polite region
   is unreliably announced. Only the error branch (`role="alert"`) works.
6. **Zero hover feedback on hand-rolled buttons.** VERIFIED: `grep -rn ":hover" --include=*.css`
   over `apps/gm-react/src` returns **nothing**. 15 of 17 inline-styled `<button>`s in this cluster +
   the player cluster have no pointer feedback. Here: `Characters.tsx:249` (breadcrumb Back), `:1330`
   (Prepared pill), `:1517` (sharing chips); `EncounterBuilder.tsx:413` (roster picker).
   `Characters.tsx:1590` (Mentioned-in) is the only one with handlers.
7. **`Characters.tsx:1098-1105` "Level up (XP)" is hard-`disabled` with no reason** while
   `Player.tsx:2057-2059` renders `xpEligible.message` for the SAME `EligibilityResult`. Same at
   `:1057-1064` ("Save choices" / `hasAdvancementChoice`).
8. **`EncounterBuilder` focus dies on its two most-used controls.** `:491-499` Add is hard-`disabled`
   on `!qName.trim()` and `quickAdd()` clears `qName` `:241` ⇒ the button disables itself under
   focus. `:638-644` per-row Remove unmounts itself.
9. **`EncounterBuilder` has no `role="status"`.** "Combatants · N" `:504` is inert, so Quick add /
   roster toggles announce nothing; `error` `:377-381` sits at the top of the scrolling Dialog body
   while Start combat is in the fixed footer.
10. **`CharBuilder` step change is invisible.** `next`/`back` `:977-981` move no focus; the step title
    `:1587` is a styled `div` never an `<h*>`; "Step i of n" `:2380-2382` is inert; StepRail is
    desktop-only `:1577`.
11. **`CharBuilder` blocked Continue is a dead button on touch.** `:2383-2392` + `:2394-2409` —
    `aria-disabled` makes `ds/Button.jsx:25-26` strip `onClick`, refusal lives only in `title`.
    Name Input `:1632-1638` has no `aria-invalid`/`aria-describedby`.
12. **Sub-24px pills (WCAG 2.5.8).** `Characters.tsx:1330-1349` Prepared/Not prepared
    (`3px 9px` + 11px ⇒ ~21px). `Player.tsx:1137` was fixed in `7bdf2908` to
    `padding:'6px 10px'; minHeight:24; boxSizing:'border-box'` — copy those three lines.
13. **`CharBuilder.tsx:2416-2466` discard alertdialog shares the wizard's Tab trap.** Inside
    `panelRef`, so `Overlay`'s sweep `:769-771` (filtered only on `offsetParent !== null`) lets Tab
    leak to scrim-obscured wizard controls. No `aria-modal`, no `aria-describedby` → `:2447`.
14. **`CharBuilder` `dirty` `:985-987` requires `phase === 'scratch'`**, but `back()` `:979` at step 0
    sets `phase:'choose'` ⇒ a typed name is discardable with no confirm.
15. **No submit lockout in the wizard.** Cancel `:1588`, Back `:2376`, every Tile stay live during
    `submitting`; import phase keeps Back `:1525` + "Choose another file" `:1538` live.
16. **`CharBuilder.tsx:288` `portraitGradient` hard-codes `#2a2117`/`#14100b`** ⇒ dark brown slab on
    every roster card (`Characters.tsx:183`) in light/parchment. And the "Portrait tone" slider
    `:1729-1737` only rotates that fixed gradient's ANGLE — it changes no colour.
17. Smaller, re-verified: `role="alert"` on the `<ul>` `:1959-1961`; points-left pill `:1859-1873`
    is not a live region and its `pointsLeft<0` colour `:1864` is unreachable (`raiseBlocked`
    `:1005-1009`); `FieldLabel` `:427-434` is a `<span>` not a `<label>` (~15 fields); phone attack
    rows `:2067-2140` repeat identical `aria-label`s and put Remove next to *Damage type*;
    `Characters.declareSlots` `:508-514` empty guard is dead (`:1420-1427` hard-disabled on the same
    condition, so `fieldError('slots')` `:1428` can never render); `Characters` `notice` survives
    navigating into a sheet and back (the component stays mounted through the `:1684` early return);
    rename `:668-693` drops focus to `<body>` on Enter/Escape; `CharBuilder` `error` isn't cleared by
    `back()`; PC-with-no-players `:1654-1677` vs `blockedReason` `:1565-1566` is a dead end;
    `EncounterBuilder` quick-add HP `min={0}` `:478` vs the floor of 1 `:232`; initiative `:551`
    allows `-` anywhere ("1-2").

## VERIFIED NON-DEFECTS (stop re-flagging)
- `ds/IconButton.jsx` DOES swallow the click on truthy `aria-disabled` (`soft`/`inert`, line ~17),
  so the equipment `×0` soft-disable is a real block, not a lie.
- `role="alertdialog" aria-label` `:2418-2419` does not erase its subtree.
- `Card interactive` (CharCard) gets role/tabIndex/Enter-Space from `ds/Card.jsx:12-25`.
- `Seg` (`app/screen-kit.tsx:147-200`) is a correct radiogroup with roving tabindex.
- `Icon name="UserCircle"` is registered.
- EncounterBuilder roster picker `:413-453` is genuine multi-select; `<label>` wrappers at
  `:535,:564,:594` are fine (aria-label wins for the name, the label still gives click-to-focus).
- `app/charImport/**` and `app/compendium/**` are PURE `.ts` — no UI surface.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`)
| spec:line | selector | source |
|---|---|---|
| authoring-layout:37 | 320px no-h-scroll sweep incl. `/characters` | roster grid `Characters.tsx:1841` |
| authoring-layout:62,90,127 | `button 'New character' exact` | `Characters.tsx:1773`, `:1830` |
| authoring-layout:63,91,128 | `button /Build from scratch/` | `CharBuilder.tsx:1321` |
| authoring-layout:65,92,130 | `dialog 'New character wizard'` | `CharBuilder.tsx:1573` |
| authoring-layout:78,96 | `button 'PC'/'NPC' exact` | `Tile` via `KINDS` |
| authoring-layout:79,97 | `getByLabel('Name')` | `CharBuilder.tsx:1636` |
| authoring-layout:98-100,131-133 | `button 'Continue'` (ALWAYS after filling Name) | `:2383-2392` |
| authoring-layout:104,105 | `getByLabel('Attack kind')` / `('Damage type')` | `:2094` / `:2124` |
| character-sheet:45,47,57 | `button 'Edit'/'Done' exact` — toggled with NO drafts open | `Characters.tsx:710-721` |
| character-sheet:94-121 | "Set AC" blank ⇒ `role=alert` within 80px of the button | `:1194`, `:1197` |
| command-palette:110 | `dialog 'Build encounter'` | `EncounterBuilder.tsx:339` |
| command-palette:125,149-155 | Start combat keeps `aria-disabled="true"` + `title` /combatant/i AND `el.disabled === false` | `:356-372` |
| command-palette:126-129 | `getByLabel('Quick add' exact)`, `button 'Add' exact` | `:465-499` |
| command-palette:132,138-141 | `getByLabel('Bandit quantity')`, blank-then-retype | `:579` |
| command-palette:145 | `button /from the draft$/` | `:640` |
| a11y-axe-gate:28 | axe on `/characters` (roster only) | — |

Blast-radius rules:
- **Do NOT convert EncounterBuilder's Start combat to hard `disabled`** — command-palette:151 asserts
  `el.disabled === false`. Add a VISIBLE reason instead of changing the mechanism. Same rule for
  CharBuilder's Continue.
- **Tile → `role="radio"` breaks authoring-layout:78 and :96 together.**
- A confirm gated on `attackRows || shareDraft` is SPEC-SAFE — character-sheet only toggles Edit/Done
  with nothing open.
- `getByLabel('Name')` survives adding `aria-invalid`/`aria-describedby`.
- Enlarging the Prepared/sharing pills is spec-safe.
- `responsive.spec.ts` covers `/characters` but never `/characters/:id`.

## Genuine strengths (don't "fix")
`Overlay`'s Escape/back-handler/scroll-lock/focus-restore contract; the dirty-close discard confirm
itself; the fail-closed import preview listing unmapped fields; `HonestNote`; the string-draft
(`crDrafts`/`qtyDrafts`/`hpDraft`) pattern; `applyAc`/`setXp`'s explicit empty-field errors routed to
their own control; `NumStepper`'s full spinbutton contract (reuse it, e.g. for PlayerView's dice
modifier). See [[completion-pass-ux-patterns]], [[ds-layer-audit]].
