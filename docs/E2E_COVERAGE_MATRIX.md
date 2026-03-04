# E2E Coverage Matrix

This matrix defines the critical desktop workflows covered by Playwright and the route-level expectations that must not regress.

## Scope

- Runtime: Electron desktop shell
- Runner: Playwright (`playwright.desktop.config.ts`)
- Critical suite: `tests/e2e-desktop/critical-workflows.spec.ts`
- Smoke suite: `tests/e2e-desktop/desktop-smoke.spec.ts`
- Performance suite: `tests/e2e-desktop/performance.spec.ts` (`@perf`, weekly)
- Memory suite: `tests/e2e-desktop/memory.spec.ts` (`@memory`, nightly)

## Route Coverage Matrix

| Route               | Covered workflows                                                               | Test evidence                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/`                 | Vault opens, app shell renders, first-run onboarding checklist is actionable    | `desktop-smoke.spec.ts`, `critical-workflows.spec.ts` ("vault opens and first-run onboarding is actionable")                    |
| `/notes`            | Notes listing and note-entry navigation                                         | `critical-workflows.spec.ts` ("note CRUD workflow", "wikilink navigation and search workflows")                                 |
| `/notes/[id]`       | Note viewer rendering and wikilink navigation                                   | `critical-workflows.spec.ts` ("wikilink navigation and search workflows")                                                       |
| `/notes/[id]/edit`  | Note create/update flow, object creation/embed flow                             | `critical-workflows.spec.ts` ("note CRUD workflow", "object creation workflow")                                                 |
| `/search`           | Search query execution and result rendering                                     | `critical-workflows.spec.ts` ("vault opens and first-run onboarding is actionable", "wikilink navigation and search workflows") |
| `/timeline`         | Chronological world/session timeline rendering with arc and participant filters | `critical-workflows.spec.ts` ("timeline route shows world events and linked session logs with filters")                         |
| `/settings?tab=mcp` | MCP pending-change review and approval lifecycle                                | `critical-workflows.spec.ts` ("MCP pending review approves staged changes from settings")                                       |
| `/session-board`    | Session board creation and note-tile management                                 | `critical-workflows.spec.ts` ("session board management creates board and attaches notes")                                      |
| `/encounter/new`    | Encounter builder route availability and encounter-tile creation flow           | `critical-workflows.spec.ts` ("encounter builder route renders and supports encounter tile creation")                           |

## Merge Blocking Policy

- Desktop critical workflows are enforced in CI (`.github/workflows/ci.yml`, job: `desktop-e2e-critical`).
- PR workflow also runs desktop critical E2E (`.github/workflows/e2e.yml`).
- Any failing covered workflow blocks green quality status.
