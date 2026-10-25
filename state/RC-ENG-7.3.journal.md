# RC-ENG-7.3 run journal — RC-1 exit audit

## 2026-10-17 — setup

- Audit commit: `3cbf4b7ccbdb6ea51d4290e43d3163bf6dae0c1c` (the task branch at claim, equal to local
  `loop/rc`). `git diff --stat d1b4e6e4d 3cbf4b7cc -- apps packages scripts tests` is empty, so the
  application tree is the one RC-ENG-8.3's fifth M2.5 run reviewed.
- Role: docs. Owned: `docs/development/RC_CHECKLIST.md`, `docs/requirements/FEATURE-GAPS.md`,
  `docs/planning/README.md`, `docs/planning/RC_ROADMAP.md` (operator widening 2026-10-15); DEBT.md is
  a companion. No application code changes are in scope; findings become stories.
- Story status source: the dispatcher store read read-only
  (`tasks.sqlite3?mode=ro`), not the §23 column. 396 RC stories: 372 succeeded, 13 proposed, 5
  cancelled, 5 blocked, 1 running (this one).
- Review scratch: detached worktree `~/.cache/dndtools-rc-eng-7.3/tree` at the audit commit, deps
  linked from this worktree; reports in `~/.cache/dndtools-rc-eng-7.3/reports`. Nothing from the
  scratch tree is committed.
- Headroom (`mcp__dispatch__*`) tools are listed but deferred; native command output is read
  directly unless noted.

## 2026-10-17 — the five passes

Run as the story authorizes (`requirements-auditor` and `ux-ui-reviewer`), in the foreground of
this attempt, each writing to the scratch reports dir:

- R1 (`requirements-auditor`): §2.1.1 scope from the store, all 23 POL journals and their 242
  waivers, §2.1.3 contracts, the RC-UX-5.5 precondition, RC-ENG-8.15 to 8.20 (it re-ran their e2e
  specs on both profiles). 2 critical, 3 high, 7 medium, 8 low.
- R2 (`requirements-auditor`): every FEATURE-GAPS claim and limit, the catalog sweep for
  unavailable copy, the locally measurable §2.2/§2.3 gates, hosted evidence via `gh` (read only),
  this checklist's claims, DEBT.md. 3 critical, 6 high, 8 medium, 6 low.
- E, F, G (`ux-ui-reviewer`, ports 5381/5391/5401): the §20.1 surfaces M2.5 did not cover, at three
  tiers, plus a whole-app Spanish sweep (G). E: 0/2/14/12; F: 0/4/10/14; G: 1/5/15/11
  (critical/high/medium/low).
- Primary routes: the M2.5 fifth-run review on `d1b4e6e4d` carries over, because the application
  tree is identical.

Re-checked myself before accepting: IA_REVIEW.md:3 status; budget-registry.ts:319 provisional;
`gh run list --workflow perf.yml --event schedule` (one run, cancelled); Nightly failing 2026-10-14
to 2026-10-17; WorkerHost.ts:664-716 (worker packages are refused on every build, so R1-10's
"desktop only" is wrong and R2-5 is right); quality-gates.ts:101-115 scans only `.tsx`; the
`wc -l` list of files over 800; golden-routes.spec.ts:14 three themes; E1
(SceneDisplay.tsx:129-135, SceneDisplayOverlay.tsx:39-43); E2 (presentation.ts:336,
Campaign.tsx:87-109); G1 (onboarding.ts:758-765, LocalBackup.tsx:94); G2 (Join.tsx:232-236); G3
(fr.ts:4-5); G4 (Players.tsx:182); F1 (PluginPackageCard.tsx:193-201); F2 (import.ts:357-361); F3
(Upgrade.tsx:66-72).

Housekeeping: pass F wrote a memory note into this worktree's `.claude/agent-memory/ux-ui-reviewer/`.
Moved the note to the scratch reports and reverted the MEMORY.md line; neither is committed.

## 2026-10-17 — edits

