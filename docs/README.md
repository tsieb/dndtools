# DND Tools Documentation

This docs set is the authoritative engineering reference for this repository.

## Scope

DND Tools is a canvas-first command platform for tabletop RPG play. The primary application is the
GM command platform (`apps/gm`, `@dndtools/gm`); a platform-independent processing core
(`packages/core`, `@dndtools/core`) holds command validation, reducers, permissions, and queries
and is shared by every surface. See [reference/PROJECT_STRUCTURE.md](reference/PROJECT_STRUCTURE.md)
and [ADR-016](adr/016-promote-gm-app-and-monorepo-reorg.md) for the repository layout.

> The prior v1 document-editor (Electron desktop + Capacitor Android + MCP sidecar) has been
> retired; its last state is preserved at the git tag `v1-final`. Some ADRs predate the remake and
> describe v1 runtimes — they are kept as the decision record, not as current behavior.

---

## Quick Navigation

| You want to...                | Start here                                                                 |
| ----------------------------- | -------------------------------------------------------------------------- |
| Understand the system design  | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)               |
| Onboard as a new contributor  | [CONTRIBUTING.md](CONTRIBUTING.md)                                          |
| Look up a domain term         | [GLOSSARY.md](GLOSSARY.md)                                                  |
| See the roadmap and initiatives | [planning/initiatives/README.md](planning/initiatives/README.md)         |
| Check the data model          | [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md)                   |
| Understand dev standards      | [development/DEVELOPMENT.md](development/DEVELOPMENT.md)                    |
| Configure git workflow        | [development/GIT_WORKFLOW.md](development/GIT_WORKFLOW.md)                  |
| Understand testing strategy   | [development/TESTING.md](development/TESTING.md)                            |
| Look up a workspace script    | [development/SCRIPTS.md](development/SCRIPTS.md)                            |
| Review architecture decisions | [adr/README.md](adr/README.md)                                             |

---

## Directory Map

```
docs/
├── README.md               — this file
├── GLOSSARY.md             — domain terminology
├── CONTRIBUTING.md         — onboarding guide
│
├── architecture/           — system design, data model, security, navigation, design tokens
├── development/            — dev standards, testing, git, performance, a11y, scripts, ownership
├── planning/               — roadmap, planning tiers, and the I1–I21 initiative breakdown
│   ├── ROADMAP.md
│   ├── PLANNING_TIERS.md
│   └── initiatives/
├── reference/              — project structure, feature tiers, icon vocabulary, random tables
└── adr/                    — architecture decision records (000-template + 001–016)
```

---

## Documentation Quality Rules (Mandatory)

- Every behavior claim in docs must map to a real file path in the repo.
- Planned work must be marked as `TODO(APP)` and include: what's missing, why it matters, who owns it, target milestone, risk.
- Do not present aspirational behavior as if already implemented.
- When contracts change (types, IPC, tools, storage format), update docs in the same change set.
- Use exact tool names, script names, and type names — never approximations.

---

## Current Product Baseline

- `apps/gm` (`@dndtools/gm`) is a browser-first SvelteKit / Svelte 5 application — the GM command
  platform. It owns rendering, platform services, and command dispatch.
- Renderer persistence uses a Dexie/IndexedDB `StorageAdapter`; the app never mutates durable state
  directly — all changes flow through commands into the processing core.
- `packages/core` (`@dndtools/core`) is platform-independent (no Svelte, DOM, Node, Electron,
  Capacitor, cloud, or app-runtime imports) and owns command validation, deterministic reducers,
  permission/visibility evaluation, actor-scoped queries, and the declared quality-gate, security,
  and source-of-truth registries. The boundary is enforced by `scripts/boundary-lint.ts`.
- Quality gates are a declared, owned, time-bounded registry in `@dndtools/core`, enforced by
  `scripts/quality-gates.ts` (`pnpm gates`) and run in CI.
- Accessibility is gated: non-text contrast lint (`pnpm a11y:contrast`) plus a Playwright axe gate
  (`apps/gm/tests/e2e/a11y-axe-gate.spec.ts`).
