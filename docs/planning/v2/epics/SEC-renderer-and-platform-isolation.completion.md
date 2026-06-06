# Completion Evidence: SEC-renderer-and-platform-isolation

- Epic: `SEC-renderer-and-platform-isolation` — SEC: Renderer and platform isolation
- Requirements: SEC-001, SEC-007
- Git branch: `epic/SEC-renderer-and-platform-isolation` (chained off the prior tip `1e40b73`)
- Workpack status: `complete`

## Summary

This branch adds two small, pure, fail-closed Processing-Core isolation policies plus their adversarial
regression coverage, and registers both new isolation invariants in the SEC-008 regression-gate registry so
they can never silently lose their tests. It COMPOSES the existing infrastructure — the v2 boundary lint
(`scripts/v2-boundary-lint.ts`), the named-method platform-service allowlist
(`apps/v2/packages/core/src/platform/service-boundary.ts`), the prior epic's widget-exfiltration policy
(`evaluateWidgetOutboundRequest` / `isolateWidgetFailure`), the host-permission catalogue
(`ALL_HOST_PERMISSIONS`, default DENIED), and the SEC-008 boundary registry — and adds NO parallel
isolation framework, NO v1 runtime import, NO new durable-mutation path, and NO change to any route,
layout, Svelte component, or canvas runtime.

1. **Renderer isolation policy** (`apps/v2/packages/core/src/security/renderer-isolation.ts`, SEC-001) —
   - `FORBIDDEN_RENDERER_IMPORT_PREFIXES` / `isForbiddenRendererImport` declare the Node/filesystem/Electron/
     Capacitor/MCP/cloud import surfaces a sandboxed renderer may never reach. This is the single source of
     truth the boundary lint enforces mechanically (AC1).
   - `auditRendererChannelSurface` proves a renderer-facing channel exposes ONLY named, allowlisted
     platform-service methods and NO generic `invoke`/`send` passthrough — i.e. there is no generic IPC
     invoke channel a compromised renderer could drive (AC2).
   - `validateRendererWindowSecurity` / `isRendererWindowSecure` / `SECURE_RENDERER_WINDOW_CONFIG` validate a
     desktop renderer-window security configuration fail-closed: `contextIsolation` true, `nodeIntegration`
     false, `sandbox` true, preload exposes only explicit named APIs (AC3). ADR-014 defers the Electron
     shell itself; the policy is the release-security gate the shell will reuse unchanged.

2. **Constrained widget host API** (`apps/v2/packages/core/src/security/widget-host-api.ts`, SEC-007) —
   `resolveHostCapability` decides whether a host-API capability is available to custom widget code:
   a permission-gated capability (clipboard / network / asset / external-link / source-adapter / filesystem)
   is `undeclared` unless its declared host permission is approved (AC1: clipboard without the permission is
   unavailable); the storage-adapter / IPC / cloud-client / auth-token / platform-bridge / raw-vault-file /
   hidden-actor-data surfaces are ALWAYS `forbidden`, never grantable. `requestRawVaultFileAccess` rejects a
   raw vault-file read and composes `isolateWidgetFailure` so the failing widget is isolated while siblings +
   core stay alive (AC2). `requestWidgetNetwork` composes the prior `evaluateWidgetOutboundRequest` so an
   unapproved destination class is denied + audited and exfiltration is still blocked/redacted (AC3).

3. **Regression-gate registry extension** (`apps/v2/packages/core/src/security/regression-gates.ts`,
   SEC-008) — two new rows, `renderer-isolation` and `widget-host-api-constraint`, name their guard surfaces
   + dedicated coverage tests + requirement ids. The SEC-008 coverage meta-test drives them: a row whose
   guard export or test file is missing turns the gate RED, so the new isolation invariants cannot silently
   regress.

## Demo / verification path (programmatic — no visible UI surface)

This epic delivers pure Processing-Core security policy + boundary tooling; there is no new user-visible
screen. Reviewers verify it programmatically:

- `pnpm --filter @dndtools/v2-core test` — runs `security-renderer-isolation.test.ts` (SEC-001),
  `security-widget-host-api.test.ts` (SEC-007), and the updated `sec-regression-gate-coverage.test.ts`
  (SEC-008 now covers the two new boundaries).
- `pnpm --filter @dndtools/v2-app test` — runs `tests/unit/renderer-isolation-boundary.test.ts`, which drives
  the live `pnpm v2:lint` boundary lint and proves a renderer module importing `node:fs` / `electron` /
  `@modelcontextprotocol/sdk` fails the boundary (SEC-001 AC1 mechanical half).
- `pnpm v2:lint` — the live boundary lint passes against the real tree (no forbidden renderer import exists).
- `pnpm v2:gates` — the SEC-008 registry (now including the two new isolation boundaries) passes.

## Requirement coverage / traceability

