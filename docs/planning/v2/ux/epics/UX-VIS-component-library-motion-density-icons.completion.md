# Completion — UX-VIS-component-library-motion-density-icons

UX workpack status: `complete`

Epic: Component Library, Motion, Density, and Icons (phase "01 Foundations", P0).
Requirement coverage: UX-VIS-009 (iconography), UX-VIS-010 (motion), UX-VIS-011 (density).

## Summary

This foundational epic adds the shared, token-driven primitives later epics consume — without
reimplementing them per surface. It builds on epic 2's design tokens (consumed, never hardcoded):

1. **Iconography (UX-VIS-009).** A single curated Lucide registry
   (`apps/v2/app/src/lib/gui/icons.ts`) is the one place `@lucide/svelte` is imported, and a shared
   `Icon.svelte` primitive renders any glyph at a token-driven size with one accessibility rule
   (decorative => `aria-hidden`; meaningful =>
   `role="img"` + `aria-label`). Icon-size tokens (`--icon-size-micro..xl`, 2px stroke) live in the
   token layer. Status icons map each severity to a distinct shape so meaning survives a grayscale
   render; the DM-only cue uses `Eye`. An import gate forbids any non-Lucide icon library and
   restricts Lucide to the registry, killing the "icon soup" failure mode.
2. **Motion (UX-VIS-010 / A11Y-005).** A device-local `MotionStore` resolves a single motion
   preference with the documented precedence (user-explicit-off > OS-reduce > user-explicit-on >
   OS-no-preference) and writes `data-motion="full|reduced"` to `<html>`. CSS collapses every
   duration token to `0ms` under reduced/none, so no component needs its own
   `prefers-reduced-motion` query; a `:root:not([data-motion])` media fallback keeps the first paint
   safe pre-hydration. The OS probe stays behind the owned capability surface; `--easing-spring`
   stays reserved for dice/celebration.
3. **Density (UX-VIS-011).** A device-local, profile-linked `DensityStore` maps the resolved
   platform viewport class to `data-density` on `<html>`: Mobile/Tablet (compact/medium) lock to
   `comfortable` (>=44px targets); Desktop (expanded) defaults to `standard` and is user-overridable
   to `compact`/`comfortable`. Three `--density-*` token sets drive control sizing, including a
   focus-ring extent that stays >=40px even when the compact visual target shrinks to 28px. A stored
   Desktop preference resets to comfortable on a touch viewport and is restored on return.

Boot scripts in `app.html` apply both `data-motion` and `data-density` before first paint (no flash
/ no layout shift). All three are wired into the root layout; Settings gains a "Display preferences"
panel (Motion + Density radiogroups + an icon demo) as the visible demo surface. No surface
regresses to a document-list home.

## Demo path / surfaces

Open `/settings` and scroll to **Display preferences** (`data-testid="display-preferences"`):

- **Desktop** (expanded viewport, `data-density="standard"`):
  - **Motion** radiogroup — pick "Reduced motion" and every `--duration-*` token resolves to 0ms
    (animations become instant); "Active: …" + a polite live-region announcement update. Keyboard:
    arrow keys move/select (roving tabindex), Space/Enter selects, visible focus ring in every theme.
  - **Density** radiogroup — `data-can-override="true"`; pick "Compact" and `data-density` flips to
    `compact`, the icon-only button's target shrinks to 28px while `--density-focus-target` stays
    40px (focus ring extends past the visual target). "Comfortable" raises targets to 44px.
  - **Iconography** — an icon-only Search button exposes the accessible name "Search"; status chips
    (Saved / Unsynced / Failed / Local only / DM only) convey state via a distinct icon shape +
    visible text, never colour alone.
- **Tablet** (medium viewport): density locks to `comfortable`; the Density controls are present but
  `aria-disabled` with an explanatory note (no dead/silent control).
- **Mobile** (compact viewport, Pixel 5): `data-density="comfortable"`, `data-can-override="false"`,
  icon-only button min-height resolves to 44px. Same Must-have controls, profile-appropriate surface.

