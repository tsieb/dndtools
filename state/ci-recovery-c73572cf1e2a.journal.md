# ci-recovery-c73572cf1e2a run journal

## Scope

Repair GitHub CI for promoted commit `c73572cf1e2acebf0734b7a1103e502a07c3870d`. Reported
failing workflow: `CI`. Reproduce locally, fix the cause, verify without weakening tests or
workflow protections. No push, promotion, loops, additional agents, or dispatcher
control-state edits.

## Diagnosis

- Run [35864647974](https://github.com/tsieb/dndtools/actions/runs/35864647974)
  (`pull_request`, head `c73572cf`): `Android unit, lint, and package checks` was the only
  failing job. It died at `Install Android API 36 toolchain`, before any repo code ran:
  `Downloading emulator-linux_x64-159` jumped 16% → 21%, then
  `Warning: An error occurred while preparing SDK package Android Emulator: Error reading Zip
content from a SeekableByteChannel.` → `Process completed with exit code 1`. The emulator
  zip from dl.google.com was cut off mid-transfer.
- Transient and not caused by the commit. The `push` CI run on the same SHA
  ([35864638731](https://github.com/tsieb/dndtools/actions/runs/35864638731)) ran the same
  Android job to success. `c73572cf` itself only touches RC-CAN-7.5 docs/evidence.
- The real defect is in the workflow: one truncated download of one SDK package failed the
  whole job, with no retry. The same inline `sdkmanager` block was copied into `ci.yml`,
  `release.yml` (draft-release Android job) and `validate.yml`.
- Out of scope, noted for triage: the other recent Android PR-run failures (35822355828,
  35722028791, 35709510322) come from something else, emulator acceptance ANRs /
  `adb: device offline`, not SDK install.

## Reproduction

No `sdkmanager` on this machine, and a truncated CDN transfer can't be forced, so the
failure mode was reproduced with a stub `sdkmanager` that exits 1 with the runner's
message and leaves a partial `$ANDROID_HOME/.temp` package behind. Before the fix, the
inline step had no retry, so one such exit ended the step.

## Fix

- `scripts/android-sdk-install.sh`: accepts licences (keeping the `yes`/SIGPIPE handling),
  then installs the requested packages. Each `sdkmanager` call gets up to 3 attempts
  (`ANDROID_SDK_INSTALL_ATTEMPTS`), 15s apart (`ANDROID_SDK_INSTALL_RETRY_DELAY`), with a
  `::warning::` annotation per retry. Staged partial downloads (`.temp`,
  `.downloadIntermediates` under the SDK root) are dropped before each retry. After the
  last failed attempt it still exits non-zero, and it exits 2 when no packages are given.
- `ci.yml`, `release.yml` and `validate.yml` call the script with the same package lists
  as before. Nothing was added or removed.
- `tests/unit/android-sdk-install.test.ts`: the stub-`sdkmanager` suite covers a clean
  install, recovery after 2 truncated downloads with staged state cleared, fail-closed
  after 3 install failures, no install while licence acceptance fails, and the usage
  error.
- `tests/unit/ci-guardrails.test.ts`: a new case fails if any workflow `run:` step calls
  `sdkmanager` directly. It also requires at least one step to use the script, so it
  can't pass vacuously.

## Verification

- `vitest run tests/unit/android-sdk-install.test.ts tests/unit/ci-guardrails.test.ts`:
  2 files, 20 tests passed.
- Mutation checks, each restored afterwards:
  - bare `sdkmanager` restored in `validate.yml`: the guardrail fails.
  - `ATTEMPTS=1`: 3 script tests fail.
  - staged-download cleanup removed: the retry test fails.
- `prettier --check` on every changed file, `eslint` on both test files, `bash -n` on the
  script, and a YAML parse of all three workflows: clean. The rendered `ci.yml` step is
  `bash scripts/android-sdk-install.sh 'platform-tools' 'platforms;android-36'
'build-tools;36.0.0' 'emulator' 'system-images;android-36;google_apis;x86_64'`.
- Not run locally: shellcheck/actionlint (not installed) and the real Android job (it
  needs a GitHub runner). CI is the proof for the live install path.
