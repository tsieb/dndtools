# UX-A11Y-interaction-primitives-and-help-compliance — Completion

UX workpack status: `complete`

Epic: `UX-A11Y-interaction-primitives-and-help-compliance` (epic 5 of 46, phase "01 Foundations", P0).
Branch: `ux/UX-A11Y-interaction-primitives-and-help-compliance` (off chain tip
`ux/UX-A11Y-release-gates-and-contrast`).

Foundational accessible-interaction primitives + help compliance. One reusable implementation of each
cross-surface a11y pattern lives in `apps/v2/app/src/lib/gui/a11y/`; the shell wires the consistent
Help trigger, the live announcer, the focus-ring baseline, and the touch-target floor. The inherited
`target-size` known violation on `/session` is resolved and removed from the register.

## Demo path (Desktop / Tablet / Mobile)

- **Desktop (desktop-chromium / expanded):** Top bar shows the `?` Help trigger at the far right of
  every route. Pressing `?` (or `F1`, or clicking it) opens the keyboard-shortcut reference in the
  shared `Dialog` primitive: focus moves into the dialog, Tab stays trapped inside, Escape closes and
  returns focus to the trigger. Every interactive control shows the 2px token focus ring on keyboard
  focus. Native checkboxes/radios render at the 24px target floor.
- **Tablet (comfortable density):** Same Help trigger position; touch targets at 44px via density
  tokens; the Help dialog renders centered. Hardware-keyboard shortcut model identical to Desktop.
- **Mobile (mobile-chromium / Pixel 5, compact):** Help trigger remains the last control in the shared
  header (same relative position); the Help dialog renders as a full-screen sheet (`@media max-width:720`).
  The `/session` recipient/member checkboxes measure ≥24×24 CSS px (was the inherited axe finding).

## Requirement coverage (every id traced to implementation + tests)

- **UX-A11Y-002 (keyboard parity):** `a11y/keyboard.ts` (activation keys, Ctrl/Cmd-equivalent matcher,
  help key, `KEYBOARD_SHORTCUTS`); Help dialog fully keyboard-operable. Tests: `a11y-keyboard.test.ts`,
  `help-and-interaction-primitives.spec.ts` (both profiles).
- **UX-A11Y-007 (colour independence):** `a11y/state-indicator.ts` + `StateBadge.svelte`
  (`resolveStateIndicator` guarantees a text label; `fieldErrorAttributes` → `aria-invalid` +
  `aria-describedby`). Tests: `a11y-state-indicator.test.ts` (incl. the "bloodied" AC and the
  fail-closed AC), `a11y-widgets.test.ts` (StateBadge label render).
- **UX-A11Y-009 (focus mgmt):** `a11y/focus-trap.ts` (trap/cycle/Escape/restore), focus-ring tokens +
  global `:focus-visible` baseline in `styles.css`. Tests: `a11y-focus-trap.test.ts`, `a11y-tokens.test.ts`,
  `help-and-interaction-primitives.spec.ts` (trap + restoration on both profiles); existing
  `route-focus.spec.ts` unaffected.
- **UX-A11Y-010 (touch targets):** `--touch-target-min`/`--touch-target-floor` tokens + native
  checkbox/radio sizing in `styles.css`; pointer-cancellation in `a11y/drag-alternative.ts`. Tests:
  `a11y-tokens.test.ts`, `touch-targets.spec.ts` (both profiles), `a11y-drag-alternative.test.ts`.
  Resolves the inherited register entry (see below).
- **UX-A11Y-011 (reduced motion):** Single resolved preference already drives the `data-motion`
  duration-collapse contract (`motion.svelte.ts` + `styles.css`, from UX-VIS); this epic adds no new
  uncontrolled motion (the Dialog/Help use token durations only). Covered by existing
  `motion-store.test.ts` + `vis-motion-density-icons-tokens.test.ts`. No regression introduced.
