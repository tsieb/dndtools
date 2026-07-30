---
name: campaign-session-hub-cluster
description: Audit of gm-react Campaign/Session/CommandCenter/EncounterBuilder + QuestCard/NpcCard — verified-open defects, verified-FIXED items, and the e2e specs that pin current semantics
metadata:
  type: project
---

Re-verified 2026-07-30 at commit `b5ed692f` with a **CLEAN working tree** (`git status` empty), so every
line number below is committed-accurate. Files: `screens/{Campaign,Session,CommandCenter}.tsx`,
`app/EncounterBuilder.tsx`, `ds/components/campaign/{QuestCard,NpcCard}.jsx`.

## FIXED — do NOT re-report
- **Campaign NPC tiles restructured** (`Campaign.tsx:841-866`). The `role="button"`+`aria-label` wrapper
  is GONE; `NpcCard` owns its click, the NAME is a real `<button>` (`NpcCard.jsx:59-65`), `disposition`
  is omitted rather than hard-coded, AC/HP moved from `hook` (dm-only eye) to plain `tags`.
  **Spec-pinned** at `campaign.spec.ts:285-310` (asserts `/Open .*sheet in Characters/` count 0,
  card contains `AC `/` HP`, NOT `Neutral`, and `getByRole('button',{name:'Mira the Ferryman',exact})`
  navigates on Enter). `NpcCard.jsx:25` no longer defaults disposition; `:44-45` hover works now.
- **Session combat row** `<ul>`/`<li>` + `<button aria-pressed>` on the name. The old double-fire
  (prev audit item 10) is fixed by `stopPropagation` at `Session.tsx:849-852`. Pinned by
  `combat.spec.ts:141` (`'Select Bog Lurker'` count 0), `:143-151`, `:154-165`.
- End combat confirm Dialog (`Session.tsx:528-553`), pinned by `combat.spec.ts:56-97`.
- **`Seg` in `app/screen-kit.tsx:146-215` is now a COMPLETE radiogroup** — roving `tabIndex`
  (`:161-164, 199`), Arrow/Home/End + selection-follows-focus (`:203-217`). The note in
  [[completion-pass-ux-patterns]] item 1 calling `Seg` incomplete is STALE.
- **`Card` `interactive` now emits `role="button"` + `tabIndex=0` + Enter/Space** (`Card.jsx:12-25`),
  so CommandCenter's Library tiles (`:537-569`) are keyboard-reachable.
- Campaign `Tabs idBase="campaign"` + `tabPanelProps` wired (`:739, :746`).
- Campaign editors are real `<form>`s w/ `setErr(null)` at the top of both `save()`s → no stale error.
- No raw hex in any cluster file; Campaign grids all `minmax(min(100%,Npx),1fr)`.

## STILL OPEN — NEW this pass (ranked)
1. **HIGH `Session.tsx:841-873`** — the combat row's name+badges flex row has NO `flexWrap` and every
   child has `minWidth:0`, so nothing can wrap to a second line. Phone math: 391 − 28 page pad − 36
   Panel pad − 24 row pad − (28 init + 28 Avatar-sm + 28 IconButton-sm) − 36 gaps ⇒ **~183px** for
   name+chips, while `Badge` "Active"+"Bloodied" alone need ~165-180px. Result: the combatant NAME
   truncates to nothing and `Badge`'s `overflowWrap:'anywhere'` stacks badge text vertically.
   `CombatPanel` has ZERO phone awareness (`viewport` is used only at `Session.tsx:352`).
   The responsive gate tests CLIPPING, not squeeze → it never catches this class.
2. **MED-HIGH `CommandCenter.tsx:221-225`** — `scenes.find(s=>s.id===homeSceneId)` is DEAD BY
   CONSTRUCTION (`:196-200` filters homeSceneId out). Reachable consequence: `Session.tsx:246`
   `goLive()` sets `activeSceneId = homeSceneId` when nothing is active ⇒ hub shows "Session live"
   while `liveScene` falls through to `scenes[0]` (a DIFFERENT scene) or `null`, in which case the
   single primary "Enter scene" is natively `disabled` (`:405`) with no explanation. Correcting the
   earlier note that this chain "is no longer dead" — the middle link provably is.
3. **MED `Session.tsx:1733-1739`** — StagePanel's `{value:'',label:'— none —'}` option is
   unhonourable: `onChange` ignores `''` AND `setActiveMapInputSchema`
   (`packages/core/src/schemas/commands.ts:596`) requires `mapId`, so the core CANNOT clear it.
   Picking it snaps back silently.
4. **MED `EncounterBuilder.tsx:130-152`** — the on-open reseed resets 7 fields but NOT `crDrafts`
   (`:184`). React fires no `blur` on unmount, so Escape-closing with a typed CR leaves an
   uncommitted draft; on reopen `:575` (`crDrafts[r.key] ?? r.cr`) shows the stale text while the
   challenge budget uses `r.cr` — displayed CR and computed difficulty disagree.
5. **MED `Session.tsx:1149-1177`** — CampaignDatePanel Day/Year coerce per keystroke
   (`Math.trunc(Number(v)||1)` / `||0`); clearing snaps to 1/0 mid-edit. This is the SAME bug
   `EncounterBuilder.tsx:117-119, 181-183` documents having fixed with string drafts. Un-fixed twin.
6. **MED** Focus loss on every unmounting op: `Session.tsx:986-994` Remove (whole Selected panel
   unmounts), `:1561-1568` Revoke, `EncounterBuilder.tsx:605-611` last draft row.
   **There is ZERO `autoFocus` / `.focus()` / `aria-live` / `role="status"` in the entire cluster**
   (grepped all 5 files, exit 1).
