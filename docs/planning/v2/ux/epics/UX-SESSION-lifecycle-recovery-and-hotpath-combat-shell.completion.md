# Completion — UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell

UX workpack status: `complete`

Epic: Session Lifecycle, Recovery, and Hot-Path Combat Shell (phase "05 Live-Play Workspaces", P1).
Requirement coverage: `UX-SES-001` (`UX-SES-001-S01`), `UX-SES-002` (`UX-SES-002-S01`),
`UX-SES-003` (`UX-SES-003-S01`), `UX-SES-004` (`UX-SES-004-S01`), `UX-SES-006`
(`UX-SES-006-S01`), `UX-SES-017` (`UX-SES-017-S01`).

## Summary

Rebuilt the `/session` combat surface into the hot-path combat shell: a sticky tracker header
strip (`◀ Prev | Round N | ▶ Next turn | End combat | Pause session`), scoreboard row anatomy
(initiative · name · HP current/max · AC · text-label condition chips with `+N more` expansion),
an unmistakable current-turn treatment (4 px live left-border accent + elevated background + bold
name + larger HP + "▶ Active" chip + `aria-current="true"` + scroll-into-view on advance),
defeated rows (strikethrough, 50 % opacity) sorted below all non-defeated rows, and 1-action turn
advance/revert via buttons, `Space`/`Shift+Space` on the focused tracker, and global `N`/`P`
during an active session. Turn changes announce through the shared assertive live region using
the actor-filtered combatant name (a hidden active combatant announces/renders only its
placeholder).

Two new Processing-Core pieces own the policy:

- `combat.previous-turn` — a DM-only, active-session-gated command (pure `previousTurn` inverse of
  `advanceTurn`, wrapping back across rounds, rejecting at round 1 turn 0) with a durable
  `turn-reverted` encounter-log entry and `combat.turn-reverted` event (UX-SES-006 AC3).
- `getSessionRecoveryPrompt` (`packages/core/src/queries/session-recovery.ts`) — the UX-SES-002
  recovery read model: on a restart during an `active`/`paused` session it deterministically
  reports either a FULL restore (with restored-state summaries) or a PARTIAL restore naming the
  specific missing item(s) (dangling active scene/map references, combat order naming missing
  combatant records, out-of-range turn position). DM-gated fail closed; the active-combatant name
  flows through the actor-filtered tracker view.

The session route gained the UX-SES-017 async-action toast model (`apps/gm/src/lib/gui/ux-ses/`):
a queue store (undo 8 s / error+Retry 10 s / milestone 2 s, newest-first, capped stack) rendered
bottom-right (full-width bottom banners on Mobile). HP changes raise "[Name] HP: old → new.
Undo?" whose Undo dispatches the core's inverse command; failed rolls raise an error toast whose
Retry re-dispatches the same command; round wraps raise "Round N begins".

Lifecycle affordances (UX-SES-001): "Pause session" sits in the tracker header while the session
is active (same `session.set-workflow` payload as the Command Center phase controls); all
session-gated tools (combat, dice, live tools) share one inline `role="status"` state-gate
message with a direct Command Center link; reaching `recap` auto-switches the Prep/Recap panel
mode to recap and surfaces a primary "Create recap notes" CTA that creates a dm-only recap note
seeded from the digest.

## Demo path / surfaces

`/session` (DM and `View as` player), `/` (workflow toolbar to drive lifecycle states).

- **UX-SES-001:** idle session → dice/combat/live-tools each show the inline gate + "/" link;
  start session from `/` → gates clear, `combat-pause-session` visible in the tracker header
  without scrolling (before and during combat); pause from the header re-gates the tools; walk
  active → ending → recap → `/session` Prep/Recap mode auto-set to recap with the
  `create-recap-notes` CTA primary-visible.
- **UX-SES-002:** with a live session + running combat, a hard reload shows the non-blocking
  "Session restored — Round N / [Name]'s turn" `role="status"` strip with View-details +
  Continue. Corrupting the persisted combat (missing combatant record) and reloading instead
  raises the modal `role="alertdialog"` recovery prompt naming "Combat order (1 combatant record
  missing)" — the dice tool is not clickable through the backdrop until "Continue with partial
  state".
