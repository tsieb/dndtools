---
name: campaign-session-hub-cluster
description: Audit of gm-react Campaign/Session/CommandCenter + QuestCard/NpcCard/ConditionBadge — verified-open defects, verified-FIXED items, and the e2e specs that pin the current (wrong) semantics
metadata:
  type: project
---

Re-verified 2026-07-30 at commit `8138156b` **plus uncommitted working-tree edits** (a concurrent
`fix(ui)` loop was editing `Session.tsx` DURING the audit — line numbers moved mid-session).
Files: `screens/{Campaign,Session,CommandCenter}.tsx`, `ds/components/campaign/{QuestCard,NpcCard}.jsx`,
`ds/components/condition/ConditionBadge.jsx`.

⚠️ **Read `git status` before trusting any line number here.** `Campaign.tsx`, `CommandCenter.tsx`,
`NpcCard.jsx`, `QuestCard.jsx` were CLEAN at audit time (their line numbers are committed-accurate);
`Session.tsx` was dirty.

## FIXED since the 2026-07-29 pass — do NOT re-report
- **Session combat row restructured** (`Session.tsx:812-918`, working tree). The `role="button"`
  + `aria-label={`Select ${name}`}` row is GONE. Now `<ul>`/`<li>` with `aria-current` on the row and
  a real `<button aria-pressed>` wrapping the NAME (`:844-863`) as the one control. This also cleared
  the `nested-interactive` nesting of ConditionBadge-remove and Heal/Damage.
- **`nested-interactive` is now actually gated.** `a11y-axe-gate.spec.ts:209-249` seeds
  `session.set-workflow` + `combat.start` and scans `/session#combat`. VERIFIED BY RUNNING IT:
  passes, artifact `test-results/a11y/axe-desktop-chromium-session-combat-w0.json` = `"violations": []`,
  register `tests/a11y/known-violations.json` still `[]`. The old note "axe can't see combat" is DEAD.
  axe-core 4.12.1 `nested-interactive` is tagged `wcag2a` → it IS inside the gate's AXE_TAGS.
- `End combat` now has a `Dialog` confirm (`Session.tsx:226-228, 369, 528-551`).
- `deliverHandout` dead-guard fixed: `canDeliver = isDm && isLive` (`Session.tsx:303`), so the
  no-scene / no-players `Toaster.warning` branches (`:264-274`) are reachable again.
- Quest/Faction editors are real `<form>`s, Enter submits (`Campaign.tsx:320-326, 574-580`).
- DicePanel is a `<form>`, Enter rolls (`Session.tsx:1382-1404`).
- FactionCard title is an `<h3>` (`Campaign.tsx:415`).
- `ConditionBadge.jsx:79-88` remove button now `minWidth/minHeight: 24`.
- `CommandCenter.tsx:222-226` `liveScene` fallback chain no longer dead.
- Campaign editors do NOT have the stale-error bug: `setErr(null)` runs at the top of both
  `save()`s (`Campaign.tsx:257`, `:522`) and errors render `role="alert"` (`:376`, `:651`).
- No hard-coded hex/rgb in any of the 5 cluster files — all `T.*` / `var(--…)`.
- Campaign grids all use `minmax(min(100%, Npx),1fr)` (`:795, :836, :905`) — safe at 391px.

## STILL OPEN (verified in code 2026-07-30)
1. `Campaign.tsx:842-864` — **last surviving instance of the killed anti-pattern.** NPC tiles are
   `role="button" tabIndex=0 aria-label="Open …’s sheet in Characters"` divs wrapping `NpcCard`.
   `aria-label` on a widget role replaces the whole subtree → name/role/disposition/AC/HP/dm-only chip
   all vanish for SR users. Apply the same restructure Session just got.
2. `NpcCard.jsx:22, 36-41` — hover/transition key off `NpcCard`'s OWN `onClick`, which Campaign never
   passes (the wrapper owns the click) → `cursor:'default'`, `transition:'none'`, no hover border.
3. `Campaign.tsx:860` — `hook={`AC … · … HP`}` lands in the slot `NpcCard.jsx:63-66` renders italic
   behind an `Icon name="dm-only"` eye. Public combat stats are painted as a DM secret.