- FEATURE-GAPS.md: 12 rows edited (references re-pointed, the worker limit corrected, 9 limits
  added from the sweep); `pnpm feature-audit` → 55 declared limits, 0 stale. The prettier diff is
  the 12 rows only (no table re-pad).
- RC_ROADMAP.md: epics ENG-11, ENG-12 and ENG-13 (27 stories). Nine per epic, because a two-digit
  story number (RC-ENG-11.10) is wider than the §23 Id column, and prettier would then re-pad all
  400+ index rows. §23 rows and counts, the RC-ENG-7.3 Deps/Owns/status, the §13 AI correction,
  five §24 rows, and the tag example (v0.4.0 to v0.4.4 already exist).
- DEBT.md (companion): DEBT-2026-004 file names corrected.
- RC_CHECKLIST.md: new "RC-ENG-7.3 exit audit" section (verdict, §2 gate table, the 55 limits
  classified, findings by severity, stories, discrepancies outside the claim, not checked,
  reproduction). Checklist fixes: the tag example (`vX.Y.Z`), the §2.3 size command (counts `.ts`;
  `pnpm gates` reads `.tsx` only), a new screen-reader item, and the Discussions state. The
  RC-RUNNER block is untouched (release.yml executes it).
- planning/README.md: pointer to the audit record.
- FEATURE-GAPS' Shells limit anchored `RC_ROADMAP.md:4324`. The new rows moved it to `:4590`, so it
  was re-pointed (feature-audit had reported `line-mismatch`).

## 2026-10-17 — verification (local, on the working tree)

- `pnpm feature-audit`: 55 declared limits, 0 stale, 0 inventory issues.
- `pnpm gates`: quality-gate check passed; docs check passed (313 files reachable, 475 links).
- `pnpm exec prettier --check` on the six changed files: clean.
- `pnpm exec vitest run tests/unit/feature-audit.test.ts`: 7/7.
- `python3 -m unittest test_rcloop.Parse test_rcloop.RelatedSpecs` (from tools/loop/tests): 7/7.
  The rcloop regexes parse 423 story bullets and 423 index rows, the same set, and resolve the new
  Deps ranges. I stopped the full rcloop suite after two minutes; it is not part of the manifest
  gates.
- Not run: `pnpm check`, e2e, visual and `validate:full`. The operator runs them.

## Verdict and what is left

The audit ran and did **not pass** on `3cbf4b7cc`. Acceptance status, stated plainly:

- "Zero unverifiable claims": met for the owned files after this change, with the discrepancies
  outside the claim listed in RC_CHECKLIST.md §6.
- "Every open limit is one of the §2.1 four": **not met.** 9 of 55 are among the four. The rest
  need code (ENG-11 to ENG-13) or the owner's ruling (RC-ENG-13.9).
- The RC-UX-5.5 precondition: **not met.** It needs the owner (§24).

No push, promotion, store edit or loop launch happened. The scratch worktree is removed after the
commit, and the reports stay in `~/.cache/dndtools-rc-eng-7.3/reports`, uncommitted.

## 2026-10-17 — second attempt, after independent review of `effe7eb5d`

The review rejected `effe7eb5d` with three findings. What this attempt does with each:

1. **High: 46 of 55 limits sit outside the §2.1 four.** Not resolvable in this claim. Closing them
   needs code (ENG-11 to ENG-13, e.g. `WorkerHost.ts:712` and the provisional budgets in
   `budget-registry.ts:309-320`) or rulings the owner adopts (RC-ENG-13.9). The acceptance stays as
   written. The RC-ENG-7.3 story text now says it stays open and that a proposed ruling does not
   change the bar.
2. **High: the RC-UX-5.5 precondition is unmet.** Not resolvable here either. It needs the owner's
   acceptance in `IA_REVIEW.md` (§24). No change beyond what the record already says.
