# ci-recovery-6f8e448d22b0 run journal

## Scope and diagnosis

Repair CI for `6f8e448d22b0c96efc0c7ae0d5b2fbea431b525b`; no push,
promotion, new loop, or dispatcher control-state changes.

GitHub push run 36322723524 and PR run 36322727101 fail the Linux Electron
smoke. The original PR log reports `timeout: scene-name input` during the write
phase. The Screens library replaced the old scene creation form. Other push-run
jobs completed successfully (the conditional smoke-gate was skipped).

## Integration reconciliation

Rebased the task branch onto the requested integration commit
`ec77c053f82b3f15607d59be3da511be76915429`. Resolved both script conflicts:

- Retained the integration Electron smoke and its stable `screens-new` test id,
  including the corresponding ScenesCreator button change.
- Retained the task's accessible dialog locators and explicit rendered-library
  wait in the browser round-trip script, together with its durable-write wait
  before reload. The duplicate persistence-wait commit was dropped by Git after
  its change was included in the reconciled commit.
- All persistence, preview, origin, CORS, font, IPC, migration, updater, and
  desktop parity assertions remain intact. No workflow changes.
- The committed round-trip script failed to start with `Cannot find module
'playwright'`. Changed its import to the already-declared `@playwright/test`
  dependency, which exports the same Chromium driver. No dependency or lockfile
  changes and no temporary script copy are needed to run this gate.

## Verification

Checks below ran against the reconciled candidate on 2026-09-27 with Node
22.22.3 and pnpm 10.34.5. GitHub uses Node 24. This host has Xwayland rather
than `xvfb-run`; the desktop command used its existing display and authentication
file. The desktop runner still creates isolated throwaway profiles.

- Reproduction: temporarily restored only `smoke-desktop.cjs` from the reported
  `6f8e448d22b0` commit, then ran
  `pnpm --filter @dndtools/gm-react desktop:smoke` against the candidate renderer.
  Exit 1, `timeout: scene-name input`, matching GitHub. A `finally` block restored
  the reconciled script. Headroom artifact `f5944ca4a5034fd882e2b932cf4d953f`;
  original diagnostic retrieved and inspected.
- Candidate: `pnpm --filter @dndtools/gm-react desktop:smoke`: exit 0.
  Production build, write, restart verification (`survived: true`), crash-safe
  origin migration, 12 updater checks, and both desktop parity phases passed.
  No renderer console errors or unexpected privileged calls.
  Headroom artifact `cf1c0e87c3664ffc8a6c11304d3e2e00`; complete original stdout
  retrieved and inspected. Only the existing bundle-size warning appeared.
- Started Vite on an isolated port with
  `pnpm --filter @dndtools/gm-react exec vite --host 127.0.0.1 --port 5392 --strictPort`.
  `REACT_URL=http://127.0.0.1:5392/ pnpm verify:roundtrip`: exit 0, 11/11 checks.
  Proves scene and operation-log persistence, reconstructed idempotency Set,
  and preview mutation rejection across reloads. Headroom artifact
  `ec4b0bb62a914532b1e0eea871ce06f0`; original output retrieved and inspected.
- Prettier check on both scripts and this journal, ESLint on both scripts, and
  `git diff --check`: exit 0. Headroom artifact
  `36b1d16c8775480792855c15f7b3f4db`; original output retrieved and inspected.

The candidate delta from `ec77c053` changes only the browser verification script
and this journal; the integration branch's renderer and Electron repair are
preserved. No pixel-changing candidate edits or baseline updates. Central gates,
independent review, promotion, and exact-SHA GitHub verification remain with the
operator.
