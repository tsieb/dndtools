# Completion — UX-SESSION-tools-encounters-dice-timers-prep-calendar

UX workpack status: `complete`

Epic: Session Tools, Encounters, Dice, Timers, Prep, and Calendar (phase "05 Live-Play
Workspaces", P1). Requirement coverage: `UX-SES-009` (`UX-SES-009-S01`), `UX-SES-010`
(`UX-SES-010-S01`), `UX-SES-011` (`UX-SES-011-S01`), `UX-SES-012` (`UX-SES-012-S01`),
`UX-SES-013` (`UX-SES-013-S01`), `UX-SES-014` (`UX-SES-014-S01`), `UX-SES-015`
(`UX-SES-015-S01`).

## Summary

Brought the supporting live-play tools on the `/session` route up to the UX-requirements
contract: encounter building with live challenge guidance and one-action combat start, dice
tools with a real advantage/disadvantage selector and spec-anatomy roll history, a true timer
countdown with urgency/expiry semantics and operator/manager affordance gating, quick-reference
polish, the prep/recap mode radiogroup + editable recap draft, and campaign-calendar inline
validation with canonical cross-actor date rendering.

**UX-SES-009 — Encounter Builder.** The challenge guidance is now a PERSISTENT `role="status"`
`aria-live="polite"` banner (`aria-label="Encounter difficulty: [band], [N] points"`) whose
difficulty pill recomputes synchronously from the pure core `computeEncounterChallenge` as the
draft changes — no button (AC1: adding a Deadly set flips the pill to "deadly" within the same
render). With a blank title the Build button is INACTIVE (`aria-disabled="true"` +
`aria-describedby` "Enter a title to build", dimmed) but stays focusable; activating it surfaces
the inline requirement error (AC3). Each saved encounter card gained a one-action
"Start combat" button (`start-combat-encounter-{id}`, active-session gated) that dispatches the
existing `combat.start` with the `encounterId` — the core expands stored quantity groups
("Goblin 1"…"Goblin 5") into the tracker on the same route (AC2). Draft cards show
Qty/CR/HP/AC; remove buttons carry "Remove [Name] from encounter draft" labels; form bounds
follow the spec (title ≤64 chars, party 1–20 size / 1–20 level, qty 1–20, terrain ≤500 chars);
a "Party: N × Lvl M" inline summary renders.

**UX-SES-010 — Dice Tools.** The dice panel is a programmatic focus target whose FIRST tabbable
control is the expression input (AC1), with `aria-label="Dice expression"` + a visually-hidden
grammar hint via `aria-describedby`. New 3-state segmented control "↓ Disadvantage | — Normal |
↑ Advantage" (`role="radiogroup"`/`role="radio"`, Left/Right/Up/Down arrows move the checked
segment, selected segment uses the accent fill): Advantage/Disadvantage rewrite a d20-only
expression through the NEW pure core transform `applyAdvantageToExpression`
(`packages/core/src/state/dice.ts`) — `d20+5` → `2d20kh1+5` / `2d20kl1+5` preserving modifiers
(AC2); any other expression rolls UNCHANGED with the inline clarification "Advantage applies to
d20 rolls — use kh1 notation for other dice." The Roll button is disabled while the expression
is empty or the session inactive (`aria-keyshortcuts="Enter"`); a successful roll announces
"[Label: ]expression → total" politely through the shared LiveAnnouncer (derived from the
roller's own actor-filtered view — cannot leak). The DM-only rollable-tables section sits
behind the shared collapsed-by-default `Disclosure` ("Tables"). History renders NEWEST-FIRST,
capped at 100 visible entries in a scrollable list (AC4).

**UX-SES-011 — roll history entry anatomy.** Each entry now renders: actor display name ·
[label:] expression → **total** · every rolled die value in roll order with DROPPED dice in
parentheses ("18, (9)" for `2d20kh1`) · the visibility badge — "DM only" (DM-only token chip +
purple left border / subtle background from the `--color-dm-only-*` group) or "Shared" (green
status chip), no badge for session-visible (AC1). Entries carry
`aria-label="[Actor]: [expr] → [total], [label] (private, DM only)"`. Table draws show
`([Table: name] "row text")` inline — no hover needed (AC3); the table name resolves through the
actor-filtered content read (an invisible table degrades to row-text-only). The DM-only line
"N hidden roll(s) in this session" (`aria-live="off"`) counts the session's dm-only rolls and
never renders for a non-DM. AC2 (player DOM contains NO node for a DM-only roll) is enforced by
the unchanged core read model (`getDiceHistoryForActor` omits entirely) and proven by a
`page.content()` negative assertion.

**UX-SES-012 — Timer widget.** New PURE core countdown view
(`packages/core/src/queries/timer-countdown.ts`): `getTimerCountdown(timer, nowIso,
fullDuration)` derives status (stopped/running/paused/expired), remaining seconds, the
arm's-length display (`M:SS`, switching to `S.s` in the final 10 running seconds, `0:00`
expired), the bar's remaining fraction, and the urgency band (danger ≤10 s, warning ≤30%
remaining). `timer.pause` now FOLDS the elapsed running time into the remaining duration
(`packages/core/src/commands/widget-command.ts`) so pause/resume cycles never lose time. The GUI
tick is the new platform-layer `SessionClock` (`apps/gm/src/lib/platform/clock.svelte.ts`,
200 ms, started only while the core timer is running) — no GUI-owned countdown state, no banned
primitives (setInterval/time stay in the platform layer per Contract 1). The widget renders
32 px-class numerals (`--text-3xl`, tabular numerals) in a `role="timer"`
`aria-label="Time remaining: …"` region, a 4 px depleting bar (success → warning → error tokens),
a "Running/Paused/Stopped/Time's up" status label, red+bold numerals at danger (bold weight is
the non-color/reduced-motion fallback; transitions use `--duration-*` tokens so reduced motion
collapses them), a "Time's up!" `role="alert"` banner at zero (AC3), and a one-shot assertive
"10 seconds remaining" announcement (`untrack`-wrapped inside the `$effect`). Controls are
capability-gated IN THE RENDER as well as in the core: operators (and managers/DM) get contextual
▶ Start / ⏸ Pause / ▶ Resume plus "Skip +30s" and "⟲ Reset"; "Set duration" (number input + Set)
renders ONLY for manager/DM (AC2 — an operator never sees it; the core still rejects fail-closed,
covered in `packages/core/tests/widget-operator-authority.test.ts`). Start uses the
manager-configured widget duration. The DM-only grant/project section is unchanged.