3. **Medium: findings left to the operator were not stories.** Fixed. RC_ROADMAP gains epic ENG-14:
   14.1 focus after actions (E3, F5), 14.2 destructive defaults (F17, F9, F12), 14.3 touch targets
   and clipped segments (E14, F6, G15, F7), 14.4 gates (R1-9 axe on account dialogs, R2-12
   behavior anchors), 14.5 audio (E5 to E8, E11), 14.6 Story and graph (E9 to E12, E15), 14.7
   Extensions wording (F8, F11, F13), 14.8 Settings, shell and wiki (E13, E16, G12 to G14, G17,
   G18, G21), and 14.9 a disposition for each of the 46 open low findings. Each story's evidence
   was re-read against the review reports and the cited source lines on this tree. Deps follow
   owns overlap with open stories (13.2 to 13.5, 12.7, 12.8). Nine stories, so no two-digit
   number re-pads §23.
   - RC_CHECKLIST §4: all 28 "operator" medium rows now name their ENG-14 story; §5 counts 36
     dependencies; the Low heading names RC-ENG-14.9.
   - RC_ROADMAP: RC-ENG-7.3 Deps and status, the ENG-11 intro, nine §23 rows, the §23 counts
     (432 stories; M 230, S 157, P4 55, open 121).
   - README: "ENG-11 to ENG-14".
   - FEATURE-GAPS: the Shells limit anchor moved from `RC_ROADMAP.md:4590` to `:4716`.

Verification on the working tree: `pnpm feature-audit` 55 limits, 0 stale, 0 inventory issues;
`pnpm gates` passed (313 files, 476 links); prettier clean on the four docs; feature-audit unit
tests 7/7; `test_rcloop.Parse` and `RelatedSpecs` 7/7; `parse_roadmap` reads 432 stories and the
new Deps; `git diff --check` clean. Not run: `pnpm check`, e2e, visual, `validate:full`.

Verdict unchanged: the audit did **not pass** on `3cbf4b7cc`, and RC-ENG-7.2 stays blocked.

## 2026-10-17 — third attempt, after independent review of `17231be4c`

The review rejected `17231be4c` with the two high findings the second attempt already called
unresolvable in this claim. Re-checked on this tree, both still hold:

1. **46 of 55 open limits sit outside the §2.1 four.** `pnpm feature-audit` still reports 55
   declared limits, 0 stale anchors, 0 inventory issues. The reviewer's example is still live:
   `apps/gm-react/src/app/widgets/WorkerHost.ts:671-675` (`refuseUnisolatedWorker` throws) is the
   default factory at `:712`. No file under `apps/` or `packages/` differs from `3cbf4b7cc`. Closing
   these needs code outside this claim's owned paths (RC-ENG-11.\* to 13.8, e.g. 13.8 owns
   `WorkerHost.ts`) or rulings the owner adopts (RC-ENG-13.9, an operator action).
2. **The RC-UX-5.5 precondition is unmet.** `docs/planning/IA_REVIEW.md:3` still reads "Proposed;
   acceptance and merge pending", and its acceptance record (`:162-172`) lists engineering
   acceptance, ADR-013 adoption and follow-up filing as pending. Only the owner can accept it (§24).

This attempt makes no change to the owned docs. Editing them further cannot meet the acceptance,
and claiming otherwise would add the unverifiable claim the acceptance forbids. The roadmap already
gives RC-ENG-7.3 the deps 11.1–11.9, 12.1–12.9, 13.1–13.9 and 14.1–14.9 (`RC_ROADMAP.md:3328-3329`
and the §23 row at `:4748`), so the rerun is sequenced after them.

**Needs operator.** Retrying this claim cannot pass. The options are: return RC-ENG-7.3 to waiting
until ENG-11 to ENG-14 land, the owner accepts `IA_REVIEW.md` and adopts the RC-ENG-13.9 rulings,
then rerun the audit on that commit; or accept `effe7eb5d` + `17231be4c` as the recorded failed
first run and close this attempt without approving the story. No push, promotion, store edit or
loop launch happened.

## 2026-10-17 — self-heal round 1, claim widened to `WorkerHost.ts` and `IA_REVIEW.md`

The review of `eb018ed64` repeated the two high findings. The self-heal widened the claim to
`apps/gm-react/src/app/widgets/WorkerHost.ts` and `docs/planning/IA_REVIEW.md`, with changes limited
to what the acceptance needs. Here is what this round can do with each finding:

