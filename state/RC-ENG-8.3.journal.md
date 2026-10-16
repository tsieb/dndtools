# RC-ENG-8.3 run journal

## Setup (2026-10-15)

- Task branch `dispatch/dndtools/30d66865d16ef7ff1eb3`, base `ef42291b` (= local `loop/rc` and
  `origin/loop/rc` at claim). Clean on entry. No push, promotion, loop launch or dispatcher
  control-state edits. Dispatcher store `tasks.sqlite3` read read-only (`mode=ro`): all 20 `Deps:`
  are `succeeded`, RC-ENG-9.3 among them.
- `git diff --stat 93361a43 ef42291b -- . ':!docs' ':!state'` is empty: the application tree is the
  one RC-ENG-9.3 audited. The gates below are nevertheless re-run on `ef42291b` for this audit.
- Gate definitions taken from the story text (RC_ROADMAP.md §ENG-8, RC-ENG-8.3) and §3.2 M2.5:
  golden paths ×5 on both profiles; `ux-ui-reviewer` over every primary route at the three viewport
  tiers (desktop, rail, phone — `LAYOUT_TIERS.md`); `pnpm a11y:gate`; DEBT.md primary-path entries;
  FEATURE-GAPS primary rows against the §2.1 four. Primary surfaces per §0.3 rule 12: screens,
  Session, Characters, Maps, Notes, onboarding, the shell.

## Golden paths ×5 on `ef42291b` (original JSON inspected)

- Script `~/.cache/rc-eng-8-3-evidence/run-gates.sh`, port 5481, default workers, run from the task
  worktree. `golden-path.spec.ts`, `--project=desktop-chromium --project=mobile-chromium`, retries 0,
  JSON + line reporters. Logs and JSON `~/.cache/rc-eng-8-3-evidence/golden-run{1..5}.{log,json}`.
- Runs 1–5, 10:37:55Z–10:43:19Z: each **78 expected, 0 unexpected, 0 flaky, 0 skipped**, 39 per
  profile, max retry index 0. The five journeys (first run, prep, Standby→live, knowledge, player
  join) passed on both profiles in every run. Load average at run starts 6.8–10.2: another
  dispatcher worktree was running a podman visual suite throughout.

## a11y gate on `ef42291b`

- `pnpm a11y:gate` (same script, after run 5), 10:43:19–10:45:12Z, exit 0. Non-text contrast: 319
  pair checks across 5 themes, 16 forced-colors remap checks, passed. Axe: 61 passed, 1 skipped.
  Report over 60 route×profile scans (60 worker artifacts present): 0 critical, 0 serious,
  1 moderate, 0 minor; 0 blocking; 0 approved known violations; "Gate result: PASS". The moderate
  is axe `region` on `div[data-testid="phone-session-strip"]`, `/session#combat`, mobile-chromium
  (FRICTIONLESS.md L12, unchanged).

## DEBT.md and FEATURE-GAPS.md on `ef42291b` (static, read against source)

- Rule applied (DEBT): an entry is primary-path when its stated impact is user-visible on a primary
  surface in a configuration the product ships (default or selectable theme, locale, system).
  - DEBT-2026-004 (low): (b) still open on Maps. `screens/atlas/LayersPanel.tsx` imports no DS
    `LayerPanel`/`LayerRow` (only `app/map/dock/LayersPanel.tsx` uses `LayerRow`); the map import flow
    composes DS `Dialog`/`Stepper`/`Field` (`app/map/ImportMapDialog.tsx`, `ImportMapSteps.tsx`), the DS
    `ImportWizard` is used only by `screens/DsGallery.tsx`. The entry says RC-POL-1.9 picks it up;
    POL-1.9 succeeded and its journal never mentions it. → primary-path, open.
  - DEBT-2026-006 (medium, Characters: PC from rolled scores) → primary-path, open.
  - DEBT-2026-007 (medium, English vocabulary in Spanish on sheet, vitals, level-up) → primary-path, open.
  - DEBT-2026-008 (medium, parchment accent-on-tint 4.43:1; Session phase Seg cited by
    `session-polish.spec.ts:27`, comments in `QuickPanel.tsx:217`, `CombatantItem.tsx:95`,
    `DiceTray.tsx:220`) → primary-path, open.
  - DEBT-2026-009 (medium, content commands copy every item) → not counted: no user-visible symptom;
    RC-ENG-3.2's final capture shows 0 target breaches on all eleven budgets. Judgement, recorded.