Demonstrable artifacts:

- `pnpm --filter @dndtools/v2-app exec vitest run tests/unit/motion-store.test.ts tests/unit/density-store.test.ts tests/unit/icon-registry.test.ts tests/unit/icon-import-gate.test.ts tests/unit/vis-motion-density-icons-tokens.test.ts`
- `pnpm --filter @dndtools/v2-app exec playwright test display-preferences` (both projects).

## Requirement coverage / traceability

| Requirement | How satisfied | Evidence |
|---|---|---|
| UX-VIS-009 (Lucide-only registry; size tokens; icon-only a11y name; non-colour status cue; no-mix gate) | `icons.ts` registry (single Lucide import point) + `Icon.svelte` (`resolveIconA11y` decorative/meaningful rule); `--icon-size-*` + `--icon-stroke-width` tokens; status→distinct-shape map; DM-only = Eye | `icon-registry.test.ts` (registry/a11y/status-shape/nav-id traceability), `icon-import-gate.test.ts` (AC3: no non-Lucide libs, Lucide only in registry), `vis-motion-density-icons-tokens.test.ts` (size tokens), e2e `display-preferences` UX-VIS-009 (accessible name + non-colour status) |
| UX-VIS-010 (single resolved motion preference; precedence; reduced-motion contract; data-motion) | `motion.svelte.ts` `resolveMotion` precedence ladder + `MotionStore` (persist/apply/announce, live OS tracking); `[data-motion=reduced|none]` zeroes durations; `:root:not([data-motion])` OS fallback; boot script; `MotionSelector.svelte` | `motion-store.test.ts` (AC1 OS-reduce, AC2 explicit-off survives OS change, AC3 spring reserved via token test, precedence cases), `vis-…-tokens.test.ts` (duration collapse + fallback + spring), e2e `display-preferences` UX-VIS-010 (0ms + resolved=applied) |
| UX-VIS-011 (three density modes; profile-linked; Desktop override; touch ≥44px; compact focus ≥40px) | `density.svelte.ts` `resolveDensity` (touch viewports lock to comfortable) + `DensityStore` (override persist + reset/restore); `:root`/`[data-density=comfortable|compact]` token sets; boot script; `DensitySelector.svelte` | `density-store.test.ts` (AC1 mobile comfortable+lock, AC2 covered via focus token, AC3 reset-on-touch then restore), `vis-…-tokens.test.ts` (44px comfortable / 40px compact focus / icon-size), e2e `display-preferences` UX-VIS-011 (data-density per profile, 44px mobile, 28px+40px-focus compact desktop) |

## Actor-safety / no-leak evidence

- This epic is presentation infrastructure: no data queries, no actor-conditional content rendering.
  The icon registry **defines** a DM-only cue (`Eye` + `--color-dm-only-badge`) for later
  content/canvas epics to consume; it renders no hidden DM-only content here.
- The full Playwright suite — including every player/observer no-leak spec — passed unchanged on
  both profiles after the shared-shell (`+layout.svelte`, `app.html`) and `/settings` changes,
  confirming the new `data-motion`/`data-density` attributes and boot scripts altered no
  actor-filtered behaviour.
- Motion and density preferences are device-local (Contract 1; localStorage behind owned, declared
  `platform-access-exceptions.json` entries) and never enter the vault or sync stream.

## Tests / gates run

- `pnpm v2:ux-workpack:validate` — PASS (run after `complete`).
- `pnpm docs:validate` — PASS.
- `pnpm lint` (eslint + lint:navigation + **lint:tokens** + audit:repo) — PASS.
- `pnpm v2:lint` (platform/boundary lint) — PASS (new `motion-preference` + `density-preference`
  localStorage exceptions added and verified by `boundary-lint.test.ts` real-repo baseline).
