---
name: campaign-session-hub-cluster
description: Audit of gm-react Campaign/Session/CommandCenter/EncounterBuilder + QuestCard/NpcCard — verified-open defects, verified-FIXED items, and the e2e specs that pin current semantics
metadata:
  type: project
---

Re-verified 2026-07-30 at commit `7bdf2908` (run #13), CLEAN tree — line numbers are
committed-accurate. Files: `screens/{Campaign,Session,CommandCenter}.tsx`,
`app/EncounterBuilder.tsx`, `ds/components/campaign/{QuestCard,NpcCard}.jsx`,
`app/screen-kit.tsx` (Seg/Panel/Page live here).

Run #13 verdict: the run-#9 top-8 is now ENTIRELY fixed. The remaining yield in this cluster has
shifted from *state/lifecycle* bugs to **accessible-name + announcement** bugs — this cluster is the
one place in the app where success is conveyed purely visually on the hot path.

## FIXED between c93c5206 → 7bdf2908 — do NOT re-report
- Frozen `busy` (run-#9 item 1) fixed in ALL THREE: `Campaign.tsx:262-321` (QuestEditor
  try/catch/finally + a user-facing storage message), `:534-582` (FactionEditor), `Session.tsx:1287-1291`
  (RecapPanel try/finally). Both Campaign editors are now real `<form>`s so Enter submits.
- `EncounterBuilder.tsx:350` `backdropDismissible={rows.length === 0}` (run-#9 item 3).
- `Session.tsx:551` End-combat Dialog now has `tone="danger"` (run-#9 item 4).
- `CommandCenter.tsx:377` hero heading gated on `isLive` (item 5); `:254` `isLive` now derives from
  `data.workflow === 'active'` (item 6); `:481` SceneTile status also gated on `isLive`.
- `NpcCard.jsx:60` — the `<h3>` no longer sets `overflow:hidden`, so the focus ring is unclipped (item 7).
- `DicePanel` is a real `<form>` (`Session.tsx:1447`) — Enter rolls.
- `Card` (`ds/components/core/Card.jsx:12-25`) gives `interactive`+`onClick` a real `role=button`
  + `tabIndex` + Enter/Space, so CommandCenter's Library tiles ARE keyboard-operable. Don't re-flag.
- `Dialog` uses `isolateModalSiblings` which sets **`inert`** (not just aria-hidden) on every sibling
  branch, so focus CANNOT escape an open dialog. Downgrade any "focus escapes the modal" claim.

## STILL OPEN — NEW this pass (ranked)
1. **HIGH `Session.tsx:928-943`** — every combatant row renders `IconButton label="Heal 1"` /
   `"Damage 1"`. N combatants ⇒ N identically named buttons writing durable HP. The in-file exemplar
   is `Move ${selected.name} earlier in initiative` (`:982`). ⚠ `combat.spec.ts:150-151` matches
   `name: 'Heal 1'` — Playwright name matching is SUBSTRING by default, so a rename that KEEPS the
   literal `Heal 1` (e.g. `Heal 1 HP — ${c.name}`) keeps the spec green.
2. **HIGH `Session.tsx:1553-1563`** — the handout title `Input` and body `Textarea` are the ONLY
   fields in the cluster with no `<Field label>` / `aria-label`; they rely on `placeholder` alone
   (WCAG 3.3.2). axe passes because HTML-AAM allows placeholder as an accname fallback, so the a11y
   gate can never catch this. ZERO spec references.
3. **HIGH — the live-play hot path never announces success.** `Session.tsx` has **zero**
   `aria-live`/`role="status"` (only Campaign `:383,:665` and EncounterBuilder `:378` have
   `role="alert"`). `onAdvance`/`onPrevious` (`:381-382`), `onHp` (`:384-390`), `onCondition`
   (`:391-397`) and the dice `onRoll` (`:431-433`) all pass NO `ok` string to the `dispatch` helper
   (`:244-255`), so no Toast fires; and `ds/components/domain/DiceResult.jsx` is a plain `<div>`.
   A screen-reader DM presses "Next turn" or "Roll" and hears nothing at all.
4. **MED `Session.tsx:1621-1628` / `:1632-1639`** — `label="Revoke handout"` and the `Mark read`
   Button are one-per-handout with no title in the name. No spec references either string.
5. **MED `Session.tsx:602-624` + `screen-kit.tsx:162-174`** — `phase` collapses `paused`/`ending`
   onto `'prep'`, but `allowedTransitionsFrom('paused'|'ending')` does NOT contain `prep`
   (`packages/core/src/lifecycle/session-workflow.ts:41-48`), so the Seg's CHECKED option is also
   `disabled`. `Seg` computes `off = o.disabled && !on` ⇒ the segment stays clickable at full
   opacity and clicking it dispatches a REJECTED `session.set-workflow` → error toast from the
   control that looks current. Worse, `selectedIndex` requires `!o.disabled` ⇒ -1, so the group's
   single Tab stop lands on the UNCHECKED "Live". LATENT: nothing in gm-react dispatches
   `paused`/`ending` (only ProjectionControl `:63` and Session `:270,:589` set workflow).
6. **MED `Session.tsx:857`, `:1894`, `NpcCard.jsx:50`** — `<Avatar name={x}/>` renders the initials
   as bare text with no `aria-hidden` (`ds/components/core/Avatar.jsx:32`), so AT reads
   "GO Goblin, toggle button". `CommandCenter.tsx:398-402` already wraps its avatar stack in
   `role="img" aria-label` — the fix pattern exists in-cluster.
7. **MED-LOW `EncounterBuilder.tsx:284-333`** — in `start` mode `encounter.build` is dispatched
   BEFORE `combat.start`. If `combat.start` rejects, the dialog stays open with `error` set and the
   built encounter already durable; pressing Start again re-dispatches `encounter.build`, so every
   retry leaves another orphan encounter with no UI to see or delete it.
8. **LOW `EncounterBuilder.tsx:564-592, 594-622`** — visible label "×" / "CR" is not contained in
   the accessible name (`${name} quantity` / `${name} challenge rating`) → WCAG 2.5.3 Label in Name.
   ⚠ `command-palette.spec.ts:130` pins `getByLabel('Bandit quantity')`, so the accname must keep
   the word "quantity".
9. **LOW `EncounterBuilder.tsx:491-499, 638-644`** — quick-add "Add" disables itself on success
   (`setQName('')`) and the per-row Remove unmounts its own button, dropping focus to `<body>`.
   `inert` keeps it inside the dialog, so the next Tab restarts at the header Close.
10. **LOW `EncounterBuilder.tsx:475-482`** — quick-add HP `min={0}` while `quickAdd` (`:232`) floors
    at 1: the control advertises a value it silently rewrites.

## STILL OPEN — carried, re-confirmed at 7bdf2908 (line numbers refreshed)
- `QuestCard.jsx:60-71` objectives: ~20px tall (WCAG 2.5.8), no hover, natively `disabled` for
  non-authors. ⚠ `campaign.spec.ts:120` pins objective-as-`button` (blocks the role=checkbox fix).
- Campaign's three create launchers unmount on click → focus to `<body>`: `:765-772` (Quests
  toolbar), `:886-893` (Factions). NPCs EmptyState `:834-843` navigates away.
- `Campaign.tsx:827-845` — NPCs tab has "New NPC" ONLY in its EmptyState (IA dead end once one NPC
  exists). `Campaign.tsx:903-913` — Factions EmptyState `action={undefined}` though the copy says
  "create the first faction dossier".
- `Campaign.tsx:686` — tab is component-local `useState`, not URL-backed (Settings reads `?tab=`).
- `Session.tsx:1009-1017` Remove combatant / `:1621-1628` Revoke handout: no confirm, no undo, both
  generic `icon="close"`, both drop focus to `<body>`.
- `Session.tsx:1808-1816` Project to players / `:1564-1572` Push to players: hard `disabled`, reason
  not on the control, while `:725-755` in the same file is the `aria-disabled`+`title` exemplar.
- `Session.tsx:236-242` — ⌘K `createEncounter` opens the builder ungated on a non-live session.
  ⚠ `command-palette.spec.ts:98-111` REQUIRES the dialog to open; extend the Start button's
  `aria-disabled`/`title` chain instead (`:149-151` asserts `title` matches `/combatant/i`).
- `Session.tsx:1275-1278` — RecapPanel re-seeds `draft` on `seedKey`, destroying an unsaved recap
  when the archive Select changes or a session ends into Recap.
- `Session.tsx:598-602` — `phase` collapses `idle|paused|ending|archived` onto **Prep** while the
  header reads "Standby".
- `Session.tsx:1971-1977` — `connectGoogleCalendar` silent branch (only `failed` toasts; a
  cancelled/dismissed sign-in returns with no feedback).
- Quest creation has no entry point outside the Quests tab; `app/CommandPalette.tsx` has no
  `new:quest` and routes "quest" keywords to `/knowledge`. `CommandCenter.tsx:287` repeats it.
- Missing hover (there is NO global `button:hover`, and inline styles can't express `:hover`):
  combat `<li>` `:830-845`, the name button `:867-891`, `ConditionPickerDialog` tiles `:1058-1067`,
  `EncounterBuilder.tsx:413-453` roster buttons, `CommandCenter.tsx:511-540` Manage rows.
  `SceneTile`/`LaunchTile` (`CommandCenter.tsx:64-65, 138-139`) and `ds/map/LayerRow.jsx:96-106`
  are the in-repo pattern.
- `CommandCenter.tsx:106-110` — draft-lock `Icon label=` sits inside the SceneTile `<button>`, so
  its `role=img`+`aria-label` joins the button name and duplicates the adjacent "Draft" Badge.
- `CommandCenter.tsx:397` — party avatar stack `slice(0,5)` with no `+N` overflow chip.
- `CommandCenter.tsx:256-264` — the comment claims every launcher hands a create-intent, but
  "New scene" bare-navigates (`:264`, `:448`, `:462`) and `/scenes` has NO `location.state` consumer.
- `EncounterBuilder.tsx:250-252` `rows.length===0 → setError` is DEAD (`Button.jsx` routes `onClick`
  to `undefined` on a truthy `aria-disabled`). Harmless.
- `EncounterBuilder.tsx:246, 300` — initiative uses `Math.random()`, not the core's deterministic RNG.

## Verified NON-issues (don't re-flag)
- No raw hex / `rgba()` in any of the 4 screen files. `IconButton size="sm"` = 28px ≥ 24px.
- `Toast.jsx:84` is `role="alert"` for errors / `role="status"` otherwise, so TOASTED feedback is
  covered — the gap in item 3 is that these call sites emit no toast at all.
- `Dialog` (`ds/components/overlay/Dialog.jsx`): focus-in on open, Tab trap, `inert` sibling
  isolation, body-scroll lock, focus RESTORE on close, `maxWidth:'100%'` (no 375px overflow even at
  `size="lg"` = 760).
- `Campaign` quest/faction editors carry `key={id ?? 'new'}` ⇒ no cross-entity draft bleed.
  `EncounterBuilder`'s `crDrafts`/`qtyDrafts` are `r.key`-scoped and cleared by the on-open effect.
- Combatant ids come from `env.ids()` (`packages/core/src/commands/combat.ts:95`), never reused, so a
  stale `Session.tsx:312` `selectedId` cannot re-select a combatant after `combat.end`.
- `/characters/:id?` (`App.tsx:391`) and the `players|permissions|vault` Settings tab ids
  (`Settings.tsx:159-161`) both exist — Campaign's NpcCard nav and CommandCenter's Manage deep links
  are NOT dead.
- `Panel` (`screen-kit.tsx:73`) renders `<section>` + `<h2>`; heading order is fine.
- `--color-text-tertiary` is tuned for AA per theme (`styles/tokens/colors.css:43,107,161,214`).
  Note `:379` maps it to `GrayText` under forced-colors (the DISABLED system colour) — that is a
  GLOBAL token decision, not a cluster defect.

## e2e specs pinning current semantics (grep BEFORE changing a role/label)
- `combat.spec.ts` — `:56-97` End-combat Dialog copy (`/no undo/i`) + Escape/Keep-running;
  `:102` `/^Build encounter/`; `:141` no `Select X`; `:143-147` list/listitem + "AC 13";
  `:150-151` **exact-ish `Heal 1`/`Damage 1`**; `:154-165` name-button `aria-pressed` + Enter;
  `:168` `li[aria-current="true"]`.
- `campaign.spec.ts` — `:120` objective-as-`button`; `:83`/`:100` "Create quest"; `:98` objectives
  Textarea; `:114`/`:157` durable objective writes; `:169`/`:174` faction create; `:190`
  `Edit ${name}`; `:138` `getByLabel('Status of ${title}')`; `:285-310` the NPC-tile contract.
- `command-palette.spec.ts` — `:98-111` ⌘K "Build encounter" MUST open the dialog on a non-live
  session; `:113-156` soft-disabled Start (`aria-disabled='true'`, `title` `/combatant/i`,
  `el.disabled === false`); `:130` `getByLabel('Bandit quantity')`.
- `a11y-axe-gate.spec.ts` — `:30-31` `/campaign` + `/session` both profiles; `:221-260` a SEEDED
  `/session#combat` running tracker. Register `tests/a11y/known-violations.json` is `[]`.
- `responsive.spec.ts:4-19` sweeps `/`, `/session`, `/campaign` — CLIPPING only; `:542` asserts the
  literal "Command Center" in `#main-content`. Dialogs are never open, so dialog layout is unguarded.
- NO spec references: "Push to players" ON /session (knowledge.spec + graph.spec own that string on
  THEIR routes), "Project to players" on /session (atlas + android-quick-map own it), "Revoke
  handout", "Mark read", "Session phase", the Manage rows, the recap panel, the handout fields, or
  the hub hero heading text.

## Probe technique that settled the axe question
Temp spec in `tests/e2e/`, `page.evaluate` over `window.__rt` to seed state, dump
`document.querySelectorAll(...)` + focusable-descendant counts, run
`npx playwright test <file> --project=desktop-chromium --reporter=line`, delete after. Reading the
axe artifact JSON alone cannot distinguish "clean" from "never rendered".

See [[char-encounter-cluster]], [[ds-layer-audit]], [[gm-react-ds]], [[completion-pass-ux-patterns]].
