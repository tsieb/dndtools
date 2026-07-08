# Contributing Guide

Start here if you're new to the DND Tools codebase.

The repo is a pnpm monorepo. The primary app is `apps/gm-react` (Vite + React 18) on
the framework-free `packages/core`; cloud Lambdas live in `packages/cloud-fns` and AWS
infra in `infra/`.

---

## 1. Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Git
- (Optional, desktop shell work) nothing extra — `electron-builder` self-downloads Electron.

## 2. First-Run Setup

```bash
git clone <repo-url>
cd dndtools
pnpm install
pnpm dev            # React app dev server on http://localhost:5273
pnpm desktop:dev    # (optional) run inside the Electron desktop shell
```

## 3. What to Read First

**All contributors:**

- This file (you're here)
- `docs/GLOSSARY.md` — domain + architecture terminology
- `docs/development/DEVELOPMENT.md` — standards and boundaries
- `docs/development/GIT_WORKFLOW.md` — branch/commit/PR conventions
- `docs/development/VALIDATION.md` — the `pnpm validate` harness

**Architecture / data model:**

- `docs/architecture/ARCHITECTURE.md` — runtime topology (React renderer → command
  dispatch → framework-free core → Dexie/IndexedDB)

**UI work:**

- `docs/development/ACCESSIBILITY.md` — a11y requirements

**Planning work:**

- `docs/planning/PLANNING_TIERS.md` — the goal hierarchy
- `docs/planning/initiatives/README.md` — initiative map and vision

## 4. Development Workflow

`main` is the default branch. Branch off it for a unit of work:

```bash
git checkout main
git pull
git checkout -b <type>/<slug>
```

See `docs/development/GIT_WORKFLOW.md` for the branch/commit conventions.

## 5. Key Boundaries (Mandatory)

- `packages/core` is framework-free: it imports **no** React/DOM/Node/Electron/cloud
  code. This is lint-enforced by `scripts/boundary-lint.ts` (`pnpm lint:boundary`).
- All durable state changes go through core **commands** (`dispatchCommand`), never by
  mutating stored state directly.
- Reads go through **actor-scoped queries** so DM-private content never leaks to players.

Boundary violations fail CI.

## 6. Before Opening a PR

- [ ] `pnpm check` passes — quality gates + boundary lint + typecheck + tests
- [ ] `pnpm validate` passes — the whole-application validation harness
- [ ] New behavior has test coverage
- [ ] Relevant docs updated

## 7. Getting Help

- Engineering docs: `docs/`
- Architecture decisions: `docs/adr/` (the pivot to the React app is ADR-018)
- Issue tracker: GitHub Issues