**UX-SES-013 — Quick Reference.** Kept the durable by-reference pin model (panels persist
across routes; hidden/deleted targets degrade to "Reference unavailable…" with zero content —
AC1/AC2 were already covered by `session-handouts-and-tools.spec.ts`, AC3 thread→digest by
`session-prep-recap-and-calendar.spec.ts`). This epic added the spec'd guided empty state
("No pinned panels. Use the form above to pin a note."), list/`listitem` accessible names that
NEVER carry target content in the unavailable state (`"[label] — reference unavailable"`),
`aria-label="Unpin [label]"`, a kind chip, and an "Open full note" link (→ `/knowledge/`) on
available note panels.

**UX-SES-014 — Prep & Recap digest.** The mode selector is now the spec'd "Prep | Recap"
segmented `role="radiogroup"` (arrow keys toggle; auto-switch to Recap on the session entering
the recap state is retained, once per entry). The non-DM presentation is fully fail-closed at
the GUI as well as the core: a player sees ONLY the `role="status"` guard message "The
prep/recap digest is available to the DM only." — no mode selector, no CTA, no section
headings, no empty lists (AC2). Digest sections are labelled `<section>`s; recent changes cap
at 10 with a "Showing 10 of N changes." line. "Create recap notes" (recap state, DM) now opens
an EDITABLE pre-populated draft (title + structured template body derived purely from the
digest: combat summary with log entry count, handouts delivered, unresolved threads, continuity
prompts — no AI); "Save recap note" dispatches the ordinary durable `content.create-item`
(dm-only note) and announces "Recap draft created: [title]" politely (AC3).

