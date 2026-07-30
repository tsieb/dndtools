---
name: char-encounter-cluster
description: Char/encounter cluster (Characters.tsx, CharBuilder.tsx, EncounterBuilder.tsx, charImport, compendium) — FIXED-vs-STILL-OPEN split re-verified 2026-07-30 @ 8fa95d31 (run #10), plus the e2e spec-coupling map
metadata:
  type: project
---

# Char/Encounter cluster — state at HEAD 8fa95d31 (2026-07-30, run #10)

Cluster moved again in `c93c5206` + `a9142f7f` (+`8fa95d31` for EncounterBuilder). Characters.tsx is now
**1868 lines** (was ~2400 — the old line numbers in run-#4 notes are dead). CharBuilder 2459,
EncounterBuilder 709.

## FIXED since run #4 (do not re-chase)
- **`key={phase}` on all three `<Overlay>`s** — `CharBuilder.tsx:1280` (`key="choose"`), `:1335`
  (`key="import"`), `:1562` (`key="scratch"`). The mount-only focus effect (`:749`, `[]` deps) now
  re-runs on every phase change; the wizard receives focus and the trap holds.
- **`NumStepper` is a real spinbutton** — `:682-704`: `role="spinbutton"` + `aria-valuenow/min/max`,
  typed entry, Arrow/Page/Home/End (`:656-667`), soft-disabled +/- with explaining `title`
  (`:705-722`). HP no longer needs 249 clicks.
- **`Tile` hover** (`:457,473-474`) and **PathCard hover** (`:549`) both live.
- **"Apply to kit →"** is now a real `Button variant=ghost size=sm` (`CharBuilder.tsx:1996-2005`).
- **Point-buy +/- explain themselves** (`:1905-1930`, `aria-disabled` + reason in `label`).
- **Phone slab height** `height: phone ? '100%' : 620` (`:828`).
- **Blocked Continue/Create character/Start combat carry `aria-disabled` + `title`** (`:2376-2377`,
  `:2387-2394`, `EncounterBuilder.tsx:363-368`). Partly a fix, partly a NEW defect — see OPEN #3.
- **`Characters.startCombat` renders refusal as refusal** — `:1721-1725` two-tone `notice`, `role`
  flips alert/status, dismissible (`:1795-1801`).
- **Per-field validation routing** on the sheet — `error.field` + `fieldError()` (`:283-296`), used at
  `:1108` (xp), `:1192` (ac), `:1423` (slots).
- **`hpDraft` string draft + `typedHpAmount()`** (`:297-315`) — Damage/Heal use what's TYPED (no blur
  needed on touch).
- **EncounterBuilder**: quick-add HP floors at 1 (`:232`), `qtyDrafts` (`:191-199`) + `crDrafts`
  (`:201-208`) both reset on open (`:153-154`), `backdropDismissible={rows.length===0}` (`:350`).
- **DS `DataTable` now HAS the `overflowX:auto` wrapper** (`DataTable.jsx:16`) — the Attacks table on
  `/characters/:id` no longer overflows. Stop citing that one.
- `key={detailId}` on CharacterSheet (`Characters.tsx:1680`).

## STILL OPEN — ranked, line numbers verified at 8fa95d31

1. **`CharBuilder.create()` `:1183-1191` has NO try/catch/finally.** `setSubmitting(true)` → ~13
   awaited dispatches → `setSubmitting(false)`. `SceneRuntime.dispatchNow` **rethrows** on persist
   failure (`runtime/SceneRuntime.ts:482`), so one storage error freezes the wizard on "Creating…"
   with the primary permanently `disabled` and NO message. Only escape is Cancel = lose everything.
   `runImport()` `:1219-1275` and `EncounterBuilder.launch()` `:249-333` have `try/finally` but still
   no `catch` → button un-freezes, still zero feedback.
2. **`Characters.tsx:903` phone attack-editor grid declares 2 tracks for 3 children.**
   `isPhone ? 'minmax(0,1fr) 28px' : '1fr 1.5fr 28px'`, children = Name Input, Detail Input,
   remove IconButton (`:908-934`, no `gridColumn` on any). Auto-placement puts **Detail into the
   28px track** and the remove button alone on row 2. Fix: `'minmax(0,1fr) 28px'` + `gridColumn:'1 / -1'`
   on the Detail input, or a 3-row phone stack.
3. **Soft-disabled primaries are silent on touch.** `ds/Button.jsx:25-26` strips `onClick` when
   `aria-disabled` is truthy, so the refusal lives ONLY in `title` (hover-only) — no visible inline
   error. Worst at `CharBuilder.tsx:2372-2381` Continue: empty Name on a phone ⇒ tap does literally
   nothing, no message anywhere on screen. `EncounterBuilder.tsx:356-372` is milder (the body says
   "Nothing picked yet."), but its `launch()` `rows.length===0` branch `:250-253` is now unreachable
   dead code. Fix: render `blockedReason` as a visible `role="alert"` near the blocked field +
   `aria-describedby`.
4. **`Characters.tsx:1093-1100` `Level up (XP)` is hard-`disabled` with zero explanation** — while
   `Player.tsx:2045-2049` renders `xpEligible.message` for the SAME eligibility object. Copy it.
   Same class: `Save choices` `:1052-1059` (`hasAdvancementChoice`).
5. **Edit→Done silently discards drafts.** `Characters.tsx:714-718` `setEditMode(v=>!v)` also does
   `setAttackRows(null)` + `setShareDraft(null)`. Typed-but-unsaved attack rows / a composed sharing
   list vanish with no confirm, no undo.
6. **The sheet has ZERO success feedback.** No `role="status"` anywhere in `Characters.tsx`
   (only `role="alert"` at `:287`, `:652`, and the `notice` at `:1775`). Damage/Heal/Set AC/Add
   spell/Set slots/Save attacks/Apply sharing/Set XP/commit-advancement all succeed silently.
   `Player.tsx:475-477`'s `hpNote` visually-hidden `role="status"` is the in-repo pattern.
7. **PC path is a dead end with no players.** `CharBuilder.tsx:1654-1666` swaps the owner `Select`
   for a `HonestNote` when `players.length===0`, but `blockedReason` `:1555` still tells the user to
   "choose who plays it" with no control to do it. Either link to Settings or drop the PC tile.
8. **Discard alertdialog `:2405-2455` shares the wizard's Tab trap.** Rendered inside the Overlay
   panel, so the panel-wide `FOCUSABLE` sweep (`:769`) lets Tab from "Discard character" `:2449`
   reach scrim-obscured wizard controls. No `aria-modal`, no `aria-describedby` → `:2436`.
   (autoFocus `:2444` + Escape do work.)
9. **Step change invisible to AT.** `next`/`back` `:977-981` move no focus; the step title `:1576`
   is a styled `div`, never an `<h*>`, never focused; "Step {i+1} of {n}" `:2369-2371` is inert text;
   StepRail is hidden on phone `:1566`.
10. **Sub-24px pill toggles (WCAG 2.5.8).** `Characters.tsx:1325-1344` Prepared/Not prepared
    (`padding:'3px 9px'`, `font:11px` ⇒ ~21px tall). Same shape in `Player.tsx:1129-1144` (Equip) and
    `:2418-2439` (Shared/Private). The Sharing player chips `Characters.tsx:1524-1535`
    (`4px 10px`/12px ⇒ ~24px) are the borderline-OK version.
11. **No submit lockout in the wizard.** During `submitting`, Cancel `:1577`, Back `:2365` and every
    Tile stay live; the import phase keeps Back `:1514` and "Choose another file" `:1527` live.
12. **Phone attack rows are unlabelled per-row.** `CharBuilder.tsx:2071-2127`: five inputs whose
    `aria-label`s are the generic "Attack name/kind/to-hit/damage" repeated identically for every
    attack, plus `label="Remove attack"` with no attack name. On the 2-up phone grid the remove
    button also lands next to "Damage type", not next to the name.
13. **Errors far from their control.** `EncounterBuilder.tsx:377-381` sits at the top of the
    `overflowY:auto` Dialog body while Start combat is in the fixed footer;
    `CharBuilder.tsx:1487-1500` (import) same shape; `Characters.tsx:651-655` renders unrouted
    rejections above the fold while the writer may be in the bottom-right panel.
14. Smaller, all re-verified: `role="alert"` on the `<ul>` `CharBuilder.tsx:1949` orphans its `<li>`s;
    the point-buy "points left" pill `:1848-1862` is not a live region (and its `pointsLeft<0`
    error colour is unreachable); `FieldLabel` `:427-434` is a `<span>` not a `<label>` (~15 fields);
    `portraitGradient` `:288` hard-codes `#2a2117`/`#14100b` so every roster card gets a dark brown
    band in light/parchment; `Characters.declareSlots`'s `:511-514` empty guard is dead because
    "Set slots" `:1418` is hard-disabled on the same condition; `startCombat` `:1699` has no busy
    state (double-click ⇒ second dispatch rejected) and its `notice` survives navigating into a sheet
    and back; `CharBuilder`'s `error` is not cleared by `back()` so a stale create error re-appears
    when you return to the review step; the initiative field `EncounterBuilder.tsx:551` allows `-`
    anywhere ("1-2").

## VERIFIED NON-DEFECTS (stop re-flagging)
- `role="alertdialog" aria-label` `:2407-2408` does not erase its subtree.
- `Card interactive` (CharCard) gets `role=button`+`tabIndex`+Enter/Space from `ds/Card.jsx:12-25`.
- `Seg` (`app/screen-kit.tsx:147-200`) is a correct radiogroup with roving tabindex + Arrow/Home/End.
- `Icon name="UserCircle"` IS registered (`ds/Icon.jsx:506`) — Join's icon is not a fallback Square.
- `DataTable` overflow wrapper exists (see FIXED).
- EncounterBuilder roster picker `:413-453` is genuine multi-select; `aria-pressed` correct; rows are
  ~29px tall.
- `<label>` wrappers around DS `Input` in EncounterBuilder `:535,:564,:594` also carry `aria-label`;
  aria-label wins for the name, the label still gives click-to-focus. Fine.
- `app/charImport/**` and `app/compendium/**` are PURE `.ts` — no UI surface.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`)
**EncounterBuilder NOW HAS COVERAGE** — `command-palette.spec.ts:98-155` (three tests). It is no
longer unguarded.

| spec:line | selector | source |
|---|---|---|
| authoring-layout:37 | 320px no-h-scroll sweep incl. `/characters` | roster grid `Characters.tsx:1836` |
| authoring-layout:62,90,127 | `button name:'New character' exact` | `Characters.tsx:1768`, `:1825` |
| authoring-layout:63,91,128 | `button name:/Build from scratch/` | `CharBuilder.tsx:1310` |
| authoring-layout:65,92,130 | `dialog name:'New character wizard'` | `CharBuilder.tsx:1562` |
| authoring-layout:78,96 | `button name:'PC'/'NPC' exact` | `Tile` via `KINDS` |
| authoring-layout:79,97 | `getByLabel('Name')` | `CharBuilder.tsx:1625` |
| authoring-layout:80 | `getByLabel('Alignment')` | `:1635` |
| authoring-layout:98-100,131-133 | `button name:'Continue'` (always AFTER filling Name) | `:2373-2381` |
| authoring-layout:104,105 | `getByLabel('Attack kind')` / `('Damage type')` | `:2083` / `:2113` |
| authoring-layout:133-139 | wizard box height > 0.95 × viewport @393×851 | `Overlay:828` |
| character-sheet:45,47,57 | `button name:'Edit'/'Done' exact` | `Characters.tsx:710-721` |
| command-palette:110 | `dialog name:'Build encounter'` | `EncounterBuilder.tsx:339` |
| command-palette:125,149-155 | `Start combat` must keep `aria-disabled="true"` + `title` matching `/combatant/i` AND stay natively enabled + focusable | `EncounterBuilder.tsx:356-372` |
| command-palette:127-129 | `getByLabel('Quick add'/'HP' exact)`, `button 'Add' exact` | `:465-499` |
| command-palette:132,138-141 | `getByLabel('Bandit quantity')`, blank-then-retype | `:579` |
| command-palette:145 | `button name:/from the draft$/` | `:640` |
| a11y-axe-gate:28 | axe on `/characters` (roster only) | — |

Blast-radius rules:
- **Do NOT convert EncounterBuilder's Start combat to hard `disabled`** — command-palette:151 asserts
  `el.disabled === false`. Add a VISIBLE reason instead of changing the disable mechanism.
- **Tile → `role="radio"` breaks authoring-layout:78 and :96 together.**
- `getByLabel('Name')` survives adding `aria-invalid`/`aria-describedby`.
- Enlarging the Prepared/Equip/Shared pills is spec-safe (equipment.spec.ts:102 matches on name only).
- `responsive.spec.ts` covers `/characters` but never `/characters/:id` — OPEN #2 and #5 are
  structurally untested.

## Genuine strengths (don't "fix")
`Overlay`'s Escape/back-handler/scroll-lock/focus-restore contract; the dirty-close discard confirm
itself; the fail-closed import preview listing unmapped fields; `HonestNote`; the string-draft
(`crDrafts`/`qtyDrafts`/`hpDraft`) pattern; `applyAc`/`setXp`'s explicit empty-field errors routed to
their own control. See [[completion-pass-ux-patterns]], [[ds-layer-audit]].
