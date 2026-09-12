# Development

## 1. Setup

- Node.js 22.13+ and pnpm 10.34.5 (pinned in `package.json` and CI, which runs Node 24).
- Electron is optional; a packaged-app smoke run needs a display.
- Android needs JDK 21, Android SDK/API 36, build-tools 36.0.0, and the pinned Gradle 8.14.3
  wrapper. `pnpm check:android` runs without Java: it parses every Android XML file, checks the
  Gradle version contract against the package versions, and rejects related-exception multi-catches.
  A real `assembleDebug` still needs the toolchain in the [Android runbook](../runbooks/android-alpha.md).

```bash
pnpm install
pnpm dev            # React app on http://localhost:5273
pnpm desktop:dev    # the same app inside the Electron shell
```

Read next: [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md), [`GIT_WORKFLOW.md`](GIT_WORKFLOW.md),
[`TESTING.md`](TESTING.md), and [`../GLOSSARY.md`](../GLOSSARY.md). UI work also reads
[`ACCESSIBILITY.md`](ACCESSIBILITY.md) and [`../design/README.md`](../design/README.md).

## 2. Commands

| Command                   | Purpose                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `pnpm check`              | Android preflight + `gates` + boundary lint + typecheck + `pnpm test`      |
| `pnpm test:smoke`         | The fast local gate (~30s); run before every push                          |
| `pnpm validate`           | Whole-application harness; see [TESTING.md](TESTING.md)                    |
| `pnpm e2e`                | Playwright on desktop and mobile Chromium                                  |
| `pnpm a11y:gate`          | Contrast lints + axe gate                                                  |
| `pnpm lint`               | eslint + boundary lint + non-text contrast lint + the i18n literal rule    |
| `pnpm format:fix:changed` | Prettier on the maintained files this branch changed (never bare `format`) |
| `pnpm gates`              | The tiered quality-gate registry, including the 800-line file-size gate    |
| `pnpm feature-audit`      | Feature-inventory drift                                                    |
| `pnpm perf:capture`       | Measure the budgets; `perf:compare` grades them                            |
| `pnpm security:secrets`   | Committed-credential scan                                                  |
| `pnpm security:audit`     | `pnpm audit --audit-level high`                                            |
| `pnpm cloud:drift`        | CloudFormation drift for a stage                                           |
| `pnpm dashboard`          | Read-only project status page on 127.0.0.1:4990 (`scripts/dashboard/`)     |

Everything else is listed in the root `package.json`; per-package scripts live in
`apps/gm-react/package.json` and `packages/core/package.json`.

## 3. Boundaries

- `packages/core` imports no React, Svelte, DOM, Node, Electron, Capacitor, Android, or cloud APIs
  (zod only). Enforced by `scripts/boundary-lint.ts`.
- The renderer (`apps/gm-react/src`) imports no Node-only APIs; Electron code lives under
  `apps/gm-react/electron`, Android code under `apps/gm-react/android`.
- Feature code consumes `PlatformCapabilities` from `src/platform/capabilities.ts` and the typed
  preferences layer in `src/platform/preferences.ts`; it never probes native globals or reads
  `localStorage` directly. Remaining exceptions are allow-listed in
  `apps/gm-react/platform-access-exceptions.json`.
- Screens dispatch commands through `SceneRuntime.dispatch`; nothing mutates durable state directly.
  Persistence goes only through `src/platform/storage/coreStore.ts` (and the player-private
  `privateStore.ts`).
- Reads go through actor-scoped queries so DM-private content never reaches a player.
- Shared files (`commands/dispatch.ts`, `schemas/commands.ts`, `core/src/index.ts`, `app/nav.ts`)
  are append-only: add a delimited block, never reorder neighbours.

## 4. Coding rules

- TypeScript strict; avoid `any` (the remaining sites are in `app/compendium/*`).
- Single-purpose modules; no `.tsx` under `apps/gm-react/src` over 800 lines (the gate) with 500 as
  the target.
- Screens stay thin; business logic lives in core commands, reducers, and queries.
- Every user-visible string goes through `t()` with a key in `src/i18n/messages/en.ts` and a Spanish
  entry in `es.ts` in the same commit; the `local/no-literal-jsx-text` rule ratchets the allow-list.
- Persisted-shape changes bump the slice `schemaVersion` with a migration and test; prefer additive
  optional fields, because a bump breaks cloud-backup restore of older snapshots.
- Compose screens from `src/ds` components and semantic tokens; no raw hex, no emoji, Lucide icons
  only through the registry.

## 5. Definition of done

Behaviour implemented; tests added at the right layer; docs updated in the same change; no
boundary violation; lint, typecheck, and tests green; the affected e2e specs green on both
profiles; performance budgets not regressed; Android changes pass the runbook's Gradle and
emulator checks. State what you verified in the PR body.

Complete the [PR template's design conformance checklist](../../.github/pull_request_template.md#design-conformance),
which mirrors [RC roadmap §20.2](../planning/RC_ROADMAP.md#202-design-fidelity).
Include verification evidence and explain pending checks, non-applicable items, and deviations
with rationale; check only verified items.

## 6. Documentation rules

- Every behaviour claim maps to a real file path. Use exact tool, script, and type names.
- Do not present planned work as implemented. Planned work is `TODO(APP)` with what is missing,
  why it matters, an owner, a target, and a risk.
- Contract changes (types, transport, tools, storage format) update the doc in the same change;
  decisions that materially alter runtime boundaries, storage, security, or platform strategy get
  an ADR (`docs/adr/000-template.md`, index in `docs/adr/README.md`).
- Long-lived source TODOs map into [`../../DEBT.md`](../../DEBT.md).

## 7. Dependency policy

`pnpm security:audit` gates on high severity in CI; moderate transitive advisories accumulate
silently, so run an unscoped `pnpm audit` periodically and pin fixes through `pnpm-workspace.yaml`
`overrides`. Newly published patches are held by the release-age policy. Deliberately deferred
majors: React 19 and React Router 7 (which carry the two remaining moderate advisories), Vite 8 with
plugin-react 6, TypeScript 7, Lucide 1.x, aws-jwt-verify 5. Migrate each with its own typecheck,
build, and e2e run rather than folding it into release hardening. Native majors (Capacitor, AGP,
Gradle) need synchronized renderer, Gradle, emulator, and signing validation.