- **UX-SES-003/004:** 7–8 combatants render the full row anatomy with no horizontal scrolling on
  both profiles; dropping a combatant to 0 HP applies the defeated treatment and sinks the row to
  the bottom; the current-turn row differs by border color, background, and name weight, carries
  `aria-current` and the ▶ chip, and is scrolled into view on advance. A hidden combatant (DM
  placeholder "Unknown creature") renders for the player as the placeholder row with `HP — / —`
  and the Active chip — the real name appears in no DOM node (asserted against the full page
  HTML).
- **UX-SES-006:** Space on the focused tracker advances within the optimistic update and the
  assertive region announces "It is now [Name]'s turn, round N."; Prev reverts (encounter log
  records "Returned to …"); the last-combatant advance increments the round and toasts "Round 2
  begins"; the Next button measures ≥44×80 px on both projects.
- **UX-SES-017:** −12 HP on a 30 HP combatant → "Ogre HP: 30 → 18. Undo?" toast; Undo restores 30
  and confirms "HP change undone."; an invalid roll raises "Roll failed…" with a Retry that
  re-dispatches the identical command.

Platform parity: Desktop (keyboard paths, corner toasts, 52 px rows) and Mobile (comfortable
density 44 px targets, full-width bottom toasts, 64 px rows, flex-fill Next button) — the new
spec runs on BOTH Playwright projects; Tablet (`medium` viewport) shares the 60 px row /
header-height CSS branch.

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-SES-001** pause in tracker header; state-gate + link; recap auto-mode + CTA | `apps/gm/src/lib/gui/CombatTracker.svelte` (header `combat-pause-session`), `apps/gm/src/lib/gui/ux-ses/SessionStateGate.svelte` (used by CombatTracker, `apps/gm/src/lib/gui/DiceTools.svelte`, `apps/gm/src/lib/gui/LiveTools.svelte`), `apps/gm/src/lib/gui/PrepRecap.svelte` (auto-recap effect + `create-recap-notes`) | e2e `apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts` "UX-SES-001 —" + "UX-SES-001 AC3" (both projects) |
| **UX-SES-002** restore within load; modal lock on partial; missing items named | core `packages/core/src/queries/session-recovery.ts`; GUI `apps/gm/src/lib/gui/ux-ses/SessionRecoveryGate.svelte` + `recovery-launch.svelte.ts` (per-launch ack), mounted in `apps/gm/src/routes/session/+page.svelte` | core `packages/core/tests/session-recovery.test.ts` (8 tests incl. fail-closed non-DM + no-leak marker); e2e "UX-SES-002 — full restore" + "UX-SES-002 AC2/AC3" (blocked-click assertion) |
| **UX-SES-003** row anatomy, no horizontal scroll, hidden no-leak, defeated below | `CombatTracker.svelte` rows (initiative/name/HP/AC/chips, `orderedRows` defeated sort, redacted `HP — / —` row); core `getCombatTrackerForActor` (pre-existing choke point) | e2e "UX-SES-003 — row anatomy" (scrollWidth check, defeated badge + last position) + "UX-SES-003 AC2 / UX-SES-004 AC3" (marker absent from `page.content()`) |
| **UX-SES-004** ≥3 dimensions, scroll into view ≤300 ms, hidden active = placeholder | `CombatTracker.svelte` `.active` treatment + `aria-current` + scroll `$effect` (reduced-motion ⇒ instant `auto`) | e2e "UX-SES-004 AC1/AC2" (computed-style border color/background/weight deltas, `toBeInViewport` after advances) + AC3 in the hidden-combatant test |
| **UX-SES-006** 1-action advance/prev, announcements, round toast, target size | core `previousTurn` + `combat.previous-turn` (`packages/core/src/state/combat-tracker.ts`, `packages/core/src/commands/combat.ts`, `dispatch.ts`, `types.ts`, `schemas/commands.ts`); GUI header strip + tracker/global key handlers + announce effect | core `packages/core/tests/combat-tracker.test.ts` "UX-SES-006" describe (pure inverse, wrap-back, fail-closed set); e2e "UX-SES-006 —" (Space + live region, Prev revert, "Round 2 begins" toast, ≥44×80 px button) |
| **UX-SES-017** undo toast ≤200 ms, undo inverse, failure Retry ≤1 s | `apps/gm/src/lib/gui/ux-ses/session-toasts.svelte.ts` + `ToastStack.svelte`; `CombatTracker.applyHp` undo flow; `DiceTools.dispatchRoll` retry flow | unit `apps/gm/tests/unit/session-toasts.test.ts` (4 tests: stack cap, per-kind TTLs, single-fire action, dispose); e2e "UX-SES-017 —" + "UX-SES-017 AC3" |