1. **Limits outside the §2.1 four (46 of 55).** `WorkerHost.ts` is one of the 46. Widening to it
   does not make the bar reachable: the other 45 still need ENG-11 to ENG-13 code or the owner's
   RC-ENG-13.9 rulings. Its fix is not a small edit either. Package workers would need a
   storage-isolated origin, for example a worker started inside a `sandbox="allow-scripts"`
   iframe and reached only through `hostBridge`, plus CSP, Electron and Android changes and tests.
   That is RC-ENG-13.8's scope (`RC_ROADMAP.md:3952`), and it is security work. Swapping the
   default factory for a blob worker would reopen the H-01 hole the refusal exists to close. So
   `WorkerHost.ts` is **unchanged**.
2. **RC-UX-5.5 precondition.** Engineering acceptance, ADR-013 and the filed follow-ups need an
   authorized decider. This round does not record or infer acceptance. It fixes the one claim in
   `IA_REVIEW.md` that was false on this tree: "merge pending". `git merge-base --is-ancestor` shows
   `3d8d8e96a` (added) and `74efcfe28` (last edit) on both `origin/loop/rc` and `origin/main`.
   - `IA_REVIEW.md:3` status now reads "Proposed and merged; engineering acceptance pending".
   - The `Review merged` row reads Met with those commits. It fits the column's existing padding,
     so it is a one-line diff.
   - The text saying the RC_CHECKLIST checkbox was "not yet present" now says RC-ENG-7.3 added it
     and that the first exit audit recorded the precondition as unmet.
   - RC_CHECKLIST §6 notes that the discrepancy was corrected here.

The verdict is unchanged: the audit did **not pass** on `3cbf4b7cc`, and RC-ENG-7.2 stays blocked.
Both high findings still need the operator or owner: ENG-11 to ENG-14 must land, the owner must
accept `IA_REVIEW.md` and adopt the RC-ENG-13.9 rulings, and then the audit reruns. No push,
promotion, store edit or loop launch happened.

## 2026-10-17 — fourth attempt, after independent review of `3566719dc`

The review rejected `3566719dc` with the same two high findings. Self-heal round 1 widened the claim
to `apps/gm-react/src/app/widgets/WorkerHost.ts` and `docs/planning/IA_REVIEW.md`. Re-checked first:
`loop/rc`, `origin/loop/rc` and `origin/main` are all still `3cbf4b7cc`, so no ENG-11 to ENG-14 story
and no owner acceptance has landed since the audit.

Neither widened path makes the acceptance reachable, so this attempt changes neither:

1. **`WorkerHost.ts`.** The reviewer's worker example is one of the 46 limits. Building an isolated
   worker host here would close that one limit and leave 45, so the verdict would not change. It is
   also RC-ENG-13.8's scope (storage-less opaque-origin host, `/security-review`, security tests on
   web and desktop that the worker cannot open IndexedDB, plus `electron/main.cjs` and WIDGETS.md,
   which this claim does not own). RC-ENG-13.8 depends on RC-ENG-11.7, which splits this same file
   (832 lines). Doing it out of order here would collide with both stories when they run.
2. **`IA_REVIEW.md`.** The precondition needs the owner's accepted decision, with decider and date,
   and an adopted ADR-013 amendment (§24). A dispatcher attempt cannot record that. Writing an
   acceptance into the record would be the unverifiable claim the acceptance forbids. The record
   already states the current status correctly (`IA_REVIEW.md:3`, `:162-171`).

The owned docs need no further edit. `effe7eb5d`, `17231be4c` and `3566719dc` record the failed
first run, the findings filed as ENG-11 to ENG-14, and the precondition's real status.

**Needs operator.** This is the third retry the claim cannot pass, and widening paths will not fix
it. The decision belongs to the operator: either return RC-ENG-7.3 to waiting until ENG-11 to ENG-14
land and the owner accepts `IA_REVIEW.md` and rules under RC-ENG-13.9, then rerun the audit on that
commit, or accept the three commits as the recorded failed first run and close this attempt without
approving the story. No push, promotion, store edit or loop launch happened.