**UX-SES-015 — Campaign calendar.** The current date renders inside a `<time
datetime="[isoLike]">` element using the CONTENT-011 canonical formatter — byte-identical on
every client (AC1, proven DM vs player in e2e). The set-date form gained its OWN inline error
(`campaign-date-error`): an invalid day (31 in 30-day Hammer) is rejected fail-closed by the
core's `validateCustomDate` BEFORE any write and the displayed date provably does not change
(AC3). A non-DM with no calendar defined sees "No campaign calendar defined." (the define CTA
stays DM-only). Links carry `aria-label="[Label], [date]"` (or "[Label] — target unavailable" —
no content in the unavailable accessible name), and Unlink buttons are labelled
"Unlink [Label]". The hidden-target degradation (AC2) remains the actor-filtered core read,
already proven in `session-prep-recap-and-calendar.spec.ts`.

## Demo path / surfaces

`/session` (DM and `View as` player), `/` (workflow toolbar for active/ending/recap),
`/knowledge/` (table + note authoring used by the dice/quick-reference flows).

- **UX-SES-009:** add 2× CR 17 dragons against a 4 × Lvl 1 party → the banner pill flips to
  "deadly" as the second combatant lands (no button); blank-title Build is dimmed +
  `aria-disabled` and explains itself inline on activation; build "War party" (Goblin ×5) →
  "Start combat" on the saved card → tracker opens with Goblin 1–5 in Round 1.
- **UX-SES-010/011:** focus the dice panel → Tab lands on the expression input; pick
  "↑ Advantage", type `d20+5`, Enter → entry reads `2d20kh1+5 → N [18, (9)]`; type `2d6+3` under
  Advantage → inline "Advantage applies to d20 rolls…" hint and the roll lands unchanged; a
  dm-only "AMBUSHSECRET7Q" roll shows the "DM only" chip + purple entry treatment + "1 hidden
  roll in this session"; as the player the entry count drops to 2 and the marker is absent from
  the ENTIRE page HTML.
- **UX-SES-012:** set duration 8 → Start → red bold numerals in `S.s` format + red bar
  immediately (8 s ≤ the 10 s band) on Desktop and Mobile; set duration 1 → Start → "Time's up!"
  `role="alert"` banner + `0:00` within ~1.2 s. As an operator-granted player: Start/Pause/
  Resume/Skip/Reset work, "Set duration" does not exist in the DOM.
- **UX-SES-014:** as a player the digest panel contains exactly one guard sentence; as the DM in
  recap state the panel auto-switches to Recap, "Create recap notes" opens the pre-filled
  editable draft, Save creates the dm-only note and announces it.
- **UX-SES-015:** define the demo calendar, set 15 Ches 1372 → "15 Ches 1372 DR"; setting day 31
  of Hammer shows the inline error and the date stays; `View as` player renders the identical
  string.

Platform parity: identical commands and controls on both Playwright projects (the new spec runs
desktop-chromium AND mobile-chromium); stacked flex layouts wrap under the compact viewport; all
new buttons sit on the global 44 px comfortable-density floor; countdown numerals stay ≥24 px on
every profile (`--text-3xl`).

## Requirement coverage / traceability

