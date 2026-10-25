# Release candidate checklist and beta program

This is the runnable checklist for [the RC definition](../planning/RC_ROADMAP.md#2-definition-of-release-candidate).
A green automated run is evidence for the commands below, not sign-off for the review and
historical evidence items. RC-ENG-7.2 owns the tag/release rehearsal; RC-ENG-7.3 owns the exit audit.

## Run on the RC tag

Use Node 24, the pinned pnpm, a clean checkout with full Git history, installed dependencies,
Chromium with system dependencies, and Docker or Podman for the pinned visual container.
The whole-app checks also need their documented desktop/cloud capabilities; inspect skipped
checks rather than treating capability skips as passes. Performance capture requires CI hardware.

The release uses a **plain semver tag** that matches all package versions and does not exist yet
(`v0.4.0` to `v0.4.4` are taken; examples below write `vX.Y.Z`).
Android cannot package a `-rc.1` version. `rc` is a workflow channel and produces a draft
prerelease with unsigned desktop installers and alpha-key-signed Android packages. Production
signing remains a separate channel. Tag pushes still select `preview`; an operator selects `rc`
explicitly after the tag's exact commit has a green `ci-gate` and is reachable from main:

```bash
gh workflow run release.yml --ref main -f tag=vX.Y.Z -f channel=rc
```

Do not run this publication command from an implementation task. An existing draft from another
channel must be reviewed and removed by its owner before changing channels; published releases
and signed production drafts are protected from unsigned replacement.

To reproduce the automated portion in the checked-out tag (outputs go in `rc-results/`):

````bash
export RELEASE_TAG=vX.Y.Z # the RC tag, already pushed
export RC_EXPECTED_SHA="$(git rev-parse "refs/tags/$RELEASE_TAG^{commit}")"
test "$(git rev-parse HEAD)" = "$RC_EXPECTED_SHA"
pnpm install --frozen-lockfile
sed -n '/^<!-- RC-RUNNER-BEGIN -->$/,/^<!-- RC-RUNNER-END -->$/p' \
  docs/development/RC_CHECKLIST.md | sed '1d;$d;/^```/d' > /tmp/rc-checklist.sh
bash /tmp/rc-checklist.sh
````

The workflow executes this same block from the pinned release commit. Every command is attempted;
any nonzero exit fails the run and prevents draft creation. Failures retain a workflow artifact.
Successful runs attach the report and raw-log archive to the release, covered by its checksums
and build provenance. Package, signing, SBOM and supply-chain checks still run in `release.yml`.

<!-- RC-RUNNER-BEGIN -->

```bash
set -euo pipefail
: "${RELEASE_TAG:?Set RELEASE_TAG to the existing RC tag}"
: "${RC_EXPECTED_SHA:?Set RC_EXPECTED_SHA to the full tagged commit SHA}"
test "$(git rev-parse HEAD)" = "$RC_EXPECTED_SHA"
test "$(git rev-parse "refs/tags/$RELEASE_TAG^{commit}")" = "$RC_EXPECTED_SHA"
test -z "$(git status --porcelain --untracked-files=no)"
mkdir -p rc-results
report=rc-results/results.md
{
  printf '# RC automated checklist results\n\n'
  printf 'Tag: `%s`\n\nCommit: `%s`\n\n' "$RELEASE_TAG" "$RC_EXPECTED_SHA"
  printf 'Workflow revision: `%s`\n\n' "${GITHUB_WORKFLOW_SHA:-local}"
  printf 'Run: %s/%s/actions/runs/%s (attempt %s)\n\n' \
    "${GITHUB_SERVER_URL:-local}" "${GITHUB_REPOSITORY:-local}" \
    "${GITHUB_RUN_ID:-local}" "${GITHUB_RUN_ATTEMPT:-1}"
  printf 'Started (UTC): %s\n\n' "$(date -u +%FT%TZ)"
  printf '| Gate | Command | Exit |\n| --- | --- | --- |\n'
} > "$report"
failed=0
run_gate() {
  local name=$1 command=$2 code=0
  bash -o pipefail -c "$command" > "rc-results/$name.log" 2>&1 || code=$?
  cat "rc-results/$name.log"
  printf '| %s | `%s` | %s |\n' "$name" "$command" "$code" >> "$report"
  if [ "$code" -ne 0 ]; then failed=1; fi
}
run_gate version 'pnpm release:verify version --tag "$RELEASE_TAG"'
run_gate static-unit 'pnpm check'
run_gate coverage 'pnpm test:coverage:core'
run_gate browser 'pnpm e2e'
run_gate accessibility 'pnpm a11y:gate'
run_gate whole-app 'pnpm validate:full'
run_gate performance 'test "${GITHUB_ACTIONS:-}" = true && bash scripts/perf/ci.sh'
run_gate advisories 'pnpm security:audit'
run_gate secrets 'pnpm security:secrets'
run_gate visual 'bash apps/gm-react/tests/visual/run-in-container.sh'
run_gate docs 'pnpm feature-audit && pnpm gates'
run_gate bundle 'pnpm build && pnpm check:bundle-budget'
# Keep structured evidence alongside the command logs when the checks produced it.
for directory in tmp/perf test-results/validation; do
  if [ -d "$directory" ]; then
    mkdir -p "rc-results/$(dirname "$directory")"
    cp -R "$directory" "rc-results/$directory"
  fi
done
{
  printf '\nAutomated command failures: %s\n\n' "$failed"
  printf 'Manual review and historical evidence: PENDING. See RC_CHECKLIST.md.\n'
  printf 'Package, signature, SBOM and provenance results: see the enclosing release workflow.\n'
  printf '\nFinished (UTC): %s\n' "$(date -u +%FT%TZ)"
} >> "$report"
exit "$failed"
```

<!-- RC-RUNNER-END -->

## Required evidence before declaring RC-1

Attach a completed copy of this list, with reviewer, date, exact SHA and evidence links, to the
same draft release. Leave unmet items unchecked. The automated attachment explicitly leaves these
items pending; neither an exit code nor a green path-filtered `ci-gate` substitutes for them.

- [ ] **§2.1 scope:** P1/P2 stories in §5–§17 are merged; every P3 polish PR has its §20 sign-off.
      Attach the RC-ENG-7.3 exit audit and the row-by-row RC-DOC-1.1 inventory audit.
- [ ] **§2.1 contracts and limits:** React system packages, widget trust/sandbox, editor IA and
      session/map/board models meet their contracts. Remaining UI limits are only payment,
      signing certificates, curation, and the explicitly deferred Cloud-Enhanced phase 2.
- [ ] **RC-UX-5.5 IA decision:** the navigation review in `docs/planning/IA_REVIEW.md` is merged
      and records the accepted decision, accepting decider, date and merged commit. ADR-013
      reflects that decision, every 2026-09-12 finding has a disposition, and each required
      implementation follow-up has an owner and is verified on this RC commit. Attach this
      evidence to the RC-ENG-7.3 exit audit. A pending decision, unmerged review or unfinished
      required follow-up blocks the RC-ENG-7.2 rehearsal.
      Recorded by RC-ENG-15.4 on 2026-10-25 (still unchecked: verify on the RC commit):
  - Decision **IA-1, six primary sections** (Screens, Characters, Maps, Story, Notes, Tools). The
    owner accepted it as Engineering decider on 2026-10-24, with UX and Accessibility consulted
    through the review. The review merged in `3d8d8e96a` (with `2a9c1a81b` and `74efcfe28`; on
    main). The acceptance and ADR-013 amendment are `43e0ffaa5`, merged into `loop/rc` by
    `bbbf3ce60` but not yet on main. See the
    [IA_REVIEW acceptance record](../planning/IA_REVIEW.md#acceptance-record-and-eng-73-release-precondition).
  - **RC-ENG-15.1** grouping and phone Screens access: integrated on `loop/rc` at `f79675059`.
    Evidence: `nav.test.ts`, `primary-sections.spec.ts`, responsive, axe and pinned visual gate
    (`state/RC-ENG-15.1.journal.md`).
  - **RC-ENG-15.2** vocabulary and table controls: integrated at `2c97e96f8`. Evidence:
    `table-controls.spec.ts`, `TableControls.test.tsx`, `section-vocabulary.test.ts`, re-baselined
    goldens (`state/RC-ENG-15.2.journal.md`).
  - **RC-ENG-15.3** bookmark compatibility: integrated at `f168547c4`. Evidence:
    `route-compat.spec.ts`, one test per route-table row on both profiles.
  - **RC-ENG-15.4** decision and release evidence: this box, plus the
    [task-based checks](../planning/IA_REVIEW.md#task-based-checks-and-exact-candidate-gates-rc-eng-154)
    (find an NPC, open a pinned screen on phone, return from player preview, find billing). On
    `f168547c4` RC-ENG-15.4 recorded three passes and a 1440px preview-return failure.
  - **Verified by RC-ENG-7.3 (second run, 2026-10-25)** on `c97e5da65`, whose application tree
    is `loop/rc` `aa300d6d5`: the three IA-1 specs passed (78 tests, both profiles), the four
    IA-1 unit files passed (19 tests), and all four tasks passed on both profiles at 1600, 1440
    and 1280px and on the phone. The 1440px failure needs no fix. Preview was clicked while
    the router's transition to the lazy Characters route was still pending, and the top bar
    still read Command Center, so Exit preview returned to the page on screen. Once Characters
    has rendered, Exit preview returns to `/characters` at 1600 and 1440px (see the
    [exit audit](#rc-eng-73-exit-audit) §1). RC-ENG-15.2's move of Start session into the sheet
    broke the Electron smoke's parity step, so hosted `ci-gate` is red on `2c97e96f8`,
    `f168547c4`, `aa300d6d5` and `e451763bf` (finding R3-1).
  - **Third run (2026-10-25)** on this record's commit, based on `loop/rc` `a047c6bd2`:
    - The smoke fix (`16ffc75c4`, dispatcher task `ci-recovery-2c97e96f8c25`) is integrated.
      Hosted `ci-gate` and Electron smoke passed on `a047c6bd2` (CI 40211540957).
    - The `verify:p2p-live` fix (R3-2) is on this commit and passed 4 of 4.
    - The three IA-1 specs passed again, 78 of 78.

    Check this box on the tagged RC commit once the same re-run passes there.

- [ ] **Static/unit:** `pnpm check` and `pnpm test:coverage:core` pass; coverage floors have not
      decreased from the previous release.
- [ ] **Browser:** `pnpm e2e` ran desktop and mobile profiles, with at least one spec per §5–§17 epic.
- [ ] **Accessibility:** `pnpm a11y:gate` passes with zero critical/serious findings, an empty
      exception register, and every durable workspace represented in its route inventory.
- [ ] **Screen reader:** the manual script in [ACCESSIBILITY.md §4](ACCESSIBILITY.md) ran on this
      RC commit with NVDA, VoiceOver and TalkBack, and its log row is filled in. A leak in the E3
      no-leak check blocks the release. All 23 polish passes waived this check, and at the exit
      audit the log still read "not yet run".
- [ ] **Whole-app:** inspect the `pnpm validate:full` report: zero fail, only the documented
      Prettier warning accepted. Resolve missing capabilities and attach their rerun results.
- [ ] **Performance:** retain the raw CI batches and `pnpm perf:compare` reports produced by
      `bash scripts/perf/ci.sh`. Also attach five consecutive scheduled `perf.yml` runs showing
      no provisional or breached budgets. Five interleaved measurements in one run do not
      satisfy the five-scheduled-run requirement.
- [ ] **Security:** both scans pass and the `pnpm check` core suite includes
      `security-vault-privacy-modes.test.ts` and `security-cloud-security-model.test.ts`.
      Confirm the shipped phase-2 decision is unapproved and the server-side gate cannot be bypassed.
- [ ] **Visual:** pinned-container comparisons pass for all golden routes, five themes and three
      tiers, with zero unreviewed differences. Do not update baselines during the RC run.
- [ ] **Release:** six packages exist; `pnpm release:verify artifacts`, `sbom`, and `supply-chain`
      pass in the workflow. Verify signatures where certificates exist, Android acceptance,
      checksums and attestations. Download the evidence attachments and check their tag/SHA.
- [ ] **Docs:** feature audit has zero drift, all inventory rows are audited and `pnpm gates`
      reports a green docs link checker (RC-DOC-2.2).
- [ ] **§2.3 size/types:** no app source file exceeds 800 lines; ESLint's
      `@typescript-eslint/no-explicit-any` count is at most 20. `pnpm gates` counts only `.tsx`
      files until RC-ENG-11.6, so list every tracked file instead:
      `git ls-files 'apps/gm-react/src/*.ts' 'apps/gm-react/src/*.tsx' | xargs wc -l | awk '$1 > 800 && $2 != "total"'`,
      and compare it against the reading RC-ENG-13.9 records for catalogs, snapshots and tests.
      Count `@typescript-eslint/no-explicit-any` in
      `pnpm exec eslint apps/gm-react/src --format json`.
- [ ] **§2.3 bundle/i18n:** bundle budget passes; every visible string uses i18n.
      Run `pnpm exec tsx scripts/i18n-catalog.ts export --dir /tmp/rc-i18n --locale es`
      and confirm the ES translated-key count is at least 95% of the English-key count;
      attach the count and the UI string audit.

## Beta program and feedback handoff

The Help topics list now includes localized **Send feedback**, targeting
`https://github.com/tsieb/dndtools/discussions/new?category=beta-feedback` through the platform
external-browser adapter. It warns that feedback is public and must exclude private campaign
content, credentials and vault exports. A rejected or blocked browser open shows a copyable URL.

The committed category form is `.github/DISCUSSION_TEMPLATE/beta-feedback.yml`. Its filename
matches the `beta-feedback` slug in the Help action. Creating the repository category and
verifying GitHub renders this form remain operator checks after integration.

- [x] Commit the form asking for RC tag/version, platform, expected/actual behavior,
      reproduction steps, severity and optional redacted screenshots/logs.
- [x] Add the Help topics action with English/Spanish catalog strings and external-open fallback.
- [x] Add a fixed-destination Electron main/preload bridge with native confirmation,
      primary-window/frame/document validation and cancellation/failure handling. Arbitrary
      destinations remain denied; no campaign data is passed to the bridge.
- [x] Exercise the real main/preload handlers and renderer adapter in focused tests, including
      rejected callers, cancellation, browser failure and navigation during confirmation.
- [ ] Enable the matching `beta-feedback` repository category and verify the URL opens its form.
      On 2026-10-17 the repository reported `has_discussions: false`, so the link opened nothing.
- [ ] Verify the action opens the intended form on supported platforms, including keyboard
      activation and external-open failure handling; record native-runtime evidence.
- [ ] Retain the required help-menu visual comparison and independent review evidence.

Focused tests are `tests/unit/electron-feedback.test.ts`,
`tests/unit/electron-hardening.test.ts`, and
`apps/gm-react/src/platform/desktopFeedback.test.ts`. They exercise production code with
substituted OS services; they do not establish a hosted form or native browser launch.

Recruit testers across Windows, macOS, Linux and Android, including GM and player roles.
Ask them to back up a vault, install/upgrade, run onboarding, play a short session, export/import,
and use the feedback route. Link each report to its tag and a triaged issue; mark duplicates,
record owner/severity, and rerun the affected checklist gates on any replacement RC commit.
Stop rollout for data loss, privacy/security failures or blocked core workflows. Keep the draft
unpublished until the exit audit, feedback route and required evidence above are complete.

## Operator rehearsal evidence record

RC-ENG-7.2 completes this record after the authorized tagged rehearsal. Keep each value PENDING
until verified; local fixture runs and implementation wrapper gates do not fill these fields.
Attach the completed checklist to the same release as the automated results.

| Evidence                                                          | Verified value |
| ----------------------------------------------------------------- | -------------- |
| RC tag and full commit SHA                                        | PENDING        |
| Hosted release workflow run URL and attempt                       | PENDING        |
| Draft release URL                                                 | PENDING        |
| Downloadable `RC_CHECKLIST_RESULTS.md` asset URL                  | PENDING        |
| Downloadable `rc-checklist-results.tar.gz` asset URL              | PENDING        |
| Downloaded report tag/SHA match and archive checksum verification | PENDING        |
| Completed manual checklist attachment URL, reviewer and UTC date  | PENDING        |
| Feedback form URL and help-menu verification evidence             | PENDING        |

Record failed or skipped checks and their resolution against the exact RC SHA. A replacement
commit requires a new tagged rehearsal and matching attachments; do not carry forward a previous
commit's passing results. RC-ENG-7.1 acceptance remains outstanding until the end-to-end run and
release attachments are verified.

## RC-ENG-7.3 exit audit

Two runs and a re-check are recorded here. The third run re-checks the second run's blocker and
is the verdict. The first two runs are kept as the record their stories cite.

**Third run, 2026-10-25, on the commit that carries this record:** the task branch, squashed and
rebased onto `loop/rc` `a047c6bd2`, which is also `origin/loop/rc` and `origin/main`. Since
`aa300d6d5`, that base has taken `ci-recovery-2c97e96f8c25`'s parity-smoke fix (`c855eca21`,
`16ffc75c4`, the R3-1 fix) and the `setup-sam` re-pin (`e451763bf`). This commit adds one code
change, the R3-2 fix:
`git diff --stat a047c6bd2 HEAD -- apps packages scripts tests .github` lists only
`apps/gm-react/scripts/verify-p2p-live.mjs`. The file is inside this story's claim; it was widened
on 2026-10-25 after review made R3-2 a condition of approval. The third run re-checked only what the
second run said a re-check needs, plus R3-2. Every other second-run reading stands. No product file
changed: `git diff --stat aa300d6d5 a047c6bd2 -- apps/gm-react/src packages` is empty.

**Second run, 2026-10-25, on `c97e5da65`:** the task branch rebased onto `loop/rc`.
`git diff --stat aa300d6d5 c97e5da65 -- apps packages scripts tests` is empty, so the application
tree is `loop/rc` `aa300d6d5`, which is also `origin/loop/rc`. Two owner decisions of 2026-10-24
apply. IA-1 is accepted, and RC-ENG-15.1 to 15.4 must be verified on the candidate. The open-limit
acceptance is amended: limits already filed as follow-up stories are waived for RC-1 and are not
re-filed, and the WorkerHost security refusal stays
([RC_ROADMAP §2.1](../planning/RC_ROADMAP.md#21-feature-completeness), item 2).

The second run re-measured every §2 gate it could measure here and read hosted evidence through
`gh`. It re-read each inventory row whose evidence file changed since `3cbf4b7cc`, and added the
missing `/tools` and App shell rows. It verified RC-ENG-15.1 to 15.4 by running their specs and the four IA tasks
(§1), and sorted all 55 limits again (§3). Two review passes covered the delta since the first run
(33 commits that are not run journals). R3 (`requirements-auditor`) took ENG-15, ADR-013, ENG-8.17
to 8.20, the vault-consent change in `packages/cloud-fns` and the inventory rows. U3
(`ux-ui-reviewer`) took the IA-1 shell, Tools, Table controls and the bookmark aliases at desktop
1440×900, rail 834×1112 (touch) and phone 390×844 (touch), in English plus a Spanish load. No
polish journal changed after the first run
(`git diff --stat 3cbf4b7cc c97e5da65 -- 'state/RC-POL-*' docs/development/run-journals` is
empty), so its reading of the 242 §20 waivers stands. The first run's findings (§4) are filed and
are not re-filed.

**First run, 2026-10-17, on `3cbf4b7ccbdb6ea51d4290e43d3163bf6dae0c1c`:** local `loop/rc` when
the story was claimed. `git diff --stat d1b4e6e4d 3cbf4b7cc -- apps packages scripts tests` is
empty, so the application tree is the one RC-ENG-8.3's fifth M2.5 run reviewed
([EARLY_ACCESS.md](../planning/EARLY_ACCESS.md)). `origin/main` and `origin/loop/rc` were at
`511fc6af4`, so no hosted CI exists for this commit.

Five passes ran on that one tree. Two used the `requirements-auditor`. R1 covered §2.1 scope from
the dispatcher store (read only), the 23 polish journals and their 242 waivers, the §2.1.3
contracts, the RC-UX-5.5 precondition and RC-ENG-8.15 to 8.20. R2 covered every inventory claim and
limit, a catalog sweep for unavailable-state copy, the gates measurable here, hosted evidence read
through `gh`, this checklist and DEBT.md. Three used the `ux-ui-reviewer`, at desktop 1440×900,
rail 834×1112 (touch) and phone 390×844 (touch), in English plus a Spanish load per route: E
(Story, Graph, Audio, display, palette, help, shell), F (Extensions, Community, Plans, Legal) and G
(Settings, Join, Wiki, and the whole-app Spanish sweep). The primary routes carry over from the
M2.5 review on the identical tree. The probes and reports were scratch files and are not committed;
every finding below cites the source that shows it. I re-read the source behind each critical and
high finding. One reviewer claim did not hold: R1 said worker widgets fail only on desktop, but
`WorkerHost.ts:664-675,712-716` refuses them on every build.

Severity: **critical** blocks the RC-1 declaration (or, on a surface, silently breaks a task);
**high** fails a §2 bar or makes a new GM or player fail or misread; **medium** is friction;
**low** is polish.

### 1. Verdict

**Third run: passed on this record's commit (base `a047c6bd2`). RC-ENG-7.2 may proceed.** It
still has its own §2.2 and §2.3 bars, listed below.

1. **The RC-UX-5.5 precondition is met.** The decision and RC-ENG-15.1 to 15.4 held in the second
   run. The `ci-gate` that 15.2 turned red is green again:
   - **R3-1 (critical) is fixed on the base.** `ci-recovery-2c97e96f8c25` (store: succeeded,
     integrated) changed the parity step. It now clicks Table controls, if present, before Start
     session, and ends the session through the current name, End session (live). It also dismisses
     first-run setup on the fresh profile and closes the sheet before the palette check.
   - Hosted CI 40211540957 (push to `loop/rc`, `a047c6bd2`) passed, including Electron smoke
     (Linux) and `ci-gate`. CI 40212936166 on `main` at the same commit passed `ci-gate`.
   - Locally on this commit, in `mcr.microsoft.com/playwright:v1.61.1-noble` under `xvfb-run`
     (CI's image and display), `node scripts/run-desktop-smoke.mjs` passed. That covered write,
     verify, origin migration, 12 updater checks, and parity write and verify. Before the fix
     landed, the same container check passed 3 of 3 runs with `16ffc75c4`'s file and failed at
     `smoke-parity.cjs:52,142` without it, as hosted CI 40201160971 and 40205169106 did.
   - On the host's Wayland display, the fixed smoke got past `:142` and then timed out at `:174`,
     after the palette opened. That display is not CI's (Electron logged
     `--ozone-platform=wayland` against Vulkan), so the result is not counted either way.
2. **R3-2 (high) is fixed on this commit.** `verify-p2p-live.mjs` opens Table controls when it is
   visible. It then matches `/^Host table($| — )/`, the names from `shell.host.label`,
   `hostingName` and `waitingName`. Results against `vite` dev on a free port:
   - Before the fix: 0 of 1 (click timeout on "Host a live table").
   - After it, on this commit at Playwright's default 1280px: 4 of 4.
   - A scratch copy at 1600×900, where the inline control shows: 4 of 4 (run before the rebase,
     on the same script).

   ESLint passes on the file. Hosted CI does not run the probe; Nightly's validation does, and
   Nightly has not run on this commit.

3. **The IA-1 follow-ups hold on this commit.** The three IA-1 specs passed on both profiles,
   78 of 78 (§8). The unit files and the four tasks were not re-run, because no product file
   changed since the second run.
4. **Zero unverifiable claims: met.** `pnpm feature-audit` reports 55 limits, 0 stale and 0
   inventory issues. The run records in this checklist, RC_ROADMAP, IA_REVIEW and the planning
   README now match the hosted state above.
5. **Open limits: met under the owner's waiver.** 9 of 55 are among the four, and the other 46
   are in §3 with an owning story. `WorkerHost.ts` is unchanged, so its refusal stays.

The waiver does not cover the following §2 failures, which RC-ENG-7.2's checklist still has to
clear: five-run performance, the 800-line bar, five-theme visual coverage, "every visible string",
and the screen-reader run. Supply Chain is now green (§2).

**Second run: not passed on `c97e5da65`, with one blocker. RC-ENG-7.2 stays blocked until hosted
`ci-gate` is green.** Against the acceptance:

1. **The RC-UX-5.5 precondition is met except for one gate.** IA-1 is accepted with its decider,
   date and commits (`IA_REVIEW.md:3`, acceptance record), ADR-013 says six sections
   (`docs/adr/013-three-layer-navigation-contract.md:17`), and `app/nav.ts:156` declares them.
   RC-ENG-15.1 to 15.4 meet their own acceptance on this tree (§4, second run). Here, on both profiles:
   - The three IA-1 specs passed (78 tests).
   - `nav.test.ts`, `TableControls.test.tsx`, `sections.test.ts` and `section-vocabulary.test.ts`
     passed (19 tests).
   - All four IA tasks passed at 1600, 1440 and 1280px and on the phone.

   The 1440px preview-return failure that RC-ENG-15.4 recorded is a timing race, not a wrong
   return. The scratch check chose Preview while React Router's transition to the lazy
   Characters route was still pending, and the top bar still read Command Center, so the control
   recorded the page on screen (`ViewAsControl.tsx:167-169`). The race applies at every width and
   is filed as a low (RC-ENG-16.6).

   **The blocker (R3-1, critical):** RC-ENG-15.2 moved Start session into the Table controls sheet
   below 1440px. The Electron smoke's parity step still waits for it in the top bar
   (`electron/smoke-parity.cjs:142`). Hosted `ci-gate` is therefore red on `2c97e96f8`,
   `f168547c4` and `aa300d6d5` and green on `09524f2e6` (CI 40193334049, 40200035157,
   40201160971, 40178768844), and RC-1 needs a green `ci-gate` on the tag. The dispatcher task
   `ci-recovery-2c97e96f8c25` holds the fix; its claim covers `smoke-parity.cjs` and
   `verify-p2p-live.mjs`. This audit does not edit them, to avoid racing that task.

2. **Zero unverifiable claims: met.** `pnpm feature-audit` reports 55 limits, 0 stale and 0
   inventory issues. R3 re-read every FEATURE-GAPS row whose evidence changed, and the claims
   held. The missing `/tools` surface row and an App shell layer row were added. The signing
   limit's anchor moved from a roadmap line number (which every roadmap edit broke) to
   `RELEASING.md:6`. The stale IA ledger lines in IA_REVIEW and this checklist were corrected.
   Claims attributed to the first run are pinned to `3cbf4b7cc`.
3. **Open limits: met under the owner's waiver.** Of 55 limits, 9 are among the four. The other
   46 are listed in §3, each with an owning story, under the 2026-10-24 waiver. Worker widgets
   stay refused on every build (`WorkerHost.ts:671-675,712`).

**What the waiver does not cover:** it admits limits; it waives no §2.2 or §2.3 bar. On this
commit the following still fail (§2): five-run performance, the 800-line bar, five-theme visual
coverage, "every visible string", the screen-reader run, and the Supply Chain workflow. They are
items in the Required evidence list above, owned by ENG-11, ENG-12 and RC-ENG-16.1. RC-ENG-7.2's
checklist cannot pass until they close. Once R3-1 is fixed, a re-check of this audit needs only
two things on the new `loop/rc` head: green `ci-gate`, and the three IA specs and four tasks,
provided the only application change from `aa300d6d5` is that fix.

**First run, 2026-10-17, on `3cbf4b7cc`: RC-1 could not be declared, and RC-ENG-7.2 stayed
blocked.** Against the acceptance as it then stood:

1. **The RC-UX-5.5 precondition is not met.** [IA_REVIEW.md](../planning/IA_REVIEW.md) is merged
   (`3d8d8e96a`), but its status line still reads "Proposed; acceptance and merge pending" (`:3`).
   No decider, date or commit is recorded (`:167`), ADR-013 still says "5–7 primary sections"
   while `app/nav.ts` declares 12 plus 2, and the four follow-ups are unregistered drafts (`:171`).
2. **Zero unverifiable claims: met for the files this audit owns, after this change.** Twelve
   FEATURE-GAPS behavior references and one wrong limit were corrected, and three instructions in
   this checklist were fixed (the taken `v0.4.0` tag, the `.tsx`-only size check, the missing
   screen-reader item). Stale claims in files outside the claim are listed in §6.
3. **Not every open limit is one of the §2.1 four.** Of the 55 declared limits, 9 are payment,
   signing, curation or Cloud-Enhanced phase 2 (§3).

### 2. The §2 gates

Second-run results on `c97e5da65` unless a row names another commit. "Run 1" is the first run's
reading on `3cbf4b7cc`. The third run changes three rows:

- **RC-UX-5.5 precondition:** met (§1).
- **Browser:** hosted CI 40211540957 on `loop/rc` `a047c6bd2` passed every job it ran, including
  Electron smoke and `ci-gate`. It covers this commit's application code. The only code difference
  is the P2P probe, which CI does not run.
- **Security:** Supply Chain passed on `loop/rc` `e451763bf` (run 40205169236) and on `main` at
  `a047c6bd2` (run 40212936193), after the `setup-sam` re-pin. R3-9 is fixed, and RC-ENG-16.1's
  acceptance is met.

| RC_ROADMAP bar              | Result                                                                                                                                                                                                                                                | Evidence                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| §2.1.1 P1/P2 merged         | **Not met as written; unchanged.** RC-AI-1.3 (P1) is still cancelled (RC-ENG-11.2). RC-CLD-1.1 (P2, operator) is still proposed; whether it counts is RC-ENG-13.9's ruling.                                                                           | store, read only: 400 stories, 382 succeeded, 7 proposed, 5 blocked, 5 cancelled                    |
| §2.1.1 P3 polish signed off | Unchanged from run 1: checklists for 23 of 23; of 242 waivers, 56 still open and 12 weak (RC-ENG-13.9, 14.9).                                                                                                                                         | no polish journal changed since `3cbf4b7cc`                                                         |
| §2.1.2 open limits          | **Met under the 2026-10-24 waiver:** 9 of 55 are among the four, and the other 46 are in §3 with an owning story.                                                                                                                                     | §3; `pnpm feature-audit`: 55 limits, 0 stale, 0 inventory issues                                    |
| §2.1.3 contracts            | **ADR-013 now holds:** six primary sections in `app/nav.ts` match the amended ADR. Still unbuilt: worker widgets (refused on every build, RC-ENG-13.8, waived) and two ADR-030 clauses (RC-ENG-13.6, 13.7).                                           | `app/nav.ts:156`; `docs/adr/013-three-layer-navigation-contract.md:17`; `WorkerHost.ts:671-675,712` |
| §2.1.3 inventory audited    | Rows whose evidence changed were re-read and held. The `/tools` surface row and an App shell layer row were added, and the signing limit now anchors to `RELEASING.md:6`.                                                                             | FEATURE-GAPS.md "Evidence and validation"                                                           |
| RC-UX-5.5 precondition      | **Not met: one blocker.** The decision and RC-ENG-15.1 to 15.4 hold; the `ci-gate` that 15.2 turned red does not (§1).                                                                                                                                | three IA specs 78/78, four unit files 19/19, four tasks on both profiles; CI 40201160971            |
| Static + unit               | Core coverage here: 5433 tests pass, 90.24/80.87/93.35/94.3% against floors 85/75/90/90 (unchanged). Hosted on `aa300d6d5`: static (gates, lint, typecheck) and the app, critical, cloud and tooling unit jobs passed. `pnpm check` did not run here. | `pnpm test:coverage:core`; CI 40201160971                                                           |
| Browser                     | The IA specs ran here; the full suite did not. Hosted, on `aa300d6d5` every browser e2e shard, accessibility and visual job passed, but **Electron smoke failed, so `ci-gate` is red** (R3-1); `09524f2e6` was green.                                 | CI 40201160971; CI 40178768844                                                                      |
| Accessibility               | Not re-run as a gate. The screen-reader script has never run.                                                                                                                                                                                         | `ACCESSIBILITY.md:158`                                                                              |
| Whole-app                   | **Improved.** Nightly passed on `loop/rc` `09524f2e6` (2026-10-25), the only green run in the last 24 (back to 2026-10-07). Nightly on `main` (`3cbf4b7cc`) still fails daily; `main` has not taken the fix.                                          | Nightly 40178768721; 40186427081                                                                    |
| Performance                 | **Not met; unchanged.** 11 of 22 budgets are provisional. Two scheduled `perf.yml` runs exist: one passed (2026-10-19), one was cancelled. Five consecutive are required.                                                                             | `budget-registry.ts:319`; runs 39232507462, 38245056229 (RC-ENG-11.3, 11.4)                         |
| Security                    | Secret scan passes. Audit: 2 low and 7 moderate, no high (the 0.4.5 fix cleared the highs). **Supply Chain fails on `loop/rc`** on its Actions-policy step (RC-ENG-16.1).                                                                             | `pnpm security:secrets`, `pnpm security:audit`; Supply Chain 40178768941                            |
| Visual                      | **Not met as written; unchanged.** The golden routes run in 3 themes, not 5 (RC-ENG-11.9). Baselines use 35,034.5 of 37,888 KiB.                                                                                                                      | `tests/visual/golden-routes.spec.ts:14`; `check-baseline-budget.mjs`                                |
| Release                     | v0.4.4 is still the newest release. The `release: v0.4.5` commit exists, but no `v0.4.5` tag does, locally or on `origin`. No RC draft exists.                                                                                                        | `gh release list`; `git ls-remote --tags origin v0.4.5`                                             |
| Docs                        | Feature audit: 0 drift. `pnpm gates` passed: 313 files reachable, 484 links.                                                                                                                                                                          | `pnpm feature-audit`, `pnpm gates`                                                                  |
| §2.3 size                   | **Not met; unchanged.** The same eight hand-written `.ts` files are over 800 lines (RC-ENG-11.6 to 11.8).                                                                                                                                             | the `git ls-files … wc -l` command above                                                            |
| §2.3 `any`                  | Met: 11.                                                                                                                                                                                                                                              | `pnpm exec eslint apps/gm-react/src --format json`                                                  |
| §2.3 bundle                 | Hosted "build + bundle budget" passed on `aa300d6d5`.                                                                                                                                                                                                 | CI 40201160971                                                                                      |
| §2.3 i18n                   | The catalog passes: `es` has 6609 of 6609 keys, and 98.31% differ from English. "Every visible string" still fails (RC-ENG-12.1 to 12.4).                                                                                                             | `pnpm exec tsx scripts/i18n-catalog.ts export --locale es`                                          |

**First run on `3cbf4b7cc`** (the record ENG-11 to ENG-14 cite):

| RC_ROADMAP bar              | Result here                                                                                                                                                                                                                         | Evidence                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| §2.1.1 P1/P2 merged         | **Not met.** RC-AI-1.3 (P1) is cancelled with "cluster momentum" unbuilt. RC-CLD-1.1 (P2, operator) is unmet; whether it counts is RC-ENG-13.9's ruling. RC-AI-1.1's tests landed; RC-CLD-4.2 became 4.5.                           | store (396 stories: 372 succeeded); `aaeb71efc`; no `cluster` or `momentum` in `packages/core/src/mcp/` |
| §2.1.1 P3 polish signed off | Checklists are attached for 23 of 23. Of 242 waivers, 167 are reasons, 6 have since closed, 56 are still open, 12 are weak, partial, unverified or not a reason, and 1 needed no waiver.                                            | `state/RC-POL-*.journal.md`, `docs/development/run-journals/RC-POL-*.md`, three journals under `src/`   |
| §2.1.2 open limits          | **Not met:** 46 of 55 are outside the four (§3).                                                                                                                                                                                    | FEATURE-GAPS.md; `pnpm feature-audit` (55 limits, 0 stale)                                              |
| §2.1.3 contracts            | **Partial.** System Packages, widget trust, the iframe sandbox, ADR-024's editor, Standby and scene history hold. Unbuilt: worker widgets (no build), two ADR-030 clauses, and ADR-013's 5–7 sections.                              | `WorkerHost.ts:712-716`; `COMBAT_ON_MAP.md:19-21,56`; `adr/013-three-layer-navigation-contract.md:17`   |
| §2.1.3 inventory audited    | Every row was re-read on this commit and corrected in this change.                                                                                                                                                                  | FEATURE-GAPS.md "Evidence and validation"                                                               |
| Static + unit               | Core coverage ran here: 5433 tests pass, 90.24/80.87/93.35/94.3% against floors 85/75/90/90, unchanged since v0.4.4. `pnpm check` did not run here.                                                                                 | `pnpm test:coverage:core`; `git diff v0.4.4 HEAD -- packages/core/vitest.config.ts` empty               |
| Browser                     | Not run here. The last full green run is `loop/rc` `511fc6af4`, 23 commits earlier (CI 38942826767). Inside Nightly's validation the e2e check timed out at 25 minutes.                                                             | `gh run view 38942826767`, `39024122179`                                                                |
| Accessibility               | Passed on the identical tree in M2.5 (60 scans, 0 critical or serious). The five passes saw no axe violation. The screen-reader script has never run.                                                                               | EARLY_ACCESS.md §3; `ACCESSIBILITY.md:158`                                                              |
| Whole-app                   | **Not met (hosted).** Nightly on main failed every day from 2026-10-14 to 2026-10-17: `verify:routes` 17/17 routes with errors, `verify:canvas`, `verify:ui` 2/10, `verify:p2p-live`, Android API 36.                               | Nightly 39024122179, 38889764000, 38723836067, 38555769646                                              |
| Performance                 | **Not met.** 11 of 22 budgets are provisional. `widget-update:large` measured 274 ms against a 100 ms target in both repeats. One scheduled `perf.yml` run has ever started, and it was cancelled.                                  | `budget-registry.ts:319`; perf run 38944915663; `gh run list --workflow perf.yml --event schedule`      |
| Security                    | Secret scan passes. Audit: 4 moderate, no high. The two named core tests pass (40 of 40). Phase-2 bypass is covered only by those tests.                                                                                            | `pnpm security:secrets`, `pnpm security:audit`, `vitest run` on the two files                           |
| Visual                      | **Not met as written.** The golden route set runs in 3 themes, not 5. The baseline budget has 61 KiB left (37,827 of 37,888 KiB).                                                                                                   | `tests/visual/golden-routes.spec.ts:14`; `check-baseline-budget.mjs`                                    |
| Release                     | v0.4.4 (pre-release, 2026-10-14) has six packages, two SPDX SBOMs and SHA256SUMS. No `rc` draft and no checklist assets exist. Desktop signing is RC-PLT-1.1.                                                                       | `gh release list`, `gh release view v0.4.4`                                                             |
| Docs                        | The feature audit shows 0 drift. `pnpm gates` passed on the audit commit (313 files reachable, 466 links). RC-DOC-1.1 is done.                                                                                                      | `pnpm feature-audit`, `pnpm gates`                                                                      |
| §2.3 size                   | **Not met.** Eight hand-written `.ts` files are over 800 lines: `dataEnvironment.ts` 1979, `coreStore.ts` 1758, `demo-seed.ts` 1277, `parity.ts` 1016, `audio-engine.ts` 909, `draft.ts` 864, `backup.ts` 859, `WorkerHost.ts` 832. | the `git ls-files … wc -l` command above; `scripts/quality-gates.ts:101-115` scans `.tsx` only          |
| §2.3 `any`                  | Met: 11 (all in `app/compendium/`).                                                                                                                                                                                                 | `pnpm exec eslint apps/gm-react/src --format json`                                                      |
| §2.3 bundle                 | Not run here; green on `loop/rc` at `511fc6af4`.                                                                                                                                                                                    | CI 38942826767 "build + bundle budget"                                                                  |
| §2.3 i18n                   | The catalog passes: `es` has 6584 of 6584 keys, and 98.27% differ from English. **"Every visible string" fails:** core labels, `src/net/*`, `ds/copy.ts` and about 25 app literals skip `t()`.                                      | `pnpm exec tsx scripts/i18n-catalog.ts export --locale es`; §4 G5–G8, F14                               |

### 3. Limits against the §2.1 four

Every limit in [FEATURE-GAPS.md](../requirements/FEATURE-GAPS.md), re-read on the second run. The
four are **pay** (payment processor), **sign** (signing certificates), **cur** (curation service)
and **CE2** (Cloud-Enhanced phase 2). The other classes are **bound** (deliberate behaviour, not a
missing capability), **i18n** (an English string, a §2.3 failure), **gap** (a missing capability),
**config** (edition or build configuration), **op** (an operator step outside the four) and
**ADR** (a scope decision already recorded).

**Owning story** is the story that closes the limit or, where none is filed, RC-ENG-13.9, the
owner's ruling on every limit outside the four. **RC-1** applies the owner's waiver of 2026-10-24
([RC_ROADMAP §2.1](../planning/RC_ROADMAP.md#21-feature-completeness), item 2): a limit outside the
four that is listed here with its owning story is admitted for RC-1 and is not re-filed. The waiver
admits the limit; it does not close the story. Worker widgets stay refused on every build until a
storage-isolated host exists (`app/widgets/WorkerHost.ts:671-675,712`).

| Row              | Limit                                                                                                    | Class      | Owning story            | RC-1                      |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ---------- | ----------------------- | ------------------------- |
| Palette and help | Guides ship in English                                                                                   | i18n       | RC-ENG-13.9             | waived                    |
| Scene editor     | Generated widgets need DM review                                                                         | bound      | RC-ENG-13.9             | waived                    |
| Board            | Tile status notes; inspector tier labels in English                                                      | i18n       | RC-ENG-12.3             | waived                    |
| Board            | Phone list tiles keep authored height                                                                    | bound      | RC-ENG-13.9             | waived                    |
| Session          | End live before Standby                                                                                  | bound      | RC-ENG-13.9             | waived                    |
| Session          | Continuity prompts in English                                                                            | i18n       | RC-ENG-12.2             | waived                    |
| Characters       | DDB import diagnostics in English                                                                        | i18n       | RC-ENG-12.3             | waived                    |
| Characters       | Guided PCs cannot hold DM-only notes                                                                     | gap        | RC-ENG-13.9             | waived                    |
| Maps (Atlas)     | Legacy per-map token array                                                                               | gap        | RC-ENG-13.7             | waived                    |
| Notes            | No live co-editing presence                                                                              | gap        | RC-ENG-13.9             | waived                    |
| Notes            | 50-revision cap; 30-day window                                                                           | bound      | RC-ENG-13.9             | waived                    |
| Notes            | Saved searches cannot filter by kind                                                                     | gap        | RC-ENG-13.9             | waived                    |
| Graph & search   | Least-overlap label placement                                                                            | bound      | RC-ENG-13.9             | waived                    |
| Audio            | Built-in templates need bound sources                                                                    | bound      | RC-ENG-13.9             | waived                    |
| Audio            | Desktop cannot bind remote streams to scenes                                                             | gap        | RC-ENG-13.9             | waived                    |
| Extensions       | Marketplace needs a configured service                                                                   | cur        | RC-CLD-4.1              | one of the four           |
| Extensions       | Only the bundled SRD offline                                                                             | bound      | RC-ENG-13.9             | waived                    |
| Community        | Discovery needs the marketplace                                                                          | cur        | RC-CLD-4.1              | one of the four           |
| Community        | Local editions host no public wiki                                                                       | config     | RC-ENG-13.9             | waived                    |
| Community        | Scene packages cannot be installed                                                                       | gap        | RC-ENG-13.9             | waived                    |
| Plans & cloud    | Desktop and Android direct subscriptions to the web                                                      | ADR (027)  | RC-ENG-13.9             | waived                    |
| Plans & cloud    | Preview enrollment takes no payment; plan changes unavailable; production Stripe blocked                 | pay        | RC-CLD-2.6              | one of the four           |
| Settings         | Cloud backup needs device key custody                                                                    | bound      | RC-ENG-13.9             | waived                    |
| Settings         | Plan changes unavailable without live billing                                                            | pay        | RC-CLD-2.6              | one of the four           |
| Settings         | Recent changes humanizes commands in English                                                             | i18n       | RC-ENG-12.3             | waived                    |
| Settings         | Push is not delivered on any build                                                                       | gap        | RC-CLD-2.3, RC-ENG-12.5 | waived                    |
| Player app       | Companions are not sent equipment; companions cannot level up                                            | gap        | RC-ENG-13.9             | waived                    |
| Invite redeem    | Invites need the configured app API                                                                      | config     | RC-ENG-13.9             | waived                    |
| Invite redeem    | Public sign-up blocked by the SES sandbox                                                                | op         | RC-CLD-1.1              | waived                    |
| Public wiki      | Hosting needs a configured cloud service                                                                 | config     | RC-ENG-13.9             | waived                    |
| Second display   | Without BroadcastChannel a display keeps its last state                                                  | bound      | RC-ENG-13.9             | waived                    |
| Legal            | Legal entity placeholders                                                                                | op         | RC-CLD-2.6, RC-ENG-12.9 | waived                    |
| Widget platform  | Worker widgets run on no build                                                                           | gap        | RC-ENG-13.8             | waived; the refusal stays |
| System packages  | Imports re-homed under a free custom ID                                                                  | bound      | RC-ENG-13.9             | waived                    |
| System packages  | Data-only packages add no trust review                                                                   | ADR (034)  | RC-ENG-13.9             | waived                    |
| AI assistant     | Managed Copilot waits on the Cloud-Enhanced review                                                       | CE2        | epic CLD-6              | one of the four           |
| Cloud and sync   | Account features need configured services                                                                | config     | RC-ENG-13.9             | waived                    |
| Cloud and sync   | Account calls need sign-in                                                                               | bound      | RC-ENG-13.9             | waived                    |
| Cloud and sync   | SES sandbox                                                                                              | op         | RC-CLD-1.1              | waived                    |
| Cloud and sync   | TURN-over-TLS rollout unverified                                                                         | op         | RC-CLD-1.5              | waived                    |
| External sources | Google Docs needs build configuration and a supported runtime; desktop has no authorization              | config/gap | RC-ENG-13.9             | waived                    |
| External sources | Calendar shares the Docs client ID; existing Google Docs cannot be connected                             | bound      | RC-ENG-13.9             | waived                    |
| Shells           | Desktop signing and notarization; packaging fails without credentials                                    | sign       | RC-PLT-1.1              | one of the four           |
| Shells           | No Capacitor iOS shell                                                                                   | ADR (038)  | RC-ENG-13.9             | waived                    |
| Performance      | Recorded fixtures include smaller vaults (partly stale: `baseline.ci.json` also measures the large rows) | bound      | RC-ENG-11.3             | waived                    |
| Performance      | CI gates drift, targets are diagnostic                                                                   | bound      | RC-ENG-13.9             | waived                    |
| Performance      | The eleven large-vault budgets are provisional                                                           | gap (§2.2) | RC-ENG-11.3             | waived                    |

Some lines combine limits from one row. Counted one by one, the 55 declared limits are 9 among the
four and 46 waived: 16 bounds, 6 English residue, 12 gaps, 5 configuration, 4 operator steps and 3
ADR scope decisions. Every one of the 46 has an owning story. The first run's sweep also found
unavailable-state copy that is neither a row nor added here, because each is a platform capability
rather than a feature: automatic updates (`electron/main.cjs:1209`), a second screen, folder
picking and OS-encrypted storage (`en.ts:19,391,2437`), and analytics (`en.ts:7491`). A character
can never be deleted (no `character.delete` command in `packages/core/src/commands`), a gap with no
copy. RC-ENG-13.9 owns all of them, under the same waiver.

### 4. Findings

**Second run.** Ids: R3 is the `requirements-auditor` pass and U3 the `ux-ui-reviewer` pass. Paths
are under `apps/gm-react/src/` unless they start with `packages/`, `docs/`, `tests/` or
`apps/gm-react/` itself. I re-read the source and the hosted logs behind R3-1 and confirmed U3-M1 in
U3's probe data (Spanish `/tools` heading truncated at 1440px). Axe found no critical or serious
violation on `/tools`, the Table controls sheet, the phone Screens chooser or More.

| Id    | Sev      | Finding                                                                                                                                                 | Evidence                                                                                    | Goes to                       |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| R3-1  | critical | Hosted `ci-gate` is red since RC-ENG-15.2: the Electron smoke waits for Start session in the top bar, which is in the Table controls sheet below 1440px | `apps/gm-react/electron/smoke-parity.cjs:52,142`; `app/shell/TopBar.tsx:29`; CI 40201160971 | fixed on `loop/rc` (§1)       |
| R3-2  | high     | Nightly's `verify:p2p-live` looks for "Host a live table", a name 15.2 replaced with "Host table" (static in run 2; reproduced in run 3)                | `apps/gm-react/scripts/verify-p2p-live.mjs:40`; `net/SessionPanel.tsx:203-215`              | fixed here (third run, §1)    |
| R3-9  | medium   | Supply Chain is red on `loop/rc`: zizmor `ref-version-mismatch` on the `setup-sam` pin                                                                  | `.github/workflows/deploy.yml:158`; `promote-production.yml:124`; run 40178768941           | fixed upstream (`e451763bf`)  |
| U3-M1 | medium   | At 1440px the labelled top bar truncates titles; Spanish shows about four letters                                                                       | `app/shell/TopBar.tsx:25-29,110`                                                            | RC-ENG-16.3                   |
| U3-M2 | medium   | Phone All sections opens with focus on New screen                                                                                                       | `ds/components/overlay/Sheet.tsx:87-89`; `app/shell/MoreSheet.tsx:70`                       | RC-ENG-16.4                   |
| U3-M3 | medium   | Tools' Change experience level lands below the fold with focus on `<body>`                                                                              | `screens/Tools.tsx:80`; `i18n/messages/en.ts:998`                                           | RC-ENG-16.4                   |
| R3-4  | medium   | `/player` is still "Player view", not IA-1's Player sheet                                                                                               | `app/nav.ts:173-178`; `i18n/messages/en.ts:234`                                             | RC-ENG-16.5                   |
| R3-5  | low      | The palette has no Tools destination and finds no billing, Atlas, Campaign or Knowledge                                                                 | `app/CommandPalette.tsx:298-313`                                                            | RC-ENG-16.2                   |
| R3-3  | medium   | The signing limit's roadmap line anchor broke on every roadmap edit                                                                                     | FEATURE-GAPS "Shells and platform"                                                          | fixed here (`RELEASING.md:6`) |

Low (RC-ENG-16.6 gives each a disposition): U3-L1 the rail marks two items `aria-current="page"`
(`ds/components/navigation/NavItem.tsx:42`); U3-L2 the phone More tab is announced as the current
page (`app/shell/Footer.tsx:91`, `ds/components/navigation/BottomTabBar.tsx:48`); U3-L3 uneven heights in the labelled controls row, Host table at
29px (`net/SessionPanel.tsx:51`); U3-L4 the sheet Close button is 30×30 on touch tiers; U3-L5 the
Tools copy describes bookmarks (`en.ts:7591-7594`; the label half is RC-ENG-16.5); U3-L6 More's vault
row shows the stored vault name, "Your campaign" in Spanish (`app/shell/MoreSheet.tsx:77`); U3-L7
"Organizar mesa" for Host table (`i18n/messages/es.ts:7885`, needs a native speaker); R3-6 the Table
controls trigger reuses the Session glyph and Account the Characters glyph (`app/shell/TopBar.tsx:238,251`; `net/SessionPanel.tsx:182`);
R3-7 while hosting, the visible "Host table · 2" is not inside the accessible name
(`net/SessionPanel.tsx:202-215`); R3-8 local navigation is labelled with the bare section name, not
ADR-013's "<Section> navigation" (`app/shell/Sidebar.tsx:323`); the preview race during a pending
route transition (`app/ViewAsControl.tsx:167-169`, `app/widgets/templates/HubIntent.tsx:45-47`);
route-compat runs history on the desktop and phone profiles but not the rail tier.

First-run findings whose status changed on this tree (from R3):

- R1-1 and R2-3 (the IA decision): closed by the acceptance, ADR-013 and RC-ENG-15.1 to 15.4. The
  R3-1 condition cleared in the third run.
- R1-13 (RC-ENG-8.16 to 8.20 `proposed`): closed; the store shows them succeeded.
- R2-8 (Nightly): Nightly passed on `loop/rc` `09524f2e6` and still fails on `main`. The second run
  expected it to fail on the candidate (R3-2). The third run fixed `verify:p2p-live`; Nightly has not
  run on this commit.
- R2-9 (no hosted CI): hosted CI was red on `aa300d6d5` (R3-1). It is green on `a047c6bd2`
  (CI 40211540957).
- G5 (Host and Join English in Spanish): the Host and Account controls now use `t()`; the `/play`
  Join dialog is still English (`net/SessionPanel.tsx:270-662`).
- E13 (the Table controls glyph): unchanged on the phone and now also on the rail (R3-6).

**First run.** Ids name the pass: R1, R2, E, F, G. Paths are under `apps/gm-react/src/` unless they
start with `packages/`, `docs/` or `tests/`. Lines are at `3cbf4b7cc`.

**Critical and high**

| Id          | Sev      | Finding                                                                                    | Evidence                                                                               | Goes to                       |
| ----------- | -------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------- |
| R1-1, R2-3  | critical | The RC-UX-5.5 IA decision is unaccepted, ADR-013 is unamended and no follow-up is filed    | `docs/planning/IA_REVIEW.md:3,167-171`                                                 | §24 RC-UX-5.5                 |
| R1-2        | critical | RC-AI-1.3 (P1) is cancelled; no cluster-momentum read tool                                 | `packages/core/src/mcp/tool-registry.ts:108-112`; `aaeb71efc`                          | RC-ENG-11.2                   |
| R2-1        | critical | 11 provisional budgets; `widget-update:large` 274 ms against 100 ms                        | `packages/core/src/perf/budget-registry.ts:319`; perf run 38944915663                  | RC-ENG-11.3                   |
| R2-2        | critical | One scheduled perf run ever started, and it was cancelled                                  | `.github/workflows/perf.yml:31`; run 38245056229                                       | RC-ENG-11.4                   |
| G1          | critical | At the default level a GM cannot download or restore a backup                              | `packages/core/src/state/onboarding.ts:758-765`; `screens/settings/LocalBackup.tsx:94` | RC-ENG-11.1                   |
| R2-8        | high     | Nightly whole-app validation and Android acceptance fail on main                           | Nightly 39024122179                                                                    | RC-ENG-11.5                   |
| R2-6        | high     | Eight `.ts` files over 800 lines; the gate reads `.tsx` only                               | `scripts/quality-gates.ts:101-115`                                                     | RC-ENG-11.6 to 11.8           |
| R2-4, R1-4  | high     | Most open limits are outside the four; whether RC-CLD-1.1 counts under §2.1.1 is undecided | §3                                                                                     | RC-ENG-13.9                   |
| R2-5, R1-10 | high     | Worker widgets run on no build; the inventory said only Electron                           | `app/widgets/WorkerHost.ts:664-675,712-716`                                            | RC-ENG-13.8 (inventory fixed) |
| R1-5, R2-7  | high     | English strings skip `t()` in core, `net/`, the design system and about 25 app sites       | §2 "§2.3 i18n"; G5–G8                                                                  | RC-ENG-12.1 to 12.4           |
| R1-6        | high     | The manual screen-reader script has never run; its E3 no-leak check blocks the release     | `docs/development/ACCESSIBILITY.md:154,158`                                            | §24 (release); item above     |
| E1          | high     | A DM-only scene card is shown on the table display                                         | `screens/SceneDisplay.tsx:129-135`; `app/SceneDisplayOverlay.tsx:39-43`                | RC-ENG-13.1                   |
| E2          | high     | Graph's "Open in Story" lands on an untargeted Quests tab                                  | `screens/graph/presentation.ts:336`; `screens/Campaign.tsx:87-109`                     | RC-ENG-13.2                   |
| F1          | high     | A package card overflows the phone and cuts off Enable and Remove                          | `screens/extensions/PluginPackageCard.tsx:193-201`                                     | RC-ENG-13.3                   |
| F2          | high     | The compendium preview reports imported fields as "Not imported"                           | `app/compendium/import.ts:357-361`                                                     | RC-ENG-13.4                   |
| F3          | high     | Plan previews in the local edition claim features the build lacks                          | `screens/Upgrade.tsx:66-72`                                                            | RC-ENG-12.6                   |
| F4          | high     | Two different "active system"s on the System tab                                           | `screens/extensions/SystemWidgetSwitch.tsx:243`                                        | RC-ENG-13.5                   |
| G2          | high     | A player on a dead invite lands in DM onboarding                                           | `screens/Join.tsx:232-236`                                                             | RC-ENG-12.8                   |
| G3          | high     | Français shows "100% translated" while it is English                                       | `i18n/messages/fr.ts:4-5`; `i18n/index.tsx:99-104`                                     | RC-ENG-12.7                   |
| G4          | high     | The primary "Invite player" only toasts "unavailable here"                                 | `screens/settings/Players.tsx:182`                                                     | RC-ENG-12.8                   |
| G5          | high     | The `/play` Join dialog and the Host control are English in Spanish                        | `net/SessionPanel.tsx:86-92,154,264,501-531`                                           | RC-ENG-12.1                   |
| G6          | high     | The DM-only safety chip reads "DJ only" in Spanish, beside literal English labels          | `ds/components/feedback/VisibilityChip.tsx:43-64`                                      | RC-ENG-12.1                   |

**Medium**

| Id           | Finding                                                                                                                                     | Evidence                                                                               | Goes to           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------- |
| R1-3         | RC-AI-1.1's streamed text reaches no UI                                                                                                     | `ai/mcpBridge.ts:396-404`; `screens/settings/AiAssistant.tsx:191-198`                  | RC-ENG-13.9       |
| R1-7         | The §20.2 prototype comparison was waived on 20 surfaces, and no later pass made it                                                         | the POL journals' prototype rows                                                       | RC-ENG-13.9       |
| R1-8         | The golden route set runs in 3 themes; the baseline budget is nearly full                                                                   | `tests/visual/golden-routes.spec.ts:14`                                                | RC-ENG-11.9       |
| R1-9         | Signed-in account dialogs and the Join sign-in modal were never axe-scanned                                                                 | `tests/e2e/_accountFixture.ts` exists; no spec opens them                              | RC-ENG-14.4       |
| R1-11        | ADR-030: legacy map tokens are still written; area templates never reach players                                                            | `packages/core/src/state/map-state.ts:256`; `docs/architecture/COMBAT_ON_MAP.md:56`    | RC-ENG-13.6, 13.7 |
| R1-12        | RC-ENG-8.15's acceptance is unmet: 17 controls recorded as clipped                                                                          | `tests/e2e/tile-overflow-controls.spec.ts:15-36`                                       | RC-ENG-13.9       |
| R2-9         | No hosted CI for the audit commit                                                                                                           | `origin/loop/rc` at `511fc6af4`                                                        | RC-ENG-7.2        |
| R2-10        | Discussions are disabled, so Help › Send feedback opens nothing                                                                             | `gh api repos/tsieb/dndtools` → `has_discussions: false`                               | §24 RC-ENG-7.1    |
| R2-11        | Unavailable copy promises a future ("yet", "when it arrives")                                                                               | `i18n/messages/en.ts:159,1492,1494,3594,4469,5349,6455`                                | RC-ENG-12.5       |
| R2-12        | Behavior references can drift silently; the audit checks only the line range                                                                | `scripts/validate/feature-audit.ts`                                                    | RC-ENG-14.4       |
| R2-13        | The Board tier-label anchor matched a comment                                                                                               | `app/board-helpers.ts:127-133`                                                         | fixed here        |
| R2-14        | ADR-027 ("links nowhere") against a disabled "Subscribe at {host}" button                                                                   | `docs/adr/027-*.md:50-53`; `screens/upgrade/PlanCards.tsx:171-180`                     | RC-ENG-13.9       |
| R2-15        | Push is undeliverable everywhere, against ADR-038's web push                                                                                | `platform/capabilities.ts:164-168`; `docs/adr/038-ios-platform-strategy.md:48-49`      | RC-ENG-13.9       |
| R2-16        | `PROD_IDENTITY = DEV_IDENTITY`: production would publish placeholders                                                                       | `screens/legal/legalContent.ts:41-54`                                                  | RC-ENG-12.9       |
| E3, F5       | Focus drops to `<body>` after about fifteen actions (Relationships, Calendar, Audio, Repair, Plugins, Types, System, Compendium, Community) | `screens/campaign/Relationships.tsx:272-276`; `screens/extensions/Plugins.tsx:218-236` | RC-ENG-14.1       |
| E4           | The Host dialog has no focus trap or return and is hand-built                                                                               | `net/SessionPanelParts.tsx:36-110`                                                     | RC-ENG-12.1       |
| E5           | Player preview of the mixer prints a raw source ID                                                                                          | `screens/audio/panels/PlaybackRight.tsx:99-100`                                        | RC-ENG-14.5       |
| E6           | Scene "Link" binds the first web stream with no choice                                                                                      | `screens/audio/index.tsx:200-214`                                                      | RC-ENG-14.5       |
| E7           | "No audio comes bundled" contradicts the bundled starter pack                                                                               | `screens/audio/SfxEventsPanel.tsx:167`                                                 | RC-ENG-14.5       |
| E8           | DM audio headings carry a lock icon named for players                                                                                       | `screens/audio/AudioPanel.tsx:22`                                                      | RC-ENG-14.5       |
| E9           | Once a campaign date exists, Story offers no way to the calendar editor                                                                     | `screens/Campaign.tsx:536-555`                                                         | RC-ENG-14.6       |
| E10          | Quest and NPC cards show visibility as an icon only                                                                                         | `screens/campaign/Cards.tsx:118`                                                       | RC-ENG-14.6       |
| E11          | Disabled controls without a stated reason (Relationships, Audio, Graph)                                                                     | `screens/campaign/Relationships.tsx:466-475`                                           | RC-ENG-14.5, 14.6 |
| E12          | Relationships on an empty vault is a dead end                                                                                               | `screens/campaign/Relationships.tsx:400-475`                                           | RC-ENG-14.6       |
| E13          | The phone's Table controls reuse the Session glyph                                                                                          | `app/shell/TopBar.tsx:188-189`                                                         | RC-ENG-14.8       |
| E14, F6, G15 | Touch targets under 44px: breadcrumb back (70×24), Seg radios (29px), compendium and theme segments                                         | `app/screen-kit.tsx:681-691,722-736`; `screens/extensions/Compendium.tsx:146`          | RC-ENG-14.3       |
| E15          | "Date a note" asks for a frontmatter key (`occurredOn`)                                                                                     | `screens/campaign/CalendarPreview.tsx:176`                                             | RC-ENG-14.6       |
| E16          | On the phone the display's help strip covers the end of long flavor text                                                                    | `styles/scene-display.css:14-19`                                                       | RC-ENG-14.8       |
| F7           | Theme preset names clip ("igh contra")                                                                                                      | `screens/extensions/ThemeStudio.tsx:103`                                               | RC-ENG-14.3       |
| F8           | Engine ids shown to GMs (`custom:tavern`, `system.home-widgets`, "string required")                                                         | `screens/extensions/CustomTypes.tsx:246-255`                                           | RC-ENG-14.7       |
| F9           | A delete confirm the core always refuses, then an engine-id toast                                                                           | `screens/extensions/CustomTypeRow.tsx:141-144`                                         | RC-ENG-14.2       |
| F11          | Trust review says "Nothing is allowed" for packages already on                                                                              | `screens/extensions/TrustReviewSheet.tsx`                                              | RC-ENG-14.7       |
| F12          | Turning off a built-in package has no confirm or undo                                                                                       | `screens/extensions/PluginPackageCard.tsx:217-226`                                     | RC-ENG-14.2       |
| F13          | The system dry run pads "Drops 61" with 43 unused rows                                                                                      | `screens/extensions/SystemDialogs.tsx:105-118`                                         | RC-ENG-14.7       |
| F14          | Extensions, Community and Plans strings stay English in Spanish                                                                             | `packages/core/src/commands/custom-object-type.ts:219`                                 | RC-ENG-12.2, 12.3 |
| F17          | "Resume your draft?" focuses Start over, so Enter discards the draft                                                                        | `app/widgetBuilder/BuilderPanes.tsx:157-166`                                           | RC-ENG-14.2       |
| G7           | Palette actions, widget and screen names are core-authored English                                                                          | `packages/core/src/queries/command-actions.ts:110`                                     | RC-ENG-12.2       |
| G8           | The design system's 127 English defaults have no tracker                                                                                    | `ds/copy.ts`                                                                           | RC-ENG-12.4       |
| G9, G10      | Push and semantic-search copy promise a future                                                                                              | `i18n/messages/en.ts:158-159,2328-2329`                                                | RC-ENG-12.5       |
| G11, G19     | The local runner shows "Ready" unchecked; About shows "Last sync" with no sync                                                              | `ai/providerConfig.ts:684-690`; `screens/settings/About.tsx:101-109`                   | RC-ENG-12.7       |
| G12          | "Choose which tools" shows 31 static raw tool ids                                                                                           | `screens/settings/Ai.tsx:429-436`                                                      | RC-ENG-14.8       |
| G13          | The rail's grants table puts Revoke past the scroll port                                                                                    | `screens/settings/Permissions.tsx:270,319-352`                                         | RC-ENG-14.8       |
| G14          | Density choices revert below 1200px without saying so                                                                                       | `public/prepaint.js:64-68`                                                             | RC-ENG-14.8       |
| G16          | "Try again" offered for "not available in this edition"                                                                                     | `screens/Join.tsx:218-231`; `screens/WikiReader.tsx:206-218`                           | RC-ENG-12.8       |
| G17          | The wiki's document title stays "Command Center" until ready                                                                                | `screens/WikiReader.tsx:143-146`                                                       | RC-ENG-14.8       |
| G18          | The recovery key says "Sign in" in an edition without sign-in                                                                               | `screens/settings/SyncPrivacy.tsx:234`                                                 | RC-ENG-14.8       |
| G20          | Settings › Subscription plan cards skip `usePlanCards` and stay English                                                                     | `screens/settings/Subscription.tsx:30`                                                 | RC-ENG-12.3       |
| G21          | One invite credential under five names                                                                                                      | `i18n/messages/en.ts:1128,1751,5689,5707`                                              | RC-ENG-14.8       |

The first version of this record left 28 medium rows marked "operator", for the operator to file
as the M2.5 audit did. Review of the audit asked for stories instead, so they now point at ENG-14.
The one medium that needs the owner's account, R2-10, points at §24.

**Low** (the inventory and checklist ones are fixed in this change; RC-ENG-14.9 gives the rest a disposition)

- R1: 13 RC-ENG-8.16–8.20 met acceptance but are `proposed` (§24 store row); 14 Characters keeps 38
  raw-style allowances (`scripts/eslint-rules/no-raw-style-values.allow.js:27-31`); 15 screen-kit
  `Panel` titles are Cinzel 14px (`app/screen-kit.tsx:391`); 16 SCENE_HISTORY.md stale on add-widget
  undo; 17 store/roadmap phase drift (RC-CLD-2.3, RC-UX-3.6/3.7); 18 §2.1.3 names a "widget brief"
  that no document carries; 19 POL-1.11 and 1.17 disagree on phone density; 20 a system can only be
  started by copying one.
- R2: 17 Performance row counted 11 budgets (fixed); 18 five weak references (fixed); 19 Google
  Docs import overstated (fixed); 20 the `v0.4.0` example (fixed); 21 EARLY_ACCESS §5 cites
  "eleven budgets" (§6); 22 DEBT-2026-004 file names (fixed in DEBT.md).
- E: 17 Cinzel below 24px on Story; 18 keyboard hint on touch tiers (`screens/Graph.tsx:515`); 19
  "DM view" stays live in player preview; 20 Refine in Notes drops the kind facet; 21 author copy
  in a player's empty NPC tab (`screens/Campaign.tsx:382`); 22 repair lowercases links; 23
  relationship direction select truncates; 24 palette lacks calendar, display and feedback
  entries; 25 "Audio" against "Audio & atmosphere"; 26 preview avatar "P("
  (`ds/components/core/Avatar.tsx:20-25`); 27 emphasis and em-dash copy; 28 the More group can
  collapse over the current route.
- F: 10 raw validator text on an invalid package; 15 two identical marketplace notices; 16 the
  builder opens with an error; 18 module save asks for "publishing" fields; 19 the community block
  has no Exit preview; 20 raw Lucide names in Upgrade (`screens/Upgrade.tsx:188`); 21 two Install
  buttons; 22 hover-only command hint; 23 export summary clips, and file names use the old brand;
  24 two "Import Goblin" buttons; 25 an unnamed "New"; 26 English legal bodies without a note; 27
  12 live regions in the system builder; 28 lower-case badges and mismatched icons.
- G: 22 recent changes stop at 8 of 48 (`screens/settings/Sync.tsx:310`); 23 technical restore
  error (`platform/backup.ts:242`); 24 "Sync now" disabled with no reason; 25 backup uses the plug
  glyph; 26 two links to `/upgrade`; 27 "Show advanced settings" changes the level app-wide; 28
  unclear invite copy; 29 the Settings subtitle undersells 14 categories; 30 developer copy in
  Ollama guidance (`ai/localLlmGuidance.ts:16`); 31 a repository path in Schedule's copy
  (`screens/session/Schedule.tsx:36-55`); 32 English exonyms in the language list.

The earlier audits' open ids that the passes saw again (FRICTIONLESS L1–L3, L8–L11, M2, M4, M6;
EARLY_ACCESS A-2, A-3, A-4/B4-3, A2-4, A2-7, C-15, C-19, D-10, D-13) are not re-filed.

### 5. Stories and owner steps

**Second run.** Filed in [RC_ROADMAP.md](../planning/RC_ROADMAP.md) §18 as epic ENG-16: 16.1
Supply Chain, 16.2 the palette, 16.3 the top-bar title at 1440px, 16.4 focus on sheet and settings
links, 16.5 Player sheet and the Tools copy, and 16.6 a disposition for each low. R3-1 and R3-2
were not filed as stories. `ci-recovery-2c97e96f8c25` fixed R3-1, and the third run fixed R3-2
(§1). The
owner's 2026-10-24 amendment makes RC-ENG-7.3 depend on RC-UX-5.5 and RC-ENG-15.4, not on ENG-11
to ENG-14, and §2.1 now records the waiver. In §24 the RC-UX-5.5 row is marked done, and the store
row lists the stories the dispatcher store does not hold yet (RC-ENG-11.1 to 14.9 and 16.1 to
16.6).

**First run.** Filed as epics ENG-11 (the release bars: 11.1 to 11.9), ENG-12 (strings and honest
states: 12.1 to 12.9), ENG-13 (surfaces and contracts: 13.1 to 13.8, and 13.9 for the owner
rulings) and ENG-14 (the medium findings: 14.1 to 14.8, and 14.9 for a disposition on each low one).
Every first-run finding in §4 points at a story or a §24 step, except the lows, which RC-ENG-14.9
covers.

### 6. Discrepancies outside this audit's files

Recorded, not edited, because each file belongs to another story:

- `docs/architecture/WIDGETS.md:389-392` says only the Electron CSP blocks workers; the code
  refuses them everywhere (RC-ENG-13.8 owns the fix).
- `docs/architecture/SCENE_HISTORY.md:18-20` says adding a widget leaves the undo stack untouched;
  `canvas/useLayoutHistory.ts:72-74,194-203` records it.
- `docs/planning/IA_REVIEW.md` said "merge pending" and later that the preview-return failure
  blocked the IA box. Both are corrected (the file is in this claim).
- `apps/gm-react/electron/smoke-parity.cjs:142` and `apps/gm-react/scripts/verify-p2p-live.mjs:40`
  hard-coded pre-IA-1 top-bar controls (R3-1, R3-2). `ci-recovery-2c97e96f8c25` fixed the smoke
  on `loop/rc`. The third run fixed the P2P probe after its claim was widened to that file (§1).
- `docs/adr/013-three-layer-navigation-contract.md:18` asks for "<Section> navigation" labels on
  local navigation; the shell uses the bare section name (R3-8).
- `docs/planning/EARLY_ACCESS.md` §5 reasons from "eleven budgets"; the registry has 22, and the
  budget that exercises DEBT-2026-009 (`graph-indexing:large`) is provisional. The judgement still
  holds on present evidence: nothing ties the one breach (`widget-update:large`,
  `scene.move-widget`) to that debt.
- `ds/copy.ts` cites DEBT-2026-002 for its English defaults; that entry is the resolved `any` debt.
- ADR-027 §4 and ADR-038's web-push reach disagree with the shipped UI (R2-14, R2-15).

### 7. Not checked

Second run:

- `pnpm check`, the full `pnpm e2e` suite, `pnpm validate:full`, the visual container and the
  Electron and Android shells. Hosted CI covers the first two on `aa300d6d5` (§2).
- `verify-ui.mjs` and `verify-canvas.mjs` at runtime. The third run ran `verify:p2p-live` (§1).
- Hosted CI and Nightly on the third run's own commit. That commit is not pushed. Hosted CI ran on
  its base `a047c6bd2`, whose application code differs only in the P2P probe.
- RC-ENG-8.17 to 8.20's specs (read against the code, not run).
- A screen reader, 200% zoom, a player's shell, a live session's Screens chooser, long pin lists,
  the signed-in Account control, and Spanish title fit above 1440px.
- The review passes are model reviewers driving the app. They are not a usability test with
  people.

First run:

- The Electron and Android shells, a packaged build, and hosted CI on this commit.
- `pnpm check`, `pnpm e2e`, `pnpm validate:full`, the visual container and `pnpm build` (the
  operator's gates and the RC-ENG-7.2 runner run them).
- A screen reader, live SES, Stripe, Firebase or TURN state, and the signed-in cloud edition.
- Prototype parity: DesignSync is limited to design review.
- Themes other than the default in the review passes (the contrast gate and G's five-theme Settings
  scan aside), 200% zoom, and Spanish beyond one load per route and state.
- The review passes are model reviewers driving the app, with the critical and high findings
  checked against source. They are not a usability test with people.

### 8. Reproducing

From a clean checkout, with `<dir>` a scratch path, `<port>` a free port and `<commit>` the commit
that carries this record (its tree outside `docs` and `state` must equal `a047c6bd2` apart from
the third-run `verify-p2p-live.mjs` fix):

```sh
git worktree add --detach <dir> <commit>
cd <dir> && pnpm install --frozen-lockfile
git diff --stat a047c6bd2 HEAD -- apps packages scripts tests .github
pnpm feature-audit && pnpm gates && pnpm test:coverage:core
pnpm exec tsx scripts/i18n-catalog.ts export --dir <dir>/i18n --locale es
pnpm security:secrets && pnpm security:audit
cd apps/gm-react && DNDTOOLS_E2E_PORT=<port> pnpm exec playwright test \
  tests/e2e/primary-sections.spec.ts tests/e2e/table-controls.spec.ts \
  tests/e2e/route-compat.spec.ts --workers=3
pnpm exec vitest run src/app/nav.test.ts src/app/shell/TableControls.test.tsx \
  src/app/shell/sections.test.ts src/i18n/section-vocabulary.test.ts
gh run view 40201160971 --json jobs
gh run view 40205169106 --log-failed | grep 'smoke-parity.cjs:'
gh run view 40211540957 --json jobs --jq '.jobs[] | "\(.name) \(.conclusion)"'
gh run list --workflow perf.yml --event schedule
gh run list --workflow Nightly
gh run list --workflow 'Supply Chain' --branch loop/rc
```

The third run's two checks, from `<dir>`. To see the unfixed smoke failure, first put
`aa300d6d5`'s `smoke-parity.cjs` on the scratch tree:
`git checkout aa300d6d5 -- apps/gm-react/electron/smoke-parity.cjs`. The smoke needs the build
first, and `--network=none` keeps the container offline. `verify:p2p-live` runs against a `vite` dev server on `<port>`. In this
dispatcher worktree, `require('playwright')` in the verify scripts failed with `MODULE_NOT_FOUND`
(the app depends on `@playwright/test`), so the run set `NODE_PATH` to pnpm's `playwright` package.
Hosted Nightly resolved it without that (`verify:p2p-live` passed in 3.9s on `09524f2e6`, run
40178768721); the cause was not investigated.

```sh
pnpm --filter @dndtools/gm-react exec node scripts/ensure-electron.mjs
pnpm --filter @dndtools/gm-react exec vite build
docker run --rm --init --ipc=host --network=none --user "$(id -u):$(id -g)" \
  -v "$PWD:$PWD" -w "$PWD/apps/gm-react" -e HOME=/tmp \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  xvfb-run --auto-servernum node scripts/run-desktop-smoke.mjs
cd apps/gm-react && pnpm exec vite --port <port> --strictPort &
NODE_PATH="$PWD/../../node_modules/.pnpm/playwright@1.61.1/node_modules" \
  REACT_URL=http://localhost:<port>/ node scripts/verify-p2p-live.mjs
```

The four IA tasks and the review probes were scratch specs under `apps/gm-react/tests/e2e/`, run
with `DNDTOOLS_E2E_PORT=<port>` and a per-test viewport, and deleted afterwards. The preview check
waits for the Characters heading before choosing Preview as player. Before citing this verdict
for another commit, run `git diff --stat <this record's commit> <commit> -- . ':!docs' ':!state'`.
Empty output means the same code. Anything else means the audit runs again. The first run's equivalent base was `3cbf4b7cc`.
