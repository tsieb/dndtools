---
name: validate-report
description: Choose the right `pnpm validate` mode for the change at hand and triage its consolidated report. Use when asked to "validate", "run the full validation", "check everything still works", when a validate run failed and needs diagnosis, or before merging a change that spans layers (core + app + cloud + infra). Covers the layer/capability model, which flags to pick, where the HTML/markdown/JSON report and per-check logs land, and how to read warn-vs-fail-vs-skip.
---

# Running and triaging `pnpm validate`

`scripts/validate/` is the whole-application harness: it orders every check into staged, parallel groups, brings up managed dev servers for browser checks, gates checks on detected capabilities, writes a consolidated report, and exits non-zero if any **required** check failed.

## Pick the mode

| Situation | Command | Runs |
|---|---|---|
| Quick signal while iterating | `pnpm validate:fast` | `static + unit + audit` |
| Default pre-commit / pre-PR | `pnpm validate` | `static + unit + build + browser + audit` |
| Touched `infra/` or cloud code, and you have AWS creds | `pnpm validate:live` | default **+ `cloud`** |
| Touched the Electron shell, on a machine with a display | `pnpm validate --desktop` | default **+ `desktop`** |
| Release / initiative close-out | `pnpm validate:full` | everything (still capability-gated) |
| Just want the catalog | `pnpm validate:list` | prints every check, its layer, and its gating |

Narrowing flags compose: `--layer=unit,static`, `--only=e2e,test:core`, `--skip=e2e`, `--jobs=4`, `--no-report`.

Rules worth knowing before you pick:

- `--only=` overrides layer selection entirely; `--skip=` applies on top of any selection.
- Naming a layer explicitly with `--layer=cloud` turns on that layer's **off-by-default** checks without needing `--live`. That is the surgical way to run one cloud probe.
- `--live` implies the `cloud` layer; `--desktop` implies the `desktop` layer; `--full` implies both.
- **Capability gating is not opt-out.** The runner probes for `aws` (via `aws sts get-caller-identity --profile ${DNDTOOLS_PROFILE:-dndtools}`), `display`, and `electron` (presence of `node_modules/electron`). A check whose `requires:` are unmet is **skipped with a reason**, not failed. So a green `--live` run on a machine with no AWS session proves nothing about the cloud — always read the capabilities line in the report before trusting a pass.

## Where the output goes

- `test-results/validation/index.html` — the dashboard. Open this first.
- `test-results/validation/report.md` — same content, greppable.
- `test-results/validation/report.json` — machine-readable (`results[]`, `counts`, `capabilities`, `ok`).
- `test-results/validation/logs/<check-id>.log` — the full stdout/stderr of each check. **This is where the actual error is.** The summary line is only a hint.

Exit codes: `0` all required checks passed · `1` at least one required check failed · `2` bad usage or the harness itself crashed.

## Triage order

1. **Read the capabilities line** in the report. Skipped-for-capability checks are the #1 source of false confidence.
2. **Separate `fail` from `warn` from `skip`.** A check marked `optional: true` downgrades a failure to `warn` and does not fail the run — `format` and `feature-audit` are the current examples. A `warn` is still a real signal; it just is not a gate.
   - `format` currently warns repo-wide (~513 files) as a standing condition. Do **not** "fix" it with a blanket `pnpm format` — that rewrites hundreds of files unrelated to your change. Run `pnpm exec prettier --write <your changed files>` instead, and confirm the warn is pre-existing by checking a file you did not touch.
3. **Open the failing check's log** at `test-results/validation/logs/<id>.log` before theorizing.
4. **Attribute the failure to a layer**, because that tells you what broke:
   - `static` (`eslint`, `lint:boundary`, `gates`, `audit:repo`, `tokens:contrast`, `a11y:contrast`, `typecheck:{core,react,cloud-fns}`) — a contract violation. `lint:boundary` failing usually means the framework-free core boundary was crossed (`packages/core` importing React).
   - `unit` (`test:core`, `test:tooling`, `test:cloud`, `verify:p2p`) — logic.
   - `build` — bundling. A dependency that assumes Node globals in the browser lands here or, worse, only at runtime. (`amazon-cognito-identity-js` → `buffer@4.9.2` references a bare `global`; `apps/gm-react/vite.config` carries `define: { global: 'globalThis' }` for exactly this. If you remove that define, dev and prod both break at mount, not at build.)
   - `browser` (`e2e`, `a11y:axe`, `a11y:report`, `verify:{routes,roundtrip,canvas,ui}`, `verify:p2p-live`) — these depend on the managed **`react-dev`** server. If several browser checks fail together, suspect the server never came up; check its log before reading any individual spec failure. Browser checks sharing the server run sequentially by design.
   - `cloud` — off by default, `requires: ['aws']`. Failures here are usually an expired SSO session, not broken code; invoke the `aws-auth` skill.
   - `desktop` — off by default, `requires: ['electron', 'display']`. Headless machines skip it.
   - `audit` — `feature-audit`, informational, never fails the run.
5. **Re-run just the failure** with `--only=<check-id>` rather than the whole suite.

## Reading `feature-audit` specifically

`pnpm feature-audit` (also the `audit` layer's only check) does three things: extracts the newest "honest stubs remaining" list from the feature-gap ledger, greps live code for stub markers (`TODO/FIXME/XXX/HACK`, "coming soon", …), and flags any React screen with no core-dispatch reference as *presentation-only — verify*.

The ledger it parses is `docs/requirements/FEATURE-GAPS.md`. If that file cannot be read, the audit sets `gapsMissing: true`, prints a `⚠ Ledger not found` banner, escalates to `warn`, and (as a standalone run) exits non-zero — because an empty declared-stub list must mean *unknown*, never *none*. It previously swallowed the error and silently reported `None declared`, which hid a moved ledger for weeks; if you ever see a suspiciously clean stub list, check `generatedFrom` and `gapsMissing` in `feature-audit.json` first.

A healthy run currently reports ~9 declared stubs. `0 declared stubs` is a signal to investigate, not to celebrate.

## Before you report a validate run as green

State the mode you ran, the detected capabilities, and the counts (`pass/warn/fail/skip`). "Validate passed" without the capability set is not a claim anyone can act on — it may mean the cloud and desktop layers never executed.