| Requirement / AC | Implementation | Test |
|---|---|---|
| **UX-SES-009** live banner ≤100 ms; one-action start; blank-title inactive + inline error | `apps/gm/src/lib/gui/EncounterBuilder.svelte` (status banner + pill tokens, `aria-disabled` build, `startCombatFromEncounter` → `combat.start`, bounds, remove labels) | e2e `apps/gm/tests/e2e/session-tools-dice-timers-prep-calendar.spec.ts` "UX-SES-009 AC1/AC3 —", "UX-SES-009 AC2 —"; existing `session-combat-and-encounters.spec.ts` still green (both projects) |
| **UX-SES-010** Tab→expression; advantage 2d20kh1 semantics; dm-only filtered; newest-first scrollable | core `applyAdvantageToExpression` (`packages/core/src/state/dice.ts`); `apps/gm/src/lib/gui/DiceTools.svelte` (radiogroup + arrows, hint, gated Roll, Disclosure tables, newest-first slice/reverse + scroll container, polite announce) | core `packages/core/tests/dice-engine.test.ts` "UX-SES-010 advantage/disadvantage…" (3 tests); e2e "UX-SES-010 AC1/AC2 —", "UX-SES-010 AC4 / UX-SES-011 —" |
| **UX-SES-011** DM-only badge; zero player DOM trace; table row text inline | `DiceTools.svelte` (entry anatomy: actor, dice-values w/ dropped dice, badges, dm-only border, hidden-count line, entry aria-labels, table-name resolution) — read model unchanged (`getDiceHistoryForActor`) | e2e "UX-SES-010 AC4 / UX-SES-011 —" (badge, hidden count, `page.content()` negative, count drop); updated `session-dice-and-tables.spec.ts` SES-008 (row text + table name, append path) |
| **UX-SES-012** red numerals/bar ≤10 s; operator sees no Set duration; expiry `role="alert"` | core `packages/core/src/queries/timer-countdown.ts` + pause-fold (`packages/core/src/commands/widget-command.ts`); platform `apps/gm/src/lib/platform/clock.svelte.ts`; `apps/gm/src/lib/gui/LiveTools.svelte` (role=timer display, bar, urgency announce, contextual operate controls, manager-only configure) | core `packages/core/tests/timer-countdown.test.ts` (6 tests: view model + pause-fold dispatch) + updated `widget-operator-authority.test.ts`; e2e "UX-SES-012 AC1/AC3 —" + updated `session-handouts-and-tools.spec.ts` SES-005 (AC2: configure absent for operator) |
| **UX-SES-013** persistence; unavailable w/o leak; thread→digest | `apps/gm/src/lib/gui/QuickReference.svelte` (guided empty state, list semantics, no-content unavailable aria-labels, unpin labels, open link) — durable pin model unchanged | existing e2e `session-handouts-and-tools.spec.ts` SES-007 (AC1 persistence, AC2 degradation) + `session-prep-recap-and-calendar.spec.ts` SES-009 (AC3); new spec "UX-SES-013 / UX-SES-014 —" (empty state + player absence) |
| **UX-SES-014** auto-recap + log count; player guard only; editable pre-populated draft | `apps/gm/src/lib/gui/PrepRecap.svelte` (mode radiogroup, fail-closed non-DM render, labelled sections, 10-change cap, recap draft form + announce) | updated e2e `session-lifecycle-recovery-combat-shell.spec.ts` "UX-SES-001 AC3 —" (auto-switch + draft + save); new spec "UX-SES-013 / UX-SES-014 —" (guard-only player render); existing `session-prep-recap-and-calendar.spec.ts` SES-009 (digest sources + no-leak) |
| **UX-SES-015** identical date string on player; unavailable link no leak; invalid day inline | `PrepRecap.svelte` (`<time datetime>` canonical render, `campaign-date-error` inline, calendar-undefined state, link/unlink aria-labels) — validation is the core's `validateCustomDate` (pre-existing, fail-closed) | new spec "UX-SES-015 AC1/AC3 —" (DM/player string equality, invalid-day inline error + unchanged date); existing `session-prep-recap-and-calendar.spec.ts` SES-012 (AC2 unavailable link no-leak) |

## Actor-safety / no-leak evidence

- Dice: the player path is unchanged — the SINGLE sanctioned read (`getDiceHistoryForActor`)
  omits a dm-only roll entirely; the new entry anatomy renders only fields from that filtered
  view. New negative e2e: as the player, the dm-only marker is absent from the ENTIRE
  `page.content()` and the entry count excludes it; the hidden-count line renders only for the
  DM. The roll announcement derives from the roller's own filtered view; the new spec reloads
  before switching actors because the harness shares one live region (a real player client never
  receives DM announcements).
- Encounter prep stays DM-only (`encounter-builder` renders for no other actor; the
  actor-filtered encounter list returns nothing — existing negative e2e still green).
- Prep/recap digest: the non-DM render now contains literally one guard sentence — asserted as
  zero `h4`/`ul`/`li` nodes inside the digest panel and zero mode-selector/CTA testids, plus the
  pre-existing dm-only thread-title negative assertion.
- Calendar links and quick-reference panels keep the by-reference + actor-filtered-resolution
  model; unavailable states (and their NEW aria-labels) carry no target content.
