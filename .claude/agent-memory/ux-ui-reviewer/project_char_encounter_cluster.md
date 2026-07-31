---
name: char-encounter-cluster
description: Char/encounter cluster (Characters.tsx, CharBuilder.tsx, EncounterBuilder.tsx) — FIXED-vs-STILL-OPEN split re-verified 2026-07-31 @ 98e0211f (run #22), plus the e2e spec-coupling map
metadata:
  type: project
---

# Char/Encounter cluster — state at HEAD 98e0211f (2026-07-31, run #22)

Line counts at HEAD: `Characters.tsx` 1950, `CharBuilder.tsx` 2470, `EncounterBuilder.tsx` 734.
**`98e0211f` touched Characters.tsx (+21/-2) only.** `CharBuilder.tsx` has NOT changed since run #11
and `EncounterBuilder.tsx` not since `33651613`, so those items are open verbatim.

## FIXED at 98e0211f — do not re-chase
- **run #20 OPEN #1 — Damage/Heal LIE at the HP boundaries.** `Characters.tsx:440-452` early-returns
  with "Already at 0 hit points — no damage applied." / "Already at full health — N of N hit points."
  The durable no-op write is gone. ⚠️ TWO holes remain — see new OPEN #1.
- **run #20 OPEN #2 (identical text never re-announced) + OPEN #3 (stale `note` under a fresh
  error).** Both closed by one line: `dispatch` now does `setNote('')` at `:418` before the await.
  Verified the await boundary yields two separate flushes, so the blank→text diff is real and
  `character-sheet.spec.ts:184`'s full-string match is untouched. ⚠️ The `applyHp` boundary branch
  BYPASSES `dispatch` and therefore bypasses this clear — new OPEN #1.

## NEW at run #22 (verified @ 98e0211f)
1. **The new HP-boundary refusal `Characters.tsx:440-452` is unreachable for sighted users AND
   announces only once.** `note` renders ONLY into `role="status" style={srOnly}` at `:709-711`, so
   pressing Damage at 0 HP (or Heal at full) now produces literally no visible change — a dead
   button with a secret explanation. And because the branch returns before `dispatch`, it never
   runs the `setNote('')` clear at `:418`, so a second identical press is dropped by AT too.
   Fix: blank the note first, and mirror the refusal into a visible slot. ⚠️ Do NOT add a second
   `role="status"` inside `#main-content` — `character-sheet.spec.ts:135,152` pin `toHaveCount(1)`.
   The `!error.field` alert slot `:712-716` or an `info`-toned reuse of `error` is the spec-safe home.
2. **`Characters.tsx:1067` still leaks the raw enum: "Advancing to level 4 (xp)."** — the exact twin
   of the `Player.tsx:2192` line `98e0211f` just fixed. `KIND_LABEL` (`:198`, `:759`) is the in-file
   pattern. ZERO e2e refs to this string.
3. **`CharBuilder.tsx:2211` visibility Tile grid is a hard `1fr 1fr` with no `isPhone` branch** —
   every sibling Tile grid (`:1688`, `:1764`, `:1828`) uses `auto-fill minmax(160-190px,1fr)`, which
   collapses to one column on a Pixel 5. Wizard body padding is 16px each side `:1590`, so at 393px
   each tile gets ~175px, of which 81px is the 34px icon + gap 11 + padding 12×2 ⇒ ~94px of text:
   "Players can see" wraps and the 37-char sub wraps to 4–5 lines (worse when `on`, which adds a
   16px check). Fix: `isPhone ? 'minmax(0,1fr)' : '1fr 1fr'`.

## FIXED at 33651613 (do not re-chase)
- **run #15 OPEN #1 — EncounterBuilder orphan encounters.** `builtIdRef` `:130` + invalidation effect
  `:189-191` + reuse branch `:299-302` + extracted `start()` `:345-358`. ⚠️ Only PARTIALLY effective —
  see new OPEN #8.
- **run #15 OPEN #2 — Characters.tsx announces successes.** `dispatch(command, okNote?)` `:411-429`
  now feeds a persistent EMPTY `role="status"` at `:690-692` (`srOnly` from screen-kit). ~14 call
  sites carry an `okNote`. ⚠️ Two new holes — see new OPEN #2 and #3.
- **run #15 OPEN #4 (half) — `dispatch` now has try/catch** `:421-428`. `startCombat()` `:1758-1785`
  STILL has no try/catch and no busy flag.
