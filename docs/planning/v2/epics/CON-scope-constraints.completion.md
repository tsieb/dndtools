# CON-scope-constraints — Completion Evidence

Workpack status: `complete`

Epic: `CON-scope-constraints` — "CON: Scope constraints"
Requirements:
- **CON-003** — "The system must never introduce community marketplace, public campaign directory, plugin
  ecosystem, third-party compendium integration, i18n, or public wiki features into the v2 core
  requirements without an explicit scope revision."
- **CON-006** — "The system must never add a new top-level platform, source, AI provider, public extension
  surface, or cloud backend assumption without an explicit architecture-contract and requirements revision."

Architecture contract: Contract 2 (Cloud Sync & Offline Model) + Architecture Cross-Contract; Vision brief
"Explicitly Out of Scope"; ADR-014 (the declared v2 stack, platform, source, cloud, and extension stance).

## What CON-003 and CON-006 require and what was built

Both are **governance / scope constraints**, not user-facing features. They keep DND Tools 0.2.0 inside its
declared scope boundaries over time: CON-003 forbids drifting in the explicitly out-of-scope feature classes
(community marketplace, public campaign directory, plugin ecosystem, third-party compendium integration, i18n,
public wiki) and keeps extension seams / user-authored widgets internal and vault-/workspace-local; CON-006
forbids adding a new top-level platform, source, AI provider, public extension surface, or cloud-backend
assumption — each only allowed through an explicit scope/contract+requirements revision.

A scope constraint is delivered as a **machine-checkable, fail-closed gate** that goes RED when scope is
violated. It is built by **composing** the existing declared registries (it re-implements none of them) and
mirrors the established mechanical registry-gate pattern (SEC-008 `security/regression-gates.ts`, PLAT-010
`platform/quality-gates.ts`, CON-004 `con/capability-set-sustainability.ts`):

- **New module** `apps/v2/packages/core/src/con/scope-constraints.ts` — the single declared CON-003/CON-006
  invariant + pure, fail-closed validators. It composes the live declared registries
  `apps/v2/packages/core/src/platform/platform-profile.ts` (`PLATFORM_PROFILES`),
  `apps/v2/packages/core/src/sync/source-adapter-registry.ts` (`REGISTERED_SOURCE_KINDS`),
  `apps/v2/packages/core/src/state/widget-package-state.ts` (`SYSTEM_WIDGET_PACKAGE_STATE`, `ALL_HOST_PERMISSIONS`,
  widget `author` distribution scope).
  - `findScopeViolation(proposal)` — the **scope-review detector** (the predicate a scope review turns into
    "reject / move to future scope"). Blocks an out-of-scope feature class (CON-003 AC1 / CON-006 AC2), a
    public plugin API extension seam (CON-003 AC2), a non-local widget distribution scope (CON-003 AC3), and a
    new top-level platform/source/AI-provider/cloud-backend/extension axis entry (CON-006 AC1) — UNLESS the
    proposal carries an explicit `scopeRevision` (the "explicit revision" escape hatch the constraints require).
  - `auditScopeBoundary(registries?)` — the **codebase-drift audit**: cross-checks the LIVE registries against
    the declared in-scope allowlists (platforms, sources, host permissions, widget author scopes). Fail closed:
    every problem is returned with a constraint-named reason.
  - `isInScopeWidgetDistribution(scope)` (CON-003 AC3 predicate), `isDeclaredInScopeForAxis(axis, value)`
    (CON-006 AC1 predicate), `summarizeScopeBoundary()` (governance diagnostic).
  - Declared allowlists are the single source of truth and the only way scope widens: `OUT_OF_SCOPE_FEATURE_CLASSES`,
    `TOP_LEVEL_SCOPE_AXES`, `DECLARED_PLATFORM_TARGETS`, `DECLARED_CONTENT_SOURCES`,
    `DECLARED_WIDGET_DISTRIBUTION_SCOPES`, `DECLARED_WIDGET_HOST_PERMISSIONS`, `PUBLIC_DISTRIBUTION_SIGNAL_TOKENS`.
- **Gate wired into CI** — the scope-boundary audit runs inside `scripts/quality-gates.ts` (`pnpm v2:gates`, a
  CI gate also reached by `pnpm v2:check`), surfaced through a new `scope-constraint-violation`
  `GateProblemKind`. A drift (undeclared platform/source/host-permission, or out-of-scope widget author) makes
  the gate exit non-zero. The constraint is ALSO covered by the vitest meta-test in `pnpm v2:test`.
