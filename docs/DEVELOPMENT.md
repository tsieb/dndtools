# Development Standards & Workflow

This document defines development standards, conventions, tooling configuration, and workflow practices for the DND Tools project.

---

## Environment Setup

### Prerequisites

| Tool       | Minimum Version | Install                                            |
| ---------- | --------------- | -------------------------------------------------- |
| Node.js    | 20.x LTS       | [nodejs.org](https://nodejs.org/) or `nvm install 20` |
| pnpm       | 9.x             | `corepack enable && corepack prepare pnpm@latest`  |
| Git        | 2.40+           | System package manager                             |

### Initial Setup

```bash
# Clone the repository
git clone <repo-url> dndtools
cd dndtools

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run all checks
pnpm check
```

### Recommended Editor: VS Code

**Extensions** (recommended; add to `.vscode/extensions.json` during Phase 0 scaffolding):

| Extension                       | Purpose                          |
| ------------------------------- | -------------------------------- |
| `svelte.svelte-vscode`          | Svelte language support          |
| `bradlc.vscode-tailwindcss`     | Tailwind IntelliSense            |
| `dbaeumer.vscode-eslint`        | ESLint integration               |
| `esbenp.prettier-vscode`        | Prettier integration             |
| `vitest.explorer`               | Vitest test runner               |
| `ms-playwright.playwright`      | Playwright test runner           |

**Settings** (recommended baseline for `.vscode/settings.json`):
```jsonc
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[svelte]": {
    "editor.defaultFormatter": "svelte.svelte-vscode"
  },
  "eslint.validate": ["javascript", "typescript", "svelte"],
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "files.exclude": {
    "node_modules": true,
    ".svelte-kit": true
  }
}
```

---

## Package Scripts

Target script set for Phase 0+ (`package.json`):

| Script              | Command                      | Description                          |
| ------------------- | ---------------------------- | ------------------------------------ |
| `pnpm dev`          | `vite dev`                   | Start dev server with HMR            |
| `pnpm build`        | `vite build`                 | Production build                     |
| `pnpm preview`      | `vite preview`               | Preview production build locally     |
| `pnpm test`         | `vitest run`                 | Run all unit tests once              |
| `pnpm test:watch`   | `vitest`                     | Run unit tests in watch mode         |
| `pnpm test:e2e`     | `playwright test`            | Run E2E tests                        |
| `pnpm lint`         | `eslint .`                   | Lint all files                       |
| `pnpm lint:fix`     | `eslint . --fix`             | Lint and auto-fix                    |
| `pnpm format`       | `prettier --write .`         | Format all files                     |
| `pnpm format:check` | `prettier --check .`         | Check formatting (CI)                |
| `pnpm typecheck`    | `svelte-kit sync && svelte-check` | TypeScript type checking       |
| `pnpm check`        | Runs lint + typecheck + test | Full pre-commit validation           |
| `pnpm bundle:analyze`| Custom script               | Analyze bundle size breakdown        |
| `pnpm mcp:dev`       | `tsx mcp/index.ts`           | Start MCP server in dev mode         |
| `pnpm mcp:build`     | `tsup mcp/index.ts`          | Build MCP server for distribution    |
| `pnpm mcp:inspect`   | `mcp-inspector mcp/index.ts` | Debug MCP tools in the MCP Inspector |

---

## Git Workflow

### Branch Strategy

**Trunk-based development** with short-lived feature branches:

```
main (protected)
  ├── feat/note-editor
  ├── feat/wikilink-parsing
  ├── fix/search-index-crash
  └── refactor/storage-layer
```

- `main` is always deployable
- Feature branches are created from `main` and merged back via PR
- Branches should be short-lived (< 3 days ideally)
- Delete branches after merging

### Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

**Types**:

| Type       | When to use                                        |
| ---------- | -------------------------------------------------- |
| `feat`     | New user-facing feature                            |
| `fix`      | Bug fix                                            |
| `refactor` | Code restructuring without behavior change         |
| `perf`     | Performance improvement                            |
| `test`     | Adding or updating tests                           |
| `docs`     | Documentation changes                              |
| `style`    | Formatting, missing semicolons (not CSS)           |
| `chore`    | Build config, dependency updates, tooling          |
| `ci`       | CI/CD pipeline changes                             |

**Scopes** (optional but encouraged):

`editor`, `viewer`, `storage`, `markdown`, `search`, `nav`, `ui`, `mcp`, `config`, `deps`

**Examples**:
```
feat(editor): add wikilink autocomplete on [[ trigger
fix(storage): handle IndexedDB quota exceeded error gracefully
refactor(markdown): extract wikilink plugin from pipeline config
perf(search): debounce search input to 200ms
test(storage): add integration tests for note CRUD operations
docs: update ARCHITECTURE.md with search service details
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make focused, atomic commits
3. Push branch and open a PR
4. PR must pass all CI checks: lint, typecheck, test, build
5. PR description should explain the "why" (not just the "what")
6. Squash-merge into `main`
7. Delete the feature branch

### Pre-commit Hooks (via Husky + lint-staged)

On every commit, automatically:
1. Run Prettier on staged files
2. Run ESLint on staged `.ts`, `.svelte`, `.js` files
3. Run a fast staged-file check only; run full `pnpm typecheck` in pre-push and CI

This catches issues before they reach CI.

---

## TypeScript Standards

### Configuration

The project uses TypeScript strict mode with additional safety checks. The full `tsconfig.json` is the source of truth, but key settings include:

- `strict: true` — enables all strict checks
- `noUncheckedIndexedAccess: true` — array/object index access returns `T | undefined`
- `noImplicitReturns: true` — all code paths must return
- `exactOptionalPropertyTypes: true` — distinguishes `undefined` from missing properties

### Type Patterns

**Discriminated unions for state modeling**:
```typescript
type NoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; note: Note }
  | { status: 'error'; error: Error };
