# Project Structure

This repository is organized by runtime boundary and responsibility.

## Top-Level Layout

- `src/`: SvelteKit renderer application.
- `electron/`: Electron main/preload runtime.
- `mcp/`: MCP server runtime and tool/resource modules.
- `tests/`: cross-cutting test fixtures and e2e tests.
- `docs/`: architecture, data model, development, and roadmap docs.
- `docs/adr/`: architecture decision records and decision index.
- `static/`: static assets served by the renderer.
- `vault/`: local development vault data.

## Renderer (`src/lib`) Layout

- `src/lib/domain/`: pure domain logic (search, export, object transforms, templates).
- `src/lib/state/`: Svelte state stores.
- `src/lib/ui/`: reusable UI components.
- `src/lib/platform/desktop/`: desktop bridge integration.
- `src/lib/platform/storage/`: storage adapter integration.
- `src/lib/runtime/`: app bootstrap/runtime orchestration.
- `src/lib/markdown/`: markdown parsing/render pipeline.
- `src/lib/types/`: shared type contracts.
- `src/lib/utils/`: generic utilities.

## MCP Layout

- `mcp/tools/`: MCP tool modules grouped by domain (`notes`, `search`, `vault`, `boards`, `objects`).
- `mcp/tools/shared/`: MCP shared helpers.
- `mcp/resources/`: MCP resource modules.
- `mcp/resources/uri-strategy.ts`: canonical + legacy resource URI mapping.
- `mcp/resources/resource-catalog.ts`: discoverability metadata resource.
- `mcp/storage.ts`: filesystem storage implementation.
- `mcp/staged-storage.ts`: staged write-mode wrapper.

## Cleanup Rules

- Build artifacts (`build/`, `.svelte-kit/`, `mcp/dist/`) are generated and should not be committed.
- Local package store (`.pnpm-store/`) is ignored.
- Empty placeholder directories should be removed unless they are intentionally reserved with documentation.