- **Public API** — the module is re-exported from `apps/v2/packages/core/src/index.ts` so GUI/governance
  surfaces consume the gate through the core's public API (never raw registries).

## Requirement coverage / traceability

Implementation: `apps/v2/packages/core/src/con/scope-constraints.ts`; gate wiring:
`apps/v2/packages/core/src/platform/quality-gates.ts` (`scope-constraint-violation` kind) +
`scripts/quality-gates.ts`; export: `apps/v2/packages/core/src/index.ts`; tests:
`apps/v2/packages/core/tests/con-scope-constraints.test.ts`.

### Story CON-003-S01 (CON-003)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| **AC1** — a proposal adding marketplace / public-directory behavior is rejected or moved to future scope. | `findScopeViolation` + `OUT_OF_SCOPE_FEATURE_CLASSES` (`community-marketplace`, `public-campaign-directory`, `third-party-compendium-integration`, `i18n-localization`, `public-wiki`); `scopeRevision` is the "move to future scope" escape hatch. | "CON-003 AC1" describe block (every out-of-scope class flagged; marketplace/public-directory/wiki/compendium/i18n; explicit-revision escape hatch; blank revision = fail closed). |
| **AC2** — extension seams support internal system/user widgets only; no public plugin APIs. | `findScopeViolation` `publicPluginApi` → `public-plugin-api`. | "CON-003 AC2" describe block (public plugin API rejected; internal-only seam accepted; revision escape hatch). |
| **AC3** — a user-authored widget package stays vault-/workspace-local; no public marketplace / SDK guarantee / third-party distribution. | `isInScopeWidgetDistribution` + `DECLARED_WIDGET_DISTRIBUTION_SCOPES` (system/user/workspace) + `PUBLIC_DISTRIBUTION_SIGNAL_TOKENS`; `auditScopeBoundary` cross-checks every installed widget `author`. | "CON-003 AC3" describe block (in-scope scopes accepted; marketplace/third-party/community/published rejected; case/separator insensitive; undeclared scope fail closed) + "out-of-scope-widget-author" adversarial RED. |

### Story CON-006-S02 (CON-006)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| **AC1** — a new cloud backend / AI provider assumption is blocked until contracts and requirements are updated. | `findScopeViolation` `newTopLevel` + `isDeclaredInScopeForAxis`; ADR-014 declares NO concrete AI provider / cloud backend / public extension surface, so every such candidate fails closed until the declared allowlist is widened (the explicit revision). `auditScopeBoundary` blocks an undeclared live platform/source/host-permission. | "CON-006 AC1" describe block (declared platform/source accepted; new platform/source blocked; ANY AI provider blocked; ANY cloud backend blocked; ANY new extension surface blocked; revision escape hatch) + "undeclared-platform/source/host-permission" adversarial RED. |
| **AC2** — expanding user-authored widgets into a public plugin ecosystem is rejected or moved to future scope through explicit revision. | `findScopeViolation` `featureClass: 'plugin-ecosystem'` → `out-of-scope-feature` (requirementId `CON-006`). | "CON-006 AC2" describe block (plugin-ecosystem rejected with CON-006 reason; revision escape hatch). |

## Adversarial constraint-violation evidence (gate goes RED, then GREEN)

- **Unit / meta-test** (`con-scope-constraints.test.ts`, "the gate goes RED on a deliberate scope violation"):
  an undeclared platform profile (`undeclared-platform`), an undeclared content source (`undeclared-source`),
  a new widget host permission (`undeclared-host-permission`), and an installed widget with a `marketplace`
  author (`out-of-scope-widget-author`) are all flagged with the correct constraint id; a clean fixture (only
  declared values) and the real codebase pass clean; the audit is deterministic.
- **CI gate, live demonstration**: temporarily injecting an out-of-scope source `'notion'` into the live
  `REGISTERED_SOURCE_KINDS` registry and running `pnpm v2:gates` produced:
  - RED — `quality-gate check failed with 1 problem(s): [scope-constraint-violation]
    con-006:source/notion: [CON-006] Content source "notion" is registered but is not a declared in-scope
    source. A new top-level source requires an architecture-contract and requirements revision (CON-006).`
    and a non-zero exit code.
  - After reverting to the real registry, `pnpm v2:gates` returned GREEN (`quality-gate check passed: 7
    gate(s)…`). The registry file was restored cleanly (no residual diff).

## Demo path (programmatic — this is a governance constraint, no visible flow)

