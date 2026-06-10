# ADR-016: Promote the GM App to Primary and Reorganize the Monorepo

- Status: Accepted
- Date: 2026-06-09
- Deciders: Engineering
- Consulted: Product, Design
- Supersedes: ADR-014 (the `apps/v2` quarantine, the `v2-` package naming, and the v1-runtime
  import ban — the stack, processing/display boundary, storage, and test decisions of ADR-014 are
  retained)

## Context

DND Tools 0.2.0 (the canvas-first GM command platform, per
`docs/remake-review/00-vision-brief.md`) was built under ADR-014 as a quarantined subproject at
`apps/v2`, deliberately kept separate from the stable v1 document-editor while the remake matured.
The remake is now feature-complete and verified; v1 is retired. The `apps/v2` quarantine and the
`v2-` labels have served their purpose and now obscure the fact that the GM app **is** the product.

This ADR promotes the GM app to the primary (and only) application, removes v1, drops the "v2"
label, and reorganizes the repository into a clean monorepo that can hold the surfaces the vision
calls for — the GM command platform, a future player app, desktop/mobile shells, a cloud-sync
service, and an MCP server — all sharing the one processing core.

## Decision

### Layout

The repository is a pnpm workspace with three top-level buckets:

```text
apps/        deployable end-user GUIs (one per surface)
  gm/        @dndtools/gm — the GM command platform (was apps/v2/app)
packages/    shared libraries with no GUI, reused across apps and services
  core/      @dndtools/core — the processing core (was apps/v2/packages/core)
services/    server/cloud-side runtimes (documented; scaffolded when a boundary lands)
```

- The processing core moves to repo-level `packages/core` because it is shared by every future
  surface. The ADR-014 reason for nesting it under `apps/v2` (containment during the experiment)
  no longer applies.
- Packages are renamed `@dndtools/v2-app` → `@dndtools/gm` and `@dndtools/v2-core` →
  `@dndtools/core`.
- Future surfaces (player app, Electron/Capacitor shells, cloud sync service, MCP server) are
  **documented, not scaffolded** — ADR-014's "avoid extra packages until a real boundary appears"
  still holds.

### Commands

Root scripts drop the `v2:` prefix: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm e2e`,
`pnpm typecheck`, `pnpm lint`, `pnpm lint:boundary`, `pnpm gates`, `pnpm docs:validate`,
`pnpm check`, and the `workpack:*` / `ux-workpack:*` planning commands. The root `package.json`
is a pure workspace root (no app, no v1 dependencies).

### v1 retirement

v1 (`src/`, `electron/`, `android/`, `mcp/`, `static/`, `vault/`, its root build configs, tests,
and v1-only scripts) is removed from the working tree. The last pure-v1 commit is preserved by the
git tag `v1-final` for recovery. The processing/display boundary, local-first storage model, and
test strategy of ADR-014 remain in force for `@dndtools/core` and `@dndtools/gm`; the v1-runtime
import ban is obsolete because v1 no longer exists.

### Enforcement

The mechanical boundary lint (`scripts/boundary-lint.ts`) now targets `apps/gm` and
`packages/core`. The declared quality-gate registry (`packages/core/src/platform/quality-gates.ts`,
enforced by `scripts/quality-gates.ts`) and the docs validator (`scripts/docs-validate.ts`) were
retargeted to the new layout; the docs validator's v1-only `mcp/migrations.ts` schema cross-check
was removed.

## Consequences

### Positive

- The repository structure now reflects reality: the GM app is primary, the core is shared, and
  future surfaces have an obvious home.
- New surfaces (player app, shells, services) attach without re-quarantining.
- Command and package names no longer carry a "v2" label that outlived its meaning.

### Negative

- A large mechanical rename touched the package scope across the app and core, plus tooling,
  configs, and the gate registry.
- Dated planning/audit artifacts under `docs/planning/v2/` and `docs/remake-review/` keep their
  original `apps/v2` / `v2-` references as a historical record; "v2" there refers to today's
  primary GM app. They are no longer path-validated.

## Migration Notes

- Directories were moved with `git mv` to preserve history.
- `v1-final` tags the last v1 commit; v1 is otherwise removed.
- The cloud release stays gated closed until ADR-015 (cloud security model) and a concrete crypto
  ADR are accepted, unchanged by this ADR.