- Timer state carries no DM-secret content; capability gating got STRICTER in the GUI
  (operator never renders configure affordances) while the core authority boundary is untouched
  and still covered fail-closed both ways by core tests.

## Accessibility evidence

- Challenge banner: `role="status"` + `aria-live="polite"` + difficulty-in-label; the pill color
  bands are token-based and the band NAME is the text content (never color alone).
- Build button: `aria-disabled` + visually-hidden `aria-describedby` requirement hint; the
  keyboard activation path (focus + Enter) surfaces the same inline error as pointer.
- Dice: radiogroup with roving tabindex + arrow keys (keyboard parity with the pointer
  segments); expression grammar hint via `aria-describedby`; `aria-keyshortcuts="Enter"`;
  entries carry full accessible names including "(private, DM only)"; polite roll announcements
  through the single LiveAnnouncer.
- Timer: `role="timer"` labelled region; "Time's up!" is `role="alert"` (fires on insertion);
  the 10-second urgency transition announces ONCE assertively (`untrack`-wrapped in `$effect` —
  no loops); urgency is color + bold weight + the `S.s` format change (non-color signals);
  transitions ride `--duration-*` tokens so reduced-motion collapses them; `--easing-spring`
  was NOT used (reserved for dice celebration surfaces; none added).
- Prep/recap: mode radiogroup with arrows; non-DM guard is `role="status"`; digest sections are
  labelled `<section>`s; recap-draft announce is polite.
- Calendar: `<time datetime>` canonical machine value; all date/link inputs labelled; unlink and
  unpin buttons carry per-item labels.
- All new interactive targets are standard buttons/inputs on the global 44 px
  comfortable-density floor; no pointer-only or hover-only affordance was added (the spec's
  hover Copy-total tooltip was deliberately NOT shipped — see gaps).

## Tests / gates run

- `pnpm typecheck` — core `tsc` + app `svelte-check`: **0 errors, 0 warnings (4740 files)**.
- `pnpm lint` (full eslint + boundary + nav-registry + a11y contrast) — **PASS** (zero new
  disables; the platform clock uses `SvelteDate` per `svelte/prefer-svelte-reactivity`).
- `pnpm docs:validate` — **PASS**.
- `pnpm ux-workpack:validate` — **PASS** (after `ux-workpack:complete`).
- Core vitest, full suite — **3105 passed (194 files)** (+10 over the 3095/193 baseline: 3
  advantage-transform in `packages/core/tests/dice-engine.test.ts`, 6 in the new
  `packages/core/tests/timer-countdown.test.ts`, +1 net from the updated pause-fold
  expectations in `widget-operator-authority.test.ts`).
- App vitest, full suite — **480 passed (61 files)** (baseline unchanged).
- New e2e `apps/gm/tests/e2e/session-tools-dice-timers-prep-calendar.spec.ts` — **14 pass**
  (7 tests × desktop-chromium + mobile-chromium), including the no-leak negatives.
- Updated e2e (`session-dice-and-tables`, `session-handouts-and-tools`,
  `session-lifecycle-recovery-combat-shell`) plus the adjacent session/collab specs — **70
  pass** on both projects.
- Full Playwright suite, BOTH projects — **763 passed, 39 skipped, 0 failed** (baseline 749 + 14
  new; no regressions; final clean run after all changes).

## Files changed

New — core:
- `packages/core/src/queries/timer-countdown.ts` (UX-SES-012 pure countdown view model)
- `packages/core/tests/timer-countdown.test.ts`

New — app:
- `apps/gm/src/lib/platform/clock.svelte.ts` (platform-layer SessionClock tick; no banned
  primitives, no exception entry needed)
- `apps/gm/tests/e2e/session-tools-dice-timers-prep-calendar.spec.ts`

Modified — core:
- `packages/core/src/state/dice.ts` (`applyAdvantageToExpression`, `DiceAdvantageMode`,
  `AdvantageTransformResult`)
- `packages/core/src/commands/widget-command.ts` (`timer.pause` folds elapsed →
  `remainingSecondsAt`)
- `packages/core/src/index.ts` (exports)
- `packages/core/tests/dice-engine.test.ts`, `packages/core/tests/widget-operator-authority.test.ts`

