# Completion — UX-SESSION-combat-editing-conditions-and-player-tracker

UX workpack status: `complete`

Epic: Combat Editing, Conditions, and Player Tracker (phase "05 Live-Play Workspaces", P1).
Requirement coverage: `UX-SES-005` (`UX-SES-005-S01`), `UX-SES-007` (`UX-SES-007-S01`),
`UX-SES-008` (`UX-SES-008-S01`), `UX-SES-016` (`UX-SES-016-S01`).

## Summary

Completed the combat editing hot paths on top of the previous epic's hot-path combat shell, and
hardened the player-visible tracker.

**UX-SES-005 — inline HP stepper.** The HP number in a combatant row is now itself the tap
target (rows the viewer may edit only): tapping it opens an in-place stepper
(`apps/gm/src/lib/gui/ux-ses/HpStepper.svelte`) — `[−] [absolute HP value] [+] [✓] [✕]` with a
muted "HP (current / max)" label — no context menu, no navigation, ≤2 actions. The typed value is
the absolute target ("42" → "42/45"), clamped into [0, max]; clamping past max raises a "Healed
to maximum" toast. −/+ step by 1 with hold-to-repeat (400 ms delay / 150 ms interval); the input
auto-focuses with the value selected; Enter confirms, Escape cancels, `H` with focus inside a row
opens that row's editor. Every change raises the UX-SES-017 undo toast ("[Name] HP: 45 → 42.
Undo?") whose Undo dispatches the core's inverse command. Setting HP to 0 raises the inline
`role="alertdialog"` confirmation "Mark [Name] as defeated?" with focus on the safer
"No — keep at 0".

**UX-SES-007 — conditions, concentration, death saves.** Condition chips remain text-label
(never icon-only) and are now tappable-to-remove on authorized rows; the add-condition input
offers the 14 standard 5e conditions via a datalist (custom names still allowed). A
concentration control (set/drop) drives the existing "Concentrating" chip; damaging a
concentrating combatant raises a 4 s warning toast "Concentration check! DC [N] for [Name]."
(DC = max(10, ⌊damage/2⌋), new `warning` toast kind). The death-save track (3 failure + 3 success
`role="checkbox"` boxes plus a "Mark defeated" resolution) renders ONLY for a dying combatant —
HP 0 with "No — keep at 0" chosen — via the new core `isDying` view flag.

**UX-SES-008 — combatant management.** Four new DM-only, active-session + running-combat gated
Processing-Core commands (`packages/core/src/commands/combat.ts`):

- `combat.add-combatants` — mid-combat add; `quantity` 1–20 creates mass combatants
  "[Name] 1"…"[Name] N"; blank initiative auto-rolls 1d20 deterministically (seeded by the
  recorded combatant id via the dice engine); hidden rows fail closed to the "Unknown creature"
  placeholder; insertion respects descending initiative (`initiativeInsertionIndex`, pure) and the
  active combatant stays active.
- `combat.remove-combatant` — non-destructive removal; the turn cursor follows the active
  combatant (removing the active last-in-order combatant wraps the round). The GUI requires one
  confirmation (`role="alertdialog"` Dialog, focus on Cancel) before dispatching.
- `combat.reorder-combatant` — move one position earlier/later (explicit buttons + `Ctrl+Up` /
  `Ctrl+Down` keyboard reorder); the active combatant keeps the turn; the move announces
  "[Name] moved to position [N]" politely.
- `combat.set-combatant-visibility` — mid-combat hide/unhide; hiding fails closed to the
  "Unknown creature" placeholder so the player tracker immediately shows a placeholder row; the
  DM row gains a "Hidden from players" marker styled with the DM-only token group.

The tracker header gained the "Add +" button opening the Add-combatant dialog
(`apps/gm/src/lib/gui/ux-ses/AddCombatantsPanel.svelte`): a vault-character path (the core seeds
HP/AC from the live character sheet) and a quick-add path (Name / Initiative auto-roll / HP / AC /
Quantity spinner 1–20 / Hidden toggle).