1. **CON-003 AC1 / CON-006 AC2**: `findScopeViolation({ featureClass: 'community-marketplace' })` →
   `out-of-scope-feature` (CON-003); `findScopeViolation({ featureClass: 'plugin-ecosystem' })` →
   `out-of-scope-feature` (CON-006). Adding `scopeRevision: '…'` makes it `null` (in scope by explicit revision).
2. **CON-003 AC2**: `findScopeViolation({ publicPluginApi: true })` → `public-plugin-api`.
3. **CON-003 AC3**: `isInScopeWidgetDistribution('workspace')` is `true`; `isInScopeWidgetDistribution('marketplace')`
   is `false`.
4. **CON-006 AC1**: `isDeclaredInScopeForAxis('cloud-backend', 'acme-cloud')` is `false`;
   `findScopeViolation({ newTopLevel: { axis: 'platform', value: 'watchos' } })` → `new-top-level-axis`. A
   value already declared in scope (e.g. `{ axis: 'source', value: 'obsidian-vault' }`) is `null`.
5. **Gate**: `pnpm v2:gates` runs `auditScopeBoundary()` and fails closed on any live-registry drift.

## Quality gates run (all green)

| Gate | Command | Result |
| --- | --- | --- |
| Core tests | `pnpm --filter @dndtools/v2-core test` | PASS — 179 files, 2740 tests (was 178/2701: +1 file, +38 tests + 1 prior carry) |
| Scope-constraints test (targeted) | `pnpm exec vitest run tests/con-scope-constraints.test.ts` | PASS — 1 file, 38 tests |
| App unit tests | `pnpm --filter @dndtools/v2-app test` | PASS — 13 files, 65 tests |
| Typecheck | `pnpm v2:typecheck` | PASS — core `tsc --noEmit` clean; app svelte-check 0 errors / 0 warnings (879 files) |
| Boundary lint | `pnpm v2:lint` | PASS — "v2 boundary lint passed" |
| Full ESLint (CI) | `pnpm lint` | PASS — eslint + navigation (132) + tokens (132) + repo audit (5 tests) |
| Docs validate (CI) | `pnpm docs:validate` | PASS — "docs validation passed" |
| Workpack validate | `pnpm v2:workpack:validate` | PASS — "v2 workpack validation passed" |
| Quality gates (incl. CON-003/006) | `pnpm v2:gates` | PASS — "quality-gate check passed: 7 gate(s)…"; RED on injected `notion` source (demonstrated above) |

**Playwright e2e: not run — intentionally skipped.** This epic touches only Processing-Core modules
(`con/scope-constraints.ts`, `index.ts`, `platform/quality-gates.ts`), a CI tooling script
(`scripts/quality-gates.ts`), a test, and generated planning files. No route, layout, `.svelte`, or
visible-flow file was changed, so the e2e suite is not affected.

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/con/scope-constraints.ts`
- `apps/v2/packages/core/tests/con-scope-constraints.test.ts`
- `docs/planning/v2/epics/CON-scope-constraints.completion.md` (this file)

Modified:
- `apps/v2/packages/core/src/index.ts`
- `apps/v2/packages/core/src/platform/quality-gates.ts`
- `scripts/quality-gates.ts`

Generated planning files (via `set-status` / `complete`, not hand-edited):
- `docs/planning/v2/epics/CON-scope-constraints.yaml`
- `docs/planning/v2/status.yaml`
- `docs/planning/v2/workpack-state.yaml`

## Known gaps / deferred

- None for CON-003 / CON-006. The constraint is enforced as a fail-closed scope-review detector
  (`findScopeViolation`) and a CI gate (`auditScopeBoundary` in `pnpm v2:gates`), and is covered by a vitest
  meta-test that proves both RED-on-violation and GREEN-on-real-codebase.
- Per ADR-014, v2 declares NO concrete AI provider, cloud backend, or public extension surface; the gate
  therefore fails closed on every candidate for those axes until the declared allowlist
  (`DECLARED_*` constants) is widened — which is itself the reviewable explicit scope/contract revision the
  constraints require. Widening any allowlist is a deliberate, reviewable change in the declared registry.

## Git evidence

- Branch: `epic/CON-scope-constraints` (based on `epic/CON-permission-sustainability-constraints` HEAD `0284887`).
- Implementation commit SHA: `__IMPL_SHA__` (`feat(v2): complete CON-scope-constraints epic`).
- Completion / regenerated-planning commit SHA: `__COMPLETE_SHA__`
  (`docs(v2): mark CON-scope-constraints complete`).

Final `git status --short` (after completion + clean slate — empty working tree):

```
(clean — no untracked or unstaged files)
```