- Rule applied (FEATURE-GAPS): a §2.1 limit is a capability a primary surface offers, or the plan
  promises it, that is unavailable or incomplete. Primary rows: Onboarding, Command Center, Palette and
  help, Screens, Scene editor, Board, Session, Characters, Maps (Atlas), Notes, Player app.
  - Counted: Characters › History has no rest/combat/level-up events (`History.tsx:21`; RC-CHR-2.3
    promised "level-ups, rests, combats, downtime"). Player app › push: the cited copy
    (`capabilities.ts:166`) renders only in GM Settings › Notifications
    (`screens/settings/Notifications.tsx:17`); `/play` imports no push client. Misattributed row;
    the capability is operator-owned (RC-CLD-2.3, §24) and not one of the §2.1 four.
  - Not counted, with reason: English residue under ES (help guides, board tile notes and inspector
    tiers, continuity prompts, D&D Beyond import diagnostics) — localization, gated by §2.3 at RC-1,
    not an unavailable capability; DM review of generated widgets (§0.3 rule 9 guardrail); phone list
    tiles scroll inside (CAN-5.5 recovery design); end live before Standby (D2 posture rule); legacy
    token array (internal state); note co-editing presence (neither offered nor promised: roadmap
    "presence" refers to `screens/play/Presence.tsx`); note history 50 revisions / 30 days (retention
    bounds); Session parchment exception (counted once, as DEBT-2026-008).

## Review (in progress)