```

**Branded types for IDs**:
```typescript
type NoteId = string & { readonly __brand: 'NoteId' };
type FolderId = string & { readonly __brand: 'FolderId' };

function createNoteId(id: string): NoteId {
  return id as NoteId;
}
```

**Readonly by default for stable domain data** (use mutable local drafts in editor-state code where needed):
```typescript
interface Note {
  readonly id: NoteId;
  readonly title: string;
  readonly content: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly tags: readonly string[];
  readonly folder: FolderId;
}
```

**Result types for operations that can fail**:
```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### Import Organization

Imports are grouped in this order, separated by blank lines:

```typescript
// 1. External packages
import { writable } from 'svelte/store';
import Dexie from 'dexie';

// 2. $lib/ aliased imports
import type { Note, NoteId } from '$lib/types/note';
import { storageAdapter } from '$lib/storage';

// 3. Relative imports
import { formatDate } from './helpers';
```

ESLint will enforce this ordering.

---

## Svelte Component Standards

### Component Structure

Every Svelte component follows this internal order:

```svelte
<!-- 1. Script block (TypeScript) -->
<script lang="ts">
  // Imports
  // Type definitions (local to component)
  // Props (`export let` or `$props()` based on chosen Svelte style)
  // Local state
  // Derived state ($:)
  // Lifecycle (onMount, onDestroy)
  // Event handlers
  // Helper functions
</script>

<!-- 2. Template (HTML) -->
<div class="...">
  <!-- markup -->
</div>

<!-- 3. Styles (scoped, only if Tailwind is insufficient) -->
<style>
  /* scoped styles */
</style>
```

### Component Size Limits

- **Target**: < 150 lines per component
- **Hard limit**: 250 lines. If a component exceeds this, it must be decomposed
- Extract logic into stores, utility functions, or child components

### Props & Events

```svelte
<script lang="ts">
  // Props with types and defaults
  export let title: string;
  export let isActive: boolean = false;
  export let variant: 'primary' | 'secondary' = 'primary';

  // Preferred event contract in Svelte 5 code
  export let onSelect: (payload: { id: string }) => void = () => {};
  export let onDelete: () => void = () => {};
</script>
```

