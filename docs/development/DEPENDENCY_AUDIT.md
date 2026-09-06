# Dependency Audit

Last reviewed: 2026-09-04

## Release posture

- `pnpm security:audit` (`--audit-level high`) is clean: zero high-severity advisories. It runs
  pnpm 11.4.0's bulk-advisory client because the registry retired the legacy endpoint used by the
  pinned pnpm 10 release/install toolchain.
- Two moderate advisories remain, both against `react-router` (open redirect via backslash in
  `<Link>`, arbitrary constructor injection), fixed only in the React Router 7 line. See
  Deliberate deferrals below; they are the same major-migration deferral already recorded for
  React 19/React Router 7.
- The locked graph installs with the release CI toolchain (`pnpm 10.34.5`) and the local pnpm 11
  toolchain. CI pins pnpm exactly and uses Node 24; local development requires Node 22.13+.
- Electron 43.1.0 and electron-builder 26.15.3 are the current releases on their selected lines.
  A Linux unpacked package and the desktop persistence/origin-migration smoke pass with this pair.
- Vite remains on the latest 7.x line (7.3.6). `@vitejs/plugin-react` 4.7.0 explicitly supports
  Vite 7; Vite 8/plugin-react 6 is a coordinated major migration, not a release patch.
- TypeScript is now 6.0.3 across every workspace package, including `@dndtools/cloud-fns` (was
  pinned to the 5.6 line and had drifted from the rest of the monorepo).
- The Android shell pins Capacitor core/Android/CLI to 8.4.2 and each official Capacitor plugin to an
  exact 8.x release in `apps/gm-react/package.json`. Native builds pin JDK 21, Android Gradle Plugin
  8.13.0, Gradle 8.14.3, and compile/target API 36.

## Changes applied in this audit

- Full `pnpm audit` (no severity floor) surfaced 25 advisories (12 high, 13 moderate) that a scoped
  `--audit-level high` run had been silently passing around: they are all transitive build-tooling
  dependencies (electron-builder's `ajv`/`fast-uri` and `js-yaml`, `vitest`/`jsdom`'s `undici`,
  eslint's `minimatch`/`brace-expansion`, `postcss`'s `nanoid`, `@capacitor/cli`/electron-builder's
  `tar`, and babel's `browserslist`), none of which had a direct-dependency release carrying the fix
  yet. Pinned every one via `pnpm-workspace.yaml` `overrides` (tightened the existing `fast-uri`,
  `brace-expansion`, `tar`, and `undici` entries, which were pinned to versions the newest
  advisories had since overtaken, and added `js-yaml`, `nanoid`, and `browserslist`).
- Bumped `react-router-dom` 6.28.0 → 6.30.5 (in-range patch fixing the moderate open-redirect/XSS
  advisory against the 6.30.2–6.30.4 window) and added `postcss`, `@xmldom/xmldom`, and
  `@humanfs/node` overrides for their respective moderate advisories.
- Aligned `@dndtools/cloud-fns`'s `typescript` devDependency from `^5.6.0` to `^6.0.3` to match
  every other workspace package.
- Updated Electron 43.0.0 → 43.1.0 and Dexie 4.4.3 → 4.4.4.
- Raised the plugin-react dependency floor to the installed Vite-7-compatible 4.7.0 release.
- Replaced Lucide's all-icons runtime record with an explicit reviewed glyph allowlist. This also
  fixed action names that previously rendered the generic square fallback.
- Added stable Vite chunks for the processing core, React, validation, storage, and authentication.
  The entry chunk fell from about 1.70 MB / 464 KB gzip to about 282 KB / 83 KB gzip, and production
  builds no longer emit mixed static/dynamic import or chunk-size warnings.
- Pinned pnpm 10.34.5 in the root package and every workflow so lockfile generation and CI installs
  do not drift by pnpm minor release.
- Added the tracked Capacitor Android project and exact native bridge dependencies. Dependabot now
  monitors the Gradle project separately, while native major updates require synchronized renderer,
  Gradle, plugin, emulator, and release-signing validation.

## Deliberate deferrals

- React 19, React Router 7 (needed to clear the two remaining moderate advisories above), Vite
  8/plugin-react 6, TypeScript 7, Lucide 1.x, and aws-jwt-verify 5 are major upgrades. Migrate each
  with its framework/API tests after this release rather than combining them with release hardening.
- Newly published Vitest, AWS SDK, ESLint, Prettier, globals, and typescript-eslint patches/minors are
  held by the dependency release-age policy. Re-evaluate after the quarantine window.
- `boolean`, `glob@7`, `inflight`, and `rimraf@2` are deprecated transitive build-time dependencies
  under electron-builder's packaging stack. They have no current advisory and no direct replacement
  in this workspace; remove them when electron-builder replaces that chain.

## Next audit actions

1. Run `pnpm security:audit`, `pnpm -r outdated`, production build, desktop smoke, an unpacked desktop package,
   Android Gradle unit/lint checks, and an API 36 APK install on every release candidate.
2. Schedule Electron patch upgrades promptly and Electron major upgrades before the selected major
   leaves upstream support.
3. Add a gzip-aware initial-load budget to `check-prod-bundle.mjs`; the new cache boundaries prevent
   a monolithic entry chunk, but the full statically imported startup graph is still roughly 372 KB
   gzip and needs architectural deferral work to reach the historical 100 KB target.
4. Periodically run a full, unscoped `pnpm audit` (not just `--audit-level high`) — the CI gate only
   fails on high severity, so moderate-and-below transitive advisories accumulate silently until
   someone reads the full report by hand.
