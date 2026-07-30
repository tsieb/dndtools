---
name: campaign-session-hub-cluster
description: Audit of gm-react Campaign/Session/CommandCenter/EncounterBuilder/screen-kit — FIXED vs STILL-OPEN split re-verified 2026-07-30 @ 45adf828 (run #14), plus the e2e spec-coupling map and the global unhandledrejection net that invalidates most "silent failure" claims
metadata:
  type: project
---

# Campaign / Session hub cluster — state at HEAD `45adf828` (2026-07-30, run #14)

Files + line counts at HEAD: `screens/Campaign.tsx` 981, `screens/Session.tsx` 2131,
`screens/CommandCenter.tsx` 592, `app/EncounterBuilder.tsx` 709, `app/screen-kit.tsx` 303.

**Run #14 verdict:** the *state/lifecycle* and *announcement* classes are now largely closed. The
remaining top finding is a **workflow dead end** (`recap` traps the DM), then **focus drops from
self-disabling controls**, then **destructive writes with no confirm**.

## ⚠️ READ FIRST — two premises that invalidate whole finding classes

1. **`main.tsx:17-22` installs a global `window.addEventListener('unhandledrejection', …)` that
   fires `Toaster.error('Something didn't save — please try that again.')`.** `SceneRuntime`
   `dispatchNow` (`runtime/SceneRuntime.ts:472-481`) rolls back and RE-THROWS on a persist failure,
   but that throw is NOT silent — the global net toasts it. So "a bare `await runtime.dispatch` is a
   silent failure" is **WRONG** in this app. The residual defect is only (a) a generic message
   instead of an in-context one and (b) any `busy` flag left true without a `finally`.
2. **The frozen-`busy` class is CLOSED in this cluster.** Every busy guard has a `finally`:
   `Session.RecapPanel.save` `:1305-1315`, `SchedulePanel.create` `:1999-2035` (full try/catch/
   finally), `EncounterBuilder.launch` `:249-333`, `Campaign.QuestEditor.save` `:251-322` and
   `FactionEditor.save` `:523-583` (both full try/catch/finally). `Session.dispatch` `:244-255` and
   `Campaign.QuestCardRow.update` `:175-183` have no busy state at all. Do NOT re-report.
3. **`runtime.defaultActorId` returns the PREVIEWED actor while previewing**
   (`SceneRuntime.ts:244-252`). So `Campaign`'s `canAuthor = actorCanAuthorContent(perms, actorId)`
   is false in preview and every author affordance unmounts. Campaign's zero `previewing` references
   are CORRECT BY CONSTRUCTION, not an omission.

## STILL OPEN — ranked, verified at `45adf828`

1. **BLOCKER — `recap` is a workflow dead end and /session's primary CTA is enabled-and-always-fails
   there.** `isLive = workflow === 'active'` (`Session.tsx:104`), so in `recap` the standby Card
   `:327-359` renders "Session is on standby" (wrong label) with a "Go live" whose only gate is
   `disabled={previewing || !isDm}` `:354`. `recap`'s allowed set is `['recap','archived','idle']`
   (`packages/core/src/lifecycle/session-workflow.ts:47`), so `goLive()` `:257-276` fires a
   guaranteed-rejected dispatch → error toast, every press. The phase `Seg` `:619-623` offers only
   prep/active/recap ⇒ from `recap` Prep and Live are both `disabled` and Recap is already checked:
   **no enabled exit exists**. `setWorkflow` `:587-590` already accepts `'idle'`; the option is just
   not rendered. `app/ProjectionControl.tsx:36` computes `canGoLive` correctly and its title reads
   "Finish Recap and return to Standby before going live" — pointing at an action no surface offers.
2. **HIGH — durable HP writes to any NON-active combatant announce nothing.** The one
   `role="status"` `Session.tsx:767-775` renders only the ACTIVE combatant. `HPBar`
   (`ds/components/domain/HPBar.jsx`) is a plain `<div>` (no `role=progressbar`, no live region) and
   `onHp` `:384-390` / `onCondition` `:391-397` pass no `ok` string ⇒ no toast either.
3. **HIGH — `Session.tsx:236-242`** ⌘K handoff opens a fully-live `EncounterDialog` in player
   preview and on a non-live session. `EncounterBuilder.tsx` has **ZERO** `preview`/`isLive`/`isDm`
   references (`grep` = 0 hits); `Session.tsx:535-541` passes none. Start combat `:356-372` is
   enabled whenever `rows.length > 0`.
4. **HIGH — `Session.tsx:1596-1604`** "Push to players" disables itself under focus on SUCCESS
   (`deliverHandout` `:306-309` clears `handoutTitle`; the button is `disabled={…||!title.trim()}`)
   ⇒ focus to `<body>`.
5. **HIGH — `Session.tsx:1003-1022`** "Move X earlier/later in initiative" natively disable
   themselves when the combatant reaches either end of the order, under focus.
6. **HIGH — `Session.tsx:1032-1040` Remove combatant / `:1653-1660` Revoke handout** — irreversible,
   no confirm, no undo, and both unmount the focused control. (`selectedId` is never cleared; the
   "Selected · X" block just disappears at `:312`.) `combat.end` got a `tone="danger"` Dialog
   `:542-571`; these two got nothing.
7. **HIGH — `Session.tsx:1841-1849` "Project to players" / `:1596-1604` "Push to players"** are hard
   `disabled` with the reason unreachable. The soft exemplars are in the same file `:735-753` and in
   `ProjectionControl.tsx:106-130`.
8. MED — `Session.tsx:1289-1301` RecapPanel: switching the Archived-session `Select` re-seeds
   `draft` from canonical, destroying unsaved markdown.
9. MED — `Session.tsx:602` collapses `idle|paused|ending|archived` onto **Prep** while the header
   `:636-642` reads "Standby". For `paused`/`ending` `'prep'` is not allowed ⇒ `Seg`
   (`screen-kit.tsx:162-163`) gets `selectedIndex === -1` and puts the group's single Tab stop on the
   UNCHECKED "Live" while "Prep" is `aria-checked="true"`. LATENT (nothing dispatches
   paused/ending); the `idle` mismatch is live today.
10. MED — `Campaign.tsx:175-183` `QuestCardRow.update()`: no busy guard (rapid objective toggling
    queues N full-array replacements) and no success announcement.
11. MED — `EncounterBuilder.tsx:284-333` start mode ORPHANS an encounter on every retry
    (`encounter.build` persists before `combat.start`).
12. MED — `EncounterBuilder.tsx:377-381` error renders at the TOP of the scrolling Dialog body while
    Start combat is in the FIXED footer.
13. MED — `EncounterBuilder.tsx:504` "Combatants · N" is inert; the dialog has no `role="status"`.
14. MED — `EncounterBuilder.tsx:491-499` Add self-disables (`quickAdd` clears `qName` `:241`);
    `:638-644` per-row Remove unmounts itself. `Dialog`'s `inert` keeps focus inside, so the next Tab
    restarts at the header Close.
15. MED — `Session.tsx:1081-1089` ConditionPicker tiles: `padding:0` button around a non-compact
    `ConditionBadge` (`padding:'2px var(--space-2)'` + `--text-xs`=12px + `line-height:1.4`) ⇒
    **~23px**, under WCAG 2.5.8's 24px.
16. MED — `Session.tsx:936` `ConditionBadge`'s remove derives `aria-label={'Clear ' + text}` from the
    condition alone ⇒ N identical "Clear Poisoned" buttons writing to different creatures. Exactly
    the bug fixed for Heal/Damage at `:951-966`. Needs a `removeLabel` prop on the DS component.
17. MED — `Campaign.tsx:686` tab is local `useState('quests')`, not `?tab=`-backed;
    `CommandCenter.tsx:306` advertises a faction count it cannot deep-link.
18. MED — `Campaign.tsx:771-778, 799-806, 894-901` create launchers unmount on click → `<body>`;
    same on `onClose()`. `app/usePanelFocusReturn.ts` EXISTS and is used in `Board.tsx:55` /
    `SceneEditor.tsx:121-122`.
19. MED — `Campaign.tsx:833-853` NPCs tab has "New NPC" ONLY in its EmptyState; `:911-921` Factions
    EmptyState copy promises "create the first faction dossier" with `action={undefined}`.
20. MED — `CommandCenter.tsx:106-110` `<Icon label>` → `role=img`+`aria-label`
    (`ds/components/core/Icon.jsx:528`) INSIDE the SceneTile `<button>` `:61`, duplicating the
    adjacent "Draft" Badge `:103` in the button's name.
21. MED — `CommandCenter.tsx:511-540` Manage rows have NO hover while `SceneTile` `:59,64-65` and
    `LaunchTile` `:133,138-139` both hand-roll it.
22. MED — same missing-hover cause: `Session.tsx:847-969` (`cursor:pointer`, no response),
    `:886-910` name button, `:1081-1089` condition tiles, `EncounterBuilder.tsx:413-453` roster.
23. LOW — `screen-kit.tsx:22-32` `radioGroupKeyDown` has no Home/End and focuses+clicks disabled
    radios, while `Seg` `:164-215` right below does both correctly. 7 consumers, all outside cluster.
24. LOW — `screen-kit.tsx:254-271` `BackBar`: `padding:0` + 13px font + 16px icon ⇒ ~19px target,
    no hover, no own focus-visible.
25. LOW — `EncounterBuilder.tsx:573`/`:603` visible "×"/"CR" not in the accnames
    `${name} quantity` / `${name} challenge rating` (WCAG 2.5.3).
26. LOW — `EncounterBuilder.tsx:475-482` quick-add HP `min={0}` vs the floor of 1 at `:232`.
27. LOW — `EncounterBuilder.tsx:353-355` Cancel stays live during `submitting`; `:360`
    `disabled={submitting}` natively disables Start mid-write.
28. LOW — `EncounterBuilder.tsx:246,:300` initiative uses `Math.random()`, not the core RNG.
29. LOW — `Session.tsx` i18n half-applied: `t()` at `:265,:274,:282,:286,:303,:488,:497`; raw
    English at `:403,:419,:451,:457,:468,:484,:521,:564` and every panel title.
30. LOW — `CommandCenter.tsx:397` avatar `slice(0,5)` with no "+N"; `:259-290` "New scene"
    bare-navigates (`:264,:448,:462`) despite the create-intent comment.

## VERIFIED NON-DEFECTS (stop re-flagging)
- The global `unhandledrejection` toast (premise 1) + no frozen `busy` (premise 2) + Campaign's
  preview safety (premise 3).
- **`FactionEditor` sending the whole declared field set incl. `secret` CANNOT wipe a DM secret**:
  `actorCanAuthorContent` (`queries/content-query.ts:221-224`) and `projectObjectFieldsForRole`
  (`state/vault-object.ts:332-338`) both gate on `hasDmAuthority`, so anyone who can open the editor
  already received `secret`.
- `Seg` (`screen-kit.tsx:147-235`) now HAS Home/End and skips disabled options; `off = disabled &&
  !on` keeps a checked-but-disabled option clickable.
- Compact `ConditionBadge` + `onRemove` is ≥24px (the remove button sets `minWidth/minHeight:24`).
- No raw hex/`rgba()` in any of the 5 files; the 3 `boxShadow` uses are decorative, never focus rings.
- `QuestEditor`/`FactionEditor` carry `key={id ?? 'new'}`; `EncounterBuilder` resets all drafts in
  its `[open, mode]` effect. No cross-entity draft bleed anywhere in the cluster.
- The app's only `<h1>` is `AppShell.tsx:860` (top bar, OUTSIDE `<main>`) — a global decision.
- `Campaign.tsx:382-386` / `:664-668` `role="alert"` mount WITH their text — correct for `alert`.
- Phone (393×851) fit is fine across all 5 files: every dense row already sets `flexWrap`, all grids
  use `minmax(min(100%,Npx),1fr)` or wrap, and the combat row's badge-wrap fix is pinned by
  `combat.spec.ts:179-235`.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`) — grep BEFORE changing any role/label
| spec:line | selector | source |
|---|---|---|
| combat:56-101 | End-combat Dialog copy `/no undo/i`, Escape/Keep-running, `/^Build encounter/` | `Session.tsx:542-571`, `:727-757` |
| combat:143-147 | `role=list`/`listitem`, "AC 13" | `Session.tsx:820-972` |
| combat:148-149 | `name: 'Heal 1'` / `'Damage 1'` (SUBSTRING) | `:951-966` |
| combat:151-171 | **`name: '<combatant>', exact: true`** on the name button + `aria-pressed` + Enter | `:886-910` |
| combat:172 | `li[aria-current="true"]` | `:849` |
| combat:179-235 | 391px badge-wrap geometry on the name row | `:881-915` |
| combat:243-250 | `getByRole('status')` matching `/Round \d+, turn \d+/` **and** `order.getByRole('status')` = 0 | `:767-775` |
| combat:259-263 | `Heal 1 HP — <name>` / `Damage 1 HP — <name>` distinct per row | `:953,:961` |
| campaign:69,94 | `button 'Create the first quest'` | `Campaign.tsx:799-806` |
| campaign:83,100 | `button 'Create quest'` (and count 0 after close) | `:390-392` |
| campaign:114-121 | objective-as-`button` named by its text | `ds QuestCard` via `:191-199` |
| campaign:138 | `getByLabel('Status of ${title}')` | `:217` |
| campaign:165,169,244,261,268,277,287 | `getByRole('tab', …)` clicks + `button 'New faction'` | `:753-759`, `:894-901` |
| campaign:190 | `button 'Edit ${name}'` | `:441` |
| command-palette:98-111 | ⌘K "Build encounter" MUST open the dialog on a NON-LIVE session | `Session.tsx:236-242` |
| command-palette:125,149-155 | Start combat keeps `aria-disabled='true'` + `title` `/combatant/i` AND `el.disabled === false` | `EncounterBuilder.tsx:356-372` |
| command-palette:126-129 | `getByLabel('Quick add', exact)`, `button 'Add' exact` | `:465-499` |
| command-palette:132 | `getByLabel('Bandit quantity')` | `:579` |
| command-palette:145 | `button /from the draft$/` | `:640` |
| authoring-layout:37,42 | 320px no-h-scroll sweep incl. `/campaign`; then `tab 'Factions'` | `Campaign.tsx` grids |
| a11y-axe-gate:30-31, 218-260 | axe on `/campaign` + `/session` both profiles; `/session#combat` SEEDED running tracker | — |
| responsive:6,10 | clipping sweep of `/session` + `/campaign` (dialogs never open) | — |

**NO spec references** (free to change): "Push to players" / "Project to players" ON /session
(`knowledge.spec:230-282` + `graph.spec:186` own the first string on THEIR routes; `atlas.spec:26,
49,60` + `android-quick-map:352` own the second on the MAP EDITOR), "Revoke handout", "Mark read",
"Session phase", "Save recap"/"Update recap"/"Archived session", "Handout title", "Combatants ·",
"Move … earlier/later", "New quest", "New NPC", "Set date"/"+1 day", "Clear <condition>", the
CommandCenter Manage rows, and the hub hero heading. **Nothing anywhere dispatches or asserts the
`recap` / `paused` / `ending` workflow states**, so finding #1's fix is entirely spec-free.

## Blast-radius rules
- Do NOT convert EncounterBuilder's Start combat to hard `disabled` (`command-palette:151` asserts
  `el.disabled === false`); add a VISIBLE reason and keep a `/combatant/i` `title` branch.
- Do NOT make ⌘K refuse to OPEN the encounter dialog (`command-palette:98-111`).
- Keep `Heal 1` / `Damage 1` as a PREFIX; keep the combat name button's accname EXACTLY the
  combatant's name (`combat:151` is `exact: true`).
- A second `role="status"` on /session is safe only OUTSIDE the initiative `<ul>` (`combat:249`).
- A `?tab=` sync on Campaign must use `{replace:true}` and must not clobber the `location.state`
  create-intent at `Campaign.tsx:696-703`.

See [[char-encounter-cluster]], [[ds-layer-audit]], [[gm-react-ds]], [[completion-pass-ux-patterns]].