- `pnpm tokens:contrast` — PASS (96 pair checks across 5 themes; unaffected).
- `pnpm --filter @dndtools/v2-core typecheck` — PASS (0 errors).
- `pnpm --filter @dndtools/v2-app typecheck` (svelte-check) — 0 errors / 0 warnings (4556 files).
- `pnpm --filter @dndtools/v2-app test` — PASS (132 tests incl. 42 new across 5 new files).
- `pnpm --filter @dndtools/v2-app exec playwright test` — PASS on **desktop-chromium** and
  **mobile-chromium**: 531 passed, 21 profile-conditional skips, 0 failures (baseline 525 + 6 new).

## Quality review summary

- Correctness/architecture: stores follow the established device-local platform-store pattern
  (theme/nav-history); resolution logic is pure + unit-tested; density consumes the resolved
  platform profile (no viewport sniffing in feature code); one icon family via one registry.
- Tests: non-vacuous — the import gate fails closed on any non-Lucide icon import; the token test
  fails on a missing/changed duration or density value; the precedence tests cover every branch.
- Accessibility: radiogroups with keyboard parity + visible focus ring + live announcements;
  reduced-motion contract; icon-only accessible names; non-colour status cues; >=44px touch targets
  on touch profiles; >=40px focus extent in compact.
- Performance/persistence/offline: no-flash boot scripts, instant attribute swaps, localStorage-only
  persistence, fully offline (Lucide glyphs are bundled SVG components — no network).
- Security/permissions: no actor-conditional logic; DM-only cue defined for later epics only.
- Maintainability/docs: heavily commented stylesheet sections + stores keyed to requirement IDs;
  `@lucide/svelte` declared in `apps/v2/app/package.json` (offline-installed, scoped lockfile diff).

## Known gaps / deferred

- **Global-nav icon rendering is intentionally out of scope.** The registry keys mirror
  `navigation-registry.yaml` icon ids (traceability test enforces coverage) so the phase-02 shell
  epic `UX-SHELL-route-layout-and-platform-profiles`, which owns the nav surfaces (architecture
  decisions §8 follow-up), renders them through this primitive. Adding icons to the shared primary
  nav now would risk unrelated e2e hit-testing; deferring keeps the foundation clean.
- **Density font-size reduction** is defined as a token (`--density-font-size`) for later consumers
  but not yet applied to body copy in component CSS (the existing font-size token test restricts
  component `font-size` to `--text-*`); the testable density ACs (touch target, focus extent,
  icon size, nav height) are fully wired and consumed.
- **Web fonts** remain system-fallback-first (deliberate, ADR-014 local-first) — unchanged here.

## Git evidence

- Branch: `ux/UX-VIS-component-library-motion-density-icons` (off chain tip
  `ux/UX-VIS-design-tokens-themes-and-brand`, HEAD `02da546`).
- Commit: recorded in the orchestrator handoff (committed after this evidence file and the
  regenerated UX state).

Final `git status --short` (pre-commit snapshot):

```
 M apps/v2/app/package.json
 M apps/v2/app/platform-access-exceptions.json
 M apps/v2/app/src/app.html
 M apps/v2/app/src/lib/platform/capabilities.ts
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/settings/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M docs/planning/v2/ux/epics/UX-VIS-component-library-motion-density-icons.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M pnpm-lock.yaml
?? apps/v2/app/src/lib/gui/DensitySelector.svelte
?? apps/v2/app/src/lib/gui/Icon.svelte
?? apps/v2/app/src/lib/gui/MotionSelector.svelte
?? apps/v2/app/src/lib/gui/icons.ts
?? apps/v2/app/src/lib/platform/density.svelte.ts
?? apps/v2/app/src/lib/platform/motion.svelte.ts
?? apps/v2/app/tests/e2e/display-preferences.spec.ts
?? apps/v2/app/tests/unit/density-store.test.ts
?? apps/v2/app/tests/unit/icon-import-gate.test.ts
?? apps/v2/app/tests/unit/icon-registry.test.ts
?? apps/v2/app/tests/unit/motion-store.test.ts
?? apps/v2/app/tests/unit/vis-motion-density-icons-tokens.test.ts
?? docs/planning/v2/ux/epics/UX-VIS-component-library-motion-density-icons.completion.md
```
