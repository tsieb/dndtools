---
name: char-encounter-cluster
description: Char/encounter cluster (Characters.tsx, CharBuilder.tsx, EncounterBuilder.tsx, charImport, compendium) — FIXED-vs-STILL-OPEN split as of 2026-07-30 @ 329bcc58, plus the exact e2e spec-coupling map
metadata:
  type: project
---

# Char/Encounter cluster — state at HEAD 329bcc58 (2026-07-30, run #4)

`git log` on the three files stops at **b5ed692f** (Characters.tsx only, +8 lines). CharBuilder /
EncounterBuilder last moved at 8e54261d. The DS layer moved under them (Button/IconButton), which
retired two findings without touching the cluster.

## FIXED (do not re-chase)
- **`key={detailId}` on CharacterSheet** — `Characters.tsx:1637`. Guarded by the NEW
  `tests/e2e/character-sheet.spec.ts` (2 tests, `Edit`/`Done` exact names).
- **Wizard phone height** — `Overlay` is `height: phone ? '100%' : 620` (`CharBuilder.tsx:765`).
  Guarded by `authoring-layout.spec.ts:110-140` @ 393×851.
- **Point-buy +/- silent no-op** — `:1832-1857` now pass `aria-disabled` + an explaining `label`.
- **IconButton `variant="outline"` hover** — `ds/components/core/IconButton.jsx:46-49` (all variants
  except `accent` now hover). NumStepper's +/- have feedback.
- **Soft-disable primitive now EXISTS**: `Button.jsx:22-23` / `IconButton.jsx:15-16` — a truthy
  `aria-disabled` keeps the control focusable, dims it, and swallows `onClick`. Any
  "disabled-without-explanation" fix in this cluster is now a one-prop change.
- Older: isPhone guards on class/kit/stats/review/import grids + sheet grids; EncounterBuilder
  string drafts (`qHp/qAc/partySize/partyLevel` `:120-124`, `crDrafts` `:188`); startCombat rolls
  d20+DEX; roster grid `minmax(min(100%,230px),1fr)`; Tabs/tabpanel wiring.

## STILL OPEN — ranked, line numbers verified at 329bcc58

1. **Wizard dialog NEVER receives focus; the trap leaks.** `CharBuilder.tsx:686-731` (`Overlay`
   focus effect, `[]` deps) + three `<Overlay>` returns from ONE component — `:1217` choose,
   `:1272` import, `:1489` scratch, none keyed. React reconciles the same instance across phase
   changes, so the mount-only effect never re-runs. Every wizard entry is a phase change, so
   focus falls to `<body>` when the PathCard unmounts; the Tab handler `:716-722` only wraps at
   first/last node, so the next Tab escapes into the nav behind the scrim. Fix: `key={phase}`.
2. **`NumStepper` `:606-662` +/- only.** No typed entry, no `role="spinbutton"`/`aria-valuenow`,
   no Arrow/Page/Home/End, value `<span>` `:636-645` unassociated. HP `min 1 max 600` `:1958-1966`
   = 249 clicks. Also Level `:1729`, AC `:1947`, Speed `:1970`.
3. **EncounterBuilder quick-add makes a 0-HP monster.** `:217` `Math.max(0,Math.trunc(Number(qHp))||0)`
   → cleared HP field yields maxHp 0; the very next line `:218` falls back to **10** for AC. No
   message. Add button `:468` only checks `qName`.
