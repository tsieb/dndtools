# ci-recovery-be43018f68c4 run journal

## Scope

Repair GitHub CI for promoted commit `be43018f68c464d8f59c1c8dc32ed4c19dd58857`. Reported
failing workflow: `CI`. Reproduce locally, fix the cause, verify without weakening tests or
workflow protections. No push, promotion, loops, additional agents, or dispatcher
control-state edits.

## Diagnosis

### CI — `build-and-test` → `Run unit tests`

- Push run 37163508003 and PR run 37163509709 both fail the same way: `pnpm test` → the
  `cloud` vitest project reports `apps/gm-react/src/cloud/AuthModal.test.tsx` 6/6 failed
  (`Input not found: auth-password`, `Button not found: Forgot password?`,
  `Button not found: Create an account`). All other suites passed.
- Cause: RC-UX-6.1 (`d9e5d0a6`) made the DS `Dialog` portal its scrim to `document.body` so a
  transformed launcher can't become its containing block. `AuthModal` renders through that
  Dialog, but its test queried the React render `container`, which is now empty. The story
  updated `Upgrade.test.tsx` and `ds-interaction-fixes.test.tsx` for the portal but missed
  this one — it runs under `vitest.cloud.config.ts`, not the app config.
- Reproduced locally:
  `pnpm exec vitest run --config vitest.cloud.config.ts apps/gm-react/src/cloud/AuthModal.test.tsx`
  → 6 failed, the same errors.

### Performance (not in this task's scope)

- Run 37163509702 failed on 1 of its 5 perf attempts: `graph-indexing` measured 192.9ms against a
  158.0ms baseline (+22.1%, still well under the 500ms target). The other four attempts passed
  with 0 regressions. `graph-indexing` is unrelated to the Dialog change, so this looks like
  hosted-runner noise. Left alone.

## Fix

- `AuthModal.test.tsx`: added a `dialog()` helper that resolves the portaled
  `[role="dialog"]` from `document`, which follows the `Upgrade.test.tsx` precedent. Button,
  input, title, text and alert lookups are now scoped to it. Every assertion is unchanged.

## Verification (local, this worktree)

- `AuthModal.test.tsx` (cloud config): 6/6 pass.
- `pnpm test` exit 0 — core 5184/5184, cloud 559/559, app 1773/1773, tooling 245/245.
- `pnpm lint` exit 0; `pnpm typecheck` exit 0; `prettier --check` on the changed test passes.

## Reconcile with integration branch (rebase onto 879489ab)

- The gate's rebase onto `879489abfe6f` conflicted in `AuthModal.test.tsx`. That commit is a
  sibling recovery (`ci-recovery-4314e0d325a4`) that already fixed the same portal breakage:
  its queries use `document.body` while mine used a `[role="dialog"]` helper. Both leave every
  assertion unchanged, so I took the integration branch's version and dropped mine. This
  branch now adds only this journal on top of `879489ab`.
- GitHub CI on `879489ab` is green: push run 37176393577 and PR run 37176396074 (`CI`), along
  with Performance and Supply Chain. That covers the `CI` failure reported for `be43018f`.
- The newer `loop/rc` head `ed614140` fails a different job, Android
  `Run instrumentation and lifecycle acceptance on API 36` (run 37188126286). That's a
  separate promoted commit and outside this task.

### Verification at 879489ab + this journal (local)

- `AuthModal.test.tsx` (cloud config): 6/6 pass.
- `pnpm test` exit 0 — core 5184/5184, cloud 559/559, app 1773/1773, tooling 245/245.
- `pnpm lint` exit 0; `pnpm typecheck` exit 0.