### SEC-001 — renderer remains sandboxed (no Node/filesystem/arbitrary IPC/cloud/MCP reach)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| Renderer importing filesystem APIs → lint/build boundary violation fails | `FORBIDDEN_RENDERER_IMPORT_PREFIXES`, `isForbiddenRendererImport` (`security/renderer-isolation.ts`) + the live `scripts/v2-boundary-lint.ts` (`CORE_FORBIDDEN_PREFIXES`) | `apps/v2/app/tests/unit/renderer-isolation-boundary.test.ts` (node:fs / electron / MCP SDK each fail the lint; declared catalogue is a subset the lint enforces); `apps/v2/packages/core/tests/security-renderer-isolation.test.ts` (catalogue assertions) |
| Compromised renderer attempts arbitrary IPC → no generic invoke channel exists | `auditRendererChannelSurface`, `PLATFORM_SERVICE_METHODS` (named-method allowlist is the only channel) | `apps/v2/packages/core/tests/security-renderer-isolation.test.ts` (generic invoke flagged; unlisted method flagged; only `storage.*` named methods exist; no `invoke`/`send`) |
| Desktop renderer-window config: `contextIsolation` true, `nodeIntegration` false, `sandbox` true, preload only named APIs | `validateRendererWindowSecurity`, `isRendererWindowSecure`, `SECURE_RENDERER_WINDOW_CONFIG` | `apps/v2/packages/core/tests/security-renderer-isolation.test.ts` (each weakened field rejected; fully-insecure window yields all five violation codes; secure baseline passes) |

### SEC-007 — custom widget code runs in a constrained host API

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| Clipboard requested without declaring the permission → clipboard API unavailable | `resolveHostCapability` / `isHostCapabilityAvailable`, `PERMISSION_GATED_CAPABILITIES` (default-denied) | `apps/v2/packages/core/tests/security-widget-host-api.test.ts` (clipboard `undeclared` without permission, `available` with it; every gated capability default-denied; no privilege bleed) |
| Widget reads raw vault files → host rejects access and isolates the widget failure | `requestRawVaultFileAccess` (always `forbidden`) composing `isolateWidgetFailure` | `apps/v2/packages/core/tests/security-widget-host-api.test.ts` (read never granted; failing widget isolated; siblings + core remain available; raw-vault-file forbidden even with `filesystem` permission) |
| Widget requests network without an approved destination class → outbound APIs unavailable + audited | `requestWidgetNetwork` composing `evaluateWidgetOutboundRequest` | `apps/v2/packages/core/tests/security-widget-host-api.test.ts` (unapproved destination denied + audited; no `network` permission ⇒ denied; clean approved request allowed; hidden-actor-data still blocked on an approved destination) |
| (cross-cutting) storage-adapter / IPC / cloud-client / auth-token / platform-bridge / hidden-actor-data are never grantable | `FORBIDDEN_HOST_CAPABILITIES`, `resolveHostCapability` | `apps/v2/packages/core/tests/security-widget-host-api.test.ts` (every forbidden capability denied even for a fully-permissioned widget; no gating permission exists; audit never leaks the surface) |

### SEC-008 regression-gate registry (no-silent-regression proof)

- `apps/v2/packages/core/src/security/regression-gates.ts` adds `renderer-isolation` (SEC-001, SEC-008) and
  `widget-host-api-constraint` (SEC-007, SEC-008) rows.
- `apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts` now asserts the catalogue includes both
  new ids, proves each names a coverage-test file that exists on disk, and proves each names a live core
  export — so the new isolation invariants fail the gate RED if their guard or test is removed.

## Adversarial isolation tests added (and what each proves)

- **DOM/renderer escape denied** — a renderer/core module importing `node:fs`, `electron`, or the MCP SDK
  fails the boundary lint (`renderer-isolation-boundary.test.ts`); the renderer cannot import its way to the
  filesystem/IPC/native bridge.
- **Arbitrary IPC denied** — `auditRendererChannelSurface` flags any generic `invoke` passthrough and any
  unlisted method; only the `storage.*` named methods are reachable (`security-renderer-isolation.test.ts`).
- **Hardened shell required** — a renderer window with `contextIsolation` off / `nodeIntegration` on /
  `sandbox` off / a generic-invoke preload / an unlisted preload API is rejected, all violations reported at
  once (`security-renderer-isolation.test.ts`).
- **Cross-widget / platform pivot denied** — `resolveHostCapability` marks storage-adapter, IPC, cloud-client,
  auth-token, platform-bridge, raw-vault-file, and hidden-actor-data `forbidden` for a widget approved for
  EVERY host permission (`security-widget-host-api.test.ts`).
- **Direct storage / raw vault read denied + crash contained** — `requestRawVaultFileAccess` never grants the
  read and isolates the failing widget; siblings + core remain available (`security-widget-host-api.test.ts`).
- **Direct network denied + audited** — `requestWidgetNetwork` denies an unapproved destination class and a
  widget with no network permission, and still blocks hidden-actor-data exfiltration on an approved
  destination (`security-widget-host-api.test.ts`).