4. **`Characters.startCombat` renders rejection as success.** `:1657-1681` one `notice` for both
   outcomes; `:1729-1745` accent-tinted `role="status"`, not dismissible, survives sheet
   navigation (Characters isn't unmounted at `:1637`). `Start combat` `:1700` has no busy state.
5. **Phone attack rows are visually indistinguishable.** `:1987` outer column `gap:8` + `:1996-1999`
   two-up phone grid `gap:8` → each attack = 3 rows with the SAME gap as between attacks.
6. **Discard alertdialog `:2323-2373` shares the wizard trap.** `Overlay`'s panel-wide FOCUSABLE
   `:706` lets Tab from "Discard character" `:2367` reach scrim-obscured wizard controls. Missing
   `aria-modal`, missing `aria-describedby` → `:2354`. (autoFocus `:2362` + Escape both work.)
7. **Step change invisible to AT.** `next`/`back` `:914-918`; heading `:1503` is a styled `div`,
   never focused, not an `<h*>`; "Step {i+1} of {n}" `:2302` is inert text; StepRail hidden on
   phone `:1493`.
8. **Disabled-without-explanation** (now trivially fixable, see FIXED): Continue `:2305`
   (`canContinue` `:1486`), Create character `:2312`, `EncounterBuilder.tsx:341` Start combat.
   Name Input `:1548-1554` has no `aria-invalid`/`aria-describedby`.
9. **Error far from its control.** `EncounterBuilder.tsx:350-354` error at the top of an
   `overflowY:auto` Dialog body (`ds/components/overlay/Dialog.jsx:309`) while the button is in the
   fixed footer. Same at `Characters.tsx:617` (writers `applyAc` :396, `declareSlots` :471,
   `setXp` :552).
10. **Last two per-keystroke coercions.** `EncounterBuilder.tsx:554-561` quantity,
    `Characters.tsx:1129-1132` `hpAmount` — both `Number(x)||fallback`, field can't be cleared.
11. **"Apply to kit →" `:1921-1937`** — bare button, `padding:0 border:none font:600 12px` ≈ 15px
    tall (< 24px, WCAG 2.5.8), no hover/active, feedback is a toast only.
12. **No submit lockout.** `create()` `:1120-1128` fires 7–13 dispatches while Cancel `:1504`,
    Back `:2297`, and every Tile stay live. `runImport()` `:1156` leaves Back `:1451` and
    "Choose another file" `:1464` live.
13. **`Tile` `:437-507` has zero hover.** Declares a `transition`, no `onMouseEnter`; no global
    `button:hover` rule exists. Sibling `PathCard` `:543,548-549` is the pattern. Now the ONLY
    inert primitive in the wizard.
14. **Dirty-guard hole.** `dirty` `:922-924` needs `phase==='scratch'`; `back()` at `i===0` sets
    `phase='choose'` `:916`, where header X `:1233` calls `onClose` directly.
15. `role="alert"` on the `<ul>` `:1876` orphans its `<li>`s. `FieldLabel` `:427-434` is a `<span>`
    not a `<label>` (~15 fields, no click-to-focus). `portraitGradient` `:288` hard-codes
    `#2a2117`/`#14100b`.

## VERIFIED NON-DEFECTS (stop re-flagging)
- `role="alertdialog" aria-label` `:2325-2326` does not erase its subtree (dialog roles aren't
  name-from-content).
- `Card interactive` (CharCard `Characters.tsx:172-243`) DOES get `role=button` + `tabIndex=0` +
  Enter/Space — `ds/components/core/Card.jsx:12-25`. Not the Campaign NpcCard problem.
- EncounterBuilder roster picker `:382-434` is genuine multi-select; `aria-pressed` correct.
- `IconButton size="sm"` = 28px; sharing chips `Characters.tsx:1466-1497` ≈ 24px — both pass.
- `Overlay` scrim `onMouseDown` `:737` vs panel `stopPropagation` `:757` — equivalent to Dialog.
- `create()`/`runImport()`/`startImport()` all `setError(null)` first.
- `launch()`'s `rows.length===0` guard (`EncounterBuilder.tsx:235`) is unreachable dead code.
- `app/charImport/**` and `app/compendium/**` are PURE `.ts` modules — zero JSX, no UI surface.
  Their only consumer UI is `screens/Extensions.tsx` (different cluster).
- `<label>` wrappers around DS `Input` in EncounterBuilder `:508,:537,:565` also carry `aria-label`
  on the input; the aria-label wins for the name, the label still gives click-to-focus. Fine.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`, NOT repo-root `tests/`)
Three specs touch this cluster. `equipment.spec.ts` does NOT (it drives `/player`).

| spec:line | selector | source |
|---|---|---|
| authoring-layout:37 | 320px no-h-scroll sweep incl. `/characters` | `Characters.tsx:1782-1795` |
| authoring-layout:62,90,127 | `button name:'New character' exact` | `Characters.tsx:1724`, `:1766` |
| authoring-layout:63,91,128 | `button name:/Build from scratch/` | `CharBuilder.tsx:1247` |
| authoring-layout:65,92,130 | `dialog name:'New character wizard'` | `CharBuilder.tsx:1489` |
| authoring-layout:78 | `button name:'PC' exact` | `Tile` via `KINDS:251` |
| authoring-layout:96 | `button name:'NPC' exact` | `Tile` via `KINDS:252` |
| authoring-layout:79,97 | `getByLabel('Name')` | `:1552` |
| authoring-layout:80 | `getByLabel('Alignment')` | `:1562` |
| authoring-layout:98,99,100 | `button name:'Continue'` | `:2305` |
| authoring-layout:104,105 | `getByLabel('Attack kind')` / `('Damage type')` | `:2015` / `:2045` |
| authoring-layout:133-139 | wizard box height > 0.95 × viewport @393×851 | `Overlay:765` |
| character-sheet:45,47,57 | `button name:'Edit'/'Done' exact` | `Characters.tsx:688-695` |
| character-sheet:80,84 | character name visible in `#main-content` | `:684` h2 |
| a11y-axe-gate:28 | axe on `/characters` (roster only, never `:id`, never the overlay) | — |

Blast-radius rules:
- **Tile → `role="radio"` breaks authoring-layout:78 and :96 only.** Both must change together.
- **Soft-disabling Continue is SPEC-SAFE** if the reason goes in `title` (accessible name stays
  "Continue"). Same for Create character and Start combat.
- **`getByLabel('Name')` survives** adding `aria-invalid`/`aria-describedby`.
- **`key={phase}` on Overlay is SPEC-SAFE** — no spec asserts anything about focus in the wizard.
- **Fixing NumStepper is SPEC-SAFE** — no spec references any stepper label.
- **`EncounterBuilder` still has ZERO e2e.** It renders only from a live DM session and
  `_helpers.ts` has `seedFresh`/`markOnboarded` but no session-start helper. Every fix there is
  unguarded.
- `responsive.spec.ts` covers `/characters` but never `/characters/:id`; findings 1, 12, 14 are
  structurally untested.

## Genuine strengths (don't "fix")
`Overlay`'s Escape/back-handler/scroll-lock/focus-restore contract; the dirty-close discard confirm
itself; the fail-closed import preview that lists unmapped fields; `HonestNote` for core-unbacked
sections; the `crDrafts` string-draft pattern; `applyAc`/`setXp`'s explicit empty-field errors.
See [[completion-pass-ux-patterns]], [[ds-layer-audit]].
