# Early-access exit audit (RC-ENG-8.3, the M2.5 gate)

Run on 2026-10-15 against **`ef42291b`**, the dispatcher's `loop/rc` when this task was claimed. It
carries all 20 stories RC-ENG-8.3 depends on, RC-ENG-9.3 among them. Its application tree is the one
[FRICTIONLESS.md](FRICTIONLESS.md) audited: `git diff --stat 93361a43 ef42291b -- . ':!docs' ':!state'`
prints nothing. The gates were still re-run for this audit on `ef42291b`, not carried over.

The gate, from the story and [§3.2 M2.5](RC_ROADMAP.md#32-milestones):

1. the golden paths green on five consecutive runs on both Playwright profiles;
2. a `ux-ui-reviewer` pass over every primary route at the three viewport tiers with zero high
   findings;
3. `pnpm a11y:gate` clean;
4. no open primary-path entry in [`DEBT.md`](../../DEBT.md);
5. no primary row of [`FEATURE-GAPS.md`](../requirements/FEATURE-GAPS.md) carrying a limit beyond
   the [§2.1](RC_ROADMAP.md#21-feature-completeness) four (payment processor, signed desktop
   certificates, curation service, Cloud-Enhanced phase 2).

Primary surfaces are the ones [§0.3 rule 12](RC_ROADMAP.md#03-non-negotiable-guardrails-apply-to-every-story)
names: screens, Session, Characters, Maps, Notes, onboarding and the shell. The player companion
(`/play`) is included because the golden paths and RC-POL-1.8 put it on the primary path. The three
tiers are the `Viewport` tiers in [NAVIGATION.md](../architecture/NAVIGATION.md): desktop (>1024px),
rail (641–1024px) and phone (≤640px).

Everything below ran locally on one Linux machine against the Vite dev server, not on hosted CI.
Severity follows FRICTIONLESS.md: **critical** blocks or silently breaks a primary path; **high**
means a new GM or player will fail or misread; **medium** is friction or inconsistency; **low** is
polish.

## 1. Verdict

**M2.5 does not pass on `ef42291b`.** Gates 1 and 3 pass. Gates 2, 4 and 5 fail:

- REVIEW-VERDICT-PLACEHOLDER
- four DEBT.md entries are open on primary surfaces: DEBT-2026-004 (Maps), -006 (Characters), -007
  (Characters and the companion in Spanish) and -008 (screens and Session in parchment);
- two primary FEATURE-GAPS rows carry a limit outside the §2.1 four: Characters (History has no
  rest, combat or level-up events) and the Player app (a push limit that `/play` never shows; the
  row is misattributed).

Each failure is filed as a story in [§7](#7-blocking-stories), added to RC-ENG-8.3's `Deps:` in the
roadmap, and created in the dispatcher as `proposed`. M2.5 is re-audited once they land.

What holds: the five golden journeys (first run, prep, Standby to live, knowledge capture, a player
joining over the fake LAN) passed 50 of 50 times across ten profile-runs with no retry, and the axe
gate reports no critical or serious violation on 60 route-and-profile scans.

## 2. Golden paths

`golden-path.spec.ts` on `desktop-chromium` and `mobile-chromium` together, retries 0, five
consecutive runs, 2026-10-15 10:37:55–10:43:19Z: **78 passed, 0 failed, 0 flaky, 0 skipped in each
run** (39 per profile). The 78 are the five journeys and the detector and seeded-defect fixtures that
prove each journey assertion fails on a planted defect; the fixtures failed their planted defect as
designed every time. The highest retry index in all five JSON reports is 0.

The journeys assert, per RC-ENG-8.1 and RC-ENG-9.2, no console error or warning, no failed request,
no widget in an error state, no disabled control without a stated reason, no unrecoverable clip, and
the friction budgets. The machine's load average was 6.8–10.2 at the run starts; another dispatcher
worktree ran a containerized visual suite throughout.

## 3. Accessibility gate

`pnpm a11y:gate` on `ef42291b` (10:43:19–10:45:12Z, straight after run 5), exit 0:

- non-text contrast: 319 pair checks across five themes and 16 forced-colors remap checks passed;
- axe on both profiles: 61 passed, 1 skipped (the phone-only `/board` Layout test on
  `desktop-chromium`, skipped by design);
- report over 60 route-and-profile scans, all 60 worker artifacts present: 0 critical, 0 serious,
  1 moderate, 0 minor; 0 blocking; 0 approved known violations; "Gate result: PASS".

The moderate one is axe `region` on the phone live-session strip
(`div[data-testid="phone-session-strip"]`, `/session#combat`, `mobile-chromium`), FRICTIONLESS.md L12,
unchanged. The gate logs moderate impacts without blocking. The gate is clean by its own policy; it
does not scan parchment for text contrast, which is why DEBT-2026-008 (§5) does not show here.

## 4. The review

REVIEW-SECTION-PLACEHOLDER

## 5. DEBT.md

An entry counts as primary-path when its stated impact is visible to a GM or player on a primary
surface in a configuration the product ships (the default or a selectable theme, locale or system).

| Entry         | Severity | Primary surface                         | Status on `ef42291b`                                                                                                                                                                                                                                                                                                         | Counts |
| ------------- | -------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| DEBT-2026-004 | low      | Maps                                    | Part (b) is still open. Atlas's `screens/atlas/LayersPanel.tsx` hand-rolls its rows; only the editor dock (`app/map/dock/LayersPanel.tsx`) uses the DS `LayerRow`. The map import composes DS `Dialog`, `Stepper` and `Field`; the DS `ImportWizard` appears only in `screens/DsGallery.tsx`. The entry says RC-POL-1.9 picks it up; POL-1.9 has landed and its journal does not mention it. | yes    |
| DEBT-2026-006 | medium   | Characters                              | Open. The core still holds every PC draft to the 27-point buy (`ABILITY_POINT_BUDGET`, `character-draft-flow.ts:77`), so a rolled spread cannot be finalized.                                                                                                                                                               | yes    |
| DEBT-2026-007 | medium   | Characters, the companion (Spanish)     | Open. Package vocabulary reaches Spanish strings untranslated.                                                                                                                                                                                                                                                              | yes    |
| DEBT-2026-008 | medium   | Screens, Session, scene editor (parchment) | Open. The parchment pair is still `#9a5418` on `#f0e0c8` (`styles/tokens/colors.css:165,168`); `session-polish.spec.ts:27` and the comments at `QuickPanel.tsx:217`, `CombatantItem.tsx:95` and `DiceTray.tsx:220` still name it.                                                                                       | yes    |
| DEBT-2026-009 | medium   | none visible                            | Open. Every content command copies every item. Not counted: the cost is internal, and RC-ENG-3.2's final capture breached none of the eleven budgets. This is a judgement; RC-ENG-7.3 should re-read it.                                                                                                                     | no     |

## 6. FEATURE-GAPS.md

The primary rows are Onboarding, Command Center, Palette and help, Screens, Scene editor, Board,
Session, Characters, Maps (Atlas), Notes (Knowledge) and Player app. A §2.1 limit is read as §2.1
item 2 defines it: a capability a primary surface offers, or the plan promises, that is unavailable
or incomplete.

Counted, outside the four:

- **Characters.** "History renders journal entries; automatic rest, combat and level-up history still
  needs event-source wiring" (`app/character/History.tsx:21`). RC-CHR-2.3 promised a feed of
  "level-ups, rests, combats, downtime"; only journal entries (downtime among them) appear.
- **Player app.** "Push delivery is unavailable" (`platform/capabilities.ts:166`). That copy renders
  only in the GM's Settings › Notifications (`screens/settings/Notifications.tsx:17`); nothing under
  `screens/play/` imports the push client. The limit is real, operator-owned (RC-CLD-2.3, §24) and
  not one of the four, but it belongs to the Settings row, which is not primary.

Not counted, with the reason:

| Row                         | Limit                                                                  | Why it is not a §2.1 limit                                                                                         |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Palette and help            | Authored guides ship in English                                        | Localization residue; §2.3 gates the Spanish catalog at RC-1, not M2.5.                                            |
| Scene editor                | Generated widgets need DM review                                       | The §0.3 rule 9 guardrail (AI proposes, never disposes).                                                           |
| Board                       | Tile status notes and inspector tier descriptions stay English         | Localization residue, as above.                                                                                    |
| Board                       | Phone list tiles keep their authored height and scroll inside          | RC-CAN-5.5's recovery design for content that outgrows a tile.                                                     |
| Session                     | Parchment phase control at 4.43:1                                      | Counted once, as DEBT-2026-008.                                                                                    |
| Session                     | End the live session to return to Standby                              | The §1.6 D2 posture rule.                                                                                          |
| Session                     | Continuity prompts stay English                                        | Localization residue.                                                                                              |
| Characters                  | D&D Beyond JSON import diagnostics stay English                        | Localization residue.                                                                                              |
| Maps (Atlas)                | The legacy per-map token array stays in state                          | Internal state; nothing on screen.                                                                                 |
| Notes                       | Live co-editing presence is not modeled                                | Neither offered nor promised; the roadmap's "presence" is the companion's `screens/play/Presence.tsx`.             |
| Notes                       | History keeps 50 revisions over 30 days                                | Retention bounds (RC-KNW-5.2), not a missing capability.                                                           |

The English residues are listed for RC-ENG-7.3, which audits §2.3.

## 7. Blocking stories

STORIES-PLACEHOLDER

## 8. Not checked

- Electron and Android shells; hosted CI.
- Themes other than the default, except through the contrast gate; Spanish and the pseudo-locale
  beyond the specs that assert them.
- A screen reader. Accessible names come from ARIA snapshots and axe.
- NOT-CHECKED-REVIEW-PLACEHOLDER

## 9. Reproducing the run, and integration

The review probes were scratch specs and are not committed; the gates are. From a clean checkout,
with `<dir>` a scratch path and `<port>` a free port:

```sh
git worktree add --detach <dir> ef42291b
cd <dir> && pnpm install --frozen-lockfile
cd <dir>/apps/gm-react
# five times, n = 1..5:
DNDTOOLS_E2E_PORT=<port> PLAYWRIGHT_JSON_OUTPUT_NAME=<dir>/golden-run<n>.json \
  pnpm exec playwright test tests/e2e/golden-path.spec.ts \
  --project=desktop-chromium --project=mobile-chromium --reporter=json,line
cd <dir> && DNDTOOLS_E2E_PORT=<port> pnpm a11y:gate
```

The DEBT.md and FEATURE-GAPS.md readings in §5 and §6 are static: the files at `ef42291b` read against
the source they cite.

This audit holds for the application tree of `ef42291b`. On top of it the branch adds only
documentation: this file, the planning-index link, the roadmap stories and the run journal. Before
citing this verdict for another commit, run `git diff --stat ef42291b <commit> -- . ':!docs' ':!state'`.
Empty output means the same application code; anything else means the gates run again.