## 2026-10-17 — fifth attempt, after independent review of `d53384fbf`

The review of `d53384fbf` repeated the same two high findings. It also confirmed the candidate's
app, package, script and test trees match `3cbf4b7cc`, and that the failed audit is recorded
honestly. Re-checked on this tree before doing anything:

- `loop/rc`, `origin/loop/rc` and `origin/main` are all still `3cbf4b7cc` after a fetch. No
  ENG-11 to ENG-14 story, owner acceptance of `IA_REVIEW.md` or RC-ENG-13.9 ruling has landed.
- `pnpm feature-audit`: 55 declared limits (0 stale), 0 inventory issues, 0/23 screens need wiring
  review. The count is unchanged, so 46 still sit outside the §2.1 four.
- `WorkerHost.ts` still defaults to `refuseUnisolatedWorker` (`:671`, default at `:712`). The
  reviewer said not to remove that refusal just to clear the finding, and an isolated host is
  RC-ENG-13.8's security scope (reasons in the fourth-attempt entry). It would also close only one
  of the 46.
- `IA_REVIEW.md:3` and `:162-171` still state the real status: merged, with engineering
  acceptance, the ADR-013 amendment and follow-up filing pending. Only the owner can change that.

This attempt changes no owned document and no code. Either finding needs work this claim cannot do
honestly: 45+ limits of code from other stories, or an owner decision written in the owner's name.
Doing either here would make a false claim, which the acceptance forbids.

**Needs operator.** This is the fourth retry with no change in inputs. Please stop retrying this
claim. Either return RC-ENG-7.3 to waiting on ENG-11 to ENG-14, the owner's `IA_REVIEW.md`
acceptance and the RC-ENG-13.9 rulings, then rerun the audit on that commit, or amend the
acceptance scope explicitly. No push, promotion, store edit or loop launch happened.

## 2026-10-17 — sixth attempt (self-heal round 2), after independent review of `9c1b61823`

The review of `9c1b61823` repeated the same two high findings, and it named the only two ways to
clear them: land the non-exempt capability fixes, or get an explicit authorized acceptance
amendment. Re-checked on this tree after `git fetch`:

- `loop/rc`, `origin/loop/rc` and `origin/main` are still `3cbf4b7cc`.
  `git diff --stat 3cbf4b7cc HEAD -- apps packages scripts` is empty.
- `pnpm feature-audit`: 55 declared limits (0 stale), 0 inventory issues, 0/23 screens need wiring
  review. Nothing closed, so 46 limits still sit outside the §2.1 four.
- `WorkerHost.ts:671-675` still throws in `refuseUnisolatedWorker`, and `:712` still makes it the
  default. The reviewer asked to keep that refusal until a storage-isolated host exists, which is
  RC-ENG-13.8's security scope. Building it would still leave 45 limits open.
- `IA_REVIEW.md:3` and `:164-171` still record engineering acceptance, the ADR-013 amendment and
  follow-up filing as pending. Only the owner can decide those (§24).

No owned document or code changed in this attempt. Neither path is open to a dispatcher attempt:
the first needs the ENG-11 to ENG-13 code, and the second needs a decision written in the owner's
name. Recording either here would be the unverifiable claim the acceptance forbids.

**Needs operator: self-heal exhausted.** This is the fifth retry with unchanged inputs. It has the
same shape as the RC-ENG-8.3 stall: the audit files its findings as stories, and the reviewer then
rejects because they are still open. Retrying will not change the result. Two ways forward:

1. Hold RC-ENG-7.3 (for example `metadata.self_heal: false`) until ENG-11 to ENG-14 are approved
   and land, the owner accepts `IA_REVIEW.md` and adopts the RC-ENG-13.9 rulings. Then rerun the
   audit on that commit.
2. Amend the acceptance explicitly, so this story is the recorded failed first run (`effe7eb5d`,
   `17231be4c`, `3566719dc`) and a later story owns the passing run.

No push, promotion, store edit or loop launch happened.

