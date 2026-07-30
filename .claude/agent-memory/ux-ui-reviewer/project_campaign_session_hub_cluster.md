---
name: campaign-session-hub-cluster
description: Audit of gm-react Campaign/Session/CommandCenter/EncounterBuilder + QuestCard/NpcCard — verified-open defects, verified-FIXED items, and the e2e specs that pin current semantics
metadata:
  type: project
---

Re-verified 2026-07-30 at commit `c93c5206`, CLEAN tree (`git status` empty) — line numbers are
committed-accurate. Files: `screens/{Campaign,Session,CommandCenter}.tsx`,
`app/EncounterBuilder.tsx`, `ds/components/campaign/{QuestCard,NpcCard}.jsx`.
Run #9 was a HIGH-YIELD pass: the whole run-#8 backlog top-8 landed, and a new root-cause class
surfaced (frozen `busy` on a throwing dispatch).

## FIXED between b5ed692f → c93c5206 — do NOT re-report
- NPC kind label no longer duplicated (`Campaign.tsx:859-861` — `tags` is now AC/HP only).
- `EncounterBuilder` on-open reset now clears `crDrafts` AND the new `qtyDrafts` (`:150-154`);
  per-row quantity is a string draft committed on blur/Enter (`:191-199, 574-587`); quick-add HP
  floors at 1 (`:232`); Start combat is `disabled={submitting}` + `aria-disabled`+`title`
  (`:352-364`).
- `CampaignDatePanel` Day/Year are string drafts w/ blur commit (`Session.tsx:1093-1140, 1207-1226`).
- Recap is clearable (`Session.tsx:1373` — `(!draft.trim() && !target.recap)`).
- StagePanel `— none —` only offered when nothing is staged (`Session.tsx:1790`).
- `CommandCenter` liveScene resolves against the UNFILTERED list, `liveSceneIsHome` → `/board` +
  "Enter GM Screen", primary CTA never natively disabled (`:225-227, 404-424`).
- Combat row name+badges row has `flexWrap:'wrap'` (`Session.tsx:860`).
- ⌘K `createEncounter` intent consumed at `Session.tsx:236-242`.
- `ds/components/core/Tabs.jsx` is now a COMPLETE ARIA tabs impl (roving tabIndex, Arrow/Home/End,
  `idBase`→`aria-controls`, `tabPanelProps`). The `ds-layer-audit` note calling Tabs unwired is STALE.
- Global `unhandledrejection` → `Toaster.error('Something didn't save…')` exists at `main.tsx:17`.
  So a throwing dispatch is NOT silent any more — but see item 1 below, the FORM still freezes.

## STILL OPEN — NEW this pass (ranked)
1. **HIGH — frozen `busy` on a throwing dispatch.** `SceneRuntime.dispatchNow` RE-THROWS on persist
   failure (`runtime/SceneRuntime.ts:475-483`). Three `save()`s set `busy` true before an awaited
   dispatch with **no `try/finally`**: `Campaign.tsx:256` (QuestEditor), `:521` (FactionEditor),
   `Session.tsx:1278-1283` (RecapPanel). In both Campaign editors **`Cancel` is also
   `disabled={busy}`** (`:380,383` / `:655,658`) ⇒ dead panel, typed content unrecoverable, only exit
   is reload. `EncounterBuilder.tsx:330-332` is the correct in-repo shape (`try{}finally{}`).
   ⚠ Reusable rule: in this app **every `await runtime.dispatch` inside a busy/submitting guard needs
   `finally`**, because dispatch throws (it does not just return `rejected`).
2. **MED-HIGH `Session.tsx:236-242`** — the ⌘K `createEncounter` handoff opens the builder with NO
   live/DM/preview gate, while the on-screen launcher (`:729-747`) soft-disables with a reason.
   From standby the DM composes a full roster and `combat.start` is rejected
   (`packages/core/src/commands/combat.ts:71`). ⚠ Fix must NOT refuse to open —
   `command-palette.spec.ts:98-111` asserts the dialog IS visible after the palette action on a
   non-live session. Extend the Start button's `aria-disabled`/`title` chain instead, roster-empty
   message FIRST (`command-palette.spec.ts:149-151` asserts `title` matches `/combatant/i`).
