# Tech Stack

This is the verified stack in the repository today.

## Runtime

- Electron 42 (`electron/` desktop shell)
- Capacitor 8 (`android/` native shell, shared renderer bundle)
- SvelteKit 2 + Svelte 5 (`src/` renderer)
- Node.js for MCP sidecar (`mcp/`)

## Build and Tooling

- TypeScript 6 (strict)
- Vite 8
- tsup (MCP and Electron bundling)
- Gradle 8 + Android SDK (Android APK builds)
- ESLint 10 flat config
- Prettier 3
- pnpm

## Styling and UI

- Tailwind CSS 4 (via `@tailwindcss/vite`)
- custom theme tokens in `src/app.css`
- `@lucide/svelte` for icon assets (plus inline SVG usage)

## Data and Persistence

- Desktop primary backend: filesystem markdown vault via `FileSystemAdapter`
- Android native backend: Capacitor Filesystem-backed `CapacitorStorageAdapter`
- Browser/PWA backend: Dexie-backed `IndexedDbStorageAdapter` over IndexedDB
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

## Implemented Stack Additions

- Automated accessibility checks: Playwright + axe integration in `tests/e2e-desktop/accessibility.spec.ts`; WCAG 2.1 AA CI gate active. See `docs/development/ACCESSIBILITY.md`.
- CI workflows enforce: lint/typecheck/unit tests, docs validation, desktop E2E critical workflows, and desktop build matrix.
- IPC storage dispatch uses explicit named channels with Zod payload schemas (`electron/ipc-schemas.ts`). Security regression tests in `electron/ipc-security.test.ts`.
