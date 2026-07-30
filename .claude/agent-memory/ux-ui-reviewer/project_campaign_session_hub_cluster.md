---
name: campaign-session-hub-cluster
description: Audit of gm-react Campaign/Session/CommandCenter/Characters + QuestCard/NpcCard/ConditionBadge — verified-open defects, verified-FIXED items, and e2e specs that pin the current (wrong) semantics
metadata:
  type: project
---

Audited 2026-07-29 (static) AFTER commits ade99dc1 / 5274a5f9 / fc40e764. Files:
`screens/{Campaign,Session,CommandCenter,Characters}.tsx`, `ds/components/campaign/{QuestCard,NpcCard}.jsx`,
`ds/components/condition/ConditionBadge.jsx`.

## FIXED — do not re-report
- Campaign.tsx Tabs ARE wired: `idBase="campaign"` + `tabPanelProps('campaign', tab)` (Campaign.tsx:716,723).
  Remaining unwired `<Tabs>` consumers app-wide are ONLY `Characters.tsx:1690` and `app/map/MapEditor.tsx:431`.
- Characters.tsx attack-editor (:867) and advancement (:970) grids now carry the `isPhone` ternary.
  All 4 residual grids from the prior char/encounter note are closed; no unguarded grid remains in
  Campaign/Session/Characters (CommandCenter.tsx:474 `'1fr 1fr'` Create grid measured OK at 393px).
- Session combat row keydown no longer steals nested activation (`if (e.target !== e.currentTarget) return`).
- `--color-text-tertiary` is AA-tuned per its own token comment — do NOT flag T.ter contrast.
- Global `:focus-visible` ring exists in `styles/tokens/base.css:36` — do NOT flag missing focus rings.
- Chip's `onRemove` uses `minWidth/minHeight: var(--density-touch-target, 24px)` — that's the canonical
  24px fix to cite; ConditionBadge has NOT adopted it yet.

## STILL OPEN (verified in code 2026-07-29)
1. `Session.tsx:262-271` — `deliverHandout`'s no-scene / no-players `Toaster.warning` branches are
   UNREACHABLE because `Push to players` (:1420) is `disabled={!canDeliver || !title.trim()}` and
   `canDeliver` (:295) already requires `activeSceneId && players.length > 0`. Live-but-no-players ⇒
   silently dead button. Same "guard became a dead button" class as the old Characters.tsx AC/XP bug.
   Contrast `StagePanel.onProject` (:445) whose players-check IS reachable — that's the correct shape.
2. `Characters.tsx:1690` — `<Tabs>` with no `idBase`; roster grid body is the panel.
3. `Campaign.tsx:818-841` — NPC tiles still `role=button` divs wrapping `NpcCard`; `aria-label` swallows
   AC/HP/dmOnly, and NpcCard's `interactive` hover never turns on (it keys off its own `onClick`).
   Also fabricates `disposition="neutral"` for every NPC and puts AC/HP in the `hook` slot, which
   NpcCard renders italic behind a `dm-only` Eye icon — stats masquerade as a DM secret.
4. `Session.tsx:738-747` — combat rows `role="button" aria-label={`Select ${name}`}` + nested real
   buttons (ConditionBadge remove :812, Heal/Damage :827). aria-label replaces the row's whole
   subtree, so initiative/HP/AC/conditions/Active-Bloodied-Down badges vanish from the a11y tree.
5. `ds/components/condition/ConditionBadge.jsx:83` — `onRemove` button is `width:14,height:14`.
6. **Campaign create entry points destroy focus.** All three create launchers unmount themselves on
   click (`canAuthor && !questEditor…` :726, EmptyState action :755, `canAuthor && !factionEditor` :848),
   so focus falls to `document.body`; the inline editor that replaces them never receives focus.
   Cancel does the reverse without restoring focus.
7. `QuestCard.jsx:60-71` — objectives are plain `<button>`, no `role=checkbox`/`aria-checked`; for a
   read-only viewer `disabled={!onToggleObjective}` drops them from tab order and loses done state.
8. `Campaign.tsx:317-379 / 558-641` — Quest/Faction editors have no `<form>`; Enter never submits.
9. `Session.tsx:1308` — dice-expression `Input` has no Enter handler on the combat hot path.
10. `Session.tsx:670` — `End combat` fires `combat.end` on one click, no confirm, no undo (Dialog
    `tone="danger"` is the established pattern; Toaster supports `action`/`onAction`).
11. `Campaign.tsx:403-413` — FactionCard title is a styled `<span>` while NpcCard/QuestCard use `<h3>`.
12. `CommandCenter.tsx:223` — `scenes.find(s => s.id === homeSceneId)` is dead (`scenes` filtered at
    :200), so "no active scene" silently falls through to `scenes[0]` instead of the home scene.
13. `CommandCenter.tsx:494-521` — Manage nav rows have no hover/active state (transparent bg, no
    onMouseEnter), unlike every sibling tile in the hub.
14. Low: `Campaign.tsx:876` Factions EmptyState `action={undefined}` while Quests' has one — NOT a dead
    end, because the top "New faction" button renders even at zero factions. Consistency only.

## e2e specs pinning current semantics (check before changing roles/labels)
- `apps/gm-react/tests/e2e/campaign.spec.ts` — **:98 asserts an objective is `getByRole('button')`**, so
  moving QuestCard objectives to `role=checkbox` REQUIRES editing this spec. Also :72 clicks
  "Create the first quest", :143/:222/:239/:255 click `role=tab`, :168 `Edit ${name}`.
- `tests/e2e/a11y-axe-gate.spec.ts` — axe (incl. best-practice, blocks critical/serious) runs on
  `/campaign`, `/session`, `/characters`; register `tests/a11y/known-violations.json` is EMPTY.
  It cannot currently see findings 3 and 4 because a fresh vault has no NPCs and no running combat,
  so `nested-interactive` never renders. Any fix that ADDS interactive nesting will start failing.
- `tests/e2e/responsive.spec.ts` — sweeps `/`, `/session`, `/characters`, `/campaign` (+ a seeded
  `/characters/:id` pass at :217-245).
- Others touching the surface: `authoring-layout`, `co-dm`, `backup-restore`, `ai-assistant`.

See [[char-encounter-cluster]], [[ds-layer-audit]], [[gm-react-ds]].