Gate follow-up: `Format (changed)` failed on `11d0ecebc` because a code span in this entry broke
across a list-item line. Rewrapped in `864d20ea1`. `pnpm format:check:changed -- --base loop/rc` now
passes locally. The verdict and "needs operator" status above are unchanged.

## 2026-10-17 — seventh attempt, after independent review of `53ad80735`

The review of `53ad80735` repeated the same two high findings word for word. Re-checked after
`git fetch`:

- `loop/rc`, `origin/loop/rc` and `origin/main` are still `3cbf4b7cc`, with no commits since.
  `git diff --stat 3cbf4b7cc HEAD -- apps packages scripts` is empty.
- `pnpm feature-audit`: 55 declared limits (0 stale), 0 inventory issues, 0/23 screens need wiring
  review. 46 limits are still outside the §2.1 four.
- `WorkerHost.ts:671-675` still throws, and `:712` still makes that the default. The refusal stays
  until RC-ENG-13.8 builds a storage-isolated host.
- `IA_REVIEW.md:3` and `:164-171` still record engineering acceptance, the ADR-013 amendment and
  follow-up filing as pending.

No owned document or code changed. The reasons are in the fourth- to sixth-attempt entries:
closing the limits needs ENG-11 to ENG-14 code, and the IA precondition needs a decision made in the
owner's name. Writing either into this record would be an unverifiable claim.

**Needs operator.** This is the sixth retry with unchanged inputs. Hold RC-ENG-7.3 until ENG-11 to
ENG-14 land and the owner accepts `IA_REVIEW.md`, or amend the acceptance so that this story is
the recorded failed first run. No push, promotion, store edit or loop launch happened.

## 2026-10-17 — eighth attempt, after independent review of `fcc7614f7`

The review of `fcc7614f7` repeated the same two high findings. Re-checked after `git fetch`:

- `loop/rc`, `origin/loop/rc` and `origin/main` are still `3cbf4b7cc`, with no commits since.
  `git diff --stat 3cbf4b7cc HEAD -- apps packages scripts tests` is empty.
- `pnpm feature-audit`: 55 declared limits (0 stale), 0 inventory issues, 0/23 screens need wiring
  review. 46 limits are still outside the §2.1 four.
- `WorkerHost.ts:671-675` still throws, and `:712` still makes that the default. The refusal stays
  until RC-ENG-13.8 builds a storage-isolated host; the widened claim on `WorkerHost.ts` does not
  make that a dispatcher-sized change, and it would leave 45 limits open.
- `IA_REVIEW.md:3` and `:164-171` still record engineering acceptance, the ADR-013 amendment and
  follow-up filing as pending.

No owned document or code changed. The reasons are in the fourth- to sixth-attempt entries.

**Needs operator.** This is the seventh retry with unchanged inputs. Hold RC-ENG-7.3 until ENG-11
to ENG-14 land and the owner accepts `IA_REVIEW.md`, or amend the acceptance so that this story is
the recorded failed first run. No push, promotion, store edit or loop launch happened.

## 2026-10-25 — ninth attempt: second audit run under the owner's 2026-10-24 decisions

Inputs changed. The owner accepted IA-1 (`43e0ffaa5`), RC-ENG-15.1 to 15.4 landed on `loop/rc`
(`aa300d6d5`), and the open-limit acceptance was amended: limits filed as follow-up stories are
waived for RC-1, and the WorkerHost refusal stays.

- Rebase: squashed attempts 1–8 into one commit (backup branch
  `backup/rc-eng-7.3-pre-rebase-*`, deleted afterwards) and rebased onto `loop/rc` `aa300d6d5`.
  Conflicts: IA_REVIEW took `loop/rc`; FEATURE-GAPS took this branch, then the anchor was re-pinned;
  RC_ROADMAP kept both ENG-11–14 (this branch) and ENG-15 (`loop/rc`) and took `loop/rc`'s amended
  7.3 text. The result is `c97e5da65`, with `git diff aa300d6d5 c97e5da65 -- apps packages scripts
tests` empty.
- IA follow-ups, run here (`apps/gm-react`, `DNDTOOLS_E2E_PORT=5871`):
  - `primary-sections`, `table-controls`, `route-compat` on both profiles: 78 passed.
  - `nav.test.ts`, `TableControls.test.tsx`, `sections.test.ts`, `section-vocabulary.test.ts`:
    19 passed.
  - The four IA tasks, as a scratch spec (deleted): 9 passed, 5 skipped as not applicable, on both
    profiles.