### Accessibility in Components

Every interactive component must:
- Have appropriate ARIA roles and labels
- Support keyboard navigation (Enter/Space for buttons, Escape to close modals)
- Include focus management (trap focus in modals, return focus on close)
- Use semantic HTML elements (`<button>`, `<nav>`, `<main>`, not `<div onclick>`)

---

## CSS / Tailwind Standards

### Utility-First Approach

```svelte
<!-- Preferred: Tailwind utilities -->
<button class="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2">
  Save Note
</button>

<!-- Avoid: Custom CSS for basic styling -->
<style>
  .save-btn { /* ... */ }
</style>
```

### When to Use Scoped Styles

- Complex animations that need @keyframes
- Styles that depend on dynamic JavaScript values via CSS custom properties
- Highly specific selectors for third-party component overrides (e.g., CodeMirror theming)

### Responsive Design

Mobile-first breakpoints:

```
Default     → mobile (< 640px)
sm:         → small tablet (≥ 640px)
md:         → tablet / small laptop (≥ 768px)
lg:         → laptop (≥ 1024px)
xl:         → desktop (≥ 1280px)
```

Every layout must be usable at mobile width. Never hide critical functionality behind a breakpoint.

### Dark Mode

- Use Tailwind's `dark:` variant for all color changes
- Theme toggle stored in `ui` store and persisted to storage
- Respect `prefers-color-scheme` as the default
- D&D thematic: light mode = parchment/warm, dark mode = tavern/dark wood

---

## Error Handling Standards

### In Services & Utilities

```typescript
// Return Result types — don't throw from service functions
function parseNote(content: string): Result<ParsedNote> {
  try {
    const parsed = pipeline.process(content);
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
```

### In Stores

```typescript
// Stores expose loading/error state
const notesStore = writable<NoteState>({ status: 'idle' });

async function loadNote(id: NoteId): Promise<void> {
  notesStore.set({ status: 'loading' });
  const result = await storage.getNote(id);
  if (result.ok) {
    notesStore.set({ status: 'loaded', note: result.value });
  } else {
    notesStore.set({ status: 'error', error: result.error });
  }
}
```

### In Components

```svelte
{#if $noteState.status === 'loading'}
  <LoadingSpinner />
{:else if $noteState.status === 'error'}
  <ErrorMessage error={$noteState.error} onRetry={reload} />
{:else if $noteState.status === 'loaded'}
  <NoteViewer note={$noteState.note} />
{/if}
```

### Logging

- Use `console.error` for unexpected errors that need investigation
- Use `console.warn` for recoverable issues (e.g., missing optional data)
- Never use `console.log` in production code (strip via build config or lint rule)
- Consider a lightweight logging utility that respects a `LOG_LEVEL` environment variable

---

## Performance Standards

### Measurement

- Use Lighthouse CI to track performance scores per build
- Key metrics to monitor: FCP, LCP, TTI, TBT, CLS
- Bundle size tracked via `pnpm bundle:analyze` and CI warnings on size regressions

### Rendering

- Virtualize lists over 50 items (use a lightweight virtual list component)
- Debounce user input that triggers expensive operations (search: 200ms, save: 500ms)
- Use `requestAnimationFrame` for visual updates, `requestIdleCallback` for background work
- Avoid layout thrashing — batch DOM reads and writes

### Memory

- Clean up all subscriptions in `onDestroy`
- Use `WeakMap`/`WeakRef` for caches that should be garbage-collected
- Profile memory usage with Chrome DevTools when working on data-heavy features

### Network (future)

- All API calls should be cancellable (AbortController)
- Implement request deduplication for concurrent identical requests
- Cache aggressively with SWR (stale-while-revalidate) pattern

---

## Agentic Development Support

This project is designed for productive AI-assisted development at two levels:
1. **AI-assisted coding** — AI agents help build and maintain the codebase
2. **AI-assisted usage** — AI agents interact with the note vault via MCP to help with campaign planning and note management

