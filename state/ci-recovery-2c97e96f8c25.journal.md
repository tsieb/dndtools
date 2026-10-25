# ci-recovery-2c97e96f8c25

## Diagnosis

- Candidate starts at `2c97e96f8c25f310ea09294e4735d9418279147e`; worktree initially clean.
- Read failed logs for attempts 1 and 2 of https://github.com/tsieb/dndtools/actions/runs/40193334049.
- Both fail Electron parity at `smoke-parity.cjs:142`, waiting to click Start session.
- RC-ENG-15.2 moved session controls into Table controls below 1440px. Electron's default and restored windows are narrower; the smoke never opens the sheet.
- The repair requires the directly failing Electron smoke file, outside the scheduler's enumerated owned paths. Claim widening is required for that test and this required journal; no product or protection changes.
- Host lacks xvfb-run; use the installed Playwright Noble container with Xvfb, no network, and the mounted task checkout for reproduction and verification.

## Verification

- Reproduced the original timeout at line 142 locally with the unmodified production bundle and Electron smoke (`/var/tmp/ci-2c97-repro.log`).
- Open Table controls to reach Start session at compact widths, and match the current exact accessible name `End session (live)`.
- Dismiss first-run setup via Skip setup on the fresh write profile, explicitly waiting for its lazy mount. The verify process reuses the saved dismissal.
- Close the controls sheet and require no remaining modal before invoking the palette, preventing either setup or the sheet from satisfying the palette assertion.
- No timeouts, badge assertions, persistence assertions, or workflow protections relaxed. No quarantine needed: the failure was stale UI interaction.
- Production Vite build passed. Full desktop smoke passed on the final candidate (exit 0, `/var/tmp/ci-2c97-final.log`): write/verify origin and persistence, crash-safe migration, 12 updater checks, and parity write/verify including live badge transitions, projector isolation/Escape and window persistence.
- Prettier, Node syntax check and git diff whitespace check passed. ESLint ignores this CJS file, so its invocation is not lint coverage.
- No app pixels changed; screenshot baselines and visual gates are unaffected.

Reproduction/verification command (after `pnpm --filter @dndtools/gm-react exec node scripts/ensure-electron.mjs` and `pnpm --filter @dndtools/gm-react exec vite build`):

```sh
docker run --rm --init --ipc=host --network=none --user "$(id -u):$(id -g)" \
  -v "$PWD:$PWD" -w "$PWD/apps/gm-react" -e HOME=/tmp \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  xvfb-run --auto-servernum node scripts/run-desktop-smoke.mjs
```

No push, promotion, loop launch, or dispatcher control-state edit. Central gates and independent review remain the operator's next step.

## Ownership gate follow-up

- Reviewed the retry feedback and the complete diff against base `2c97e96f8c25f310ea09294e4735d9418279147e`. Only `apps/gm-react/electron/smoke-parity.cjs` and this journal differ; there are no unrelated changes to revert.
- Retain `apps/gm-react/electron/smoke-parity.cjs`: it is the test failing in both CI attempts and in the local reproduction. Its stale interactions must follow the current compact shell and accessible names. Reverting it restores the reported failure; changing the product or bypassing the smoke to fit the stale test would not be an appropriate repair.
- Retain `state/ci-recovery-2c97e96f8c25.journal.md`: the task explicitly requires a current run journal containing diagnosis and verification evidence.
- The ownership gate has not approved these paths. Per the retry instruction, the follow-up commit records why each is necessary so the operator can decide whether to widen the claim. No claim or dispatcher state was changed.
- Re-read the original local failure and final passing smoke logs. Test code is unchanged from the verified candidate; this follow-up changes documentation only. Formatting and whitespace checks passed.