## Actor-safety / no-leak evidence

- All combat rendering keeps flowing through the single sanctioned read path
  (`getCombatTrackerForActor` via `getSharedCombatView`): hidden combatants are omitted or
  placeholder-redacted before the GUI sees them. The new row anatomy renders `— / —` stat cells
  for redacted rows without touching raw state.
- E2E creates a combatant named with marker `DMSECRETSES9X`, hides it with placeholder "Unknown
  creature", and asserts as a player: the placeholder row + Active chip render, and the marker is
  absent from the ENTIRE page HTML (`page.content()`), both projects (UX-SES-003 AC2 /
  UX-SES-004 AC3).
- Turn announcements use the view's (already filtered) active-combatant name, so a player client
  can only ever announce the placeholder.
- `getSessionRecoveryPrompt` is DM-gated fail closed (players/observers/unknown actors get
  `kind: 'none'` — core test asserts the serialized prompt carries no hidden-combatant marker),
  and even the DM's active-combatant summary is read through the actor-filtered tracker.
- Toasts and the state gate render caller-supplied, viewer-filtered text only (same contract as
  the live announcer); no toast is produced from raw models.
- Controls remain gated by `computeCombatControls` (fail closed): Prev/Next/Pause/End are absent
  for players/observers (existing `collab-combat-handouts-groups` player test still passes).

## Accessibility evidence

- Header buttons carry `aria-label` + `aria-keyshortcuts` (`Space` / `Shift+Space`); the tracker
  section is focusable with a visually-hidden `aria-describedby` shortcut description; key
  handlers never steal keys from text entry (`isFromTextEntry`) or interactive elements.
- Current turn: `aria-current="true"` + non-color dimensions (border, elevation, typography,
  text chip). Conditions are text-label chips, never icon-only; the forced-colors badge remaps
  are preserved.
- Turn changes announce via the single shared `LiveAnnouncer` assertive region (announce calls
  wrapped in `untrack` inside the `$effect` — no effect loops); undo confirmation announces
  politely.
- Recovery: full-restore strip is `role="status"`; partial restore is the a11y `Dialog`
  (`role="alertdialog"`, `aria-modal`, focus trap, Escape, focus restoration). The state gate is
  `role="status"` with a real link.
- Toasts: `role="alert"` (error/undo) vs `role="status"` (milestone); Undo/Retry/Dismiss are real
  buttons; Escape dismisses a focused toast.
- Reduced motion: scroll-into-view uses instant `auto` behavior when the resolved motion is
  `reduced`.
- Touch targets: Next ≥44×120 px Desktop / flex-fill Mobile (asserted ≥44×80), Prev ≥44×80; rows
  ≥52/60/64 px by viewport; the global comfortable-density 44 px rule applies to all new buttons.
- The full a11y axe + target-size + touch-target e2e gates pass with the new surfaces mounted.

## Tests / gates run

- `pnpm typecheck` — core `tsc` + app `svelte-check`: **0 errors, 0 warnings (4735 files)**.
- `pnpm lint` (full eslint + boundary + nav-registry + a11y contrast) — **PASS**.
- `pnpm docs:validate` — **PASS**.
- `pnpm ux-workpack:validate` — **PASS** (after `ux-workpack:complete`).
- Core vitest, full suite — **3085 passed (193 files)** (+12 new: 3 in
  `tests/combat-tracker.test.ts` UX-SES-006 describe, 8 in `tests/session-recovery.test.ts`,
  plus the extended pure-state test, baseline 3073/192).
- App vitest, full suite — **479 passed (61 files)** (+4 new in
  `tests/unit/session-toasts.test.ts`, baseline 475/60).
- New e2e `apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts` — **20 pass**
  (10 tests × desktop-chromium + mobile-chromium), including the no-leak negative assertion and
  the modal-lock blocked-click assertion.
- Full Playwright suite, BOTH projects — **733 passed, 39 skipped, 0 failed** (baseline 713 + 20
  new; no regressions; final clean run after all changes).

## Files changed

New — Processing Core:
- `packages/core/src/queries/session-recovery.ts` (UX-SES-002 recovery read model)

New — GUI (`apps/gm/src/lib/gui/ux-ses/`):
- `SessionRecoveryGate.svelte`, `SessionStateGate.svelte`, `ToastStack.svelte`,
  `session-toasts.svelte.ts`, `recovery-launch.svelte.ts`

