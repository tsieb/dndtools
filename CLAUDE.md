# CLAUDE.md — Agentic Development Guide

This file provides context and instructions for AI-assisted development on this project.

## Project Overview

**DND Tools** is a lightweight web application for organizing D&D campaign notes. Notes use markdown with Obsidian-style wikilinks (`[[note-name]]`) and bidirectional linking. The app must perform well on low-end devices.

- **Current phase**: Local-first architecture planning (target storage: browser IndexedDB via Dexie.js)
- **Future phases**: Cloud sync, shared notes, maps, player-specific features

## Tech Stack

| Layer          | Technology                | Notes                              |
| -------------- | ------------------------- | ---------------------------------- |
| Framework      | SvelteKit                 | Compiles to minimal JS, no runtime |
| Language       | TypeScript (strict mode)  | All source files must be `.ts`/`.svelte` |
| Styling        | Tailwind CSS v4           | Utility-first, purged in production |
| Markdown       | unified / remark / rehype | Extensible pipeline with custom plugins |
| Editor         | CodeMirror 6              | Same engine as Obsidian            |
| Local Storage  | IndexedDB via Dexie.js    | Structured local persistence       |
| MCP Server     | @modelcontextprotocol/sdk | AI agent access to the note vault  |
| Testing        | Vitest + Playwright       | Unit + E2E                         |
| Package Mgr    | pnpm                      | Strict, fast, disk-efficient       |
| Linting        | ESLint (flat config) + Prettier | Auto-fixable on save          |
| Build          | Vite (via SvelteKit)      | Fast HMR, tree-shaking             |

## Repository Structure

Current repository state is documentation-first. The tree below is the **target structure after Phase 0 scaffolding**.

```
dndtools/
├── CLAUDE.md                  # This file — agentic dev guide
├── docs/                      # Project documentation
│   ├── README.md              # Docs index, goals, and ownership rules
│   ├── ARCHITECTURE.md        # System design & component map
│   ├── TECH_STACK.md          # Technology choices & rationale
│   ├── DEVELOPMENT.md         # Dev standards, workflow, tooling
│   ├── UX_GUIDELINES.md       # UX principles & accessibility
│   ├── DATA_MODEL.md          # Data structures & storage
│   ├── ROADMAP.md             # Phased feature plan
│   └── TESTING.md             # Testing strategy
├── mcp/                       # MCP server (AI agent vault access)
│   ├── index.ts               # Server entry point
│   ├── tools.ts               # MCP tool handlers
│   ├── resources.ts           # MCP resource providers
│   ├── storage.ts             # FileSystemAdapter implementation
│   └── tsconfig.json          # Node.js-specific TS config
├── src/
│   ├── lib/                   # Shared library code
│   │   ├── components/        # Reusable Svelte components
│   │   ├── stores/            # Svelte stores (state management)
│   │   ├── utils/             # Pure utility functions
│   │   ├── markdown/          # Markdown pipeline & plugins
│   │   ├── storage/           # IndexedDB / storage abstraction
│   │   └── types/             # Shared TypeScript types
│   ├── routes/                # SvelteKit file-based routes
│   └── app.html               # HTML shell
├── static/                    # Static assets (fonts, icons)
├── tests/
│   ├── unit/                  # Vitest unit tests
│   └── e2e/                   # Playwright E2E tests
├── svelte.config.js
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .prettierrc
```

## Coding Standards

### TypeScript
- **Strict mode** is mandatory (`"strict": true` in tsconfig)
- Prefer `interface` over `type` for object shapes; use `type` for unions/intersections
- No `any` — use `unknown` and narrow with type guards
- All functions must have explicit return types (except trivial one-liners in components)
- Use `readonly` for properties that should not be mutated after creation
- Prefer `const` assertions and discriminated unions for state modeling

### Svelte Components
- One component per file, named in PascalCase (e.g., `NoteEditor.svelte`)
- Props should be typed (`export let` or `$props()`), and style should be consistent within a file
- Keep components under 150 lines — extract logic into stores or utils if growing
- Use Svelte stores for shared state; avoid prop drilling beyond 2 levels
- Reactive declarations (`$:`) should be simple — move complex logic into functions
- Prefer callback props in new Svelte 5 code; avoid mixing event patterns in the same component

### Styling
- Tailwind utility classes are the default styling approach
- Component-scoped `<style>` blocks only for complex/dynamic styles
- Never use inline `style` attributes except for truly dynamic values (e.g., computed positions)
- Responsive design: mobile-first breakpoints (`sm:`, `md:`, `lg:`)
- Dark mode: use Tailwind `dark:` variant; support system preference + manual toggle