- **run #15 OPEN #16 — Prepared/Not prepared pill** `:1372-1395` now `6px 10px` + `minHeight:24` +
  `boxSizing:'border-box'`.
- **run #15 OPEN #13 (part) — Prepared pill duplicate name** `:1379` `aria-label={`${…} — ${s.name}`}`.
- **run #15 OPEN #19 — EncounterBuilder quick-add HP `min={1}`** `:501`.
- Older: `CharBuilder.create()` try/catch/finally `:1183-1202`; phone attack grid `Characters.tsx:916`;
  `key={phase}` Overlays; `NumStepper` spinbutton; Tile/PathCard hover + `aria-pressed`; point-buy
  soft-disable; `key={detailId}` on CharacterSheet `:1739`; `error.field` routing; `hpDraft`;
  `crDrafts`/`qtyDrafts`; `backdropDismissible={rows.length===0}`; DataTable overflow wrapper;
  `SpellSlots` read-only `role="img"`; `screen-kit.radioGroupKeyDown`/`BackBar`.

## STILL OPEN — ranked; line numbers below are from 21e4f86e (Characters.tsx shifted ~+19 after :418)

1. ~~Damage/Heal lie at the HP boundaries~~ **CLOSED at 98e0211f** — but see NEW #1 above.
2. ~~live region never re-announces identical text~~ **CLOSED at 98e0211f** (`setNote('')` at `:418`).
3. ~~clears `error` but never `note`~~ **CLOSED at 98e0211f** (same line).
4. **`Characters.tsx:1115-1117` level-up "Cancel" is destructive, unconfirmed, and now the ONLY
   silent write in the file** (NEW). `cancelAdvancement()` `:667-669` is the one dispatch left with
   no `okNote` after `33651613`. Ghost `sm`, accessible name just "Cancel", sits beside "Finish
   level-up". Fix: rename "Discard level-up", confirm when `draft.choices` is non-empty, announce.
   ZERO e2e refs (the `name:'Cancel', exact` uses in ai-assistant/knowledge specs are dialog-scoped).
5. **`Characters.tsx:1758-1785` `startCombat()` has NO busy flag and NO try/catch.** Double-click →
   two `combat.start`; the second rejection overwrites the ok notice. A thrown persist leaves
   `notice` at `null` (cleared at `:1759`) so nothing appears at all.
6. **`Characters.tsx:1838` roster `notice` MOUNTS WITH its text** ⇒ "Combat started" unreliably
   announced. Only the `role="alert"` error branch works. (`role` is chosen per-tone at `:1840`.)
7. **`Characters.tsx:714-718` Edit→Done silently discards drafts** (`setAttackRows(null)` +
   `setShareDraft(null)`), no confirm, no undo. Same at the attack editor's Cancel `:959`.
8. **`EncounterBuilder`'s orphan fix is unreachable in its motivating scenario** (NEW). The retry
   path `:299-302` only helps if the DM clears the `combat.start` rejection WITHOUT closing the
   modal — but both likely rejections ("start a session first", "combat already running") are only
   resolvable on /session. Cancel ⇒ the durably-committed encounter is orphaned forever (no screen
   lists or deletes encounters); reopening re-seeds `rows` `:136`, firing the invalidation effect,
   so the next Start mints another. Also the `:129` comment claims the ref is cleared "on close" —
   **no code does that**; it only survives because the re-seed happens to change `rows`.
   Fix: clear the ref in the `!open` branch, and on close-with-a-held-id either dispatch a delete
   or surface "A draft encounter was saved — start a session and press Start again."
9. **`CharBuilder` step change is invisible.** `next`/`back` `:976-981` move no focus, reset no
   scroll, announce nothing. `step.title` `:1587` is a styled `div`, never an `<h*>`. "Step i of n"
   `:2381-2383` is inert. StepRail is `!isPhone` only `:1577` ⇒ phone has ZERO progress signal.
10. **`CharBuilder.tsx:2413-2464` discard alertdialog shares the wizard's Tab trap.** Rendered inside
    `panelRef`; `Overlay`'s Tab sweep `:768-770` filters only on `offsetParent !== null`. No
    `aria-modal`, no `aria-describedby` → the body copy `:2447`.
