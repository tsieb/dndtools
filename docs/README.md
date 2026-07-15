# DND Tools Documentation

This docs set is the authoritative engineering reference for this repository.

## Scope

DND Tools is a canvas-first command platform for tabletop RPG play. The primary application is the
GM command platform (`apps/gm-react`, `@dndtools/gm-react`); a platform-independent processing core
(`packages/core`, `@dndtools/core`) holds command validation, reducers, permissions, and queries
and is shared by every surface. See [reference/PROJECT_STRUCTURE.md](reference/PROJECT_STRUCTURE.md)
and the [ADRs](adr/README.md) for the repository layout.

> **History.** The GM app was first built in SvelteKit; it is now maintained in React
> (`apps/gm-react`). The Svelte app is preserved at `archive/gm-svelte` (git tag `svelte-gm-final`).
> The earlier v1 document-editor (Electron desktop + Capacitor Android + MCP sidecar) was retired
> before the remake (tag `v1-final`). Some ADRs predate these pivots and describe older runtimes —
> they are kept as the decision record, not as current behavior; each carries a status banner.

---

## Quick Navigation

| You want to...                  | Start here                                                   |
| ------------------------------- | ------------------------------------------------------------ |
| Understand the system design    | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) |
| Onboard as a new contributor    | [CONTRIBUTING.md](CONTRIBUTING.md)                           |
| Look up a domain term           | [GLOSSARY.md](GLOSSARY.md)                                   |
| Read the product requirements   | [requirements/README.md](requirements/README.md)             |
| Find the design system + tokens | [design/README.md](design/README.md)                         |
| See the roadmap and initiatives | [planning/README.md](planning/README.md)                     |
| Check the data model            | [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md)     |
| Understand dev standards        | [development/DEVELOPMENT.md](development/DEVELOPMENT.md)     |
| Configure git workflow          | [development/GIT_WORKFLOW.md](development/GIT_WORKFLOW.md)   |
| Understand testing + validation | [development/TESTING.md](development/TESTING.md)             |
| Prepare a release or promotion  | [development/RELEASING.md](development/RELEASING.md)         |
| Look up a workspace script      | [development/SCRIPTS.md](development/SCRIPTS.md)             |
| Understand the security model   | [security/README.md](security/README.md)                     |
| Review architecture decisions   | [adr/README.md](adr/README.md)                               |

---

## Directory Map

```
docs/
├── README.md               — this file
├── GLOSSARY.md             — domain terminology
├── CONTRIBUTING.md         — onboarding guide
│
├── architecture/           — system design, data model, navigation contracts
├── requirements/           — the centralized product/feature/UX requirements set
├── design/                 — the design system: sources, tokens, icons, component package
├── development/            — dev standards, testing/validation, git, performance, a11y, scripts, ownership
├── planning/               — roadmap, planning tiers, and the initiative breakdown
├── security/               — threat model + the cloud security audits
├── reference/              — project structure, feature tiers, random tables
└── adr/                    — architecture decision records
```

---

## Documentation Quality Rules (Mandatory)

- Every behavior claim in docs must map to a real file path in the repo.
- Planned work must be marked as `TODO(APP)` and include: what's missing, why it matters, who owns it, target milestone, risk.
- Do not present aspirational behavior as if already implemented.
- When contracts change (types, transport, tools, storage format), update docs in the same change set.
- Use exact tool names, script names, and type names — never approximations.

---

## Current Product Baseline

- `apps/gm-react` (`@dndtools/gm-react`) is a browser-first Vite + React 18 application — the GM
  command platform. It owns rendering, platform services, remote-play transport, and command
  dispatch, and additionally ships an Electron desktop shell and LAN/cloud remote play.
- Renderer persistence uses a Dexie/IndexedDB storage adapter (`src/platform/storage/coreStore.ts`);
  the app never mutates durable state directly — all changes flow through commands into the core.
- `packages/core` (`@dndtools/core`) is platform-independent (no React, Svelte, DOM, Node, Electron,
  Capacitor, cloud, or app-runtime imports) and owns command validation, deterministic reducers,
  permission/visibility evaluation, actor-scoped queries, and the declared quality-gate, security,
  and source-of-truth registries. The boundary is enforced by `scripts/boundary-lint.ts`.
- Quality gates are a declared, owned, time-bounded registry in `@dndtools/core`, enforced by
  `scripts/quality-gates.ts` (`pnpm gates`) and run in CI.
- Accessibility is gated: non-text contrast lint (`pnpm a11y:contrast`) plus a Playwright axe gate
  (`apps/gm-react/tests/e2e/a11y-axe-gate.spec.ts`).
