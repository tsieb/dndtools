# ADR-018: Promote the React GM App to Primary; Archive the Svelte App

- Status: Accepted
- Date: 2026-07-08
- Deciders: Engineering
- Consulted: Product, Design, Security, QA
- Supersedes: the "Svelte is the primary and only GM app" position of ADR-016; the React-rejecting
  rationale in ADR-014's rejected-alternatives table.

## Context

ADR-016 promoted the SvelteKit GM app (`apps/gm`, `@dndtools/gm`) to be the primary — and, at the
time, only — application. Since then all new product work landed in a parallel React app
(`apps/gm-react`, `@dndtools/gm-react`): it reached feature parity on the core workspace surface and
additionally carries three strategic capabilities the Svelte app never had — the AWS cloud backend
(Cognito auth + end-to-end-encrypted sync), LAN/serverless WebRTC remote play, and an Electron
desktop shell. Maintaining two full GM apps against one shared core doubled the cost of every change
and the "React is a prototype" framing no longer matched reality.

The processing core (`packages/core`, `@dndtools/core`) is framework-independent (it imports neither
React nor Svelte) and the two apps shared zero code, so the choice of primary GUI is reversible and
carries no core coupling.

## Decision

`apps/gm-react` (`@dndtools/gm-react`) is the primary and only maintained GM surface. The SvelteKit
app is moved out of the pnpm workspace to `archive/gm-svelte` (retired, not built or gated) and
tagged `svelte-gm-final` for recovery. The workspace defaults (`pnpm dev`/`build`/`test`/`typecheck`/
`e2e`/`a11y:axe`), the boundary lint, the a11y/token gates, the quality-gate path selectors, ESLint,
and the validate harness all target the React app. The React app keeps its `apps/gm-react` directory
and `@dndtools/gm-react` package name (not renamed to `apps/gm`) so history and imports stay stable.

## Consequences

### Positive

- One maintained GM app; every core change is validated against a single, real product surface.
- The primary app now includes cloud sync, remote play, and desktop packaging out of the box.
- The framework-free core boundary is now enforced against React imports too.

### Negative

- The React app started as a design-package port and carries `any` in some runtime/view-model seams
  (tracked as DEBT-2026-002) and lacks a typed platform-preferences layer (DEBT-2026-001).
- The Svelte app's ~88 Playwright specs do not all port at once; the critical-path specs (collab,
  sync, canvas, permissions) plus the axe gate are ported now, the rest is tracked as DEBT-2026-003.

## Rejected Alternatives

| Alternative | Why Rejected |
| ----------- | ------------ |
| Keep both apps maintained | Doubles the cost of every core change; the Svelte app's large e2e corpus would gate work indefinitely for a surface no longer shipped. |
| Rename `apps/gm-react` → `apps/gm` | Churns hundreds of references and imports for a cosmetic name; the `-react` suffix is harmless once Svelte is archived. |
| Delete the Svelte app outright | Its e2e specs are a valuable behavioral reference while the React test corpus is built up; archiving keeps them readable without gating cost. |

## Migration Impact

- `git mv apps/gm archive/gm-svelte` (out of the `apps/*` workspace glob); add `archive/README.md`.
- Flip root scripts, boundary lint, a11y/token gates, `quality-gates.ts` `selectsOnPaths`, ESLint,
  `.prettierignore`, the validate harness (`registry.ts`/`servers.ts`), and `validate.yml` to React.
- Relocate the repo-tooling boundary/renderer-isolation regression tests to `tests/unit/`.
- Stand up Playwright + an axe gate on the React app; port the critical-path specs.

## Rollback Plan

- Trigger: React app proves unshippable for a hard requirement only Svelte satisfied.
- Steps: `git checkout svelte-gm-final -- archive/gm-svelte`, move it back under `apps/`, and revert
  the tooling flip. No core or data changes are involved (the core and storage format are shared).

## Verification and Evidence

- `apps/gm-react/` (the app), `packages/core/` (shared, framework-free), `archive/gm-svelte/` (retired).
- `scripts/boundary-lint.ts` (React GUI surface + core purity incl. React imports), the git tag
  `svelte-gm-final`, `apps/gm-react/tests/e2e/` (ported specs + axe gate), and `DEBT.md`
  (DEBT-2026-001/002/003).
