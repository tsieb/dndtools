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
