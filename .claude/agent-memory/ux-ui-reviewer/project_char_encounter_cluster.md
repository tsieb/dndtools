---
name: char-encounter-cluster
description: Recurring UX defect classes in the gm-react character/encounter cluster (Characters.tsx, CharBuilder.tsx, EncounterBuilder.tsx) — isPhone-only-partly-applied inline grids, Number(x)||fallback coercion, guards that became dead buttons
metadata:
  type: project
---

Audited 2026-07-29 (static). Three defect CLASSES recur across this cluster and are worth
re-checking first on any future pass, because the codebase's styling model makes them easy to
reintroduce.

**Why:** all layout is inline `style={{...}}` with no CSS media queries, so responsiveness is
opt-in per grid via the `isPhone` flag from `useViewport()`. Nothing enforces it, so new grids
ship non-responsive by default.

**How to apply:**

1. **Partly-applied `isPhone`.** `CharBuilder.tsx` threads `isPhone` through the `choose` phase
   and the `identity` step, then stops — the `class` / `stats` / `kit` / `bio` / `review` steps and
   the ENTIRE `import` phase use hard `repeat(N,1fr)` / `1fr 1fr` templates and hardcoded
   `28px` gutters. Same shape in `Characters.tsx`: the sheet's two-column grid
   (`minmax(0,1.3fr) minmax(0,1fr)`) never collapses. Grep pattern for a fast sweep:
   `gridTemplateColumns` lines that contain neither `isPhone` nor `auto-fill`/`auto-fit`
   nor `min(100%`. Note `1fr` == `minmax(auto,1fr)` — form controls (ds `Input`/`Select` are
   `width:100%` but keep their intrinsic min-content) will NOT shrink, so these overflow rather
   than compress. The file's own `minmax(0,…)` usages show the authors know the difference.

2. **`Number(x) || fallback` on every keystroke.** Widespread in `EncounterBuilder.tsx`
   (qHp/qAc/partySize/partyLevel/quantity/CR) and `Characters.tsx` (spellLevel/slotLevel/hpAmount).
   Consequences: clearing a field instantly rewrites it; a deliberate `0` becomes the fallback;
   fractional entry is impossible because `Number("0.")` is `0` (this makes CR 0.25/0.5 untypeable).
   Correct shape used elsewhere in the repo: hold the field as a STRING in state, coerce only on
   submit, and surface an inline error rather than snapping.

3. **A guard that fixed a silent-write bug became a silent dead button.** `Characters.tsx`
   `applyAc` / `setXp` / `declareSlots` / `addSpell` early-`return` on blank/invalid input with NO
   feedback — the prior pass's fix for "blank field writes 0" traded data loss for a button that
   does nothing. Whenever you see a comment explaining a `Number('')` trap, check that the guard
   also reports why it refused.

4. **Single-select rendered as independent `aria-pressed` toggles.** `CharBuilder`'s `Tile`
   (kind/race/class/background/visibility) and `EncounterBuilder`'s roster picker. `screen-kit`'s
   `Seg` (role=radiogroup) and ds `SegmentedControl` exist and are the right primitive for the
   mutually-exclusive ones.

5. **Two surfaces disagree about initiative.** `EncounterBuilder.launch` deliberately rolls
   `d20 + DEX` for blank initiative ("so the DM never starts a fight of all-0 initiative");
   `Characters.tsx startCombat` sends `initiative: 0` for the whole party. Cross-surface
   inconsistency of the same domain rule — same failure mode as the divergent-list-filters gotcha
   in [[beta-readiness-audit]].

**Coverage gap:** `tests/e2e/responsive.spec.ts` covers `/characters` (the roster) but NOT
`/characters/:id` (the sheet) and never opens the CharBuilder overlay, so every phone-layout defect
in this cluster is structurally untested. See [[completion-pass-ux-patterns]].

**Genuine strengths (don't "fix"):** the CharBuilder `Overlay` a11y contract, the dirty-close
discard confirm, the fail-closed import preview listing unmapped fields, the `HonestNote` pattern
for core-unbacked sections, and `Field`'s auto label/control association (`ds/components/forms/Field.jsx`
generates and injects an id — Field-wrapped inputs do NOT need a manual `aria-label`).