7. **MED `Campaign.tsx:850` + `:860`** — kind label rendered TWICE per NPC card: as `role=` under the
   name and again as `tags[0]`. Every card reads "NPC / NPC · AC 13 · 8 HP".
8. **MED-LOW `Campaign.tsx:672`** — tab is component-local `useState`, not URL-backed. Reload/back
   always lands on Quests; `CommandCenter.tsx:297`'s "N threads · M factions" tile cannot deep-link
   Factions. `Settings` already reads `?tab=` — the pattern exists in-repo.
9. LOW `Session.tsx:1743-1751` / `:1504-1512` — native `disabled` with no on-control reason, while
   `:707-737` (Build encounter) is the file's own `aria-disabled`+`title`+explanatory-`aria-label`
   exemplar. `!activeMapId` has no adjacent prose at all.
10. LOW `Session.tsx:1901-1912` SchedulePanel silently returns on a non-`signed-in`/non-`failed`
    outcome (latent — the module emits only those two today). `:1322` `!draft.trim()` makes clearing
    an authored recap impossible.
11. LOW `EncounterBuilder.tsx:213-214` — `Number(qHp)||0` vs `Number(qAc)||10`: clearing HP
    quick-adds a 0-max-HP monster that is instantly Down, no validation message.
12. LOW `CommandCenter.tsx:106-110` — the draft-lock `Icon label=` sits inside the SceneTile
    `<button>`, so its `role=img`+`aria-label` (`Icon.jsx:528`) joins the button name, duplicating the
    adjacent "Draft" Badge.
13. LOW `NpcCard.jsx:29` — `<article onClick>` + `cursor:pointer` over the whole card while only the
    name button is focusable (deliberate, per the in-file comment).

## STILL OPEN — carried from prior passes (line numbers refreshed)
- `QuestCard.jsx:60-70` objectives are plain `<button>`; need `role=checkbox`+`aria-checked`, and
  `disabled={!onToggleObjective}` (`:62`) should be `aria-disabled`. ⚠ **`campaign.spec.ts:120` asserts
  `getByRole('button',{name:'Find who is buying the shipments'})`** — cannot land without editing it.
- Campaign's 3 create launchers unmount on click (`:749-759`, `:778-787`, `:872-882`) → focus to
  `<body>`, no announcement, Cancel never restores.
- `Campaign.tsx:813-831` NPCs tab has "New NPC" ONLY in its EmptyState; Quests (`:749`) and Factions
  (`:872`) keep a toolbar button. IA dead end once one NPC exists.
- `Session.tsx:986-994` Remove + `:1561-1568` Revoke handout: no confirm, no undo, both the same
  generic `icon="close"`, right next to an End-combat that now HAS a danger Dialog.
- `CommandCenter.tsx:493-522` Manage rows: `background:'transparent'`, no `onMouseEnter`, no
  transition, while sibling `LaunchTile` (`:133-152`) and `SceneTile` (`:59-77`) both have the full
  treatment. In-repo idiom for inline styles is `onMouseEnter/Leave` (there is NO global
  `button:hover` rule anywhere in src).
- `EncounterBuilder.tsx:337` Start combat `disabled` with no inline reason; `:550-557` quantity is a
  `Number(x)||1`-per-keystroke field; `:231-234` `rows.length===0` branch is UNREACHABLE (the footer
  button is disabled on exactly that predicate).
- `Campaign.tsx:892-901` Factions EmptyState `action={undefined}` though the copy says "create the
  first faction dossier" (cosmetic — the `:872` button does render at zero factions).

## e2e specs pinning current semantics (grep BEFORE changing a role/label)
- `campaign.spec.ts` — `:120` objective-as-button (blocks the QuestCard fix); `:69`/`:94` "Create the
  first quest"; `:83`/`:100` "Create quest"; `:169` "New faction"; `:174` "Create faction"; `:190`
  `Edit ${name}`; `:138` `getByLabel('Status of ${title}')`; `:117`/`:135`/`:159` the `done/total`
  text; `:165`/`:244`/`:261`/`:268`/`:277` `role=tab`; `:285-310` the whole NPC-tile fixed contract.
- `combat.spec.ts` — `:56-97` End-combat + its Dialog copy (`/no undo/i`); `:102` `/^Build encounter/`
  (regex, so the explanatory `aria-label` suffix is tolerated); `:141` no `Select X`; `:143-151`
  list/listitem/Heal 1/Damage 1; `:154-165` name-button selection + `Selected · X`.
- `a11y-axe-gate.spec.ts` — `/campaign`, `/session`, `/` on both profiles + seeded `/session#combat`
  (`:209-249`). Register `tests/a11y/known-violations.json` is `[]`.
- `responsive.spec.ts:4-19` sweeps `/`, `/session`, `/campaign` — CLIPPING only, not squeeze.
- `authoring-layout.spec.ts:37` loads a populated `/campaign`.
- NO spec references: "Enter scene"/"Open scene", "Active map", "Project to players", "Remove",
  "Revoke handout", "Mark read", "New NPC", the Manage rows, or any EncounterBuilder CR/quantity
  control — all of those fixes are spec-free.

## Probe technique that settled the axe question
Temp spec in `tests/e2e/`, `page.evaluate` over `window.__rt` to seed state, dump
`document.querySelectorAll(...)` + focusable-descendant counts, run
`npx playwright test <file> --project=desktop-chromium --reporter=line`, delete after. Reading the
axe artifact JSON alone cannot distinguish "clean" from "never rendered".

See [[char-encounter-cluster]], [[ds-layer-audit]], [[gm-react-ds]], [[completion-pass-ux-patterns]].