### File & Naming Conventions
- **Files**: `kebab-case.ts` for modules, `PascalCase.svelte` for components
- **Functions/variables**: `camelCase`
- **Types/interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE` for true constants, `camelCase` for derived values
- **Test files**: co-located as `*.test.ts` or in `tests/` mirroring `src/` structure

### Imports
- Use `$lib/` alias for all imports from `src/lib/`
- Group imports: (1) external packages, (2) `$lib/` imports, (3) relative imports
- No circular imports — if two modules need each other, extract shared code

## Performance Constraints

This app MUST run well on low-end devices. Every decision should consider:

- **Bundle size**: Target < 100KB gzipped for initial load (JS + CSS combined)
- **No heavy dependencies**: Before adding any package, check its bundle size on bundlephobia.com. Reject anything > 20KB minified unless absolutely essential
- **Lazy loading**: Routes and heavy components (editor, graph view) must be code-split
- **Rendering**: Minimize DOM nodes. Virtualize any list > 50 items
- **Images**: Use modern formats (WebP/AVIF), lazy-load below the fold
- **Animations**: CSS-only where possible; use `will-change` sparingly; respect `prefers-reduced-motion`
- **Memory**: Clean up subscriptions, event listeners, and timers in `onDestroy`

## Key Architectural Decisions

1. **Storage abstraction layer**: All data access goes through `$lib/storage/` — never call IndexedDB directly from components. This enables future migration to cloud storage without touching UI code.

2. **Markdown pipeline**: The unified/remark/rehype pipeline in `$lib/markdown/` processes all note content. Custom plugins handle wikilinks, backlinks, and any future syntax extensions. Never parse markdown manually outside this pipeline.

3. **Offline-first**: The app must work fully offline. Treat network as an enhancement, not a requirement. When cloud sync is added, use optimistic updates with conflict resolution.

4. **Component composition over configuration**: Prefer many small, focused components over fewer large ones with many props/flags.

5. **MCP server for agentic access**: The MCP server (`mcp/`) provides AI agents structured access to the note vault via the Model Context Protocol. It uses a `FileSystemAdapter` (reads/writes markdown files on disk) and shares the service layer code with the web app. See `docs/ARCHITECTURE.md` for the full integration design.

## Common Tasks

### Adding a new route/page
1. Create `src/routes/[route-name]/+page.svelte`
2. Add any load logic in `+page.ts` (client-side) or `+page.server.ts`
3. Navigation uses SvelteKit's `<a>` tags or `goto()` from `$app/navigation`

### Adding a new remark/rehype plugin
1. Create plugin in `src/lib/markdown/plugins/`
2. Register it in the pipeline at `src/lib/markdown/pipeline.ts`
3. Add unit tests for the plugin's transform behavior

### Adding a new store
1. Create in `src/lib/stores/` with a descriptive name
2. Use Svelte's `writable`/`readable`/`derived` stores
3. Export a single store instance (singleton pattern)
4. If the store hydrates from storage, handle the async load gracefully

### Modifying the data model
1. Update types in `src/lib/types/`
2. Update Dexie schema + migration in `src/lib/storage/`
3. Update `FileSystemAdapter` in `mcp/storage.ts` if storage contracts change
4. Update any affected stores and components
5. Add/update tests covering the new shape

### Adding a new MCP tool
1. Define the tool schema in `mcp/tools.ts` (name, description, input schema)
2. Implement the tool handler, delegating to the `StorageAdapter` or service layer
3. Register the tool in the MCP server at `mcp/index.ts`
4. Add unit tests in `mcp/tools.test.ts`
5. Test interactively with `pnpm mcp:inspect`

### Adding a new MCP resource
1. Define the resource URI pattern in `mcp/resources.ts`
2. Implement the resource read handler
3. Register in the MCP server at `mcp/index.ts`
4. Add tests for resource retrieval

## Testing Requirements

- All utility functions in `$lib/utils/` must have unit tests
- All markdown plugins must have unit tests covering edge cases
- Storage layer must have integration tests
- New user-facing features should have at least one Playwright E2E test
- MCP tools and `FileSystemAdapter` must have unit/integration tests
- Run `pnpm test` before committing; CI will reject failing tests

## What NOT to Do

- Do NOT add React, Vue, Angular, or any non-Svelte UI framework
- Do NOT use `localStorage` for structured data — use the IndexedDB storage layer
- Do NOT import large utility libraries (lodash, moment). Write focused utilities or use smaller packages
- Do NOT add server-side dependencies to the web app (`src/`) — it is client-side only. Server-side dependencies belong in `mcp/` only
- Do NOT bypass the markdown pipeline with raw HTML injection
- Do NOT use global CSS classes — use Tailwind utilities or scoped styles
- Do NOT commit `.env` files, API keys, or credentials
- Do NOT add polyfills unless a specific browser target requires one and it is documented

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Branch naming: `feat/short-description`, `fix/short-description`
- Keep commits atomic — one logical change per commit
- Squash-merge feature branches into main

## AI Agent Instructions

When working on this project as an AI agent:

1. **Read before writing**: Always read existing files and documentation before making changes
2. **Follow the structure**: Place files according to the repository structure above
3. **Check bundle impact**: When adding dependencies, verify bundle size is acceptable
4. **Run tests**: Execute `pnpm test` after making changes
5. **One thing at a time**: Make focused, atomic changes rather than sweeping refactors
6. **Consult docs/**: Read relevant documentation files before implementing features
7. **Update docs**: If your changes affect architecture or data models, update the relevant docs
8. **Respect the storage abstraction**: Never bypass `$lib/storage/` for data operations
9. **Performance first**: If in doubt between a convenient approach and a performant one, choose performance
10. **Ask before adding dependencies**: Flag new package additions for review