11. **`CharBuilder` blocked Continue is a silent dead button on touch.** `:2383-2392` —
    `aria-disabled` makes `ds/Button` strip `onClick`; `blockedReason` `:1563-1570` lives ONLY in
    `title`. Name Input `:1630-1636` has no `aria-invalid`/`aria-describedby`. **Do NOT use hard
    `disabled`** — `command-palette.spec.ts:149-155` pins the EncounterBuilder twin as natively enabled.
12. **PC-with-no-players is a contradiction.** `blockedReason` `:1565` says "choose who plays it"
    while `:1660-1672` renders a `HonestNote` INSTEAD of the owner Select.
13. **`CharBuilder` `dirty` `:985-987` requires `phase==='scratch'`**, but `back()` `:978` at i===0
    sets `phase:'choose'` ⇒ X from the choose screen throws a typed name away with no confirm.
14. **`EncounterBuilder` focus dies + the error is scrolled away.** `:495`-area quick-add Add is hard
    `disabled={!qName.trim()}` and `quickAdd()` clears `qName` `:252` ⇒ disables itself under focus.
    Per-row Remove unmounts itself. Start combat `:385` is hard `disabled={submitting}` ⇒ focus →
    `<body>`, while `error` renders at the TOP of Dialog's scrolling body with the button pinned in
    the fixed footer. On a full roster the DM presses Start and sees/hears nothing.
15. **`EncounterBuilder` has no `role="status"`.** "Combatants · N" is inert.
16. **Duplicate accessible names in the attack editors.** `Characters.tsx:910/925/933` and
    `CharBuilder.tsx:2082-2135` (5 labels + "Remove attack" × N). (The Prepared pill is now FIXED.)
17. **`CharBuilder.tsx:2066-2139` phone attack rows are visually merged** — row grid `gap:8` equals
    the container's inter-row `gap:8` `:2066`; the 6th cell (Remove) lands beside *Damage type*.