### Documentation as Context

- `CLAUDE.md` at the root provides project-wide context for AI agents
- Each docs file is self-contained and can be fed as context independently
- Type definitions serve as machine-readable documentation of data shapes
- JSDoc comments on public APIs explain intent, not just mechanics

### Predictable Structure

- File-based routing makes page structure discoverable
- Consistent module organization (`components/`, `stores/`, `utils/`, etc.)
- Naming conventions eliminate ambiguity about what a file contains
- Barrel exports (`index.ts`) provide clean public APIs for each module

### Type Safety as Guard Rails

- Strict TypeScript catches errors that AI agents might introduce
- Discriminated unions prevent invalid state combinations
- Branded types prevent mixing up IDs of different entity types
- Exhaustive switch statements force handling of all cases

### Test Coverage as Verification

- AI agents should run `pnpm test` after making changes
- Tests serve as executable documentation of expected behavior
- Test failures provide specific feedback for course correction

### Small, Focused Modules

- Functions and modules are small enough to fit in AI context windows
- Single responsibility principle means changes are localized
- Clear interfaces between modules reduce the context needed to make changes

### MCP Server for Vault Access

The MCP server enables AI agents to work with the note vault directly:

- **Read notes**: Query, search, and read note content for context
- **Write notes**: Create and update notes (session recaps, NPC descriptions, location details)
- **Navigate links**: Traverse the wikilink graph to find related content
- **Manage tags**: Query tag indexes for vault organization

**Configuring the MCP server** in an AI tool:

```json
{
  "mcpServers": {
    "dndtools": {
      "command": "node",
      "args": ["path/to/dndtools/mcp/dist/index.js"],
      "env": {
        "VAULT_PATH": "path/to/vault"
      }
    }
  }
}
```

**Development workflow with MCP**:
1. Run `pnpm mcp:dev` to start the MCP server in dev mode
2. Use `pnpm mcp:inspect` to test tools interactively in the MCP Inspector
3. Connect your AI tool (Claude Code, Cursor, etc.) to the MCP server
4. AI agents can now read and write notes alongside you

---

## Dependency Management

### Adding Dependencies

Before adding a new package:

1. **Check bundle size** on [bundlephobia.com](https://bundlephobia.com)
2. **Check maintenance status** — last publish date, open issues, bus factor
3. **Check alternatives** — is there a lighter or more focused package?
4. **Check if it's needed** — can we write the functionality in < 50 lines?
5. **Document the decision** in a commit message or PR description

### Updating Dependencies

- Run `pnpm outdated` weekly to check for updates
- Update patch versions freely
- Update minor versions after checking changelogs
- Update major versions in dedicated PRs with testing

### Security

- Run `pnpm audit` regularly
- Address critical/high severity vulnerabilities immediately
- Use `pnpm overrides` for transitive dependency vulnerabilities when direct updates aren't available

---

## File Organization Patterns

### Feature-Based Organization

For new features that span multiple concerns (component + store + types), co-locate them:

```
src/lib/features/
  note-editor/
    NoteEditor.svelte          # Main component
    NoteEditorToolbar.svelte   # Sub-component
    editor-store.ts            # Feature-specific store
    editor-types.ts            # Feature-specific types
    editor-utils.ts            # Feature-specific utilities
    NoteEditor.test.ts         # Feature tests
```

### Shared Code Organization

Code used across multiple features lives in the shared directories:

```
src/lib/
  components/common/     # Reusable UI components (Button, Modal, etc.)
  stores/                # App-wide state stores
  utils/                 # Pure utility functions
  types/                 # Shared type definitions
  storage/               # Storage abstraction layer
  markdown/              # Markdown processing pipeline
```

### Index Files (Barrel Exports)

Each directory with multiple exports should have an `index.ts`:

```typescript
// src/lib/storage/index.ts
export { storageAdapter } from './adapter';
export type { StorageAdapter } from './types';
export type { Note, Folder } from './schema';
```

This provides a clean public API and allows internal restructuring without breaking imports.