3. **MED `EncounterBuilder.tsx:336-338`** — `Dialog` defaults `dismissible`, so a backdrop mousedown
   (`Dialog.jsx:168-170`) or Escape discards a whole composed encounter with no confirm, on a screen
   that now guards `combat.end` with one. Fix `dismissible={rows.length === 0}`. No spec pins Escape
   here.
4. **MED `Session.tsx:542-548`** — End-combat confirm passes `icon="warning"` but **no `tone`**, so
   `Dialog.jsx:150-151` leaves `accent` undefined and the destructive header mark renders in the GOLD
   accent — identical to an info dialog. `tone="danger"` is the DS severity channel (A11Y-011).
5. **MED `CommandCenter.tsx:368`** — hero heading shows `scenes[0].name` when nothing is live
   (`liveScene` falls back unconditionally at `:225`), so an idle hub titles an arbitrary scene.
   Gate the TITLE on `isLive`; keep `liveScene` for the button destination.
6. **MED `CommandCenter.tsx:248`** — `isLive` derived from `activeSceneId`, not `session.workflow`
   (Session `:104`, `ProjectionControl.tsx:33` and every StatusDot use workflow). `session.recover`
   restores `activeSceneId` while moving to `recap` (`session-control.ts:178-187`) ⇒ hub would pulse
   "Session live" over a read-only archive. Latent (nothing in gm-react dispatches recover).
7. **MED `NpcCard.jsx:57-66`** — the name button is the ONLY tab stop per NPC card and its focus ring
   is clipped: the wrapping `<h3>` sets `overflow:'hidden'` and the global baseline is
   `outline:2px; outline-offset:2px` (`styles/tokens/base.css:36-38`). WCAG 2.4.7/2.4.11.
8. **MED `Session.tsx:1265-1274`** — RecapPanel re-seeds `draft` whenever `seedKey` changes, so
   switching archives (`:1340-1348`) or a session ending into Recap silently destroys an unsaved
   recap draft.
9. **MED — quest creation has no entry point outside the Quests tab, and ⌘K mis-routes "quest".**
   `Campaign.tsx:683` consumes only `createFaction`; `app/CommandPalette.tsx:178-185` has no
   `new:quest` and its "New note" entry carries `keywords:'quest thread …'` → `/knowledge`.
   `CommandCenter.tsx:279-283` ("Lore, quest, or handout") does the same.
10. **MED `QuestCard.jsx:60-70`** — objective rows are ~20px tall (16px box + `--text-sm`×1.45),
    under WCAG 2.5.8's 24px; NO hover feedback (and there is no global `button:hover` in src); and
    natively `disabled` for non-authors so the reason never reaches AT.
11. **MED-LOW missing hover on the hot path** — combat `<li>` has `cursor:pointer` + onClick but no
    hover (`Session.tsx:826-842`), nor the name button (`:863-887`), nor `ConditionPickerDialog`
    tiles (`:1054-1063`), nor `EncounterBuilder.tsx:409-449` roster buttons. Sibling
    `SceneTile`/`LaunchTile` in the same cluster DO have it (`CommandCenter.tsx:64-65, 138-139`).
12. **LOW `Session.tsx:598`** — `phase` collapses `idle|paused|ending|archived` onto the **Prep**
    segment. Reachable: the top bar's End goes to `idle` (`ProjectionControl.tsx:51-58`), after which
    the Seg reads "Prep" while the header reads "Standby".
13. **LOW `CommandCenter.tsx:388-402`** — party avatar stack `slice(0,5)` with no `+N` overflow chip.
14. **LOW `CommandCenter.tsx:250-259`** — the comment claims every launcher hands a create-intent,
    but "New scene" bare-navigates (`:258`, `:439`, `:453`) and `/scenes` has NO `location.state`
    consumer at all.

## STILL OPEN — carried, re-confirmed at c93c5206 (line numbers refreshed)
- Campaign create launchers unmount on click → focus to `<body>`: `:751-758` (Quests toolbar, hidden
  by `!questEditor`), `:872-879` (Factions). NPCs EmptyState `:820-828` navigates away entirely.
- `Campaign.tsx:813-831` — NPCs tab has "New NPC" ONLY in its EmptyState (IA dead end once one NPC
  exists); Quests/Factions keep a toolbar button.
- `Campaign.tsx:889-899` — Factions EmptyState `action={undefined}` though the copy says "create the
  first faction dossier" (cosmetic; the `:872` toolbar button does render at zero factions).
