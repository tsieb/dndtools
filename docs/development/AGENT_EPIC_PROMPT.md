# Agent Prompt: Complete Epic X.X

Expert software engineer completing an epic for DND Tools. Prioritize correctness and architecture integrity. Minimize token waste — be direct in plans, commits, and output.

---

## 1. Read First

**Always read — no exceptions:**

1. `CLAUDE.md` — architecture boundaries, coding standards, prohibited patterns
2. The initiative file containing your epic (in `docs/planning/initiatives/I*-*.md`)
3. Every story under your epic in that file

**Read when your epic touches the domain:**

| Domain                     | Read                                                 |
| -------------------------- | ---------------------------------------------------- |
| Storage, system boundaries | `docs/architecture/ARCHITECTURE.md`, `DATA_MODEL.md` |
| UI styling                 | `docs/architecture/DESIGN_TOKENS.md`                 |
| Performance-sensitive code | `docs/development/PERFORMANCE.md`                    |
| Accessibility              | `docs/development/ACCESSIBILITY.md`                  |
| Test patterns              | `docs/development/TESTING.md`                        |

---

## 2. Plan

Before writing code, decompose the epic into tasks from its stories. For each story:

- List affected files — **read each one before modifying it**
- Flag boundary crossings: renderer ↔ Electron main ↔ MCP
- Flag storage contract changes → both adapters + migration required
- Flag IPC additions → Zod schema in `electron/ipc-schemas.ts` + security test required

---

## 3. Branch

**Two models exist.** Determine which applies:

```bash
# A) Epic within an initiative — branch from the initiative branch
git checkout initiative/<id>-<slug> && git pull
git checkout -b story/<epic-id>-<slug>
# PR targets the initiative branch → runs smoke CI only

# B) Standalone epic — branch from master
git checkout master && git pull
git checkout -b story/<epic-id>-<slug>
# PR targets master → runs full quality CI
```

One branch per epic. See `docs/development/GIT_WORKFLOW.md` for the full branch model.

---

## 4. Implementation

### Architecture Rules (non-negotiable)

These are the hard boundaries. `CLAUDE.md` is the full reference.

- **Renderer isolation:** No Node APIs. All data access through `StorageAdapter`.
- **IPC safety:** Every new channel needs a Zod schema in `electron/ipc-schemas.ts`.
- **MCP structure:** Tools in `mcp/tools/<domain>/`, registered in `mcp/tools/index.ts`.
- **Storage parity:** Contract changes update both `indexeddb-adapter.ts` and `mcp/storage.ts`.
- **Markdown pipeline:** All rendering through unified/remark/rehype. No manual parsing.
- **State management:** Svelte 5 runes classes in `src/lib/state/*.svelte.ts`.

### Code Quality

- **Strict TypeScript.** No `any`. No unjustified type assertions.
- **No file over 500 lines.** Extract co-located modules, child components, or domain helpers to stay under. This is lint-enforced.
- **Single-purpose modules.** Minimal surface area.
- **Nothing speculative.** No abstractions, error handling, validation, or features beyond what the story requires.

### Performance

Do not regress these — they are CI-enforced:

- **Bundle:** < 100KB gzipped initial JS. Lazy-load heavy modules (CodeMirror, graph, map canvas, encounter builder). Do not add weight to the critical path.
- **Runtime:** 7 budgets defined in `src/lib/types/diagnostics.ts` (cold start ≤ 3s, note open ≤ 200ms, search ≤ 150ms, etc.). See `docs/development/PERFORMANCE.md`.
- **Reactivity:** Prefer `$derived` over reactive chains that cause intermediate re-renders.

### Styling

Use semantic design tokens from `src/app.css`. See `docs/architecture/DESIGN_TOKENS.md`.

- **No raw color values** in components.
- **No structural `dark:` Tailwind prefixes** — theme presets handle dark mode via token overrides.
- **No arbitrary font sizes** (`text-[14px]`) — use the typography scale (`--text-sm`, etc.).

---

## 5. Testing

Every behavioral change needs a test. Match type to scope:

| Change                  | Test                                                     |
| ----------------------- | -------------------------------------------------------- |
| MCP tool                | Unit: success, validation failure, edge case             |
| Storage / data contract | Unit for both adapters; migration test if schema changes |
| IPC channel             | Security regression in `ipc-security.test.ts`            |
| UI behavior             | E2E in `tests/e2e/` or `tests/e2e-desktop/`              |
| Domain logic / state    | Vitest unit tests                                        |

### Automatic Gates

Git hooks run these — you do not need to invoke them manually:

- **Pre-commit:** `pnpm lint && pnpm format:check`
- **Pre-push:** `pnpm check` (lint + typecheck + unit tests)

If a hook fails, fix the issue. Never use `--no-verify`.

### Manual Pre-PR Checks

Run only for the domains your epic touched:

```bash
pnpm test:e2e        # UI behavior changes
pnpm desktop:build   # Electron / IPC changes
pnpm mcp:build       # MCP tool / resource changes
```

---

## 6. Documentation

Update alongside code — not after. Only when applicable:

- `ARCHITECTURE.md` or `DATA_MODEL.md` — structural changes
- `AGENTIC_NOTES_WORKFLOW.md` — MCP tool contract changes
- `CLAUDE.md` "Completed Epics" — add a concise epic summary when done
- `docs/adr/` — new ADR for significant architectural decisions

Verify the actual files before claiming they are current.

---

## 7. Commit and PR

**Commit format:** `<type>(<scope>): <imperative summary>`

- Types: `feat` `fix` `refactor` `test` `docs` `chore`
- Scopes: `mcp` `renderer` `electron` `storage` `ui` `ci`

Commit at story boundaries or cohesive behavior checkpoints. Do not batch an entire epic into one commit.

```bash
gh pr create \
  --title "<type>(<scope>): <summary> [Epic X.X]" \
  --base <initiative-branch-or-master> \
  --body "Epic X.X — <one-line summary>"
gh pr merge --auto --squash
```

You may merge your own PRs when CI is green. No human approval required.

---

## 8. Done When

- [ ] All stories implemented
- [ ] Tests passing (`pnpm check` green)
- [ ] No source file exceeds 500 lines
- [ ] Pre-PR checks run for affected domains
- [ ] Docs updated where applicable
- [ ] `CLAUDE.md` "Completed Epics" updated
- [ ] PR opened against correct base branch, CI green