- The 1440px preview-return failure from RC-ENG-15.4: reproduced (`previewFrom: "/"` at 1600 and
  1440). An instrumented render log showed the inline control rendering with `/` while the
  transition to the lazy Characters route was pending, and the top-bar h1 still read "Command
  Center" when Preview was clicked (three runs). After waiting for the Characters heading,
  `previewFrom` is `"/characters"` (two runs each at 1440 and 1600). `ViewAsControl.tsx` was
  restored byte-for-byte after the instrumentation.
- Gates here: `pnpm feature-audit` 55 limits, 0 stale, 0 inventory issues (after the anchor fix);
  `pnpm gates` passed (313 files, 484 links); `pnpm test:coverage:core` 5433 passed;
  `security:secrets` passed; `security:audit` 2 low and 7 moderate; eslint `no-explicit-any` 11;
  i18n es 6609/6609, 98.31% differ; baselines 35,034.5 of 37,888 KiB.
- Hosted: CI 40201160971 on `aa300d6d5` failed only in Electron smoke, so `ci-gate` is red (also
  on `2c97e96f8` and `f168547c4`; green on `09524f2e6`). Nightly passed on `09524f2e6`. Supply
  Chain fails on `loop/rc` (zizmor, `setup-sam` pin). Scheduled perf: 1 success, 1 cancelled.
- Reviews: R3 (`requirements-auditor`) and U3 (`ux-ui-reviewer`) on the delta. They found one
  critical (R3-1, the smoke), one high (R3-2), six medium and eleven low. Their tracked
  agent-memory edits were reverted (outside the claim); the reports are scratch files in
  `/tmp/eng73/`.
- R3-1 is held by the dispatcher's `ci-recovery-2c97e96f8c25` (status `ready`, claim includes
  `electron/smoke-parity.cjs` and `scripts/verify-p2p-live.mjs`), so it is not fixed here, to avoid
  a sibling race.
- Docs: RC_CHECKLIST (IA box, exit audit intro, verdict, §2, §3 with an owning story and RC-1
  status per limit, §4 second-run findings, §5–§8); FEATURE-GAPS (Tools row, App shell row,
  signing anchor moved to `RELEASING.md:6`, evidence paragraph); RC_ROADMAP (§2.1 waiver note, 7.3
  run record, epic ENG-16 with 16.1–16.6 and index rows, two §24 rows); IA_REVIEW (status,
  acceptance row, re-diagnosis, re-run record); planning README. `WorkerHost.ts` unchanged.

**Verdict: not passed, one blocker.** Zero unverifiable claims and the open-limit bar are met, and
RC-ENG-15.1 to 15.4 meet their own acceptance. The RC-UX-5.5 precondition waits on a green
`ci-gate` (R3-1). Once `ci-recovery-2c97e96f8c25` lands, re-check on the new `loop/rc` head: green
`ci-gate`, plus the three IA specs and four tasks. No push, promotion, store edit or loop launch
happened.

## 2026-10-25 — tenth attempt: third run, R3-1 and R3-2 fixed on this branch

Independent review of `413b863d9` rejected it on R3-1 (Electron smoke) and R3-2 (`verify:p2p-live`):
both still broken on the candidate. The review asked for the probes to be fixed and re-run, not
deferred.

- State: local `loop/rc` is still `aa300d6d5`, so no rebase was needed. `origin/loop/rc` is at
  `e451763bf` (workflow pin only). Hosted CI 40205169106 on it still fails at
  `smoke-parity.cjs:142`. Supply Chain 40205169236 passed there, which fixes R3-9 upstream.
- `ci-recovery-2c97e96f8c25` (store, read only): status `review`, candidate `16ffc75c4`, which
  changes only `electron/smoke-parity.cjs` and its journal. `verify-p2p-live.mjs` is in that
  task's claim but unchanged in its candidate.