18. **`Characters.tsx:1102/1110/1143` hard-`disabled` with no reason** ("Save choices", "Finish
    level-up", "Level up (XP)") while `Player.tsx:2070-2074/2096-2100` renders the SAME
    `EligibilityResult`'s message (badly placed, but present).
19. **Tile groups are N unrelated toggle buttons.** `:1611`, `:1682`, class/background grids: no
    accessible group name, no "1 of 4". **`role="radio"` breaks `authoring-layout.spec.ts:78,96`** —
    the spec-safe fix is `role="group" aria-label="Kind"` on each grid wrapper.
20. **Zero hover feedback on hand-rolled buttons.** No global `button:hover` exists.
    `Characters.tsx:249` (breadcrumb Back), `:1372` (Prepared), `:1517` (sharing chips);
    `EncounterBuilder.tsx:436` (roster picker). `Characters.tsx:1590` is the only one with handlers.
21. **`Characters.tsx:1086` `color: T.warn ?? T.sub`** — `T.warn` is a constant string so `?? T.sub`
    is dead code. (Contrast itself PASSES — see the token note below. Don't file that part.)
22. Smaller, re-verified: `role="alert"` on the draft-issues `<ul>` `:1081`; points-left pill not a
    live region; `FieldLabel` `:427`-area is a `<span>` not a `<label>` (~15 fields); `declareSlots`
    empty guard is dead; `Characters` `notice` survives navigating into a sheet and back; rename
    drops focus to `<body>`; `CharBuilder` `error` isn't cleared by `back()`; initiative allows `-`
    anywhere ("1-2"); `CharBuilder` create button `:2396` hard-`disabled={submitting}`.

## VERIFIED NON-DEFECTS (stop re-flagging)
- `ds/IconButton.jsx` DOES swallow the click on truthy `aria-disabled`.
- `role="alertdialog" aria-label` `:2415-2416` does not erase its subtree.
- `Card interactive` (CharCard) gets role/tabIndex/Enter-Space from `ds/Card.jsx`.
- `Seg` (`app/screen-kit.tsx`) is a correct radiogroup with roving tabindex + Home/End.
- `Icon name="UserCircle"` is registered.
- EncounterBuilder roster picker is genuine multi-select with `aria-pressed`.
- `app/charImport/**` and `app/compendium/**` are PURE `.ts` — no UI surface.
- `Overlay`'s backdrop `onMouseDown` calls `requestClose`.
- **`T.warn` (`--color-status-warning`) AS TEXT on `T.surf` PASSES 1.4.3** — dark #f0a830/#1f1810 =
  8.65:1, parchment #9a6310/#fdf8f0 = 4.76:1. Measured run #20. Stop filing it.
- **`T.accFg` on a `T.ok` fill PASSES** (dark 8.23:1, parchment 5.38:1) — `Player.tsx:2182-2183`.
- `CharacterSheet` is `key={detailId}` at `Characters.tsx:1739`, so `note`/drafts can't bleed
  between characters.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`)
| spec:line | selector | source |
|---|---|---|
| authoring-layout:37 | 320px no-h-scroll sweep incl. `/characters` | roster grid `Characters.tsx:1894` |
| authoring-layout:62,90,127 | `button 'New character' exact` | `Characters.tsx:1826`, `:1882` |
| authoring-layout:63,91,128 | `button /Build from scratch/` | `CharBuilder.tsx` choose phase |
| authoring-layout:65,92,130 | `dialog 'New character wizard'` | `CharBuilder.tsx:1573` |
| authoring-layout:78,96 | `button 'PC'/'NPC' exact` | `Tile` via `KINDS` |
| authoring-layout:79,97 | `getByLabel('Name')` | `CharBuilder.tsx:1630` |
| authoring-layout:98-100,131-133 | `button 'Continue'` | `:2383-2392` |
| authoring-layout:104,105 | `getByLabel('Attack kind')`/`('Damage type')` | `:2094`/`:2124` |
| authoring-layout:135+ | `spinbutton {name:'hit points'}` | NumStepper `:2036-2044` |
| character-sheet:45,47,57 | `button 'Edit'/'Done' exact` | `:710-721` |
| character-sheet:94-121 | "Set AC" blank ⇒ `getByRole('alert')` count **1** | `:1239` |
| **character-sheet:134-135** | **`sheetStatus` = `#main-content` `getByRole('status')`, `toHaveCount(1)`** | `Characters.tsx:690` |
| **character-sheet:151-153** | status `toHaveText('')` ON MOUNT | `:690` |
| **character-sheet:175-186** | `button 'Damage' exact` ⇒ status `toHaveText(/Damaged 1\. \d+ of \d+ hit points\./)` | `:433-439`, `:1220` |
| command-palette:110 | `dialog 'Build encounter'` | `EncounterBuilder.tsx:364` |
| command-palette:125,149-155 | Start keeps `aria-disabled="true"` + `title` /combatant/i AND `el.disabled === false` | `:381-397` |
| command-palette:126-129 | `getByLabel('Quick add' exact)`, `button 'Add' exact` | `:488-522` |
| command-palette:132,138-141 | `getByLabel('Bandit quantity')` | `:602` |
| command-palette:145 | `button /from the draft$/` | `:663` |
| a11y-axe-gate:28 | axe on `/characters` (roster only) | — |

Blast-radius rules:
- **Do NOT convert Start combat / Continue to hard `disabled`** (command-palette:151 asserts
  `el.disabled === false`). Render a VISIBLE reason instead.
- **Do NOT add a SECOND `role="status"` inside `#main-content` on the sheet** — character-sheet:135
  and :152 both assert `toHaveCount(1)`. Reuse `Characters.tsx:690`.
- **Do NOT append a marker char to the note text** — character-sheet:184 is a full-string
  `toHaveText(regex)`. Use `key={seq}` remounting inside the region instead.
- **Tile → `role="radio"` breaks authoring-layout:78 AND :96.** Use `role="group"` on the wrapper.
- A confirm gated on `attackRows || shareDraft` is SPEC-SAFE.
- `getByLabel('Name')`/`('Attack kind')` survive `aria-invalid`/`aria-describedby` and a row suffix.
- `responsive.spec.ts` ROUTES covers `/characters` but never `/characters/:id`.

## Genuine strengths (don't "fix")
`Overlay`'s Escape/back-handler/scroll-lock/focus-restore contract; the dirty-close discard confirm;
the fail-closed import preview; `HonestNote`; the string-draft pattern; `applyAc`/`setXp`'s explicit
empty-field errors routed to their own control; `NumStepper`'s full spinbutton contract; the new
`dispatch(cmd, okNote)` shape (port it to `Player.tsx`, which is now the laggard).
See [[completion-pass-ux-patterns]], [[ds-layer-audit]], [[player-char-scene-display-cluster]].
