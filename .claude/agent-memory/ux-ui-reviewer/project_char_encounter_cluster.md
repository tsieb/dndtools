---
name: char-encounter-cluster
description: Recurring UX defect classes in the gm-react character/encounter cluster (Characters.tsx, CharBuilder.tsx, EncounterBuilder.tsx) — isPhone-only-partly-applied inline grids, Number(x)||fallback coercion, guards that became dead buttons
metadata:
  type: project
---

Audited 2026-07-29 (static), RE-AUDITED 2026-07-29 same day after commit 5274a5f9 landed ~40
cross-cluster fixes. That commit fixed: CharBuilder standard-array gating, the `stats`/`review`
steps + the ENTIRE `import` phase isPhone grids, EncounterBuilder CR 0.25/0.5 typeability,
Characters.tsx blank AC/XP/slot guards (now explain via setError instead of silently no-op'ing),
Characters.tsx `startCombat` initiative (now rolls d20+DEX, matching EncounterBuilder — item 5
below is RESOLVED). Below is updated to reflect what's STILL present after that pass.

Three defect CLASSES recur across this cluster and are worth
re-checking first on any future pass, because the codebase's styling model makes them easy to
reintroduce.

**Why:** all layout is inline `style={{...}}` with no CSS media queries, so responsiveness is
opt-in per grid via the `isPhone` flag from `useViewport()`. Nothing enforces it, so new grids
ship non-responsive by default.

**How to apply:**

1. **Partly-applied `isPhone`, now down to a residue.** As of 2026-07-29 post-fix: `stats`/
   `review`/`import` in CharBuilder and the sheet's top-level 2-col grid in Characters.tsx are
   fixed. STILL missing, each provably an oversight because a sibling grid in the SAME step/panel
   already got the ternary: CharBuilder `class` step's Subclass-Select+Level-NumStepper row
   (`gridTemplateColumns: '1.4fr 1fr'`, no isPhone — c.f. the identical `1.4fr 1fr` pattern that
   IS isPhone-guarded two steps earlier at the `identity` step); CharBuilder `kit` step's
   "Attacks & actions" row (`minmax(0,1.4fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,1fr)
   minmax(0,1fr) 28px` — 5 inputs + delete button, no isPhone, while the AC/HP/Speed grid right
   above it in the same step IS isPhone-guarded); Characters.tsx sheet's Attacks-editor row
   (`'1fr 1.5fr 28px'`, no isPhone/minmax) and Advancement draft grid (`'1fr 1fr'`, no isPhone) —
   both nested under the now-fixed top-level grid, so the fix didn't propagate inward. Grep
   pattern for a fast sweep: `gridTemplateColumns` lines that contain neither `isPhone` nor
   `auto-fill`/`auto-fit` nor `min(100%`. Note `1fr` == `minmax(auto,1fr)` — form controls (ds
   `Input`/`Select` are `width:100%` but keep their intrinsic min-content) will NOT shrink, so
   these overflow rather than compress; `NumStepper` is `width:'fit-content'` and won't shrink at
   all, making the class-step row the highest-risk of the four.

2. **`Number(x) || fallback` on every keystroke — CR fixed, siblings not.** The commit fixed CR
   (0.25/0.5 now typeable via a string draft + commit-on-blur pattern, see `crDrafts` in
   EncounterBuilder.tsx). STILL present on EncounterBuilder's `qHp`/`qAc`/`partySize`/
   `partyLevel`/quantity fields and Characters.tsx `hpAmount` — clearing the field snaps it to
   0/1 instead of going blank, same class as the fixed CR bug just not carried to siblings.
   Correct shape (now demonstrated in-file by `crDrafts`): hold the field as a STRING in state,
   coerce only on submit/blur.

3. **A guard that fixed a silent-write bug became a silent dead button — fixed for AC/XP/slots.**
   `Characters.tsx` `applyAc`/`setXp`/`declareSlots` now explain via `setError` instead of silently
   returning; `addSpell`'s blank-guard is dead code in practice (its button is
   `disabled={!spellName.trim()}`, so the guard can't fire from the UI) — not a live bug, just
   defensive redundancy. Pattern is now correctly established in-file; watch for NEW fields that
   skip it. CharBuilder's `identity` step is the current gap in the same family: `identityOk`
   (name/owner) only disables Continue with zero inline explanation, unlike the `stats` step which
   lists concrete validation failures via a `role="alert"` `<ul>` right there in the panel.

4. **Single-select rendered as independent `aria-pressed` toggles — CharBuilder Tile only.**
   `CharBuilder`'s `Tile` (kind/race/class/background/visibility) is still individual `<button
   aria-pressed>` elements with no roving tabindex/radiogroup semantics, unlike `screen-kit`'s
   `Seg` (role=radiogroup) and ds `SegmentedControl`, which exist and got their own
   radiogroup-a11y fix in this same commit. CORRECTION to prior note: EncounterBuilder's roster
   picker is NOT this anti-pattern — re-read confirms it's a genuine multi-select (pick any number
   of combatants into the draft), so independent aria-pressed toggle buttons are the *correct*
   primitive there. Don't re-flag it.

5. **RESOLVED 2026-07-29:** `Characters.tsx startCombat` now rolls d20+DEX like
   `EncounterBuilder.launch` always did — the initiative divergence is gone.

6. **NEW: CharBuilder's step-change never moves focus.** `Overlay`'s focus-trap `useEffect`
   (CharBuilder.tsx ~686-731) runs on mount only (`[]` deps) — it focuses the first focusable node
   ONCE when the overlay opens, never again as the wizard's `i` (step index) advances via
   Continue/Back. A screen-reader user gets no announcement that the panel content changed
   step-to-step, and the "Step X of Y" text (~line 2270) is plain text, not a live region.

7. **NEW: Campaign.tsx wraps `NpcCard` in a role=button div instead of passing it `onClick`.**
   `NpcCard` only turns on its own hover border-color transition and `cursor:pointer` when it
   receives an `onClick` prop (`interactive = !!onClick` in NpcCard.jsx); Campaign.tsx's NPC tab
   wraps the card in an outer `<div role="button" onClick=...>` instead, so the card itself keeps
   `cursor:'default'` (set explicitly on the `<article>`, which wins over the ancestor's
   `cursor:pointer`) and never shows a hover state, despite being fully clickable. Fix: pass
   `onClick` through to `NpcCard` itself rather than (or in addition to) wrapping it.

**Coverage gap:** `tests/e2e/responsive.spec.ts` covers `/characters` (the roster) but NOT
`/characters/:id` (the sheet) and never opens the CharBuilder overlay, so every phone-layout defect
in this cluster is structurally untested. See [[completion-pass-ux-patterns]].

**Genuine strengths (don't "fix"):** the CharBuilder `Overlay` a11y contract, the dirty-close
discard confirm, the fail-closed import preview listing unmapped fields, the `HonestNote` pattern
for core-unbacked sections, and `Field`'s auto label/control association (`ds/components/forms/Field.jsx`
generates and injects an id — Field-wrapped inputs do NOT need a manual `aria-label`).
