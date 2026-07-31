---
name: campaign-session-hub-cluster
description: Audit of gm-react Campaign/Session/CommandCenter/EncounterBuilder/screen-kit — FIXED vs STILL-OPEN split re-verified 2026-07-30 @ 33651613 (run #15), incl. the NEW regression the run-#14 "recap dead end" fix introduced (Seg Standby silently nukes a live session)
metadata:
  type: project
---

# Campaign / Session hub cluster — state at HEAD `33651613` (2026-07-30, run #15)

Line counts at HEAD: `screens/Campaign.tsx` 981, `screens/Session.tsx` 2169,
`screens/CommandCenter.tsx` 592, `app/EncounterBuilder.tsx` 734, `app/screen-kit.tsx` 362.

**Run #15 verdict:** run #14's top blocker (recap dead end) is FIXED — and the fix **introduced a
worse one**. Adding `{value:'idle', label:'Standby'}` to the phase `Seg` made a full live-session
teardown reachable from `active` by one click or ONE ARROW KEY (Seg = selection-follows-focus),
unconfirmed and unannounced. Everything else is focus-drop, missing-announcement and no-hover work.

## ⚠️ READ FIRST — premises that invalidate whole finding classes (all still true)

1. `main.tsx:17-22` global `unhandledrejection` → `Toaster.error('Something didn't save…')`. A bare
   uncaught `await runtime.dispatch` is GENERIC, not silent. Only report a missing catch where the
   UI ALSO lies.
2. **Frozen-`busy` is CLOSED cluster-wide.** Every busy guard has `finally`.
3. `runtime.defaultActorId` returns the PREVIEWED actor, so Campaign's zero `previewing` refs are
   correct by construction.
4. **`Seg` (`screen-kit.tsx:206-294`) is selection-follows-focus.** `moveSelection` calls
   `onChange` on every Arrow/Home/End. Any destructive option in a `Seg` is one keypress away.
   `radioGroupKeyDown` (`:22-47`) behaves the same and now has Home/End + disabled-skip.

## FIXED since run #14 — do NOT re-report

- **recap dead end** — `canGoLive` (`Session.tsx:108`), soft-disabled Go live w/ reason (`:361-382`),
  honest `WORKFLOW_LABEL` copy on the standby Card (`:351-358`) and the header pill (`:679`),
  `idle`/Standby added to the phase Seg (`:655`). Pinned by `combat.spec.ts:271-330`.
- **EncounterBuilder orphan-per-retry** — `builtIdRef` (`:130`, `:189-191`, `:299-302`, `:338`).
- **EncounterBuilder quick-add HP `min={1}`** (`:503`).
- **`screen-kit.radioGroupKeyDown`** Home/End + skips disabled (`:22-47`).
- **`screen-kit.BackBar`** now `padding:'4px 8px'` (≥24px) + hover + transition (`:301-345`).
- **`QuestCard` objectives** (`ds/components/campaign/QuestCard.jsx:213-241`) — read-only is a plain
  `<li>` (no more disabled button), editable is `<button aria-pressed>` WITH hover.
  `campaign.spec.ts:120` still matches (`role=button` named by its text). CLOSED.
- Earlier: NPC tiles, quest/faction editor try/catch/finally + `key`, combat `<li>`+`aria-pressed`
  rows, End-combat danger Dialog, `— none —` Stage option, Day/Year drafts, ⌘K create-intent,
  `liveScene` resolution, `isLive` off workflow, Library tiles keyboard-operable, CR string drafts,
  Start-combat aria-disabled+title.

## STILL OPEN — ranked, verified at `33651613`

1. **BLOCKER (NEW, regression) — `Session.tsx:646-660` phase `Seg` → "Standby" from `active` is an
   unconfirmed, unannounced full teardown.** `setWorkflow` `:611-614` → `session.set-workflow
   {workflow:'idle'}` → `resetLiveSessionFields` (`packages/core/src/commands/session-control.ts:
   87-106`, idle branch `:364-369`) nulls `activeSceneId`, `activeMap`, **`combat`**, `diceHistory`,
   `timers`, `playerViewAssignments`, `activeMapProjections`, **`handouts`** (with delivery
   history), `quickReferencePanels`, `audioPlayback`, plus `recapArchiveId: null`. **No archive** —
   only the `recap`/`archived` branches call `archiveCurrentSession`. `combat.end` (a strict SUBSET
   of this) got a `tone="danger"` Dialog `:566-595`; this got nothing, no `ok` toast, and Seg
   selection-follows-focus means ArrowLeft on "Live" fires it (Prep is disabled from active so it
   skips straight to Standby).
   **Fix:** confirm ONLY when `workflow === 'active'` (`combat.spec.ts:328` clicks Standby from
   `recap` and polls for `'idle'` with no dialog — gating on `active` keeps that spec green).
2. HIGH (NEW) — `Session.tsx:611-614` `setWorkflow` passes no `ok` string ⇒ Prep/Recap/Standby are
   silent, while the SAME transition from the top bar toasts (`ProjectionControl.tsx:73`).
   Also `active → recap` archives the live session unconfirmed (recoverable, so MED-tier).
3. HIGH (NEW) — **`CommandCenter.tsx` has ZERO headings** (`grep '<h[1-6]'` = 0). The hero is a
   styled `<div>` `:373`; `HubLabel` `:26-40` renders Scenes/Create/Manage/Library as `<span>`s.
   The app's landing hub is unnavigable by heading. Campaign `:761` already ships the
   `visually-hidden <h2>` pattern; `Panel` (`screen-kit.tsx:161-176`) ships `<h2>`.
4. HIGH (NEW) — **`Campaign.tsx` has ZERO success announcements** (`grep Toaster` = 1 hit, an
   `error`). Quest create/update `:251-322`, faction create/update `:523-583`, visibility change,
   objective toggle and status change `:175-183` all succeed silently, and `onClose()` unmounts the
   editor `<Panel>` dropping focus to `<body>`. The run-#15 commit did exactly this fix for
   `Characters`; Campaign was missed.
5. HIGH — durable HP writes to a NON-active combatant announce nothing. The one `role="status"`
   `:805-813` renders only the ACTIVE combatant; `HPBar` is a plain `<div>`; `onHp` `:408-414` /
   `onCondition` `:415-421` pass no `ok`. A 2nd region must sit OUTSIDE the `<ul>`
   (`combat.spec.ts:251` asserts `order.getByRole('status')` = 0).
6. HIGH — `Session.tsx:1634-1642` "Push to players" natively disables itself ON SUCCESS
   (`deliverHandout:310-313` clears the title) ⇒ focus to `<body>`.
7. HIGH — `Session.tsx:1041-1060` Move earlier/later natively disable at either end, under focus.
8. HIGH — `Session.tsx:1070-1078` Remove combatant / `:1691-1698` Revoke handout: irreversible, no
   confirm, no undo, both unmount the focused control.
9. HIGH — `EncounterBuilder.tsx` has **ZERO** `preview`/`isLive`/`isDm` refs (grep = 0) and
   `Session.tsx:559-565` passes none ⇒ ⌘K opens a fully-live builder in player preview / on standby.
   Must still OPEN (`command-palette.spec.ts:98-111`); add an in-dialog banner, not a refusal.
10. MED — `Session.tsx:1879-1887` "Project to players" hard `disabled` w/ no reason; the soft
    exemplars are `:765-795` and `ProjectionControl.tsx:103-124`.
11. MED — `Session.tsx:974` `ConditionBadge onRemove` ⇒ DS derives `aria-label={'Clear ' + text}`
    from the condition alone (`ds/components/condition/ConditionBadge.jsx:81`) ⇒ N identical
    "Clear Poisoned" buttons on different creatures. Needs a `removeLabel` prop.
12. MED — `Session.tsx:1289-1301`/`:1409-1419` RecapPanel: switching the Archived-session `Select`
    re-seeds `draft` from canonical (`seedKey` effect `:1335-1339`), destroying unsaved markdown.
13. MED — `Campaign.tsx:686` tab is local `useState('quests')`, no `?tab=`;
    `CommandCenter.tsx:306` advertises a faction count it cannot deep-link.
14. MED — `Campaign.tsx:771-778 / 799-806 / 892-901` create launchers unmount on click → `<body>`.
    `app/usePanelFocusReturn.ts` exists and is used in `Board.tsx` / `SceneEditor.tsx`.
15. MED — `Campaign.tsx:175-183` `QuestCardRow.update()` has no busy guard: rapid objective toggling
    queues N whole-array replacements, last-write-wins.
16. MED — `CommandCenter.tsx:106-110` `<Icon label="Draft — not visible to players">` → role=img +
    aria-label INSIDE the SceneTile `<button>` `:61`, duplicating the "Draft" Badge `:103`.
17. MED — `CommandCenter.tsx:511-540` Manage rows have NO hover while `SceneTile` `:59,64-65` and
    `LaunchTile` `:133,138-139` both hand-roll it.
18. MED — same missing-hover class: `Session.tsx:885-1007` combat rows, `:924-948` name button,
    `:1118-1127` condition tiles, `EncounterBuilder.tsx:436-476` roster, `:533-670` draft rows.
    (`grep -c MouseEnter`: Session 0, Campaign 0, EncounterBuilder 0, CommandCenter 2.)
19. MED — `EncounterBuilder.tsx:400-404` error renders at the TOP of the scrolling Dialog body while
    Start sits in the FIXED footer; `:385 disabled={submitting}` hard-disables mid-write (focus →
    body); nothing moves focus. Keep `el.disabled === false` at rest (`command-palette.spec.ts:151`).
20. MED — `EncounterBuilder.tsx:529` "Combatants · N" is inert; the dialog has no `role="status"`.
21. MED — `EncounterBuilder.tsx:516-524` Add self-disables (`quickAdd:252` clears `qName`);
    `:663-669` per-row Remove unmounts itself.
22. LOW (NEW) — `EncounterBuilder.tsx:127-130` comment claims the held id is cleared "on close" —
    it is not; only the reopen path clears it (via the `[open,mode]` reseed → new `rows` identity →
    `:189` effect). Behaviourally OK, but cancelling after a rejected Start still abandons ONE
    durable orphan encounter that no screen can list or delete.
23. LOW (NEW) — `Seg` disabled options carry no reason (Prep is natively `disabled` from
    active/recap with no title), unlike every other soft-disabled control on the screen.
24. LOW (LATENT) — `Session.tsx:626-633` collapses `paused`/`ending`/`archived` onto `'idle'`, so
    the Seg would show "Standby" checked while the header `:679` reads "Paused"/"Wrapping up"/
    "Archived". Nothing in the app dispatches those three (`grep set-workflow` = ProjectionControl
    active|idle + Session active|idle|prep|recap), so LATENT only.
25. LOW — `Campaign.tsx:920` Factions EmptyState `action={undefined}` while its copy promises
    "create the first faction dossier"; `:833-853` NPCs tab has "New NPC" ONLY in its EmptyState.
26. LOW — `EncounterBuilder.tsx:598`/`:628` visible "×"/"CR" not in the accnames
    `${name} quantity` / `${name} challenge rating` (WCAG 2.5.3).
27. LOW — `EncounterBuilder.tsx:257,:319` initiative uses `Math.random()`, not the core RNG.
28. LOW — `EncounterBuilder.tsx:378` Cancel stays live during `submitting`.
29. LOW — `Session.tsx` i18n half-applied: `t()` at `:269,278,286,290,307,512,521`; raw English at
    `:427,443,474,481,492,508,545,570` and every `Panel title`.
30. LOW — `CommandCenter.tsx:397` avatar `slice(0,5)` with no "+N"; `:264,:448,:462` "New scene"
    bare-navigates while the other four launchers hand over a create-intent (`:270-288`).

## VERIFIED NON-DEFECTS (stop re-flagging)

- Premises 1–3 above.
- **`Session.tsx:2042-2047` `connectGoogleCalendar()`** — `GoogleAuthOutcome` declares
  `'redirecting'` (`cloud/googleDocs.ts:202-205`) but `connectGoogleCalendar` only ever returns
  `'signed-in' | 'failed'` (all 6 return sites, `cloud/googleCalendar.ts:87-140`). The
  `!== 'signed-in'` / `=== 'failed'` pair is exhaustive. **My old "zero feedback" claim was WRONG.**
- **`Session.tsx:1118-1127` ConditionPicker tiles PASS WCAG 2.5.8** via the Spacing exception:
  non-compact `ConditionBadge` ≈ 22.8px tall in a `gap:9` wrap ⇒ adjacent centers ≥ 31.8px.
  **My old "~23px, fails 2.5.8" claim was WRONG.**
- `QuestCard` objectives (see FIXED).
- `FactionEditor` sending the whole declared field set incl. `secret` CANNOT wipe a DM secret
  (`queries/content-query.ts:221-224`, `state/vault-object.ts:332-338` both gate on `hasDmAuthority`).
- Compact `ConditionBadge` + `onRemove` is ≥24px (`ConditionBadge.jsx:85` sets minWidth/minHeight 24).
- No raw hex/`rgba()`; no inline `outline:`/`minHeight:`/`touchAction:` anywhere in the 5 files.
- `Campaign.tsx:382-386` / `:664-668` `role="alert"` mount WITH their text — correct for `alert`.
- `EncounterBuilder` `[open,mode]` reseed + `key={id ?? 'new'}` on both Campaign editors ⇒ no
  cross-entity draft bleed.
- Phone (393×851) fit is fine across all 5 files. The 4th Seg option (~280px total) still fits the
  365px phone content box; `Seg` is `flexWrap:'wrap'` + `maxWidth:'100%'`.
- The app's only `<h1>` is `AppShell.tsx` (top bar, outside `<main>`) — a global decision.

## e2e spec-coupling map (`apps/gm-react/tests/e2e/`) — grep BEFORE changing any role/label
| spec:line | selector | source |
|---|---|---|
| combat:56-101 | End-combat Dialog `/no undo/i`, Escape/Keep-running, `/^Build encounter/` | `Session.tsx:566-595`, `:765-795` |
| combat:143-147 | `role=list`/`listitem`, "AC 13" | `:858-1010` |
| combat:148-149,259-263 | `Heal 1 HP — <name>` / `Damage 1 HP — <name>` (SUBSTRING) | `:989-1004` |
| combat:151-171 | **`name:'<combatant>', exact:true`** + `aria-pressed` + Enter | `:924-948` |
| combat:172 | `li[aria-current="true"]` | `:887` |
| combat:179-235 | 391px badge-wrap geometry | `:919-953` |
| combat:243-251 | `role=status` `/Round \d+, turn \d+/` **and** `order.getByRole('status')` = 0 | `:805-813` |
| **combat:271-330** | **Seg `radiogroup 'Session phase'`, `radio 'Standby'` enabled, `Session is in Recap`, Go live `aria-disabled=true` + `el.disabled===false` + `title /return to Standby/i`, then `standby.click()` ⇒ workflow `'idle'` WITH NO DIALOG** | `:351-382`, `:646-660` |
| campaign:69,94 | `button 'Create the first quest'` | `Campaign.tsx:799-806` |
| campaign:83,100 | `button 'Create quest'` (count 0 after close) | `:390-392` |
| campaign:120,135 | objective-as-`button` named by its text; `0/2` → `1/2` | `QuestCard.jsx:223-241` |
| campaign:138 | `getByLabel('Status of ${title}')` | `:217` |
| campaign:165-214,244-253 | `role=tab` clicks, `button 'New faction'`/`'Create faction'`/`'Save faction'`/`'Edit ${name}'`, `getByLabel Name/Leader/Goals/'DM secret'/Stance/Visibility` | `:894-901`, `:585-675`, `:441` |
| command-palette:98-111 | ⌘K "Build encounter" MUST open the dialog on a NON-LIVE session | `Session.tsx:240-246` |
| command-palette:125,149-155 | Start combat `aria-disabled='true'` + `title /combatant/i` AND `el.disabled === false` | `EncounterBuilder.tsx:381-395` |
| command-palette:126-132,145 | `getByLabel('Quick add', exact)`, `button 'Add' exact`, `getByLabel('Bandit quantity')`, `button /from the draft$/` | `:488-524`, `:604`, `:665` |
| canvas:586 | `/Go live in Session/` accessible name | outside cluster |
| authoring-layout:37,42 | 320px no-h-scroll sweep incl. `/campaign`; `tab 'Factions'` | Campaign grids |
| a11y-axe-gate:30-31,218-260 | axe on `/campaign` + `/session` both profiles; `/session#combat` seeded | — |
| responsive:6,10 | clipping sweep of `/session` + `/campaign` (dialogs never open) | — |

**NO spec references on /session** (free to change): "Push to players" / "Project to players" ON
`/session` (`knowledge:230-282` + `graph:186` own the first on THEIR routes; `atlas:26,49,60` +
`android-quick-map:352` own the second on the MAP EDITOR), "Revoke handout", "Mark read",
"Save recap"/"Update recap"/"Archived session", "Handout title", "Combatants ·",
"Move … earlier/later", "New quest", "New NPC", "Set date"/"+1 day", "Clear <condition>", the
CommandCenter Manage rows and hub hero. `paused`/`ending`/`archived` are asserted nowhere.

## Blast-radius rules
- **A Standby confirm must be gated on `workflow === 'active'`** — `combat.spec.ts:328` clicks
  Standby from `recap` and polls straight for `'idle'`.
- Do NOT convert EncounterBuilder's Start to hard `disabled` (`command-palette:151`).
- Do NOT make ⌘K refuse to OPEN the encounter dialog (`command-palette:98-111`).
- Keep `Heal 1`/`Damage 1` as a PREFIX; the combat name button's accname must stay EXACTLY the
  combatant name (`combat:151` is `exact: true`).
- A second `role="status"` on /session must sit OUTSIDE the initiative `<ul>` (`combat:251`).
- A `?tab=` sync on Campaign must use `{replace:true}` and not clobber the `location.state`
  create-intent at `Campaign.tsx:696-703`.
- Keep the quest objective as `role=button` named by its text (`campaign:120`) — `role=checkbox`
  would break the spec.

See [[char-encounter-cluster]], [[ds-layer-audit]], [[gm-react-ds]], [[completion-pass-ux-patterns]].