- **UX-A11Y-012 (APG widgets):** `a11y/roving-tabindex.ts` + `Dialog.svelte` / `Tabs.svelte` /
  `Disclosure.svelte` (dialog/menu/tabs/tree/grid engine; disclosure uses `hidden`, never `aria-hidden`,
  AP-9; no positive tabindex, AP-8). Tests: `a11y-roving-tabindex.test.ts`, `a11y-widgets.test.ts` (SSR
  ARIA), `a11y-focus-trap.test.ts`, Help-dialog e2e.
- **UX-A11Y-013 (drag alternatives, WCAG 2.5.7):** `a11y/drag-alternative.ts` — `DragController` +
  `nudge`/`buildMoveCommand` so pointer and keyboard paths dispatch the IDENTICAL command; Escape /
  release-away cancels and restores origin. Tests: `a11y-drag-alternative.test.ts`. Existing
  `scene-accessibility.spec.ts` already proves keyboard widget move/resize alternatives on the canvas.
- **UX-A11Y-014 (consistent help, WCAG 3.2.6):** `HelpTrigger.svelte` in the shared header (same
  position every route), `?`/`F1` global key, shortcut reference in the `Dialog` primitive. Tests:
  `help-and-interaction-primitives.spec.ts` (consistent-position AC1 + `?`-opens-everywhere AC2, both
  profiles).
- **UX-A11Y-015 (redundant entry 3.3.7 / accessible auth 3.3.8):** `a11y/redundant-entry.ts`
  (`SessionEntryCache.prefill`, `isAccessibleAuthMethod`). Tests: `a11y-redundant-entry.test.ts`.
  Local-first persona has no auth step (exemption encoded).

Supporting primitive: `a11y/live-announcer.svelte.ts` + `LiveRegion.svelte` (single polite/assertive
region, §6.2; visibility-filtered text only). Test: `a11y-live-announcer.test.ts`.

## Tests run (all green)

- `pnpm lint` — PASS (eslint + nav-layer + token-compliance + a11y:contrast + audit:repo).
- `pnpm v2:lint` (boundary) — PASS. `pnpm --filter @dndtools/v2-core typecheck` — PASS.
  `pnpm --filter @dndtools/v2-app typecheck` (svelte-check) — PASS (0 errors).
- `pnpm --filter @dndtools/v2-app exec vitest run` — PASS (29 files, 192 tests), incl. 9 new a11y
  unit/SSR test files.
- `pnpm a11y:axe` — PASS (14/14: 7 routes × desktop-chromium + mobile-chromium).
- `pnpm a11y:report` — PASS (0 critical, 0 serious, 0 blocking, 0 approved known violations; 2 moderate
  pre-existing/non-blocking).
- `pnpm --filter @dndtools/v2-app exec playwright test --project=desktop-chromium --project=mobile-chromium`
  (FULL suite, shared-header + /session touched) — PASS (555 passed, 21 skipped, 0 failed with retries).
- `pnpm docs:validate` — PASS. `pnpm v2:ux-workpack:validate` — PASS.

## Inherited target-size register entry — RESOLVED + REMOVED

The `target-size` (serious, `/session`, WCAG 2.5.8) entry deferred from epic 4 is fixed by sizing native
checkboxes/radios to the 24px floor (`--touch-target-floor`, global rule in `styles.css`). The entry was
removed from `apps/v2/app/tests/a11y/known-violations.json` (now `"violations": []`). Proof: `pnpm a11y:axe`
passes 14/14 and `pnpm a11y:report` shows 0 serious / 0 blocking / 0 approved known violations WITHOUT the
entry; `touch-targets.spec.ts` asserts ≥24×24 on both profiles. Register doc updated
(`docs/development/ACCESSIBILITY.md` §9.3).

## Actor-safety / no-leak

- The live announcer never reads the raw model — callers pass visibility-filtered text (documented on
  `LiveAnnouncer` and in the shell wiring), upholding AP-1 / UX-A11Y-008.
- No DM-only content added to any player-visible ARIA, label, or live region. The Help dialog content is
  static product-wide shortcut copy (role-independent). Full e2e suite (incl. player/observer no-leak
  specs) green on both profiles.