Modified — app:
- `apps/gm/src/lib/gui/EncounterBuilder.svelte` (UX-SES-009)
- `apps/gm/src/lib/gui/DiceTools.svelte` (UX-SES-010/011)
- `apps/gm/src/lib/gui/LiveTools.svelte` (UX-SES-012)
- `apps/gm/src/lib/gui/QuickReference.svelte` (UX-SES-013)
- `apps/gm/src/lib/gui/PrepRecap.svelte` (UX-SES-014/015)
- `apps/gm/tests/e2e/session-dice-and-tables.spec.ts` (tables disclosure + row-text anatomy)
- `apps/gm/tests/e2e/session-handouts-and-tools.spec.ts` (UX-SES-012 AC2: configure absent for
  operator; contextual controls; "Running"/"Paused" labels)
- `apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts` (mode radiogroup +
  recap-draft flow)

Workpack/docs:
- `docs/planning/v2/ux/workpack-state.yaml` + regenerated UX planning files (status commands only)
- `docs/planning/v2/ux/epics/UX-SESSION-tools-encounters-dice-timers-prep-calendar.completion.md`
  (this file)

## Known gaps / scoping

- Roll-entry hover affordances ("Copy total" tooltip, per-entry "Append to note") were not
  shipped: clipboard access would need a new platform probe + exception entry, and hover-only
  controls violate the no-pointer-only rule; the existing labelled append form remains the
  keyboard/touch-parity path. A future pass can add per-entry buttons alongside a clipboard
  platform service.
- Quick-reference drag reorder (DM "can reorder via drag") is not implemented; pins keep
  newest-first pin-date order. The spec's panel content/degradation/persistence contracts are
  complete.
- "Open full note" links to the Knowledge workbench route (no per-item deep-link parameter
  exists yet on `/knowledge/`); it never renders for unavailable panels.
- Mobile renders the same stacked sections rather than literal tab/bottom-sheet recompositions
  (consistent with every prior UX-SES epic in this app shell); commands, targets, and keyboard/
  touch parity are identical on both tested projects.
- The timer alarm sound is deferred to the audio-atmosphere surface (per the spec's reference to
  `13-audio-atmosphere.md`); "Project to player" and grant flows are unchanged from SES-005.
- `getDiceHistoryForActor.hiddenCount` (viewer-relative) is kept for the core contract; the
  DM-facing "N hidden roll(s)" line derives the dm-only count from the DM's own filtered view in
  the GUI.

## Git evidence

Branch: `ux/UX-SESSION-tools-encounters-dice-timers-prep-calendar` (single commit
`feat(ux): UX-SES session tools, encounters, dice, timers, prep, calendar`).

`git status --short` before the final commit (all changes staged in the epic commit; clean after):

```
 M apps/gm/src/lib/gui/DiceTools.svelte
 M apps/gm/src/lib/gui/EncounterBuilder.svelte
 M apps/gm/src/lib/gui/LiveTools.svelte
 M apps/gm/src/lib/gui/PrepRecap.svelte
 M apps/gm/src/lib/gui/QuickReference.svelte
 M apps/gm/tests/e2e/session-dice-and-tables.spec.ts
 M apps/gm/tests/e2e/session-handouts-and-tools.spec.ts
 M apps/gm/tests/e2e/session-lifecycle-recovery-combat-shell.spec.ts
 M docs/planning/v2/ux/epics/UX-SESSION-tools-encounters-dice-timers-prep-calendar.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M packages/core/src/commands/widget-command.ts
 M packages/core/src/index.ts
 M packages/core/src/state/dice.ts
 M packages/core/tests/dice-engine.test.ts
 M packages/core/tests/widget-operator-authority.test.ts
?? apps/gm/src/lib/platform/clock.svelte.ts
?? apps/gm/tests/e2e/session-tools-dice-timers-prep-calendar.spec.ts
?? docs/planning/v2/ux/epics/UX-SESSION-tools-encounters-dice-timers-prep-calendar.completion.md
?? packages/core/src/queries/timer-countdown.ts
?? packages/core/tests/timer-countdown.test.ts
```
