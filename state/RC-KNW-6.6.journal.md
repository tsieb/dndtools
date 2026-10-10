# RC-KNW-6.6 run journal

## Implementation (2026-10-10)

- Clean worktree at `87e1c891` (= `loop/rc`). No agents spawned. No push, promotion, dispatcher
  control change or new loop.
- Code stays inside the claim. `campaign/Cards.tsx` and the DS `NpcCard` are not owned, so the trays
  sit beside each card in `Campaign.tsx` (a column wrapper per grid cell) instead of inside the card
  components. Companion paths only: EN/ES catalogs, regenerated `qps-ploc.ts`, a new
  `campaignRows.test.ts`, a new e2e spec, and selector/copy edits to `campaign.spec.ts`.
- `Relationships.tsx`: the overview's body write is now `useRelationshipWriter()` (same fresh-body
  read, same per-storage command, same resolve check before writing a title). The overview and the
  new `StoryLinks` card tray both call it, so the inline "Add relationship" makes the same write.
  The overview UI itself is unchanged.
- `StoryLinks` tray (quest, faction and NPC cards): typed edges from
  `getTypedRelationshipEdgesForActor`, "Mentioned in" from `getNoteRelationshipsForActor` backlinks
  (content-backed sources only, newest edit first), and an inline form (direction, verb with the
  overview's suggestions, the other end grouped by kind word). It's only offered to an actor who can
  author. Focus goes back to the launcher after Add/Cancel.
- NPC card: AC/HP tags are gone. The tags now show `Faction: …`, `Place: …` (a POI, else a map) and
  `Last mentioned in …`, all derived from the same reads (`npcStoryHome`, `mentionsOf` in
  `campaignRows.ts`). The tray has an explicit "Open sheet" button; the name still opens the sheet.
- Timeline: "No campaign date set yet." plus a DM-only "Set the campaign date" button. It opens the
  Session surface's own `CampaignDatePanel` in place, which dispatches `session.set-campaign-date`.
  No new state beyond the open flag. Once a date exists the panel closes and focus moves to the
  date line.
- `campaign.npc.ac` / `campaign.npc.hp` removed (no remaining users).

## Verification

- `tsc --noEmit` (gm-react) clean; ESLint + Prettier on every changed file clean.
- `vitest run src/screens/campaignRows.test.ts`: 3/3 passed.
- New `tests/e2e/campaign-story-links.spec.ts`: 6/6 passed (desktop-chromium + mobile-chromium):
  NPC → faction "leads" added from the faction card, then seen on the NPC card (tray + `Faction:`
  tag), in the NPC's body, and in the overview graph/table after a reload; player preview shows the
  public edge and note but not the dm-only NPC's edge or the dm-only note, and offers no add control;
  timeline date set in place with the URL still `#/campaign`; axe clean at each state.
- Story specs (`campaign`, `campaign-polish`, `campaign-relationships`, `campaign-story-links`,
  `campaign-calendar`, `widget-intents`, `authoring-layout`) on both profiles: 72/72 passed
  (`/tmp/rc-knw-6.6-e2e-5.log`).
- Wider e2e on both profiles (`a11y-axe-gate`, `responsive`, `knowledge-filters`,
  `session-capture`): 243 passed, 1 skipped (`/tmp/rc-knw-6.6-e2e-6.log`).
- Pinned visual container, `-g "campaign cards|Story polish"`: 16 passed, 2 failed, both
  `campaign-npc.png` (desktop, phone): the NPC card lost its AC/HP chip row (120px → 82px tall).
  This is the intended change. I re-baselined only those two (`--update-snapshots=changed`),
  inspected them, and re-ran: 3/3 passed. The `Story polish` goldens (all themes × tiers) and the quest,
  faction and arc captures were unchanged. Baseline budget: 36,237 of 37,888 KiB.
- `pnpm test:app`: 180 files / 2,229 tests passed. `pnpm typecheck`, `pnpm lint` and `pnpm gates`
  exit 0 (existing file-size warnings; `Relationships.tsx` is 731 lines, warn-only, under the
  800-line limit). `git diff --check` clean.
- Not run locally: the full Playwright suite and the Android/desktop smoke gates. They are left to
  the central gates.
