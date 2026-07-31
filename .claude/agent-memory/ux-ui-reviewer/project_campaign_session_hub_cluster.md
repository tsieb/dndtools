---
name: campaign-session-hub-cluster
description: Audit of gm-react Campaign/Session/CommandCenter/EncounterBuilder/screen-kit — FIXED vs STILL-OPEN split re-verified 2026-07-31 @ e702bb6f (run #21). Run #14's recap dead end AND run #15's standby-teardown regression are both CLOSED; the new lead is the phase Seg being the ONLY ungated lifecycle control on the screen.
metadata:
  type: project
---

# Campaign / Session hub cluster — state at HEAD `e702bb6f` (2026-07-31, run #21)

Line counts at HEAD: `screens/Campaign.tsx` 988, `screens/Session.tsx` 2218,
`screens/CommandCenter.tsx` 603, `app/EncounterBuilder.tsx` 734, `app/screen-kit.tsx` 375.

Only `21e4f86e` touched this cluster since run #15 (Campaign +7, CommandCenter +19, Session +51).
`EncounterBuilder.tsx` and `screen-kit.tsx` are UNCHANGED since run #15 — every item against them
still stands verbatim.

**Run #21 verdict:** the destructive-transition work is done and well done. What is left is a single
structural hole — **`SessionHeader` is the one control on /session with no `previewing`/`isDm`
prop** — plus a parchment/forced-colors contrast problem that run #17 *promoted* by turning the
CommandCenter hub labels into `<h2>`s, plus the long-standing focus-drop / no-announcement backlog.

## ⚠️ READ FIRST — premises that invalidate whole finding classes (all re-verified)

1. `main.tsx:17-22` global `unhandledrejection` → toast. A bare uncaught `await runtime.dispatch` is
   GENERIC, not silent. Only report a missing catch where the UI ALSO lies.
2. Frozen-`busy` is CLOSED cluster-wide. Every busy guard has `finally`.
3. `runtime.defaultActorId` returns the PREVIEWED actor, so Campaign's zero `previewing` refs are
   correct **for its dispatches** — but see OPEN #1 for why "the runtime rejects it" is not a UI story.
4. **`Seg` (`screen-kit.tsx:206-294`) is selection-follows-focus.** `moveSelection` `:223-233` calls
   `onChange` on every Arrow/Home/End and it SKIPS disabled options. From `active` the transition
   table (`packages/core/src/lifecycle/session-workflow.ts:39-49`) disables `prep`, so **ArrowLeft on
   "Live" lands on Standby and Home lands on Standby** — both now hit the confirm.
5. **`ds/Button` strips `onClick` entirely when `aria-disabled` is truthy** (`Button.jsx:25-26,87`).
   Any `setError` inside such a handler is DEAD CODE. This is why EncounterBuilder's
   `'Pick at least one combatant.'` can never render.
6. `--color-text-tertiary` (`T.ter`) is only guaranteed AA on `--color-surface-raised`. MEASURED:
   parchment `#837057` on `--color-bg` `#f3ebdd` = **4.01:1 FAIL**, on `--color-surface` `#fdf8f0`
   = **4.49:1 FAIL (marginal)**, on `--color-surface-raised` `#ffffff` = 4.75 PASS. Dark theme
   `#9d8d75` passes everywhere (5.86 / 4.89). Under `forced-colors: active`, `colors.css:379` maps
   `--color-text-tertiary` → **`GrayText`**, the system DISABLED colour.

## FIXED since run #15 — do NOT re-report

- **run #15 OPEN #1 (the standby-teardown regression) — CLOSED.** `standbyConfirmOpen` state
  `Session.tsx:234`, danger Dialog `:606-635`, gate `:658` (`target==='idle' && workflow==='active'`
  — correctly scoped so `combat.spec.ts:328`'s recap→idle path still needs no dialog).
  Pinned by `combat.spec.ts:340-380`.
- **run #15 OPEN #2 — phase transitions announce.** `workflowAnnounce()` `:265-269` + both dispatch
  sites `:625-628`/`:659-662`. Pinned by `combat.spec.ts:373-379` (`'Session archived into Recap'`).
- **run #15 OPEN #3 — CommandCenter headings.** Hero `<h2>` `:384`, `HubLabel` `<h2>` `:42`.
- **run #15 OPEN #4 — Campaign save announcements.** `Toaster.success` `Campaign.tsx:319` / `:583`.
  Pinned by `campaign.spec.ts:88` (`Created “<title>”`).
- **run #15 OPEN #16 — the CommandCenter draft padlock** is now an unlabelled (aria-hidden) `Icon`
  `CommandCenter.tsx:117`, so the tile no longer double-announces "Draft".
- Earlier: recap dead end / `canGoLive`, `WORKFLOW_LABEL` honesty, NPC tiles, quest+faction editor
  try/catch/finally + `key`, combat `<li>`+`aria-pressed` rows, End-combat danger Dialog,
  `— none —` Stage option, Day/Year drafts, ⌘K create-intent, `liveScene`, `isLive` off workflow,
  CR string drafts, Start-combat aria-disabled+title, `builtIdRef`, quick-add HP `min={1}`,
  `radioGroupKeyDown` Home/End, `BackBar` padding+hover, `QuestCard` objectives.

## STILL OPEN — ranked, verified at `e702bb6f`

1. **BLOCKER — `Session.tsx:335-339` / `:666-673` `SessionHeader` takes NO `previewing`/`isDm`.**
   It is the ONLY control on /session without them (`grep -c previewing Session.tsx` = 56; the Seg
   is the sole abstainer). While previewing as a player on a LIVE session, clicking Seg→Standby
   raises the full-red **"End the live session?"** dialog describing a catastrophic teardown; "End
   session" then dispatches, is rejected read-only, and the DM gets a generic error toast. A
   player/observer actor gets the same fully-enabled radiogroup. Fix: pass `previewing`/`isDm`,
   `disabled: !allowed.has(x) || previewing || !isDm` per option (or `aria-disabled` + `title`, to
   match Go live `:379-388`), and short-circuit `setWorkflow` `:651` before opening the dialog.
   ⚠️ `combat.spec.ts:312-313` asserts `radio 'Standby'` is `toBeEnabled()` and `:346` clicks it —
   both run as the DM, not previewing, so gating on `previewing || !isDm` is SPEC-SAFE.
2. **HIGH — `CommandCenter.tsx:42` `HubLabel`'s new `<h2>` uses `eb` (`T.ter`) directly on
   `--color-bg`.** Parchment = **4.01:1, WCAG 1.4.3 FAIL** at 11px; under `forced-colors: active`
   the four structural headings (Scenes/Create/Manage/Library) render in **`GrayText`** and read as
   disabled. Same token/background pair at `SceneTile` `:123-125` (4.49 on `--color-surface`),
   Manage `meta` `:545-547`, Library counts `:592-594`. Fix: `color: T.sub`
   (`--color-text-secondary`) for `eb` at least where it lands on `--color-bg`/`--color-surface`.
   ZERO e2e refs.
3. **HIGH — `EncounterBuilder.tsx:381-395` Start is a dead button, and its own error is dead code.**
   `aria-disabled={rows.length===0||undefined}` ⇒ `Button.jsx:87` drops `onClick` ⇒ `launch()`
   `:260-264`'s `setError('Pick at least one combatant.')` can NEVER render, and the only channel
   for the reason is `title` (pointer-only — inert on touch). With a FULL roster, `error` renders at
   `:400-404`, the TOP of Dialog's scrolling body, while Start is pinned in the fixed footer ⇒ press
   Start, see and hear nothing. `disabled={submitting}` `:385` additionally hard-disables under
   focus mid-write. Fix: render the blocked reason as visible text beside Start; keep
   `el.disabled === false` (`command-palette.spec.ts:155-159`); add `role="status"`.
4. **HIGH — `EncounterBuilder.tsx` has ZERO `preview`/`isLive`/`isDm` refs** (grep = 0) and
   `Session.tsx:569-575` passes none ⇒ ⌘K opens a fully-live builder in player preview / on
   standby. Must still OPEN (`command-palette.spec.ts:100-114`); add an in-dialog banner + a
   soft-disabled Start, not a refusal.
5. **HIGH — `Session.tsx:2205-2210` PartyPanel LIES about un-statted PCs.**
   `current={p.combat?.hp ?? 0} max={p.combat?.maxHp ?? 1}` ⇒ `HPBar.jsx:9-11` renders a red,
   empty **"0/1"**. `character-query.ts:53-56` DELETES individual `combat.*` keys for a non-DM
   viewer, so previewing as a player makes the whole party read as dead. Fix: render "—" when
   `hp`/`maxHp` are absent.
6. HIGH — durable HP writes to a NON-ACTIVE combatant announce nothing. `onHp` `:418-424`,
   `onCondition` `:425-431`, `onReorder` `:439-445` and `ConditionPickerDialog onPick` `:639-646`
   pass no `ok`; the one `role="status"` `:854-862` renders ONLY the active combatant; `HPBar` has
   no ARIA. A 2nd region must sit OUTSIDE the `<ul>` (`combat.spec.ts:252` asserts
   `order.getByRole('status')` = 0) and must not contain `Round \d+, turn \d+` (`:246-250`).
7. HIGH — `Session.tsx:1683-1691` "Push to players" natively disables itself ON SUCCESS
   (`deliverHandout` `:320-323` clears the title) ⇒ focus to `<body>`.
8. HIGH — `Session.tsx:1090-1109` Move earlier/later natively disable at either end, under focus.
9. HIGH — `Session.tsx:1119-1127` Remove combatant / `:1740-1747` Revoke handout: irreversible, no
   confirm, no undo, both unmount the focused control. (Remove DOES now toast
   `${name} removed from combat` `:433-438`.) No e2e refs on /session for either.
10. MED — `Campaign.tsx:386-390` / `:671-675` validation is REMOTE and unassociated. "A quest needs
    a title." (`:252-255`) renders as a bare `role="alert"` span at the BOTTOM of a 5-field form,
    with no `aria-invalid`/`aria-describedby` on the Title Input and no focus move. `ds/Field`
    already does all three via its `error` prop (`Field.jsx:30-40,76-83`). Routing it there is
    SPEC-SAFE — `campaign.spec.ts:70,99,174` use `getByLabel('Title'/'Name', exact)`, which survives
    `aria-invalid`/`aria-describedby`.
11. MED — `Session.tsx:1928-1936` "Project to players" hard `disabled` with no reason; the soft
    exemplars are `:814-844` and `ProjectionControl.tsx:103-124`.
12. MED — `Session.tsx:1023` `ConditionBadge onRemove` ⇒ DS derives `aria-label={'Clear ' + text}`
    from the condition alone (`ConditionBadge.jsx:81`) ⇒ N identical "Clear Poisoned" buttons on
    different creatures. Needs a `removeLabel` prop.
13. MED — `Session.tsx:1061-1071` the "Selected · X" action bar mounts BELOW the whole initiative
    list with no announcement and no focus move; the name button `:973-997` has `aria-pressed` but
    no `aria-controls`. On a phone with 8 combatants the new controls are off-screen.
14. MED — `Session.tsx:1385-1388`/`:1459-1467` RecapPanel: switching the Archived-session `Select`
    re-seeds `draft` from canonical, destroying unsaved markdown.
15. MED — `Campaign.tsx:693` tab is local `useState('quests')`, no `?tab=`, so it resets on every
    remount while `CommandCenter.tsx:315` advertises a faction count it cannot deep-link.
    ⚠️ Any `?tab=` sync must use `{replace:true}` and not clobber the create-intent at `:703-710`.
16. MED — `Campaign.tsx:840-895` the NPCs tab's ONLY create affordance is inside its EmptyState
    `:846-859`; once one NPC exists there is no "New NPC" anywhere, unlike Quests `:776-787` and
    Factions `:899-910`.
17. MED — `Campaign.tsx:175-183` `QuestCardRow.update()` has no busy guard: rapid objective toggling
    queues N whole-array replacements, last-write-wins.
18. MED — `Campaign.tsx:771-778 / 799-816 / 899-910` create launchers unmount on click → `<body>`.
    `app/usePanelFocusReturn.ts` exists and is used in `Board.tsx` / `SceneEditor.tsx`.
19. MED — `CommandCenter.tsx:522-551` Manage rows have NO hover while `SceneTile` `:65,70-79` and
    `LaunchTile` `:142,147-159` both hand-roll it.
20. MED — same missing-hover class: `Session.tsx:934-1056` combat rows, `:973-997` name button,
    `:1166-1177` condition-picker tiles, `EncounterBuilder.tsx:436-476` roster, `:533-670` draft
    rows. (`grep -c onMouseEnter`: Session 0, Campaign 0, EncounterBuilder 0, CommandCenter 2.)
    There is no global `button:hover` in `styles/index.css`.
21. MED — `EncounterBuilder.tsx:516-524` Add self-disables (`quickAdd` `:252` clears `qName`);
    `:663-669` per-row Remove unmounts itself.
22. MED — `EncounterBuilder.tsx:529` "Combatants · N" is inert; the dialog has no `role="status"`,
    so quick-add / remove / roll-initiative are all silent.
23. LOW — `EncounterBuilder.tsx:127-130` the comment claims the held id is cleared "on close" — **no
    code does that**. `:134-135` early-returns on `!open`, so `rows` keeps its identity and the
    `:189-191` invalidation effect does not fire until REOPEN. Cancelling after a rejected Start
    abandons ONE durable orphan encounter that no screen can list or delete.
24. LOW — `Seg` disabled options carry no reason (`Session.tsx:704-707` sets `disabled` with no
    `title`), unlike every other soft-disabled control on the screen.
25. LOW (LATENT) — `Session.tsx:675-682` collapses `paused`/`ending`/`archived` onto `'idle'`, so
    the Seg would show "Standby" checked while the header `:728` reads "Paused". Nothing dispatches
    those three states.
26. LOW — `EncounterBuilder.tsx:598`/`:628` visible "×"/"CR" not in the accnames
    `${name} quantity` / `${name} challenge rating` (WCAG 2.5.3). ("Init" `:569` is fine — it is a
    case-insensitive substring of `${name} initiative`.)
27. LOW — `EncounterBuilder.tsx:257,:319` initiative uses `Math.random()`, not the core RNG;
    `:576`'s `replace(/[^-\d]/g,'')` accepts "1-2", which `Math.trunc(Number(…))||0` silently turns
    into initiative 0.
28. LOW — `EncounterBuilder.tsx:378` Cancel stays live during `submitting`.
29. LOW — i18n half-applied: `Session.tsx` `t()` at 18 sites but the two confirm Dialogs `:576-635`,
    every `Panel title` and all handout/recap copy are raw English. `Campaign.tsx` 3, CommandCenter
    and EncounterBuilder **0**.
30. LOW — `CommandCenter.tsx:408-422` avatar `slice(0,5)` with no "+N"; `:273,:459,:473` "New scene"
    bare-navigates while the other four launchers hand over a create-intent (`:279-297`).

## VERIFIED NON-DEFECTS (stop re-flagging)

- Premises 1–5 above.
- **`Campaign.tsx:927` Factions EmptyState `action={undefined}` is NOT a dead end** — the "New
  faction" button `:899-910` renders above it whenever `canAuthor && !factionEditor`. Cosmetic only.
  My earlier "LOW dead end" framing was wrong.
- **`Seg` can never render its CHECKED option as disabled.** `selectedIndex` `:221` requires
  `!o.disabled`, and every row of `SESSION_WORKFLOW_TRANSITIONS` includes its own state, so
  `allowed.has(current)` is always true.
- **`Session.tsx:2092-2096` `connectGoogleCalendar()`** is exhaustive (`'signed-in' | 'failed'`
  only, all 6 return sites in `cloud/googleCalendar.ts:87-140`).
- **`Session.tsx:1166-1177` ConditionPicker tiles PASS WCAG 2.5.8** via the Spacing exception
  (~22.8px badge in a `gap:9` wrap ⇒ centers ≥31.8px).
- `Campaign.tsx:215-223` `<span>Status</span>` beside `aria-label="Status of X"` PASSES 2.5.3
  (substring). Same for `Field label="Title"` etc.
- `FactionEditor` sending the whole declared field set incl. `secret` cannot wipe a DM secret
  (`content-query.ts:221-224`, `vault-object.ts:332-338` gate on `hasDmAuthority`).
- Compact `ConditionBadge` + `onRemove` is ≥24px. `Seg` options are ~30px. Roster-picker rows
  (`padding:'6px 8px'`) are ~31px. `CommandCenter` Manage rows are ~52px. All pass 2.5.8.
- No raw hex/`rgba()`; no inline `outline:`/`minHeight:`/`touchAction:` anywhere in the 5 files.
- `Campaign.tsx:386-390` / `:671-675` `role="alert"` mount WITH their text — correct for `alert`.
- `EncounterBuilder`'s `[open,mode]` reseed + `key={id ?? 'new'}` on both Campaign editors ⇒ no
  cross-entity draft bleed.
- Phone (393×851 Pixel 5) fit is fine across all 5 files; the 4-option Seg is `flexWrap:'wrap'`.
- The app's only `<h1>` is `AppShell.tsx` (top bar, outside `<main>`). CommandCenter's flat
  h2-hero + four h2-sections skips no level, so `heading-order` stays green.
- `Toaster` is `data-modal-exempt`, so toasts raised from inside the confirm Dialogs are live.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`) — grep BEFORE changing any role/label
| spec:line | selector | source |
|---|---|---|
| combat:58,69-102 | End-combat Dialog `/no undo/i`, Escape/Keep-running, `/^Build encounter/` | `Session.tsx:576-605`, `:814-844` |
| combat:143-148 | `role=list`/`listitem`, "AC 13" | `:907-1059` |
| combat:150-151,261-264 | `Heal 1 HP — <name>` / `Damage 1 HP — <name>` (SUBSTRING; `Heal 1` prefix must survive) | `:1038-1053` |
| combat:154-167 | **`name:'<combatant>', exact:true`** + `aria-pressed` + Enter | `:973-997` |
| combat:170-171 | `li[aria-current="true"]` | `:936` |
| combat:179-235 | 391px badge-wrap geometry | `:968-1002` |
| combat:245-252 | `role=status` `/Round \d+, turn \d+/` **and** `order.getByRole('status')` = 0 | `:854-862` |
| combat:306-327 | Seg `radiogroup 'Session phase'`, `radio 'Recap'` aria-checked, `radio 'Standby'` **toBeEnabled** (as DM), `Session is in Recap`, Go live `aria-disabled=true` + `el.disabled===false` + `title /return to Standby/i` | `:351-392`, `:695-709` |
| **combat:340-380** | **Standby-from-live ⇒ `dialog 'End the live session?'`, buttons `'Stay live'`/`'End session'`; Recap ⇒ NO dialog + toast text `'Session archived into Recap'`** | `:606-635`, `:265-269`, `:658` |
| campaign:69,98 | `button 'Create the first quest'` | `Campaign.tsx:806-813` |
| campaign:70,99,174 | `getByLabel('Title'/'Name', exact)` | `:346-352`, `:610-616` |
| campaign:83,104 | `button 'Create quest'` (count 0 after close) | `:394-396` |
| campaign:88 | **toast `Created “<title>”`** | `:319` |
| campaign:121,139 | `0/2` → `1/2`; objective-as-`button` named by its text | `QuestCard.jsx:223-241` |
| campaign:142 | `getByLabel('Status of ${title}')` | `:217` |
| campaign:169-197,248-258 | `role=tab` clicks, `button 'New faction'`/`'Create faction'`/`'Save faction'`/`'Edit ${name}'`, `getByLabel Leader/Goals/'DM secret'/Stance/Visibility` | `:899-910`, `:592-685`, `:445` |
| campaign:294,307 | NO `/Open .*sheet in Characters/`; `button '<npc name>' exact` | `NpcCard` |
| command-palette:100-114 | ⌘K "Build encounter" MUST open `dialog 'Build encounter'` on a NON-LIVE session | `Session.tsx:241-247` |
| command-palette:127-158 | `getByLabel('Quick add'/'HP', exact)`, `button 'Add' exact`, `getByLabel('Bandit quantity')`, `button /from the draft$/`, Start `aria-disabled='true'` + `title /combatant/i` + **`el.disabled === false`** + `toBeFocused` | `EncounterBuilder.tsx:381-395`, `:488-524`, `:604`, `:665` |
| responsive:4-19 | clipping sweep of `/`, `/session`, `/campaign` (dialogs never open) | — |
| a11y-axe-gate:23-38 | axe on `/`, `/campaign`, `/session` both profiles | — |
| authoring-layout:37,42 | 320px no-h-scroll sweep incl. `/campaign`; `tab 'Factions'` | Campaign grids |

**NO spec references on /session** (free to change): "Push to players" / "Project to players" ON
`/session`, "Revoke handout", "Mark read", "Save recap"/"Update recap"/"Archived session",
"Handout title", "Combatants ·", "Move … earlier/later", "New quest", "New NPC", "Set date"/"+1
day", "Clear <condition>", the CommandCenter hub hero / Manage rows / HubLabels.
`paused`/`ending`/`archived` are asserted nowhere.

## Blast-radius rules
- **A Standby confirm must stay gated on `workflow === 'active'`** — `combat.spec.ts:346` clicks
  Standby from `recap` and polls straight for `'idle'`.
- **Gating the Seg on `previewing || !isDm` is safe**; gating it on anything the DM hits is not
  (`combat.spec.ts:313` asserts Standby `toBeEnabled()`).
- Do NOT convert EncounterBuilder's Start to hard `disabled` (`command-palette:157`).
- Do NOT make ⌘K refuse to OPEN the encounter dialog (`command-palette:100-114`).
- Keep `Heal 1`/`Damage 1` as a PREFIX; the combat name button's accname must stay EXACTLY the
  combatant name (`combat:154` is `exact: true`).
- A second `role="status"` on /session must sit OUTSIDE the initiative `<ul>` (`combat:252`) and
  must not match `/Round \d+, turn \d+/` (`combat:246-250`).
- A `?tab=` sync on Campaign must use `{replace:true}` and not clobber `location.state` at `:703-710`.
- Keep the quest objective as `role=button` named by its text (`campaign:139`).
- Keep the Recap phase change silent-of-dialogs and its toast text exactly
  `'Session archived into Recap'` (`combat:373-379`).

See [[char-encounter-cluster]], [[ds-layer-audit]], [[gm-react-ds]], [[completion-pass-ux-patterns]].