- `Campaign.tsx:672` — tab is component-local `useState`, not URL-backed. `Settings` reads `?tab=`.
- `Session.tsx:1005-1013` Remove combatant / `:1612-1619` Revoke handout: no confirm, no undo, both
  generic `icon="close"`, both drop focus to `<body>` (the owning row/panel unmounts).
- `Session.tsx:1799-1807` Project to players / `:1555-1563` Push to players: hard `disabled`, reason
  not on the control, while `:729-747` in the same file is the `aria-disabled`+`title` exemplar.
- `CommandCenter.tsx:106-110` — draft-lock `Icon label=` sits inside the SceneTile `<button>`, so its
  `role=img`+`aria-label` joins the button name and duplicates the adjacent "Draft" Badge.
- `CommandCenter.tsx:501-530` Manage rows: `background:'transparent'`, no `onMouseEnter`.
- `EncounterBuilder.tsx:250-252` — `rows.length===0 → setError(...)` is now DEAD: `Button.jsx:24,74`
  routes `onClick` to `undefined` on a truthy `aria-disabled`. Harmless.
- `EncounterBuilder.tsx:244-247, 300` — initiative rolls use `Math.random()`, not the core's
  deterministic RNG (replay/PLAT concern, not a visual defect).

## Verified NON-issues (don't re-flag)
- No raw hex / `rgba()` in any of the 4 screen files.
- `IconButton size="sm"` is 1.75rem = 28px ⇒ above the 24px minimum.
- `Toast.jsx:84` uses `role="alert"` for errors / `role="status"` otherwise, so the cluster's lack of
  its own live regions is covered for toasted feedback.
- `Dialog.jsx` focus-in-on-open, Tab trap, body-scroll lock and focus RESTORE on close all present.
- `session.set-active-map` is NOT workflow-gated (only `project-active-map` is), so the Stage Select
  legitimately works on standby.
- Campaign's `role="alert"` error spans mount WITH content — acceptable, `role=alert` insertions are
  announced (unlike bare `aria-live` regions added dynamically).
- Campaign quest/faction editors carry `key={id ?? 'new'}` ⇒ no cross-entity draft bleed.

## e2e specs pinning current semantics (grep BEFORE changing a role/label)
- `campaign.spec.ts` — `:120` objective-as-`button` (BLOCKS the QuestCard `role=checkbox` fix);
  `:83`/`:100` "Create quest"; `:98` the objectives Textarea; `:114`/`:157` durable objective writes;
  `:169`/`:174` faction create; `:190` `Edit ${name}`; `:138` `getByLabel('Status of ${title}')`;
  `:285-310` the whole NPC-tile contract.
- `combat.spec.ts` — `:56-97` End-combat + Dialog copy (`/no undo/i`) + Escape/Keep-running;
  `:102` `/^Build encounter/`; `:141` no `Select X`; `:143-151`; `:154-165`.
- `command-palette.spec.ts` — `:98-111` ⌘K "Build encounter" MUST open the dialog on a non-live
  session; `:113-156` the encounter dialog's soft-disabled Start (`aria-disabled='true'`,
  `title` `/combatant/i`, `el.disabled === false`, focusable) + quantity retype + no `0 HP`.
- `a11y-axe-gate.spec.ts` — `/campaign`, `/session`, `/` both profiles + seeded `/session#combat`.
  Register `tests/a11y/known-violations.json` is `[]`.
- `responsive.spec.ts:4-19` sweeps `/`, `/session`, `/campaign` — CLIPPING only, never squeeze;
  `:542` asserts the literal text "Command Center" in `#main-content`.
- `authoring-layout.spec.ts:37` loads a populated `/campaign`.
- NO spec references: the hub hero heading text, "Project to players", "Push to players", "Remove",
  "Revoke handout", "Mark read", "New NPC", the Manage rows, the recap panel, or the Dialog `tone`.

## Probe technique that settled the axe question
Temp spec in `tests/e2e/`, `page.evaluate` over `window.__rt` to seed state, dump
`document.querySelectorAll(...)` + focusable-descendant counts, run
`npx playwright test <file> --project=desktop-chromium --reporter=line`, delete after. Reading the
axe artifact JSON alone cannot distinguish "clean" from "never rendered".

See [[char-encounter-cluster]], [[ds-layer-audit]], [[gm-react-ds]], [[completion-pass-ux-patterns]].