**UX-SES-016 — player tracker.** The same `CombatTracker.svelte` renders the player view from
the actor-filtered core model: distinct `aria-label="Initiative order (player view)"`; hidden
combatants are placeholder rows (`aria-label="Unknown creature, turn position N"`, `— / —`
stats, no menu, no edit affordance); HP tap-to-edit renders ONLY for the viewer's
`combat-participant` character rows (`aria-label="Your HP for [Name] — tap to edit"`); all
read-only HP cells are non-interactive text; no advance/add/reorder/remove/hide affordance exists
anywhere in the player DOM (gated by `computeCombatControls`, fail closed).

**NO-LEAK hardening found by this epic's negative tests** (`packages/core/src/queries/
combat-tracker-view.ts`): encounter-log labels carry REAL names (e.g. "X is now hidden from
players."), and previously an entry naming a placeholder-visible hidden combatant passed the
non-DM log filter because the placeholder row's id was in `visibleIds`. The log filter now uses a
separate `fullyVisibleIds` set, and a mass-add log entry (which has no per-combatant id for the
filter to act on) never carries real names when any added combatant is hidden.

**UX-SES-005/007 state model**: `CombatantResources` gained the optional `notDefeated` flag
(absent ⇒ pre-existing hp ≤ 0 ⇒ defeated semantics, so persisted states hydrate unchanged). The
new `defeated` resource kind on `combat.apply-resource` records "Yes — defeated" /
"No — keep at 0"; healing above 0 resets the death-save track and the flag (5e rule). The view
exposes `isDefeated` (hp ≤ 0 and not kept-at-0) and `isDying` (hp ≤ 0 and kept-at-0).

## Demo path / surfaces

`/session` (DM and `View as` player), `/characters` (grant setup for the combat-participant
scenario), `/` (workflow toolbar).

- **UX-SES-005:** run combat with a 45 HP Ogre → tap the HP number → stepper appears in place
  (within the same frame; no navigation); −/+ adjust the draft only; type 42 + ✓ → row shows
  42/45 + undo toast "Ogre HP: 45 → 42. Undo?"; Undo restores 45 and announces; Escape cancels a
  reopened editor. Set a 7 HP goblin to 0 → "Mark Goblin as defeated?" appears; "No — keep at 0"
  keeps the row un-defeated with the 6-box death-save track; one failure tally checks the first
  red box; "Mark defeated" applies the strikethrough/opacity treatment and the row sinks below
  all living combatants.
- **UX-SES-007:** add "Paralyzed" → the word renders as a text chip in the row with no
  hover/tooltip/menu; tap the chip to remove it. Set concentration "Bless" → "Concentrating"
  chip; deal 22 damage through the stepper → "Concentration check! DC 11 for Ogre." toast within
  the action.
- **UX-SES-008:** tracker header "Add +" → dialog; quick-add Goblin ×5 (initiative blank) → five
  rows "Goblin 1"…"Goblin 5" appear immediately, active combatant unchanged. ▲/▼ reorder a row
  and the polite region announces the new position. Remove → "Remove Goblin from this combat?
  They can be re-added." dialog; Cancel keeps the row; Remove deletes it. Hide a combatant
  mid-combat → DM keeps the real name + "Hidden from players" marker + hidden count.
- **UX-SES-016:** as the player, the hidden combatant is "Unknown creature" with `HP — / —`,
  also when ACTIVE (placeholder + "▶ Active" chip); the marker name appears nowhere in
  `page.content()`. With a `combat-participant` grant on Pip (granted via `/characters`, Pip
  added to combat from the vault-character path), exactly ONE HP cell is tappable
  ("Your HP for Pip — tap to edit"); the stepper opens and the edit lands with the undo toast.

Platform parity: the same commands and controls render on Desktop and Mobile (the new spec runs
on BOTH Playwright projects); the stepper goes full-row width under the compact viewport; all new
buttons sit on the global 44 px comfortable-density floor; Tablet (`medium`) shares the stacked
flex row CSS.

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-SES-005** tap-to-edit stepper ≤2 actions; absolute value + clamp; undo via inverse command; defeated confirm | `apps/gm/src/lib/gui/ux-ses/HpStepper.svelte`; `apps/gm/src/lib/gui/CombatTracker.svelte` (`hp-edit-*` tap target, `confirmHp`, defeat confirm, `resolveDefeat`, `H` row hotkey); core `defeated` resource kind + heal-resets-death-saves (`packages/core/src/commands/combat.ts`, `packages/core/src/schemas/commands.ts`) | core `packages/core/tests/combat-tracker.test.ts` "UX-SES-005 defeated confirmation"; e2e `apps/gm/tests/e2e/session-combat-editing-conditions-player-tracker.spec.ts` "UX-SES-005 —" + "UX-SES-005 AC3 / UX-SES-007 AC3"; updated stepper flows in `apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts` and `apps/gm/tests/e2e/session-combat-and-encounters.spec.ts` (both projects) |
| **UX-SES-007** text chips visible without interaction; concentration DC toast ≤500 ms; death saves at 0-not-defeated | `CombatTracker.svelte` (chip remove buttons, condition datalist, concentration set/drop, death-save track, "Mark defeated"); `isDying` flag (`packages/core/src/queries/combat-tracker-view.ts`); `warning` toast kind (`apps/gm/src/lib/gui/ux-ses/session-toasts.svelte.ts`, `ToastStack.svelte`) | core "UX-SES-005 defeated confirmation" (isDying transitions); unit `apps/gm/tests/unit/session-toasts.test.ts` (warning TTL/no-action); e2e "UX-SES-007 AC1/AC2 —" + the death-save assertions in "UX-SES-005 AC3 / UX-SES-007 AC3" |
| **UX-SES-008** mass add "Goblin 1–5" ≤1 s; hidden ⇒ player placeholder; remove confirmed | core `combat.add-combatants` / `combat.remove-combatant` / `combat.reorder-combatant` / `combat.set-combatant-visibility` (+ `initiativeInsertionIndex` in `packages/core/src/state/combat-tracker.ts`); GUI `AddCombatantsPanel.svelte`, row ▲/▼/Hide/Remove controls + `Ctrl+Up/Down`, remove Dialog | core "UX-SES-008 add / remove / reorder / visibility" describe (8 tests incl. fail-closed matrix + ≤20 cap + no-leak serialization); e2e "UX-SES-008 AC1 —", "UX-SES-008 — explicit reorder", "UX-SES-008 AC3 —", "UX-SES-008 AC2 / UX-SES-016 AC2 —" |
| **UX-SES-016** own-HP stepper only; hidden combatant in no rendered element/label; hidden turn announces placeholder | `CombatTracker.svelte` (player aria-label, placeholder row labels, `editableCombatantIds` gating of every edit affordance); core `getSharedCombatView`/`computeCombatControls` (pre-existing choke points) + the log-filter hardening | e2e "UX-SES-016 AC1 —" (exactly one tappable HP cell, player label, edit lands) + "UX-SES-008 AC2 / UX-SES-016 AC2 —" (`page.content()` negative assertion, read-only affordance counts, active placeholder row); core hidden-add/hide tests serialize the player view and assert the marker is absent |

## Actor-safety / no-leak evidence

- All rendering still flows through the single sanctioned read path (`getCombatTrackerForActor`
  via `getSharedCombatView`); the new management commands never widen it.
- New negative tests caught and fixed a REAL leak: non-DM encounter-log filtering now uses
  `fullyVisibleIds` (a placeholder row's position is visible, but log labels carrying its real
  name are withheld), and mass-add log labels omit names whenever any added combatant is hidden.
- `combat.set-combatant-visibility` and hidden `combat.add-combatants` rows fail closed to the
  "Unknown creature" placeholder — a hidden combatant can never silently disappear into a
  position-revealing gap, and never renders identity/stats to a non-DM.
- E2E hides marker `DMSECRETSESEDIT7Q` mid-combat and asserts as a player: placeholder row +
  Active chip render and the marker is absent from the ENTIRE page HTML (`page.content()`),
  both projects. The test reloads before switching actors because the single shared live region
  in the test harness carried DM-side announcements; a real player client never receives them
  (announcements are produced per-client from the actor-filtered view).
- Edit affordances are derived from `computeCombatControls.editableCombatantIds` (fail closed):
  a player without a grant renders zero `hp-edit-*`/`apply-hp-*` controls (existing
  `collab-combat-handouts-groups` assertion still passes); management controls require
  `canEditAnyCombatant` (DM + live only).
- Turn announcements keep using the view's filtered active-combatant name, so a player client
  can only ever announce the placeholder ("It is now Unknown creature's turn…", UX-SES-016 AC3).

## Accessibility evidence

- Stepper: input auto-focus + select, `aria-label="HP for [Name]"`, −/+ labeled
  decrease/increase, group `aria-label="Edit HP for [Name]"`, Enter/Escape handling, native
  Up/Down arrow stepping; all targets ≥44 px.
- Defeated confirmation: `role="alertdialog"` with focus moved to the safer "No — keep at 0".
- Remove confirmation: shared a11y `Dialog` (`role="alertdialog"`, `aria-modal`, focus trap,
  Escape, focus restoration), focus starts on Cancel.
- Add panel: shared `Dialog` (`role="dialog"`, labeled), labeled fields, quantity input with
  min/max bounds.
- Death saves: `role="checkbox"` + `aria-checked` + per-box labels; red/green is reinforced by
  ☐/☑ glyphs and the "failures"/"successes" text labels (non-color state).
- Conditions stay text-label chips in a labeled `role="list"`; removable chips carry
  "[condition] — press to remove" labels.
- Reorder: explicit ▲/▼ buttons (labels include the Ctrl+arrow shortcut) + `Ctrl+Up`/`Ctrl+Down`;
  moves announce "[Name] moved to position N" via the shared polite region (the drag-free
  alternative; no pointer-only path).
- The visually-hidden tracker shortcut description now documents `H` and `Ctrl+Up/Down`.
- All announcements go through the single `LiveAnnouncer`; the turn/round `$effect` still wraps
  side effects in `untrack` (no effect loops). Warning toasts are `role="alert"` (assertive per
  UX-SES-007 spec); milestones remain `role="status"`.
- Full a11y axe / target-size / touch-target e2e gates pass with the new surfaces mounted.

## Tests / gates run

- `pnpm typecheck` — core `tsc` + app `svelte-check`: **0 errors, 0 warnings (4738 files)**.
- `pnpm lint` (full eslint + boundary + nav-registry + a11y contrast) — **PASS**.
- `pnpm docs:validate` — **PASS**.
- `pnpm ux-workpack:validate` — **PASS** (after `ux-workpack:complete`).
- Core vitest, full suite — **3095 passed (193 files)** (+10 new in
  `packages/core/tests/combat-tracker.test.ts`: 1 UX-SES-005 defeated-confirmation + 8 UX-SES-008
  management + the shared running-combat helper; baseline 3085/193).
- App vitest, full suite — **480 passed (61 files)** (+1 new warning-kind test in
  `apps/gm/tests/unit/session-toasts.test.ts`, baseline 479/61).
- New e2e `apps/gm/tests/e2e/session-combat-editing-conditions-player-tracker.spec.ts` —
  **16 pass** (8 tests × desktop-chromium + mobile-chromium), including the no-leak negative
  assertions and the player-tracker affordance counts.
- Updated e2e (`session-lifecycle-recovery-combat-shell`, `session-combat-and-encounters`,
  `collab-combat-handouts-groups`) — **34 pass** on both projects.
- Full Playwright suite, BOTH projects — **749 passed, 39 skipped, 0 failed** (baseline 733 + 16
  new; no regressions; final clean run after all changes).

## Files changed

New — GUI (`apps/gm/src/lib/gui/ux-ses/`):
- `HpStepper.svelte` (UX-SES-005 inline stepper)
- `AddCombatantsPanel.svelte` (UX-SES-008 add dialog: vault character + quick-add mass/secret)

New — tests:
- `apps/gm/tests/e2e/session-combat-editing-conditions-player-tracker.spec.ts`

Modified — core:
- `packages/core/src/state/combat-tracker.ts` (`notDefeated` resource flag,
  `initiativeInsertionIndex`, `combatant-reordered`/`combatant-visibility`/`defeated-set` log
  kinds)
- `packages/core/src/commands/combat.ts` (`handleAddCombatants`, `handleRemoveCombatant`,
  `handleReorderCombatant`, `handleSetCombatantVisibility`, `defeated` resource kind,
  heal-above-0 death-save reset, mass-add label no-leak)
- `packages/core/src/queries/combat-tracker-view.ts` (`isDying`, defeated semantics, log-filter
  `fullyVisibleIds` no-leak hardening)
- `packages/core/src/commands/types.ts`, `packages/core/src/commands/dispatch.ts`,
  `packages/core/src/schemas/commands.ts`, `packages/core/src/index.ts` (commands / events /
  schemas / registration / exports)
- `packages/core/tests/combat-tracker.test.ts` (UX-SES-005 + UX-SES-008 describes)

Modified — app:
- `apps/gm/src/lib/gui/CombatTracker.svelte` (HP tap target + stepper wiring, defeat confirm,
  death-save track, chip removal + condition datalist, concentration controls, Add + header
  button, row management controls + keyboard reorder, remove Dialog, player-view labels)
- `apps/gm/src/lib/gui/ux-ses/session-toasts.svelte.ts`, `apps/gm/src/lib/gui/ux-ses/ToastStack.svelte`
  (`warning` toast kind, 4 s)
- `apps/gm/tests/unit/session-toasts.test.ts` (warning kind)
- `apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts`,
  `apps/gm/tests/e2e/session-combat-and-encounters.spec.ts` (HP edits now exercise the UX-SES-005
  stepper flow)

Workpack/docs:
- `docs/planning/v2/ux/workpack-state.yaml` + regenerated UX planning files (status commands
  only)
- `docs/planning/v2/ux/epics/UX-SESSION-combat-editing-conditions-and-player-tracker.completion.md`
  (this file)

## Known gaps / scoping

- The Mobile HP editor renders the same inline stepper at full row width rather than a literal
  bottom-sheet drawer; commands, targets (≥44 px), and keyboard/touch parity are identical. A
  dedicated bottom-sheet primitive can swap in later without contract changes.
- Drag reorder is not implemented; the spec's required explicit/keyboard alternative (▲/▼ +
  `Ctrl+Up/Down`, announced) is the shipped path, which also satisfies the no-pointer-only rule.
- The player-side live-region announcement for a hidden combatant's turn is guaranteed by
  construction (announcements derive from the actor-filtered view name — the placeholder) and
  covered by the active-placeholder row assertions; a literal multi-client announcement e2e is
  not possible in the single-client harness (the DM and player share one live region there).
- The combatant ••• context menu from the row-anatomy spec remains decomposed into direct,
  labeled row controls (as in the previous epic); a menu consolidation pass can follow when the
  shared menu primitive lands.

## Git evidence

Branch: `ux/UX-SESSION-combat-editing-conditions-and-player-tracker` (single commit
`feat(ux): UX-SES combat editing, conditions, and player tracker`).

`git status --short` before the final commit (all changes staged in the epic commit; clean after):

```
 M apps/gm/src/lib/gui/CombatTracker.svelte
 M apps/gm/src/lib/gui/ux-ses/ToastStack.svelte
 M apps/gm/src/lib/gui/ux-ses/session-toasts.svelte.ts
 M apps/gm/tests/e2e/session-combat-and-encounters.spec.ts
 M apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts
 M apps/gm/tests/unit/session-toasts.test.ts
 M docs/planning/v2/ux/epics/UX-SESSION-combat-editing-conditions-and-player-tracker.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M packages/core/src/commands/combat.ts
 M packages/core/src/commands/dispatch.ts
 M packages/core/src/commands/types.ts
 M packages/core/src/index.ts
 M packages/core/src/queries/combat-tracker-view.ts
 M packages/core/src/schemas/commands.ts
 M packages/core/src/state/combat-tracker.ts
 M packages/core/tests/combat-tracker.test.ts
?? apps/gm/src/lib/gui/ux-ses/AddCombatantsPanel.svelte
?? apps/gm/src/lib/gui/ux-ses/HpStepper.svelte
?? apps/gm/tests/e2e/session-combat-editing-conditions-player-tracker.spec.ts
?? docs/planning/v2/ux/epics/UX-SESSION-combat-editing-conditions-and-player-tracker.completion.md
```
