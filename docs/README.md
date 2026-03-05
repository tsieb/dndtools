# DND Tools Documentation

This docs set is the authoritative engineering reference for this repository.

## Scope

DND Tools is a local-first markdown vault application with shared renderer/domain logic
across Electron desktop and Capacitor Android runtimes.

Runtime modes:

- **Desktop**: Electron main + renderer + filesystem storage + MCP sidecar.
- **Android**: Capacitor shell + renderer + Capacitor filesystem adapter (no MCP sidecar).
- **Browser/PWA**: renderer + IndexedDB storage adapter + service worker cache (no MCP sidecar).

---

## Quick Navigation

| You want to...                | Start here                                                                 |
| ----------------------------- | -------------------------------------------------------------------------- |
| Understand the system design  | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)               |
| Onboard as a new contributor  | [CONTRIBUTING.md](CONTRIBUTING.md)                                         |
| Look up a domain term         | [GLOSSARY.md](GLOSSARY.md)                                                 |
| See the roadmap and epics     | [planning/initiatives/README.md](planning/initiatives/README.md)           |
| Check the data model          | [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md)                   |
| Understand dev standards      | [development/DEVELOPMENT.md](development/DEVELOPMENT.md)                   |
| Configure git workflow        | [development/GIT_WORKFLOW.md](development/GIT_WORKFLOW.md)                 |
| Understand testing strategy   | [development/TESTING.md](development/TESTING.md)                           |
| Work with MCP / AI agents     | [reference/AGENTIC_NOTES_WORKFLOW.md](reference/AGENTIC_NOTES_WORKFLOW.md) |
| Ship a release                | [operations/RELEASE.md](operations/RELEASE.md)                             |
| Review architecture decisions | [adr/README.md](adr/README.md)                                             |

---

## Directory Map

```
docs/
├── README.md               — this file
├── GLOSSARY.md             — domain terminology
├── CONTRIBUTING.md         — onboarding guide
│
├── architecture/           — system design, data model, security
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── TECH_STACK.md
│   └── SECURITY.md
│
├── development/            — dev standards, testing, git, performance, a11y
│   ├── DEVELOPMENT.md
│   ├── GIT_WORKFLOW.md
│   ├── TESTING.md          — includes E2E route coverage matrix
│   ├── PERFORMANCE.md
│   ├── ACCESSIBILITY.md
│   ├── UX_GUIDELINES.md
│   └── OWNERSHIP.md
│
├── planning/               — roadmap and initiative breakdown
│   ├── ROADMAP.md
│   ├── PLANNING_TIERS.md
│   └── initiatives/
│       ├── README.md       — vision, principles, initiative map
│       ├── I1-platform-foundation.md
│       ├── I2-engineering-excellence.md
│       ├── I3-core-knowledge-architecture.md
│       ├── I4-session-command-center.md
│       ├── I5-ai-creative-partnership.md
│       ├── I6-multi-platform-distribution.md
│       ├── I7-collaborative-infrastructure.md
│       ├── I8-extensibility-ecosystem.md
│       ├── I9-maps-spatial-intelligence.md
│       ├── I10-player-character-suite.md
│       ├── I11-atmosphere-audio-immersion.md
│       └── I12-community-content-ecosystem.md
│
├── operations/             — migrations, release, mobile, MCP testing
│   ├── SCHEMA_MIGRATIONS.md
│   ├── MCP_INSPECTOR_WORKFLOW.md
│   ├── RELEASE.md          — desktop + Android signing and sideload
│   └── MOBILE.md
│
├── reference/              — MCP tool contracts, random tables, repo layout
│   ├── AGENTIC_NOTES_WORKFLOW.md
│   ├── RANDOM_TABLES.md
│   └── PROJECT_STRUCTURE.md
│
└── adr/                    — architecture decision records
    ├── README.md           — ADR index
    ├── 000-template.md
    └── 001–010-*.md
```

---

## Documentation Quality Rules (Mandatory)

- Every behavior claim in docs must map to a real file path in the repo.
- Planned work must be marked as `TODO(APP)` and include: what's missing, why it matters, who owns it, target milestone, risk.
- Do not present aspirational behavior as if already implemented.
- When contracts change (types, IPC, tools, storage format), update docs in the same change set.
- Use exact tool names, script names, and type names — never approximations like "30+" when the actual count is known.

---

## Current Product Baseline (Verified)

- Notes are markdown files in a vault folder when running desktop mode.
- MCP runs as a sidecar process and defaults to staged write mode (pending approvals).
- Renderer uses runtime-selected `StorageAdapter`:
  Electron bridge (desktop), Capacitor filesystem (Android), Dexie/IndexedDB (browser PWA).
- Import/export includes Obsidian analyzer + conflict-aware import jobs with resumable checkpoints.
- Export supports portable markdown zip and deterministic git-friendly markdown zip with validation.
- MCP resources expose canonical versioned URIs under `dndtools://v1/*` with legacy aliases.
- Vault-intelligence tools provide campaign health, coverage gaps, stale-note APIs, and task bundles.
- 43+ MCP tools registered across notes, search, vault, boards, objects, dice, and random domains. See `mcp/tools/index.ts` for the canonical list.
- Accessibility: WCAG 2.1 AA — all 10 gap register items closed; CI gate active via `tests/e2e-desktop/accessibility.spec.ts`.
- IPC: explicit named channels with Zod payload schemas (`electron/ipc-schemas.ts`); security regression tests in `electron/ipc-security.test.ts`.
