# ADR-014: V2 Stack and Subproject Boundary

- Status: Superseded by ADR-016
- Date: 2026-06-03
- Deciders: Engineering
- Superseded-by: ADR-016 (2026-06-09), which retired the `apps/v2` quarantine, the `v2-` package
  names, and the v1-runtime import ban; and ADR-018 (2026-07-08), which reversed the React-rejecting
  rationale in the rejected-alternatives table.
- Amended by: ADR-019 (asset bytes in a content-addressed Dexie table lift the large-asset and
  `content.write-to-source` deferrals), ADR-021 (a client-side BYO-key transport lifts the AI
  provider deferral), ADR-028, ADR-029, ADR-030 (pointer notes; the boundary is unaffected).

## What still holds

This ADR scaffolded the remake as a SvelteKit app with a package-local processing core. The stack
choice was reversed, but three decisions remain the architecture:

1. **A hard processing/display boundary.** The core (now `packages/core`) owns command schemas,
   validation, deterministic reducers, state types, permission and visibility evaluation,
   actor-filtered queries, widget binding contracts, the operation-log shape, and deterministic
   dice, graph, map, and session algorithms, and imports no framework, DOM, Node, Electron,
   Capacitor, MCP runtime, or cloud SDK. The app owns rendering, platform services, the IndexedDB
   adapter, and dispatch wiring, and may not mutate durable state directly.
2. **Dexie over IndexedDB behind core-defined ports** for local-first persistence: versioned state
   documents, a durable operation log for accepted commands, schema metadata with safe defaults.
   OPFS and SQLite/WASM were deferred until large assets or relational pressure justified them;
   ADR-019 answered the asset question inside Dexie.
3. **Operation-shaped local records** (actor, target, revision, idempotency, dependency metadata)
   so later sync and collaboration had a seam, without choosing a CRDT or provider up front.
4. **Vitest for unit and contract tests, Playwright for browser automation** with desktop and
   compact-viewport projects and an axe policy.

The engine-free geometry renderer this ADR required for the first scene slice is upheld by ADR-024.
Everything it explicitly deferred (cloud crypto, transport, shells, MCP surface, custom widget
sandbox, map engine, migration) has since been decided by ADRs 015–038. The full original text,
including the framework evaluation table and the `apps/v2` acceptance criteria, is in git history.
