# Whole-application validation harness

`pnpm validate` runs one orchestrated pass over **every** verification the repo
has — across all packages, both apps, and every runtime environment — and emits a
single consolidated report. It exists so that "is the whole application healthy?"
is one command instead of a dozen half-remembered scripts.

It does **not replace** PR CI. `ci.yml` runs static analysis, the full unit suite, and a production
build on every push/PR, plus path-filtered browser, accessibility, Electron smoke, and Android
native-build jobs for runtime changes. `validate` is the deep, on-demand sweep (local, plus a weekly +
manual `validate.yml` workflow).

## Quick start

```bash
pnpm validate            # default: static + unit + build + browser + audit
pnpm validate:fast       # static + unit + audit only (~fast signal, no servers/builds)
pnpm validate:live       # + live AWS dev-stack validation (needs the `dndtools` profile)
pnpm validate --desktop  # + packaged Electron smoke (needs a display)
pnpm validate:full       # everything (capability-gated: skips what it can't run)
pnpm validate:list       # print the full check catalog
pnpm feature-audit       # just the feature-gap drift report
```

Selectors: `--layer=unit,static` · `--only=e2e,test:core` · `--skip=e2e` · `--jobs=N` · `--no-report`.

## What it covers

| Layer       | Checks                                                                                                                                                                                     | Environment                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **static**  | eslint, boundary lint, quality-gate meta-gate, CI-guardrail audit, text + non-text contrast, typecheck ×3 (**core** / **gm-react** / **cloud-fns**), prettier                              | none                                             |
| **unit**    | core suite, React app suite, repo tooling suite, **cloud + transport suite** (`test:cloud`), P2P crypto gate                                                                               | none                                             |
| **build**   | production build of core, cloud Lambda bundles, then gm-react                                                                                                                              | none                                             |
| **browser** | React Playwright E2E (`apps/gm-react/tests/e2e/`, desktop + mobile Chromium), axe scan + gate report, React verify (routes / round-trip / canvas / UI-dispatch), P2P live WebRTC handshake | headless Chromium + managed `react-dev` server   |
| **desktop** | Electron packaged smoke (secure `dndtools://app` origin, exact-origin CORS, CSP, IndexedDB persistence, renderer console errors, and startup privileged-IPC tripwires across restart)      | display + electron binary — _off by default_     |
| **cloud**   | SSM config resolvable, CloudFront security headers, sync-API rejects anonymous, Cognito OIDC discovery, signaling e2e, TURN relay, E2EE backup round-trip + ciphertext-at-rest             | live AWS dev stacks — _off by default, `--live`_ |
| **audit**   | feature-gap drift (FEATURE-GAPS.md ↔ live code)                                                                                                                                            | none                                             |

Android native verification is deliberately outside the Node-based `pnpm validate` harness. Run it
after the renderer checks, from the tracked project:

```bash
pnpm --filter @dndtools/gm-react android:sync
cd apps/gm-react/android
./gradlew --no-daemon testReleaseUnitTest lintRelease assembleRelease bundleRelease
```

Release CI supplies the permanent alpha signing key, verifies the APK/AAB signatures, and installs and
cold-launches the signed APK on API 36. Before publication, complete the lifecycle, Back,
persistence, share/import, restore/upgrade, responsive/accessibility, and Quick Map matrix in the
[Android alpha runbook](../runbooks/android-alpha.md). `pnpm validate` staying green does not replace
that native release gate.

The harness deliberately folds in the checks that were previously orphaned from
the basic `check` command: repo audit, text contrast, P2P crypto/browser checks,
`a11y:*`, `e2e`, `verify:{routes,roundtrip,canvas,ui}`, and the P2P/desktop/cloud gates.

## How it runs

- **Stages** execute in order (0 = fast fail-early lint/unit wave → build → browser
  → desktop → cloud). Within a stage, independent checks run in parallel up to a
  jobs cap; checks that share a dev server (the React `verify:*` gates) run
  sequentially in one `group` to avoid IndexedDB races.
- **Servers** (`react-dev` on :5273) are started once when a stage needs them and
  torn down at the end. A server already listening on its port is reused. The
  React E2E/axe checks let Playwright manage its own preview.
- **Capabilities** are detected up front. A check whose requirement is absent is
  **skipped with a reason**, never failed — so `--full` on a laptop without AWS
  creds or a display simply skips cloud/desktop instead of erroring.

## Output

Written to `test-results/validation/`:

- `index.html` — theme-aware dashboard (open in a browser)
- `report.md` — Markdown summary (good for PRs)
- `report.json` — machine-readable results
- `logs/<check>.log` — full captured output per check
- `logs/feature-audit.{md,json}` — the feature-gap ledger

Exit code is non-zero iff a **required** check failed (optional checks — prettier,
the feature audit — downgrade to `warn`).

## Feature-gap audit

`FEATURE-GAPS.md` is a _layered, historical_ ledger: its old gap sections were
remediated by later dated passes. So the audit keys off the **latest** "Honest
stubs remaining" list and **probes live code** (stub markers + per-screen
core-dispatch wiring) rather than echoing superseded gap tables. It surfaces:

- declared-but-unbuilt surfaces (the honest stub list),
- stub markers found in `apps/gm-react/src` (drift the ledger doesn't mention),
- screens with no core-dispatch reference (presentation-only — verify).

## Live cloud validation

`pnpm validate:live` requires the `dndtools` AWS profile (`ca-central-1`, stage
`dev`). It resolves all coordinates from SSM (never hardcoded), asserts the
CloudFront security headers + Cognito OIDC + anonymous-rejection contracts, then
runs the deep `infra/verify-{signaling,turn,sync}.sh` end-to-end scripts (which
mint an ephemeral Cognito token and prove ciphertext-at-rest). It hits real
deployed infrastructure and incurs minor cost, which is why it is opt-in.

Overrides: `DNDTOOLS_PROFILE`, `DNDTOOLS_REGION`, `DNDTOOLS_STAGE`.
