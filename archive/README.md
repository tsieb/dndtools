# archive/

Retired code kept in-tree for reference only. Nothing here is part of the active pnpm
workspace (`pnpm-workspace.yaml` globs `apps/*` + `packages/*`), so it does **not** install,
build, typecheck, lint, or gate CI. It is not maintained.

## `gm-svelte/` — the original SvelteKit GM app (`@dndtools/gm`)

The GM command platform was first built in SvelteKit / Svelte 5. As of the React pivot
(mid-2026) the project committed to the React app (`apps/gm-react`, `@dndtools/gm-react`) as the
primary and only maintained GM surface — it had reached feature parity and additionally carries
the cloud backend, P2P remote play, and the Electron desktop shell, none of which the Svelte app
had. The Svelte app was moved here rather than deleted so its ~88 Playwright e2e specs and unit
suite remain readable as a behavioral reference while the React test corpus is built up.

- **Last buildable state:** git tag **`svelte-gm-final`** (and the earlier `v1-final` for the
  pre-remake document editor).
- **Recover it:** `git checkout svelte-gm-final -- archive/gm-svelte` (or check out the tag).
- **Rationale:** see the ADR that promoted React to primary in `docs/adr/`.

Do not import from `archive/` in active code. The processing core (`packages/core`,
`@dndtools/core`) is framework-independent and is the shared contract for any GM surface,
Svelte or React.
