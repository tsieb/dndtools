# Release candidate checklist and beta program

This is the runnable checklist for [the RC definition](../planning/RC_ROADMAP.md#2-definition-of-release-candidate).
A green automated run is evidence for the commands below, not sign-off for the review and
historical evidence items. RC-ENG-7.2 owns the tag/release rehearsal; RC-ENG-7.3 owns the exit audit.

## Run on the RC tag

Use Node 24, the pinned pnpm, a clean checkout with full Git history, installed dependencies,
Chromium with system dependencies, and Docker or Podman for the pinned visual container.
The whole-app checks also need their documented desktop/cloud capabilities; inspect skipped
checks rather than treating capability skips as passes. Performance capture requires CI hardware.

The release uses a **plain semver tag**, such as `v0.4.0`, matching all package versions.
Android cannot package a `-rc.1` version. `rc` is a workflow channel and produces a draft
prerelease with unsigned desktop installers and alpha-key-signed Android packages. Production
signing remains a separate channel. Tag pushes still select `preview`; an operator selects `rc`
explicitly after the tag's exact commit has a green `ci-gate` and is reachable from main:

```bash
gh workflow run release.yml --ref main -f tag=v0.4.0 -f channel=rc
```

Do not run this publication command from an implementation task. An existing draft from another
channel must be reviewed and removed by its owner before changing channels; published releases
and signed production drafts are protected from unsigned replacement.

To reproduce the automated portion in the checked-out tag (outputs go in `rc-results/`):

````bash
export RELEASE_TAG=v0.4.0
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
- [ ] **Static/unit:** `pnpm check` and `pnpm test:coverage:core` pass; coverage floors have not
      decreased from the previous release.
- [ ] **Browser:** `pnpm e2e` ran desktop and mobile profiles, with at least one spec per §5–§17 epic.
- [ ] **Accessibility:** `pnpm a11y:gate` passes with zero critical/serious findings, an empty
      exception register, and every durable workspace represented in its route inventory.
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
      `@typescript-eslint/no-explicit-any` count is at most 20. Review `pnpm gates` and
      `pnpm exec eslint apps/gm-react/src --format json` output against those exact RC bars.
- [ ] **§2.3 bundle/i18n:** bundle budget passes; every visible string uses i18n.
      Run `pnpm exec tsx scripts/i18n-catalog.ts export --dir /tmp/rc-i18n --locale es`
      and confirm the ES translated-key count is at least 95% of the English-key count;
      attach the count and the UI string audit.

## Beta program and feedback handoff

This deliverable is **blocked**, not complete, until the feedback route below is implemented
under an authorized ownership correction or companion task. Documentation alone does not satisfy it.

Before inviting testers, verify a GitHub Discussions beta-feedback category and form are enabled,
and that Help → **Send feedback** opens that form. These changes require ownership of
`.github/DISCUSSION_TEMPLATE/` and the app help menu; this checklist does not claim they exist.
The form should ask for RC tag/version, platform, expected/actual behavior, reproduction steps,
severity, and optional redacted screenshots/logs. Never request vault exports, credentials or
private campaign content by default.

- [ ] Commit the Discussions form and record its path and the enabled category URL.
- [ ] Wire the localized Help → **Send feedback** action to that category's form.
- [ ] Verify the action opens the intended form on supported platforms, including keyboard
      activation and external-open failure handling; record the test names and results.
- [ ] Retain the required help-menu visual comparison and independent review evidence.

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