- Three `ux-ui-reviewer` passes, authorized by the story text ("a `ux-ui-reviewer` pass over every
  primary route at the three tiers"), each in its own detached worktree at `ef42291b`
  (`~/.cache/rc-eng-8-3-review-{a,b,c}`, `pnpm install --frozen-lockfile` exit 0), ports 5491–5493,
  shared brief `~/.cache/rc-eng-8-3-evidence/review-brief.md`. A: onboarding, Command Center, shell,
  palette and Help, `/screens`. B: `/screen/:id`, `/scene/:id`, `/session`. C: Characters, Atlas and
  the map editor, Notes, `/play`. Desktop 1440×900, rail 834×1112 touch, phone 390×844 touch.
- 10:57Z and again ~11:17Z: the parent session restarted mid-review; the reviewers' orphaned dev servers on 5491/5492
  were stopped and the three passes resumed from their transcripts and partial evidence.
- Review C finished: critical 0, high 1 (C-1), medium 14 (C-2..C-15), low 11 (C-16..C-26); report
  saved as `~/.cache/rc-eng-8-3-evidence/review-c/REPORT.md`. C-1 re-checked by me in source:
  `charBuilder/data.ts:53,59` ancestry `sub` strings are display text only; `charBuilder/index.tsx:225`
  `effScores` and `coreAbilities` add no bonus; `create.ts:209` dispatches them as-is; the core draft
  flow has no ancestry concept. Copy `en.ts:5252,5283` promises the bonuses. Confirmed.
- 11:19Z: EARLY_ACCESS.md drafted (gates, DEBT, FEATURE-GAPS, verdict fail); review A/B sections and stories pending.
- Review B finished: critical 0, high 2, medium 5 (B-3..B-7), low 7 (B-8..B-14); the agent could not
  write report files, so its final message is saved as `review-b/REPORT.md`. B-1 (default Start goes
  live on the dm-only home screen and the header says players see it) re-checked in source:
  `useSessionView.ts:104` falls back to `commandCenter.homeSceneId`, `Lifecycle.tsx:303` defaults to
  Continue, the header at `Lifecycle.tsx:54-56` names the scene regardless of visibility. Confirmed.
  B-2 (FRICTIONLESS L4 widened: rail Fit covers Next turn and Timer Start) re-checked: the overflow
  footer is an opaque absolute overlay (`WidgetRenderSlot.tsx:415-430`). Accepted as high on the
  brief's "primary action hidden"; recoverable by scrolling inside the tile, which is why the golden
  detector passes it. Judgement recorded.
- Review A finished: critical 0, high 1 (A-1), medium 7 (A-2..A-8), low 6 (A-9..A-14); report saved
  from its final message as `review-a/REPORT.md`. A-1 re-checked: `en.ts:14-15` `importHub.keywords`
  names "notes characters … maps"; `CommandPalette.tsx:466` `groupOrder` ranks Actions above Go to.
  Confirmed; held high although the reviewer left the blocking call open (recorded as a judgement).

## Verdict and filing

- Verdict: M2.5 does not pass on `ef42291b`. Gates 1 and 3 pass; gate 2 fails (A-1, B-1, B-2, C-1),
  gate 4 fails (DEBT-2026-004, -006, -007, -008), gate 5 fails (Characters History, Player app push).
- Stories RC-ENG-8.5–8.13 written into the ENG-8 epic; RC-ENG-8.3's `Deps:` (story and §23) gains
  them; §23 rows and header counts (380 → 389; L 42, M 210, S 137, P3 128, open 79); §3.2 status note.
  `dispatcher.sources.rc.parse_roadmap` parses all nine (sizes, P3, owns, specs; 8.13 docs-only) and
  RC-ENG-8.3's deps with no unknown token.
- `task.create` ×9 via `python3 dispatch.py command` (operator note authorizes it), envelopes and
  results in `~/.cache/rc-eng-8-3-evidence/task-create-{envelopes.json,results.txt}`; all exit 0;
  store read back read-only: all nine `proposed`. RC-ENG-8.3's own stored dependencies were not
  touched (`task.update` refuses a running task; that is the operator's to reconcile).

## Validation and cleanup

- `pnpm feature-audit` first FAILED: the FEATURE-GAPS Shells row anchors `RC_ROADMAP.md:4109`, which
  the new stories moved to 4206 (same `| RC-PLT-1.1 |` row, matched exactly). Re-anchored (companion
  path, one token, same width, no re-pad); re-run: 48 declared limits, 0 stale, 0 inventory issues.
- Docs link audit (`auditDocs` from `scripts/validate/docs-links.ts`): 310 files, 465 links, 0
  problems. Heading anchors used by EARLY_ACCESS.md checked by hand against GitHub slugging.
- Prettier `--check` on the five changed files: clean (EARLY_ACCESS.md table padding was fixed with
  `--write`).
- `tools/loop/tests/test_rcloop.py` Parse + RelatedSpecs (7 tests, system python unittest): OK. The
  full file was not run: its later classes exercise the retired loop's quota probes and hung past
  three minutes; stopped.
- ADR-031 and ADR-032 cite historical roadmap line numbers that were already stale; outside this
  task's paths, untouched.
- Removed: `tmp/a11y` and `apps/gm-react/test-results/` (copied to
  `~/.cache/rc-eng-8-3-evidence/a11y-artifacts/`), the three review worktrees (probes copied to
  `review-{a,b,c}/probes/`), `tools/loop/**/__pycache__`. Evidence stays in
  `~/.cache/rc-eng-8-3-evidence/`, uncommitted.

## Attempt 2 (2026-10-15, after independent review rejected 3b9bbaec)

- Review findings: (1) M2.5 still fails on this candidate — correct, and not fixable inside this
  task's docs-only paths; the audit stays a recorded failure. (2) RC-ENG-8.3's stored dependencies do
  not include RC-ENG-8.5–8.13 — re-read the store read-only at ~12:00Z: RC-ENG-8.3 `running`, 20 deps;
  8.5–8.13 `proposed`, 0 deps. Not changed: editing it is dispatcher control state, which this task
  must not touch; recorded in EARLY_ACCESS.md §1 and §7 as needing the operator before approval.
  (3) the phone template-editor state was never reviewed — completed now.
- Phone template editor: own probe (`p1..p4`, port 5497, this worktree; app tree == `ef42291b`, `git
diff --stat ef42291b HEAD -- . ':!docs' ':!state'` empty). p1/p2 failed on a probe error (clicked the
  "Dice & Timers" filter, Add sheet stayed open); p3/p4 passed every step. Then a fourth
  `ux-ui-reviewer` pass (same brief, phone only, extended probe, q1..q6): 0 critical, 0 high, medium
  BP-1..BP-5, low BP-6..BP-11; q1 failed on its own selectors, q2..q6 passed; no console or page
  errors. BP-1 re-read in source (`useSceneCommands.ts:116-122`, toast Undo = generic history undo):
  confirmed. Evidence `~/.cache/rc-eng-8-3-evidence/review-b-phone-tpl/` (REPORT.md, probes, shots,
  aria, metrics). Scratch `apps/gm-react/tests/e2e/_rc83/` and `test-results/` removed.
- EARLY_ACCESS.md: verdict unchanged (not passed); BP row and findings added to §4; §8 drops the
  phone template editor and states the review is still incomplete (Help shortcut list, map-editor
  actions); §1/§7 say the task must stay blocked until the re-audit passes. RC_ROADMAP.md story text
  says the same.
- Validation: the roadmap sentence was first added as an extra line, which moved the FEATURE-GAPS
  Shells anchor (`RC_ROADMAP.md:4206`) and failed `pnpm feature-audit`. Rewritten to keep the story's
  line count; re-run: 48 declared limits, 0 stale, 0 inventory issues. Docs link audit (`auditDocs`):
  310 files, 465 links, 0 problems. Prettier `--check` on the changed files: clean.

## Attempt 3 (2026-10-15, after independent review rejected eb654710)

- Review findings: (1) the M2.5 failures need application fixes outside this docs-only task; the
  verdict stays "not passed". (2) RC-ENG-8.3's stored deps still lack RC-ENG-8.5–8.13. Re-read
  read-only at 12:07Z: RC-ENG-8.3 `running`/`implement`, 20 deps; 8.5–8.13 `proposed`, 0 deps.
  This is control state, so it's not mine to change; left for the operator again. (3) the review
  missed five primary actions (Help shortcut list, token drag, fog drawing, POI placement, map
  import past step 1). That one is actionable here.
- 12:08Z: started review pass D (`ux-ui-reviewer`, the same shared brief, assignment
  `~/.cache/rc-eng-8-3-evidence/review-d/assignment.md`). It covers those five actions at all three
  tiers, on this checkout (app tree == `ef42291b`), port 5493, with scratch probes under
  `apps/gm-react/tests/e2e/zz-eng83-d/` that are removed afterwards.
- ~12:18Z: the parent session restarted and pass D stopped part-way, at about 11:18Z after ~10 min. Its
  scratch probes, its evidence and its dev server on 5493 were still present. Resumed it from its
  transcript with the same assignment. The gate retry flagged the scratch probes and this journal
  edit as uncommitted work. The probes are removed when the pass ends; the journal is committed
  with the result.
- ~12:40Z: pass D finished. It found 0 critical, 1 high (D-1), 7 medium (D-2..D-8) and 5 low
  (D-9..D-13). All five actions are covered at all three tiers, two runs each. Not reached: the
  camera QR join (no camera) and the reviewer's own optional `.dd2vtt` re-import. The agent could
  not write files, so I saved its report as `review-d/REPORT.md`; the probes are in `review-d/probes/`.
  It deleted the scratch dir `zz-eng83-d/`, created no `test-results/`, and stopped its server on
  5493 (port checked free).
- D-1 re-read in source: `useImportMap.ts:210-231` dispatches `map.import-asset` and only then calls
  `putAssetBytes` (:252); `useAssetObjectUrl` (`platform/assetUrl.ts:42-64`) depends on `[assetId]`
  alone; `MapCanvas.tsx:186-208` renders `mapEditor.imageMissing`. Confirmed. The audio import
  already writes the bytes first (`runtime/audio-import.ts:208`).
- Filed RC-ENG-8.14 (S, P3) in the ENG-8 epic. RC-ENG-8.3 `Deps:` gets 8.14 in the story text and in
  §23; header 390 (S 138, P3 129, open 80); the §3.2 note now says 8.5 to 8.14. `task.create` exit 0;
  read-only check at 12:41Z: 8.14 `proposed`, RC-ENG-8.3 still `running` with 20 deps (operator).
- EARLY_ACCESS.md: verdict stays "not passed", now with five highs; D row, intro, D-1, D-2..D-8 and
  D-9..D-13 added to §4; L3 re-checked; §7 now has ten stories; §8 keeps only the camera QR join and
  the `.dd2vtt` re-import as review exclusions and states that the review now covers every primary
  route.
- Validation: the new story moved the FEATURE-GAPS Shells anchor's row (RC-PLT-1.1) from 4206 to
  4216, so I re-anchored it (one token, same width). `pnpm feature-audit`: 48 declared limits, 0
  stale, 0 inventory issues. `auditDocs`: 310 files, 465 links, 0 problems. `parse_roadmap` parses
  RC-ENG-8.14 (S, P3, deps none) and RC-ENG-8.3's deps through 8.14. Prettier `--check` on the
  changed files: clean.

## Attempt 4 (2026-10-16, re-audit after RC-ENG-8.5 to 8.14 landed)

- Read-only store check at ~16:10Z: RC-ENG-8.5 to 8.14 all `succeeded`/`integrated`; RC-ENG-8.3
  `running`/`implement` with 30 stored dependencies, the ten among them (the operator reconciled the
  second review finding). Every story's recorded head is an ancestor of local `loop/rc` = `b2ddfc1d`
  (RC-ENG-8.9's head is the tip). `origin/loop/rc` is `77ae4c82` and behind; the dispatcher's local
  `loop/rc` is the reference.
- Rebased the seven audit commits onto `b2ddfc1d` (clean, no conflicts). `git diff --stat b2ddfc1d HEAD
-- . ':!docs' ':!state'` is empty. Lockfile unchanged since `ef42291b`; deps already installed.
- 16:16:58Z: gate chain started (`~/.cache/rc-eng-8-3-evidence/rerun-b2ddfc1d/run-gates.sh`, port
  5481): golden-path.spec.ts ×5 on both profiles, retries 0, then `pnpm a11y:gate`.
- Static: DEBT.md on `b2ddfc1d` resolves -006 (RC-ENG-8.8), -007 (RC-ENG-8.10) and -008 (RC-ENG-8.9);
  -004 stays open, re-scoped by RC-ENG-8.11 to part (c) only (GeneratePanel and AssetsPanel pickers,
  hand-rolled `aria-pressed` chip groups). FEATURE-GAPS.md: the Characters History limit is gone
  (RC-ENG-8.12) and the push limit sits on the Settings row (RC-ENG-8.13); the Player app row has none.
- Review worktrees `~/.cache/rc-eng-8-3-rerun-{a,b,c,d}` detached at `b2ddfc1d`, installed. Four passes
  (A shell/onboarding/CC/palette/Help/screens, B screens/scene editor/Session, C Characters/Notes/play,
  D Atlas/map editor/import), brief `rerun-b2ddfc1d/review-brief.md`, ports 5511–5514; launched after the
  gate chain so they do not load the golden runs.
- Gate chain on `b2ddfc1d` (`rerun-b2ddfc1d/chain.log`): runs 1–5 exit 0, 16:16:58–16:21:55Z, load
  1.7–4.1; JSON reports parsed: 78 expected, 0 unexpected/flaky/skipped each, 39 per profile, max
  retry 0. `pnpm a11y:gate` exit 0 (16:21:55–16:23:24Z): 319 contrast pairs + 16 forced-colors checks,
  axe 61 passed / 1 skipped, 60 scans, 0 critical/serious, 1 moderate (`region`, mobile
  `/session#combat`), PASS. `tmp/a11y` and `apps/gm-react/test-results/` moved to
  `rerun-b2ddfc1d/a11y-artifacts/`.
- Four `ux-ui-reviewer` passes in parallel (~16:25–17:00Z), all completed in-turn. A: 0/0, A-1 fixed.
  B: 2 high — B2-1 (B-2 still present, now desktop too, after RC-ENG-8.7's 44px Grow floor) and B2-2
  (no UI changes a scene's visibility; new screens are dm-only) — B-1 fixed. C: 1 critical — C2-1
  (level-up wizard 609px in a 362/490px column; Next and Discard off-screen under overflow-x hidden on
  touch) — C-1 fixed. D: 0/0, D-1 fixed. The agents could not write files; condensed reports saved as
  `rerun-b2ddfc1d/review-{a,b,c,d}/REPORT.md`, probes in `review-*/probes/`.
- Re-read in source: `LevelUp.tsx:282` (maxWidth only), `Stepper.tsx:118` (nowrap); C2-1 rects in
  `review-c/r1/phone/levelup-layout.log.json`. `useScreens.ts:194` (`visibility: 'dm-only'`);
  `SceneMetaPanel`/`useSceneCommands.ts:15-20` draft has no visibility; the only `onVisibility` in the
  scene editor is per tile (`ScreenEditing.tsx:116`); no app dispatch sends a scene visibility.
  `WidgetRenderSlot.tsx:494-501` 44px floor; B2-1 HIT lines in `review-b/metrics/log-r2.txt`. All
  three confirmed.
- DEBT-2026-004 (c) judged not primary-path (optional editor docks, working `aria-pressed` buttons,
  review D: no visible friction; size is M2) and stated as a judgement in §5.
- Filed RC-ENG-8.15 (M), 8.16 (M), 8.17 (S), P3, in the ENG-8 epic; RC-ENG-8.3 `Deps:` through 8.17
  in the story and §23; §23 header 393 (M 212, S 139, P3 132, open 83) — only the new stories counted;
  the status cells of 8.5–8.14 are stale (blank), left for `tools/roadmap/sync-status.py`, which
  rewrites every row and was not run. `parse_roadmap`: 393 stories; RC-ENG-8.3 33 deps, 0 unknown.
- `task.create` ×3 via `dispatch.py command`, exit 0 (`rerun-b2ddfc1d/task-create-*`). Read-only
  check at 17:00Z: all three `proposed`; RC-ENG-8.3 `running` with 30 deps (operator to add 8.15–8.17).
  Mistake: RC-ENG-8.16's stored `owns` carries three non-path tokens (`useScreens.ts:194`,
  `scene.update-metadata`, `visibility`) — my extraction split on ". Finding" and the text broke the
  line there. Harmless as fences, but the operator should drop them; not changed here (control state).
- EARLY_ACCESS.md rewritten for the re-run on `b2ddfc1d` (verdict: not passed, gate 2 only); §10 keeps
  the first run's verdict and its medium/low descriptions (the earlier ids are re-checked in §4).
- Validation: re-anchored the FEATURE-GAPS Shells limit 4216 → 4260 (same row `| RC-PLT-1.1 |`, same
  width); `pnpm feature-audit`: 46 limits, 0 stale, 0 inventory issues. `auditDocs`: 313 files, 467
  links, 0 problems. Prettier `--check` on the changed files: clean. Review worktrees
  `~/.cache/rc-eng-8-3-rerun-{a,b,c,d}` removed after checking they were clean; ports 5511–5514 free.

## Attempt 5 (2026-10-16, after independent review rejected 71b92d85)

- The review approved none of it as completion. Its four findings are C2-1/RC-ENG-8.17, B2-1/RC-ENG-8.15 and
  B2-2/RC-ENG-8.16 still unfixed, plus the stored dependencies of RC-ENG-8.3 leaving out 8.15–8.17. It
  confirmed the evidence of attempt 4 (5 golden runs 78/78, a11y PASS, feature-audit and docs audit clean)
  and judged the audit's documentation candid.
- Read-only check at 17:09Z: `loop/rc` is still `b2ddfc1d` (it is this branch's merge base; no
  commit since). RC-ENG-8.15, 8.16 and 8.17 are all still `proposed` in `tasks.sqlite3`, so none
  has been approved, let alone landed. RC-ENG-8.3's stored `dependencies` is still 30 entries
  ending at RC-ENG-8.14.
- The committed roadmap already blocks on them: the story's `Deps:` (RC_ROADMAP.md:3359-3362) and its
  §23 row both run through 8.17. Nothing more in the owned paths can enforce the block.
- No re-audit run: the application code is identical to the audited `b2ddfc1d`, so a new run would
  measure the same tree, and the brief says to re-run only once the finding stories have landed.
  EARLY_ACCESS.md is unchanged; its verdict (not passed on `b2ddfc1d`) is still current.
- Blocked, needs operator: approve RC-ENG-8.15–8.17, add them to RC-ENG-8.3's stored dependencies
  (and drop the three non-path `owns` tokens on RC-ENG-8.16 noted in attempt 4), then re-dispatch
  RC-ENG-8.3 once they land on `loop/rc`. Both actions edit control state, which this task may not do.

## Attempt 6 (2026-10-16, after independent review rejected 50f3a67e)

- The review repeats the four findings from attempt 5: C2-1/RC-ENG-8.17, B2-1/RC-ENG-8.15
  and B2-2/RC-ENG-8.16 are unfixed, and RC-ENG-8.3's stored dependencies leave out 8.15–8.17. It found the
  documentation accurate and raised nothing against the docs themselves.
- Read-only check at 17:13Z: `loop/rc` and `origin/loop/rc` are both still `b2ddfc1d`, with no commit on any
  branch naming RC-ENG-8.15–8.17. In `tasks.sqlite3` all three are still `proposed`; RC-ENG-8.3 is
  `running` with 30 dependencies ending at RC-ENG-8.14.
- No re-audit and no change to EARLY_ACCESS.md, RC_ROADMAP.md or README.md. The tree is the one already
  audited, and the roadmap already lists 8.15–8.17 in the story's `Deps:` and its §23 row.
- Still blocked, needs operator: approve RC-ENG-8.15–8.17, add them to RC-ENG-8.3's stored dependencies,
  drop the three non-path `owns` tokens on RC-ENG-8.16, and re-dispatch this task once the fixes are on
  `loop/rc`. Re-dispatching it before that will produce the same rejection.

## Attempt 7 (2026-10-16, self-heal round 1: claim widened to the three defect files)

- The self-heal widened the claim to `LevelUp.tsx`, `WidgetRenderSlot.tsx` and `useScreens.ts`, so this
  attempt fixes the three findings itself and then re-runs the audit on the result.
- C2-1: the wizard root gets `width: 100%`, `minWidth: 0`. `character-levelup.spec.ts` gains a rail
  (834) and phone (390) touch test that taps Discard, every Next and Finish where they rest (centre in
  the viewport, `elementFromPoint` is the button) and completes a level-up. Base: fails ("Discard
  level-up's centre is inside the viewport"); fixed: 8/8 on both profiles.
- B2-1: the overflow footer row is one 24px text line on every tier (was a 44px row); Grow fills the row,
  44px wide. That alone cleared desktop. The rail body is 76px at Fit and Next turn sat at 54–98, so
  `Initiative.tsx` (outside the claim, one `order: -1`) lets Next turn lead its row: 0–44 in a 52px body.
  `tile-overflow-controls.spec.ts` now hit-tests at rest (no scroll into view of the body), clicks
  Next turn at its centre and checks the turn moved. Base: fails at 1440 and 834 ("Next turn rests
  inside its tile body"); fixed: 8/8. Not fixed: the Timer on the rail needs 82px (clock + 44px
  controls) in a 76px body even with no footer; recorded as a medium, not a combat control.
- B2-2: `useScreenActions().setVisibility` (claimed) and a "Who can see this screen" select in Scene
  details (`SceneMetaPanel.tsx`, outside the claim), written before the details save. Catalog keys in
  en/es (companions), qps-ploc regenerated. New `screen-visibility.spec.ts`: fresh vault, Combat scene
  template, share, Start session with "Show … to the table" enabled and checked, a player joins over
  the fake LAN and the stage names the screen. 2/2.
- Scene details offers the select only where the core's `canShowSceneToTable` would allow the scene
  once shared (not the GM's default workspaces, not templates): they can never reach the table.
- Gates so far (local): `tsc --noEmit` 0; `pnpm lint` 0; `CI=true pnpm test:app` 198 files / 2402
  tests pass. Full e2e, both profiles, 6 workers, retries 1 (25.1 min): 2301 passed, 49 skipped,
  10 failed, 0 flaky. Eight are `hub-templates.spec.ts:32` (×4 kinds ×2 profiles): "useI18n must be
  used inside I18nProvider", because I edited files on the live dev server and HMR gave the app
  modules `?t=` URLs the spec's bare-path imports did not share. Two are `phone-arrange.spec.ts:134`:
  the strict locator `[style*="--scene-board-scale"]` now also matched the footer rows, whose inline
  style uses `var(--scene-board-scale)`. Fixed in that spec and the same locator in
  `scene-surfaces.spec.ts:182` to `[style*="--scene-board-scale:"]` (the declaration). Re-run on a
  fresh Playwright-owned server: hub-templates, phone-arrange, scene-surfaces, canvas, both profiles,
  110 passed, 4 skipped.