4. `Campaign.tsx:859` — `disposition="neutral"` HARD-CODED for every NPC; the dot+label is pure noise.
5. `QuestCard.jsx:58-71` — objectives are plain `<button>`; need `role="checkbox"` + `aria-checked`,
   and `disabled={!onToggleObjective}` (`:62`) drops every objective from the tab order for read-only
   viewers instead of `aria-disabled`.
6. `Campaign.tsx:749-759 / 778-787 / 871-880` — all three create launchers unmount themselves on click
   (`canAuthor && !questEditor` / EmptyState action / `canAuthor && !factionEditor`); focus falls to
   `<body>`, no live-region announcement, and Cancel never restores it. There is **no `autoFocus` or
   `.focus()` anywhere** in Campaign/Session/CommandCenter — confirmed by grep.
7. `Campaign.tsx:813-867` — the NPCs tab has a "New NPC" button ONLY inside its EmptyState. Once one
   NPC exists the create affordance disappears (Quests `:749` and Factions `:871` both keep a toolbar
   button). IA inconsistency / dead end.
8. `Session.tsx:980-989` `Remove` (combatant) and `:1554-1563` `Revoke handout` still fire on one
   click, no confirm, no undo — both rendered as the SAME generic `icon="close"` glyph. `End combat`
   right beside them now has a `Dialog tone="danger"`. No e2e spec touches either label (checked).
9. `CommandCenter.tsx:494-521` — Manage nav rows: `background:'transparent'`, no `onMouseEnter`,
   no transition, while the sibling `LaunchTile` (`:133-152`) has a full hover state.
10. `Session.tsx:812-815` (NEW, introduced by the in-flight fix) — the `<li>` keeps
    `onClick` + `cursor:'pointer'` over the FULL row while only the name button is focusable, and a
    click on the name fires `onSelect` twice (button handler + `<li>` bubble).
11. Low: `Campaign.tsx:890-900` Factions EmptyState `action={undefined}` though its copy says "create
    the first faction dossier". Not a dead end (the `:871` button renders at zero factions) — cosmetic.
12. Out of this cluster but still open: `Characters.tsx` `<Tabs>` with no `idBase`.

## e2e specs pinning current semantics (check BEFORE changing roles/labels)
- `tests/e2e/campaign.spec.ts` — **`:120` asserts an objective is
  `getByRole('button', {name:'Find who is buying the shipments'})`** → open item 5 CANNOT land without
  editing this line. Also `:69`/`:94` "Create the first quest", `:169` "New faction", `:100`/`:174`
  "Create quest"/"Create faction", `:190` `Edit ${name}`, `:138` `getByLabel('Status of ${title}')`,
  `:117`/`:135`/`:159` the `done/total` counter text, `:165`/`:244` `role=tab`.
- `tests/e2e/a11y-axe-gate.spec.ts` — scans `/campaign`, `/session`, `/` on BOTH profiles plus the
  seeded `/session#combat` state. Blocks critical+serious; register is empty. Any fix that re-adds
  interactive nesting or an `aria-label` over a widget subtree starts failing here.
- `tests/e2e/responsive.spec.ts:6,10` — sweeps `/session` and `/campaign`.
- `tests/e2e/authoring-layout.spec.ts:37` — loads `/campaign` (populated: quests + factions grids).
- NO spec references: the NPC tile label, `Remove`, `Revoke handout`, `Mark read`, `New NPC`,
  or the CommandCenter Manage rows — those fixes are spec-free.

## Probe technique that settled the axe question
Temp spec in `tests/e2e/`, `page.evaluate` over `window.__rt` to seed state, then dump
`document.querySelectorAll('[role="button"][aria-pressed]')` + focusable-descendant counts; run with
`npx playwright test <file> --project=desktop-chromium --reporter=line`; delete after. Reading the
axe artifact JSON alone is NOT enough — it cannot distinguish "clean" from "never rendered".

See [[char-encounter-cluster]], [[ds-layer-audit]], [[gm-react-ds]].