- **Undeclared capability denied** — clipboard (and every permission-gated capability) is unavailable until
  its declared host permission is approved, with no privilege bleed across permissions
  (`security-widget-host-api.test.ts`).

## Gates run

| Gate | Command | Result |
| --- | --- | --- |
| Core unit/integration/adversarial tests | `pnpm --filter @dndtools/v2-core test` | PASS — 166 files, 2436 tests |
| App unit tests | `pnpm --filter @dndtools/v2-app test` | PASS — 13 files, 65 tests |
| Type checks (core `tsc --noEmit` + app `svelte-check`) | `pnpm v2:typecheck` | PASS — 0 errors / 0 warnings (866 files) |
| Boundary lint | `pnpm v2:lint` | PASS — v2 boundary lint passed |
| Full ESLint + nav/token/repo audit (CI gate) | `pnpm lint` | PASS |
| Docs validation (CI gate) | `pnpm docs:validate` | PASS |
| Workpack validation | `pnpm v2:workpack:validate` | PASS |
| SEC/quality gate registry | `pnpm v2:gates` | PASS — 7 gate(s) owned, budgeted, wired |
| Playwright e2e (both projects) | `pnpm e2e` (apps/v2/app) | SKIPPED — see below |

### E2E justification (skipped)

The change is genuinely pure-core/tooling. The only files touched are Processing-Core source under
`apps/v2/packages/core/src/security/` + the public `index.ts` export barrel, core tests, ONE app **unit**
test under `apps/v2/app/tests/unit/`, and generated planning files. No route, `+page.svelte`,
`+layout.svelte`, Svelte component, `canvas-runtime`, platform adapter, or any visible/interactive flow file
was added or modified, so no Playwright-observable behavior changed. Per the epic's e2e guidance, e2e is
skipped for a pure-core/tooling change with no route/layout/Svelte/visible-flow file touched.

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/security/renderer-isolation.ts`
- `apps/v2/packages/core/src/security/widget-host-api.ts`
- `apps/v2/packages/core/tests/security-renderer-isolation.test.ts`
- `apps/v2/packages/core/tests/security-widget-host-api.test.ts`
- `apps/v2/app/tests/unit/renderer-isolation-boundary.test.ts`
- `docs/planning/v2/epics/SEC-renderer-and-platform-isolation.completion.md`

Modified:
- `apps/v2/packages/core/src/index.ts` (export the two new policies)
- `apps/v2/packages/core/src/security/regression-gates.ts` (two new SEC-008 boundary rows + doc)
- `apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts` (assert the two new boundary ids)
- `docs/planning/v2/epics/SEC-renderer-and-platform-isolation.yaml` (generated; status active→complete)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (status source of truth)

## Quality review

- **Correctness**: every SEC-001 and SEC-007 acceptance criterion is implemented and directly test-covered;
  every gate is fail-closed (least privilege by default, deny on any undeclared/forbidden access).
- **Architecture**: policy lives in the Processing Core (pure, deterministic, no DOM/storage/clock/entropy/
  network); enforcement seams (boundary lint, platform-service allowlist) are composed, not duplicated;
  obeys ADR-014 and the no-v1-runtime-import rule (boundary lint clean).
- **Security/permissions**: renderer cannot reach Node/filesystem/IPC/cloud/MCP; no generic invoke channel;
  hardened renderer-window config required; widget host API is least-privilege with forbidden platform
  surfaces never grantable; crashing/denied widget is isolated; outbound exfiltration still blocked/redacted.
- **Tests**: unit + adversarial + boundary coverage; the SEC-008 registry meta-test prevents silent
  regression of the new invariants.
- **Persistence / sync / offline**: unchanged — no durable-mutation, storage, or sync path touched; all
  policies are pure functions over plain data.
- **Accessibility / UX**: no visible surface added or changed.
- **Maintainability**: two cohesive, fully-documented modules; no speculative abstraction; no unrelated
  refactor.
- **Docs**: this completion file + module/registry doc comments updated; generated planning files
  regenerated through the workpack commands.

## Known gaps / deferred items

- The Electron shell itself remains deferred by ADR-014. SEC-001 AC3 is delivered as the pure release-security
  GATE (`validateRendererWindowSecurity`) that a future shell must pass; there is no live Electron
  `BrowserWindow` to assert against yet. When the shell lands, it should construct its window from
  `SECURE_RENDERER_WINDOW_CONFIG` and run the validator in its release checks.
- The widget host RUNTIME (the code that actually mounts widget modules and calls these gates) is likewise
  deferred; this epic delivers the constrained-host-API POLICY the runtime will call before exposing any
  capability. No widget host renders in the app today, so there is no e2e hostile-widget surface to drive.

## Git

- Branch: `epic/SEC-renderer-and-platform-isolation`
- Base: `1e40b73` (prior epic-chain tip)
- Commit SHA (feat): recorded in the follow-up `docs(v2): record commit SHA` commit.

### Final `git status --short`

```
(empty — clean working tree after commits; see the recorded SHA commit)
```
