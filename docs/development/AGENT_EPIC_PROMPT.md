# Agent Prompt: Complete Epic X.X

You are an expert software engineer completing a specific epic for the DND Tools project. Think deeply before acting. Prioritize correctness, architecture integrity, and long-term maintainability over speed.

---

## 1. Orient Before You Act

**Read these files first — do not skip:**

- `CLAUDE.md` — authoritative architecture, boundaries, coding standards, and what not to do
- `docs/planning/initiatives/README.md` — guiding principles and vision
- `docs/planning/initiatives/` — find the initiative file containing Epic **X.X** (e.g., `I3-*.md`)
- `docs/architecture/ARCHITECTURE.md` and `DATA_MODEL.md` if your work touches storage or system boundaries

Within the epic file, locate Epic X.X and read every story under it. Understand the full scope before writing any code.

---

## 2. Plan Before Implementing

Decompose the epic into a concrete task list from its stories. For each story:

- Identify what files are affected — read them before modifying
- Identify runtime boundary crossings (renderer ↔ main ↔ MCP)
- Note any storage contract changes (require adapter + migration updates)
- Note any IPC additions (require schema + security validation)

Do not start implementing until you understand the full scope.

---

## 3. Branch Setup

```bash
git checkout master && git pull
git checkout -b story/<epic-id>-<story-id>-<slug>
```

Use one branch per story when stories are independent. Merge sequentially if they have dependencies.

---

## 4. Implementation Standards

**Architecture rules (non-negotiable):**

- Renderer must not use Node APIs — all data access goes through `StorageAdapter`
- New IPC channels require Zod schema validation in `electron/ipc-schemas.ts`
- MCP tools live under `mcp/tools/`, grouped by domain directories and registered in `mcp/tools/index.ts`
- Storage contract changes require both adapters updated: `src/lib/platform/storage/indexeddb-adapter.ts` and `mcp/storage.ts`
- All markdown rendering goes through the unified pipeline — never manual string parsing
- State in renderer uses Svelte 5 runes classes in `src/lib/state/*.svelte.ts`

**Code quality:**

- Strict TypeScript — no `any`, no type assertions without justification
- Single-purpose modules, minimal surface area
- No speculative abstractions — solve the problem at hand
- No backwards-compatibility shims for code only you changed
- Do not add error handling, validation, or features beyond what the story requires

---

## 5. Testing Requirements

Every behavioral change requires tests. Match test type to scope:

| Change type                | Required tests                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| MCP tool (new or modified) | Unit tests: success, validation failure, edge cases in files like `mcp/tools/notes/note-tools.test.ts` |
| Storage / data contract    | Unit tests for both adapters; migration test if schema changes                                         |
| IPC channel                | Security regression test in `ipc-security.test.ts`                                                     |
| UI behavior                | E2E test in `tests/e2e/` or `tests/e2e-desktop/` covering the critical path                            |
| Renderer service/state     | Vitest unit tests                                                                                      |

Run before every commit:

```bash
pnpm format          # enforce prettier (CI will reject failures)
pnpm check           # lint + typecheck + unit tests
```

Run before opening a PR:

```bash
pnpm test:e2e        # if UI behavior changed
pnpm desktop:build   # if electron/main or IPC changed
pnpm mcp:build       # if MCP tools/resources changed
```

---

## 6. Documentation Requirements

Update docs alongside code — not after. Required updates:

- `docs/architecture/ARCHITECTURE.md` or `DATA_MODEL.md` — if system structure changed
- `docs/reference/AGENTIC_NOTES_WORKFLOW.md` — if MCP tool contracts changed
- `CLAUDE.md` "Completed Epics" section — add the epic when all stories are done
- `docs/adr/` — add an ADR if a significant architectural decision was made

Do not claim docs are current without verifying the actual files.

---

## 7. Commit and PR

Commit format: `<type>(<scope>): <imperative summary>`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
Scopes: `mcp`, `renderer`, `electron`, `storage`, `ui`, `ci`

Commit at logical checkpoints — one story or one cohesive behavior per commit. Do not batch the entire epic into one commit.

```bash
gh pr create \
  --title "<type>(<scope>): <summary> [Epic X.X / SX.X.X]" \
  --base master \
  --body "Closes Epic X.X stories: ..."
gh pr merge --auto --squash
```

CI must be green before merging. Never bypass pre-commit or pre-push hooks.

---

## 8. Definition of Done

- [ ] All stories in the epic are implemented
- [ ] All required tests written and passing (`pnpm check`)
- [ ] E2E / build validation run where applicable
- [ ] Docs updated to reflect behavior changes
- [ ] `CLAUDE.md` "Completed Epics" updated
- [ ] PR merged to master with green CI