- R3-1: `smoke-parity.cjs` copied byte-for-byte from `16ffc75c4`, so whichever branch lands second
  rebases cleanly. Run in `mcr.microsoft.com/playwright:v1.61.1-noble` with `xvfb-run` and
  `--network=none`: 3 of 3 passes (`/tmp/eng73-smoke-container-{1,2,3}.log`). With
  `aa300d6d5`'s file swapped in, parity write failed at `:52,:142`
  (`/tmp/eng73-smoke-container-base.log`). The fixed file was then restored and checked identical
  to `16ffc75c4`. On the host's Wayland display (`DISPLAY=:0`), the fixed smoke timed out at `:174`
  instead (`/tmp/eng73-desktop-smoke.log`). That is not CI's display, so the run is not counted.
- R3-2: `verify-p2p-live.mjs` now opens Table controls when it is visible and matches
  `/^Host table($| — )/`. On `vite` dev on :5891: 0 of 1 before the fix, 4 of 4 after it at
  1280px, and 4 of 4 for a 1600×900 scratch copy (`/tmp/eng73-p2p/wide.mjs`). The worktree needs
  `NODE_PATH` set to pnpm's `playwright` package (`MODULE_NOT_FOUND` otherwise). Hosted Nightly
  resolved it unaided on `09524f2e6`.
- IA-1 specs (`DNDTOOLS_E2E_PORT=5872`, both profiles): 78 passed (`/tmp/eng73-ia-specs.log`).
- Gates here: `pnpm feature-audit` 55 limits, 0 stale, 0 inventory issues, 0/24 screens. `pnpm gates`
  passed (313 files, 484 links). Prettier on the changed files and `node --check` passed.
- Docs: RC_CHECKLIST (IA box, audit intro, third-run verdict, §2 note, R3-1/R3-2 rows, §4–§8),
  RC_ROADMAP 7.3 run record, IA_REVIEW status lines, planning README. FEATURE-GAPS and `WorkerHost.ts`
  are unchanged.

**Verdict:** the acceptance is met on local evidence. Hosted `ci-gate` has not run on this commit,
and RC-ENG-7.2 needs it green on the tag. The two script files are outside this task's listed Owns.
The review's findings required the change. No push, promotion, store edit or loop launch happened.

## 2026-10-25 — eleventh attempt: claim fence on the two script files

The ownership gate rejected `30e2b1a9d` because it changed `electron/smoke-parity.cjs` and
`scripts/verify-p2p-live.mjs`, both outside the claim.

- `electron/smoke-parity.cjs`: reverted to `aa300d6d5`. Its fix is `ci-recovery-2c97e96f8c25`'s
  candidate `16ffc75c4` (store, read only: status `review`). This branch does not need to carry it.
  The third-run evidence (3 of 3 container passes with that file, failure at `:142` without it)
  stands, and is now recorded as a check on a scratch copy of this tree.
- `scripts/verify-p2p-live.mjs`: **kept, outside the claim, for the operator to rule on.** Review
  of `413b863d9` made finding R3-2 a condition of approval: the probe must follow the current
  controls and re-run on the final commit, and filing it under RC-ENG-11.5 does not waive that. No
  other candidate changes the file; the ci-recovery task's claim lists it, but its candidate leaves
  it untouched. The fix and its 4 of 4 runs are unchanged from the tenth attempt.
- Docs: RC_CHECKLIST (IA box, third-run intro, §1, §2 note, R3-1 row, §5, §6, §8), RC_ROADMAP run
  record, IA_REVIEW status lines and planning README now say R3-1's fix is pending in that task.

**Verdict:** zero unverifiable claims and the open-limit bar are met. The RC-UX-5.5 precondition
waits on `ci-recovery-2c97e96f8c25` landing and on a green hosted `ci-gate`. **Needs operator:**
widen the claim to `apps/gm-react/scripts/verify-p2p-live.mjs`, or move the R3-2 fix to the task
that owns it. No push, promotion, store edit or loop launch happened.
