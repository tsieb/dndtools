# Tech Stack

This is the verified stack in the repository today.

## Runtime

- Electron 37 (`electron/` desktop shell)
- SvelteKit 2 + Svelte 5 (`src/` renderer)
- Node.js for MCP sidecar (`mcp/`)

## Build and Tooling

- TypeScript 5 (strict)
- Vite 7
- tsup (MCP and Electron bundling)
- ESLint 10 flat config
- Prettier 3
- pnpm

## Styling and UI

- Tailwind CSS 4 (via `@tailwindcss/vite`)
- custom theme tokens in `src/app.css`
- `lucide-svelte` for icon assets (plus inline SVG usage)

## Data and Persistence

- Desktop primary backend: filesystem markdown vault via `FileSystemAdapter`
- Shared contracts under `src/lib/types/*`

## Content and Search

- CodeMirror 6 for editing
- unified + remark + rehype for markdown pipeline
- rehype sanitize for rendered HTML safety
- MiniSearch for in-memory full-text search

## MCP

- `@modelcontextprotocol/sdk`
- tool modules under `mcp/tools/*`
- resources under `mcp/resources/*`
- staged changes mode via `mcp/staged-storage.ts`

## Testing

- Vitest (unit/integration)
- Playwright (e2e)
- testing-library for component-level tests when needed

## Current Stack Gaps

`TODO(APP):` Add automated accessibility checks (axe/Playwright integration).

`TODO(APP):` Add CI workflows to enforce lint/typecheck/test/e2e/build on pull requests.

`TODO(APP):` Review and reduce broad IPC dispatch pattern for stricter Electron security best practices.
