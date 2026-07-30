---
name: char-encounter-cluster
description: Char/encounter cluster (Characters.tsx, CharBuilder.tsx, EncounterBuilder.tsx) — FIXED-vs-STILL-OPEN split as of 2026-07-30 @ 0a07165d, plus the exact e2e spec-coupling map for every label a fixer would touch
metadata:
  type: project
---

# Char/Encounter cluster — state as of 2026-07-30 (HEAD 0a07165d)

`git log` on the three files stops at **8e54261d**. The two newest commits (8138156b,
0a07165d) did **not** touch this cluster, so nothing below moved since the fc40e764 re-audit
except line numbers.

## FIXED (do not re-chase)
- isPhone residues from the original note: class-step `1.4fr 1fr` (`CharBuilder.tsx:1706`),
  kit-step attacks row (`:1977-1979`), stats/review/import grids, Characters sheet top-level
  grid (`:696`) and attacks row (`:868`) — all phone-guarded now.
- EncounterBuilder `qHp`/`qAc`/`partySize`/`partyLevel` are STRING drafts (`:120-124`),
  coerced only in `quickAdd`/`launch`. CR drafts (`crDrafts`, `:184-191`) are the reference
  pattern.
- `Characters.startCombat` rolls d20+DEX (`:1668-1670`).
- Roster grid uses `minmax(min(100%,230px),1fr)` (`Characters.tsx:1773`) — 320px-safe.
- Tabs/tabpanel wiring on the roster (`tabPanelProps('characters', kind)`, `:1742`).

## STILL OPEN — ranked, with 2026-07-30 line numbers
1. **`Characters.tsx:1632` CharacterSheet is not keyed by `id`.** `<CharacterSheet id={detailId}>`
   with no `key`; there is **no `useEffect` on `id`** anywhere in the component (verified by awk
   over 273-1595). ⌘K (`app/CommandPalette.tsx:136`) navigates sheet→sheet without unmounting, so
   `shareDraft`/`attackRows`/`acDraft`/`xpInput`/`error`/`editMode` carry over. `applySharing`
   (`:516`) and `saveAttacks` (`:493`) both send `characterId: id` (the NEW id) with the OLD
   character's payload ⇒ real cross-character overwrite. Fix = add `key={detailId}`.
2. **`CharBuilder.tsx:761` `height: 620` is unconditional.** Everything else in `Overlay` goes
   full-bleed on phone (`borderRadius: phone ? 0 : 18` `:766`; zero padding `:746-748`), so on the
   e2e `mobile-chromium` device (Pixel 5, 393×851) the wizard is a square-cornered 620px slab with
   ~115px of scrim above and below. The 320×640 spec can't see it (620/640).
3. **`NumStepper` (`:606-662`) still +/- only.** No text input, no `role="spinbutton"`, no
   Arrow/Page/Home/End, and the value `<span>` (`:636-645`) is not associated with the buttons.
   Worst: HP `min 1 max 600 step 1` (`:1939-1947`) = 249 clicks to 250. Also Level `:1725`,
   AC `:1928`, Speed `:1951`. Targets are fine (IconButton `sm` = 1.75rem = 28px).
4. **`CharBuilder.tsx:1830-1838` point-buy Raise silently no-ops.** `onClick={() => { if
   (!raiseBlocked(k)) setScore(...) }}` with no `disabled`/`aria-disabled`/opacity. Minus
   (`:1823-1829`) clamps at `scoreMin` the same way. Enabled-looking dead buttons.
5. **Discard alertdialog `:2304-2354`** — inside the wizard panel, so `Overlay`'s panel-wide
   `FOCUSABLE` query (`:706`) lets Tab from "Discard character" walk into the scrim-obscured
   wizard. Missing `aria-modal`, missing `aria-describedby` → `:2335`. (`autoFocus` on
   "Keep editing" `:2343` and Escape both work.)
6. **Wizard step change invisible to AT.** `next`/`back` `:910-914`; `Overlay` focus effect
   `:686-731` has `[]` deps; "Step {i+1} of {STEPS.length}" `:2282-2284` is plain text; the step
   heading `:1499` is a styled `div`, never focused, not an `<h*>`.
7. **`Characters.tsx:1673-1677` + `:1725-1740`** — `startCombat` writes both the success string and
   the core rejection into one `notice`, rendered in an accent-tinted `role="status"` box. Failure
   and success are pixel-identical, polite not assertive, and the notice is never dismissible.
8. **Disabled-without-explanation:** `CharBuilder` `canContinue` `:1482` → Continue `:2286`
   (no `aria-invalid`/`aria-describedby` on Name `:1544-1550` either); `EncounterBuilder.tsx:337`
   Start combat on `rows.length === 0`. Contrast with the stats step's `role="alert"` `<ul>`
   `:1856-1872`. Fix pattern = `Button.jsx:23-25` soft `aria-disabled` + `title`.
9. **Error rendered far from the control that sets it.** `Characters.tsx:617` `role="alert"` sits
   directly under BackBar while `applyAc` `:396`, `declareSlots` `:477`, `setXp` `:552` live deep
   in the edit-mode panels. Same shape in `EncounterBuilder.tsx:346-350` (error at top of the
   scrolling Dialog body, Start combat in the sticky footer).
10. **`EncounterBuilder.tsx:550-557`** — last `Number(x)||fallback` in that file (quantity snaps to
    1 on backspace). `Characters.tsx:1129-1132` `hpAmount` is the last one in that file.
