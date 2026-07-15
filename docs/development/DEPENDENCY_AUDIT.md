# Dependency Audit

Last reviewed: 2026-07-14

## Release posture

- `pnpm audit` reports zero known vulnerabilities across 722 runtime, development, and optional
  dependencies.
- The locked graph installs with the release CI toolchain (`pnpm 10.34.5`) and the local pnpm 11
  toolchain. CI pins pnpm exactly and uses Node 24; local development requires Node 22.13+.
- Electron 43.1.0 and electron-builder 26.15.3 are the current releases on their selected lines.
  A Linux unpacked package and the desktop persistence/origin-migration smoke pass with this pair.
- Vite remains on the latest 7.x line (7.3.6). `@vitejs/plugin-react` 4.7.0 explicitly supports
  Vite 7; Vite 8/plugin-react 6 is a coordinated major migration, not a release patch.

## Changes applied in this audit

- Updated Electron 43.0.0 → 43.1.0 and Dexie 4.4.3 → 4.4.4.
- Raised the plugin-react dependency floor to the installed Vite-7-compatible 4.7.0 release.
- Replaced Lucide's all-icons runtime record with an explicit reviewed glyph allowlist. This also
  fixed action names that previously rendered the generic square fallback.
- Added stable Vite chunks for the processing core, React, validation, storage, and authentication.
  The entry chunk fell from about 1.70 MB / 464 KB gzip to about 282 KB / 83 KB gzip, and production
  builds no longer emit mixed static/dynamic import or chunk-size warnings.
- Pinned pnpm 10.34.5 in the root package and every workflow so lockfile generation and CI installs
  do not drift by pnpm minor release.

## Deliberate deferrals

- React 19, React Router 7, Vite 8/plugin-react 6, TypeScript 7, Lucide 1.x, and aws-jwt-verify 5 are
  major upgrades. Migrate each with its framework/API tests after this release rather than combining
  them with release hardening.
- Newly published Vitest, AWS SDK, ESLint, Prettier, globals, and typescript-eslint patches/minors are
  held by the dependency release-age policy. Re-evaluate after the quarantine window.
- `boolean`, `glob@7`, `inflight`, and `rimraf@2` are deprecated transitive build-time dependencies
  under electron-builder's packaging stack. They have no current advisory and no direct replacement
  in this workspace; remove them when electron-builder replaces that chain.

## Next audit actions

1. Run `pnpm audit`, `pnpm -r outdated`, production build, desktop smoke, and an unpacked package on
   every release candidate.
2. Schedule Electron patch upgrades promptly and Electron major upgrades before the selected major
   leaves upstream support.
3. Add a gzip-aware initial-load budget to `check-prod-bundle.mjs`; the new cache boundaries prevent
   a monolithic entry chunk, but the full statically imported startup graph is still roughly 372 KB
   gzip and needs architectural deferral work to reach the historical 100 KB target.
