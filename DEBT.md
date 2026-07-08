# Technical Debt Register

This file is the canonical debt register for long-lived refactors and deferred architectural work.

Last reviewed: 2026-07-08

## Entry Requirements

Each debt item must include:

- `ID`: stable identifier (for example `DEBT-2026-001`)
- `Severity`: `critical`, `high`, `medium`, or `low`
- `Impact`: concrete risk if deferred
- `Owner`: accountable maintainer
- `Resolution Window`: target quarter/date range
- `Targets`: concrete files/modules
- `Status`: `open`, `in_progress`, or `resolved`

## Active Debt Items

### DEBT-2026-001 — React app lacks a platform-preferences / capability layer

- `Severity`: medium
- `Impact`: The React GM app's GUI surface reads platform primitives (`localStorage`,
  `matchMedia`, `navigator.onLine`, `crypto.randomUUID`) directly instead of routing them through
  a typed platform layer (the analogue of the retired Svelte app's `src/lib/platform`). Each site
  is allow-listed in `apps/gm-react/platform-access-exceptions.json` (PLAT-006/012), so the
  boundary is explicit and owned, but the accesses remain scattered across GUI files.
- `Owner`: platform
- `Resolution Window`: 2026 Q3
- `Targets`: `apps/gm-react/src/app/AppShell.tsx` (matchMedia), `apps/gm-react/src/app/Onboarding.tsx`,
  `apps/gm-react/src/screens/{Settings,Upgrade}.tsx` (localStorage + navigator),
  `apps/gm-react/src/screens/{Board,SceneEditor}.tsx` (crypto.randomUUID idempotency keys).
- `Status`: open

### DEBT-2026-002 — React app carries `any` in runtime/view-model seams

- `Severity`: low
- `Impact`: ~128 `@typescript-eslint/no-explicit-any` sites remain from the design-package port.
  They lint as warnings (not errors), so they do not block the gate, but they weaken type safety
  at the runtime/dispatch and view-model boundaries.
- `Owner`: platform
- `Resolution Window`: 2026 Q4
- `Targets`: `apps/gm-react/src/**` (notably `Settings.tsx`, `Upgrade.tsx`, runtime + net view-models).
- `Status`: open

### DEBT-2026-003 — Port the Svelte E2E corpus to the React app

- `Severity`: high
- `Impact`: The archived Svelte app carried ~88 Playwright e2e specs across every surface. The React
  promotion ports the critical-path specs (collab, sync, canvas, permissions) plus the axe gate; the
  remaining surface coverage (content, maps, sessions, onboarding, navigation) is not yet ported, so
  regressions in those surfaces are caught only by the lighter `verify-*` smoke scripts.
- `Owner`: platform
- `Resolution Window`: 2026 Q3
- `Targets`: `apps/gm-react/tests/e2e/` (port from `archive/gm-svelte/tests/e2e/`).
- `Status`: open

## Usage Notes

- Reference debt IDs in PR descriptions when deferring architectural work.
- If a code comment uses `TODO(APP)` and remains unresolved for more than one quarter, add/update a
  debt entry here before merge.