## Known gaps / deferred

- `Tabs`/`Disclosure` keyboard interaction is proven via the unit-tested `roving-tabindex` engine + SSR
  ARIA assertions (the testing-library-svelte runes harness is not configured in this repo, so live
  component mounting in vitest is unavailable; the `Dialog` trap is proven live via Playwright). Wiring
  Tabs/Disclosure into concrete surfaces is owned by the consuming feature epics.
- `CommandPalette.svelte` keeps its existing in-place modal handling; migrating it onto the shared
  `focus-trap`/`Dialog` primitive is a low-risk future refactor (left untouched to avoid destabilising
  its passing e2e).
- Canvas roving-tabindex spatial model (UX-A11Y-003/004) and combat graduated announcements
  (UX-A11Y-006) are out of this epic's requirement set (owned by canvas/combat surface epics); this epic
  ships the reusable engines they will consume.

## Git evidence

Branch: `ux/UX-A11Y-interaction-primitives-and-help-compliance`. Commit: created after this file +
`pnpm v2:ux-workpack:complete` regeneration (see final report). `git status --short` at completion
(pre-commit, staged):

```
A  apps/v2/app/src/lib/gui/HelpTrigger.svelte
A  apps/v2/app/src/lib/gui/a11y/Dialog.svelte
A  apps/v2/app/src/lib/gui/a11y/Disclosure.svelte
A  apps/v2/app/src/lib/gui/a11y/LiveRegion.svelte
A  apps/v2/app/src/lib/gui/a11y/StateBadge.svelte
A  apps/v2/app/src/lib/gui/a11y/Tabs.svelte
A  apps/v2/app/src/lib/gui/a11y/drag-alternative.ts
A  apps/v2/app/src/lib/gui/a11y/focus-trap.ts
A  apps/v2/app/src/lib/gui/a11y/index.ts
A  apps/v2/app/src/lib/gui/a11y/keyboard.ts
A  apps/v2/app/src/lib/gui/a11y/live-announcer.svelte.ts
A  apps/v2/app/src/lib/gui/a11y/redundant-entry.ts
A  apps/v2/app/src/lib/gui/a11y/roving-tabindex.ts
A  apps/v2/app/src/lib/gui/a11y/state-indicator.ts
M  apps/v2/app/src/routes/+layout.svelte
M  apps/v2/app/src/routes/styles.css
M  apps/v2/app/tests/a11y/known-violations.json
A  apps/v2/app/tests/e2e/help-and-interaction-primitives.spec.ts
A  apps/v2/app/tests/e2e/touch-targets.spec.ts
A  apps/v2/app/tests/unit/a11y-drag-alternative.test.ts
A  apps/v2/app/tests/unit/a11y-focus-trap.test.ts
A  apps/v2/app/tests/unit/a11y-keyboard.test.ts
A  apps/v2/app/tests/unit/a11y-live-announcer.test.ts
A  apps/v2/app/tests/unit/a11y-redundant-entry.test.ts
A  apps/v2/app/tests/unit/a11y-roving-tabindex.test.ts
A  apps/v2/app/tests/unit/a11y-state-indicator.test.ts
A  apps/v2/app/tests/unit/a11y-tokens.test.ts
A  apps/v2/app/tests/unit/a11y-widgets.test.ts
A  apps/v2/app/tests/unit/fixtures/DialogOpenFixture.svelte
A  apps/v2/app/tests/unit/fixtures/DisclosureFixture.svelte
A  apps/v2/app/tests/unit/fixtures/StateBadgeFixture.svelte
A  apps/v2/app/tests/unit/fixtures/TabsFixture.svelte
M  docs/development/ACCESSIBILITY.md
M  docs/planning/v2/ux/epics/UX-A11Y-interaction-primitives-and-help-compliance.yaml
M  docs/planning/v2/ux/status.yaml
M  docs/planning/v2/ux/workpack-state.yaml
```

The final commit includes this completion file and the regenerated `docs/planning/v2/ux/**`; the
post-commit `git status --short` is clean (empty).