New — tests:
- `packages/core/tests/session-recovery.test.ts`
- `apps/gm/tests/unit/session-toasts.test.ts`
- `apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts`

Modified — core:
- `packages/core/src/state/combat-tracker.ts` (`previousTurn`, `turn-reverted` log kind)
- `packages/core/src/commands/combat.ts` (`handlePreviousCombatTurn`)
- `packages/core/src/commands/types.ts` (`combat.previous-turn` command, `combat.turn-reverted`
  event)
- `packages/core/src/commands/dispatch.ts`, `packages/core/src/schemas/commands.ts`,
  `packages/core/src/index.ts` (registration / schema / exports)
- `packages/core/tests/combat-tracker.test.ts` (UX-SES-006 describe)

Modified — app:
- `apps/gm/src/lib/gui/CombatTracker.svelte` (header strip, row anatomy, current-turn emphasis,
  defeated sort, keyboard hot keys, announce/scroll effect, HP undo toast, pause control,
  state gate)
- `apps/gm/src/lib/gui/DiceTools.svelte` (state gate + roll-failure Retry toast)
- `apps/gm/src/lib/gui/LiveTools.svelte` (shared state gate)
- `apps/gm/src/lib/gui/PrepRecap.svelte` (auto-recap mode + "Create recap notes" CTA)
- `apps/gm/src/routes/session/+page.svelte` (recovery gate + toast stack + toast context)

Generated by the UX workpack commands (do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/epics/UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell.yaml`

## Known gaps / deferred

- **UX-SES-002 full-restore banner is non-blocking by design:** the requirement's either/or arm
  ("either … fully restored … or a recovery prompt") is satisfied by the automatic full restore +
  `role="status"` confirmation strip; the MODAL lock applies to partial restores (where the AC2
  "not interactive" behavior is asserted). A modal lock on every successful restore would block
  the table on every reload for no safety gain — recorded as the chosen interpretation.
- **Recovery surface scope:** the recovery gate mounts on `/session` (the session-tools surface
  the requirement protects); a future shell-level mount could also cover `/` if the Command
  Center grows interactive session tools beyond the phase controls.
- **"Start a new session" CTA on partial restore** is rendered as an "Open Command Center" link
  (the lifecycle controls live there, incl. the confirmed end-session two-step) rather than a
  direct destructive transition inside the recovery dialog.
- **Player-client turn announcement for a hidden active combatant** is verified through the
  rendered placeholder row + the shared announce path using the filtered view name; a two-client
  live announcement assertion needs the deferred transport (ADR-014).
- Row anatomy items not in this epic's ACs — portraits/monster icons, per-row ••• context menu,
  inline HP stepper (UX-SES-005), add/reorder/secret toggles (UX-SES-008) — stay with their own
  requirements (the sibling combat-editing epic).
- The `N`/`P` global shortcuts are active only for the DM during an active session with running
  combat and never fire from text entry; they are not yet listed in the global shortcut help
  reference (owned by UX-SHELL command-surface docs).

## Git evidence

- Branch: `ux/UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell` (base `7aac3c4`, 16/46 UX
  epics complete).
- Commit: `feat(ux): UX-SESSION lifecycle, recovery, and hot-path combat shell` (recorded after
  this evidence file + regenerated UX state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/gm/src/lib/gui/CombatTracker.svelte
 M apps/gm/src/lib/gui/DiceTools.svelte
 M apps/gm/src/lib/gui/LiveTools.svelte
 M apps/gm/src/lib/gui/PrepRecap.svelte
 M apps/gm/src/routes/session/+page.svelte
 M docs/planning/v2/ux/epics/UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M packages/core/src/commands/combat.ts
 M packages/core/src/commands/dispatch.ts
 M packages/core/src/commands/types.ts
 M packages/core/src/index.ts
 M packages/core/src/schemas/commands.ts
 M packages/core/src/state/combat-tracker.ts
 M packages/core/tests/combat-tracker.test.ts
?? apps/gm/src/lib/gui/ux-ses/
?? apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts
?? apps/gm/tests/unit/session-toasts.test.ts
?? docs/planning/v2/ux/epics/UX-SESSION-lifecycle-recovery-and-hotpath-combat-shell.completion.md
?? packages/core/src/queries/session-recovery.ts
?? packages/core/tests/session-recovery.test.ts
```
