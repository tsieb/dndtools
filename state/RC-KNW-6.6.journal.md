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

## Independent-review repair (2026-10-10)

- Review candidate `c8920f38` silently overwrote inline outgoing relationships when an already-open
  faction/quest editor saved its captured body. Confirmed with a new browser regression for unchanged
  faction prose on desktop and phone before the repair (`/tmp/rc-knw-6.6-regression-before.log`). The
  first run's other cases had fixture errors (quest required status and faction textarea label), now
  corrected; those failures are not evidence of the defect.
- Both editor drafts now retain their opening body in the surviving draft slot. At save, an
  actor-filtered fresh read is merged against that ancestor: independent prose and frontmatter
  edits survive together, including relationship additions/removals. Competing edits to the same
  part abort before dispatch, report a localized conflict and leave the draft available to copy.
- Added regression cases for both entity types, unchanged/edited prose, durable reload and axe on
  both browser profiles, plus merge unit coverage. Validation in progress. No agents, push,
  promotion, new loop or dispatcher control writes.

### Repair verification

- `campaignRows.test.ts`: 8/8 unit tests passed (`/tmp/rc-knw-6.6-review-fix-unit.log`).
- Story links + relationship overview: 26/26 browser tests passed on desktop and mobile, including
  all eight editor-save regressions and axe (`/tmp/rc-knw-6.6-review-fix-e2e.log`).
- Final Story links + regular campaign editor suite: 26/26 passed on desktop and mobile
  (`/tmp/rc-knw-6.6-review-fix-final-e2e.log`). The edited-prose regressions now additionally cross
  into the rail detail pane and back before saving, verifying the ancestor survives remounts.
- gm-react `tsc --noEmit`, targeted ESLint, Prettier over all changed files and `git diff --check`
  passed. Logs: `/tmp/rc-knw-6.6-review-fix-types.log`, `-lint.log`, `-final-lint.log`, `-format.log`
  with the same `/tmp/rc-knw-6.6-review-fix` prefix.
- Full wrapper gates and independent review remain with the central operator. This repair changes
  save behavior and adds conflict feedback; no existing visual baseline was changed.

## Post-rebase gate investigation (2026-10-10)

- Started clean at `61ec03c9`. No Headroom tools are available in this session; inspected the original
  dispatcher gate log directly. The failed visual run had 545 passes and one 5-second screenshot
  timeout in `graph polish — scholar`, visual-rail, at `graph-repair--scholar.png`. It reported no
  pixel mismatch. Existing feature implementation and editor-save repair remain intact.
- Fresh Story links and campaign editor browser run: 26/26 passed on desktop and mobile, including
  relationship creation, persistence, graph display, player-preview filtering, inline date setting,
  and axe assertions (`/tmp/rc-knw-6.6-retry-e2e.log`). Story reader/merge units: 8/8 passed
  (`/tmp/rc-knw-6.6-retry-unit.log`).
- Initial pinned-container reproduction, three repetitions of the reported graph case: two failed
  at the separate 20-second runtime startup wait, and one passed with unchanged baselines
  (`/tmp/rc-knw-6.6-retry-visual.log`). This ran alongside the browser acceptance suite; it does not
  establish a product regression or resolve the original timeout.
- Isolated pinned-container comparison of `graph polish|campaign cards|Story polish`: 33/33 passed
  across desktop, rail and phone, including the originally failing scholar rail repair screenshot
  (`/tmp/rc-knw-6.6-retry-visual-isolated.log`, exit 0). No baselines, tolerances, timeouts or product
  code were changed. Evidence supports a transient timing failure, not a reproducible pixel defect;
  this targeted pass is not a claim that the full 546-test wrapper has passed again.
- Journal formatting and `git diff --check` pass. This retry commits only this verification record;
  the intended application changes already exist in `221003c7` and `61ec03c9`. Full wrapper gates
  and independent review remain with the central operator. No push, promotion, dispatcher control
  writes, new loop or additional agents.