11. **No hover on the two most-clicked primitives.** `Tile` `:455-472` has a `transition` but no
    `onMouseEnter` (its sibling `PathCard` `:543,548-549` does). `IconButton.jsx:37` gates hover on
    `variant === 'ghost'`, so every `variant="outline"` IconButton — NumStepper's +/- and the
    point-buy +/- — has zero pointer feedback.
12. **No submit lockout.** `create()` `:1116-1124` only disables the primary button (`:2293`); the
    PC path fires 7–13 sequential dispatches while Cancel `:1500`, Back `:2278` and every tile stay
    live ⇒ a half-built character.
13. **Dirty-guard hole.** `dirty` (`:918-920`) requires `phase === 'scratch'`; `back()` on step 0
    sets `phase='choose'` (`:912`), where the header X (`:1229`) calls `onClose` directly. Type a
    name → Back → X = silent loss.
14. `portraitGradient` `:288` hard-codes `#2a2117`/`#14100b` (used `:1627`, `Characters.tsx:183`).
15. `FieldLabel` `:427-434` renders a `<span>`, not `<label>` — ~15 builder fields have no
    click-to-focus (ds `Field` does auto-associate; this local helper doesn't).
16. `role="alert"` on the `<ul>` at `:1857` orphans its `<li>`s — wrap a `<div role="alert">`.
17. Footer `:2269-2277` has no `flexWrap` and the Back label is the previous step's title
    (`:2279`), so at 320px it wraps to multiple lines (`Button` is `whiteSpace:'normal'`, so it
    wraps rather than clipping — not a blocker).

## VERIFIED NON-DEFECTS (stop re-flagging)
- The discard `role="alertdialog" aria-label` (`:2306-2307`) does **not** erase its subtree —
  dialog roles are not name-from-content. Grep confirmed **no** `role=X + aria-label wrapping
  content` shape anywhere in the three files.
- EncounterBuilder roster picker (`:382-422`) is genuine multi-select; `aria-pressed` is correct.
- `IconButton size="sm"` = 28px, sharing chips (`Characters.tsx:1484-1495`) ≈ 27px — both pass 2.5.8.
- `Overlay`'s scrim `onMouseDown` (`:737`) lacks a `target === currentTarget` check but the panel
  stops propagation (`:757`) — equivalent to Dialog's guard.
- Global `:focus-visible` ring exists — `src/styles/tokens/base.css:35-36`.
- `launch()`'s `rows.length === 0` guard (`EncounterBuilder.tsx:231-234`) is unreachable dead code.
- `create()`/`runImport()`/`startImport()` all `setError(null)` first — no stale error on retry.
- `saveName` `:429`, `setCondition` `:411`, `addSpell` `:461` early-returns are all behind disabled
  buttons or revert visibly — defensive, not live bugs.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`, NOT repo-root `tests/`)
`authoring-layout.spec.ts` is the ONLY spec that touches this cluster. Exact couplings:

| spec line | selector | source |
|---|---|---|
| 39 | route sweep incl. `/characters` @320px no-h-scroll | `Characters.tsx:1768-1780` |
| 62, 90 | `getByRole('button',{name:'New character',exact:true})` | `Characters.tsx:1720`, `:1762` |
| 63, 91 | `getByRole('button',{name:/Build from scratch/})` | `CharBuilder.tsx:1243` |
| 65, 92 | `getByRole('dialog',{name:'New character wizard'})` | `CharBuilder.tsx:1485` |
| 78 | `getByRole('button',{name:'PC',exact:true})` | `Tile` via `KINDS` `:251` |
| 96 | `getByRole('button',{name:'NPC',exact:true})` | `Tile` via `KINDS` `:252` |
| 79, 97 | `getByLabel('Name')` | `:1548` |
| 80 | `getByLabel('Alignment')` | `:1558` |
| 98,99,100 | `getByRole('button',{name:'Continue'})` | `:2286` |
| 104, 105 | `getByLabel('Attack kind')` / `getByLabel('Damage type')` | `:1996` / `:2026` |

Blast radius rules that follow:
- **Tile → `role="radio"` breaks spec lines 78 and 96 only.** Nothing else in `tests/e2e/` matches
  "PC"/"NPC" as a button. Both lines must change in the same commit.
- **Soft-disabling Continue is spec-safe** if the explanation goes in `title` (accessible name
  stays "Continue"). Appending to `aria-label` also survives (Playwright name match is substring),
  but `title` is the safer route.
- **`getByLabel('Name')` survives** adding `aria-invalid`/`aria-describedby`.
- **`EncounterBuilder` has ZERO e2e** — it only renders from a live DM session and `_helpers.ts`
  has `seedFresh`/`markOnboarded` but no session-start helper. Any fix there is unguarded.
- `responsive.spec.ts` covers `/characters` but never `/characters/:id` and never opens the
  builder overlay, so items 1, 2, 12 and 13 above are structurally untested.

## Genuine strengths (don't "fix")
`Overlay`'s Escape/back-handler/scroll-lock/focus-restore contract, the dirty-close discard confirm
itself, the fail-closed import preview that lists unmapped fields, `HonestNote` for core-unbacked
sections, and the `crDrafts` string-draft pattern. See [[completion-pass-ux-patterns]],
[[ds-layer-audit]].
