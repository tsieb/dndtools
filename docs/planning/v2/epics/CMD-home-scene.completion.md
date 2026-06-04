# CMD-home-scene - Completion Evidence

Epic packet: `docs/planning/v2/epics/CMD-home-scene.yaml`
Workpack status: `complete`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **CMD-001**, **CMD-002**, **CMD-007**.

## Demo Path

1. From repo root, run `pnpm v2:dev` and open `http://localhost:5183/`.
2. The home route is now the **Command Center** (no longer the Scene/notes list). On first load
   with no Command Center configured, a default Command Center Scene is created from the system
   template and its DM tools render as widgets: Initiative, Dice, Timers, Audio, Quick Reference,
   and Prep (CMD-001, CMD-002).
3. On a desktop viewport, use the per-tool **← → ↑ ↓** controls to rearrange a tool (e.g. move
   **Dice**). Reload the page; the new position is restored from local IndexedDB (CMD-002 layout
   persists across restart).
4. In the **Presets** panel, type a name and click **Save preset**. Move a tool to a new position,
   then click **Apply** on the saved preset. Only the Command Center Scene is restored to the saved
   layout; other Scenes (visit **Scenes** in the nav) are untouched (CMD-007).
5. If a preset references a widget type whose package was removed, **Apply** restores all valid
   widgets and reports the skipped widget types under the restore status line (CMD-007 AC2; exercised
   in core tests).
6. Resize the window to a compact width (≤720px) or open in the mobile Playwright profile. The same
   Command Center renders as **focused panels** (a tab list with one tool surface at a time) instead
   of the free canvas, without changing the underlying Scene state (CMD-002 AC2, slim-device
   contract).
7. The legacy Scene creation, widget-package review, and Scene list now live at
   `http://localhost:5183/scenes/`, linked from the header nav.

Playwright `apps/v2/app/tests/e2e/command-center.spec.ts` exercises this demo path in desktop
Chromium and mobile Chromium.

## Requirement Traceability

| Requirement | Implementation | Test evidence |
| ----------- | -------------- | ------------- |
| CMD-001 | `command-center.ensure-home` creates the default Command Center Scene from the system template (`buildDefaultCommandCenterScene`) when no home Scene is configured, sets `CommandCenterState.homeSceneId`, and is idempotent on reload. Implemented in `apps/v2/packages/core/src/commands/command-center.ts`, `apps/v2/packages/core/src/state/command-center-state.ts`. The home route `apps/v2/app/src/routes/+page.svelte` renders the Command Center as the landing surface and dispatches ensure-home on load; the prior Scene-management UI moved to `apps/v2/app/src/routes/scenes/+page.svelte`. | `apps/v2/packages/core/tests/command-center.test.ts` (default template creation, idempotency, dangling-pointer recreation, non-DM rejection); `apps/v2/app/tests/unit/command-center-store.test.ts` (home Scene + pointer persist across reload); e2e "default Command Center renders the DM tools as widgets". |
| CMD-002 | Command Center tools are ordinary Scene widgets (`DEFAULT_COMMAND_CENTER_TOOLS`: initiative, dice, timers, audio, quick-reference, prep). Rearrangement reuses the existing `scene.move-widget` command, so layout persists durably. New system widget types `audio`, `quick-reference`, `prep` added in `apps/v2/packages/core/src/state/widget-package-state.ts`. Mobile/slim layout is profile-driven via `apps/v2/app/src/lib/platform/platform-profile.svelte.ts` (shell-owned profile detection); the compact profile renders focused panels without mutating Scene state. | `apps/v2/packages/core/tests/command-center.test.ts` (move-widget on home Scene); `apps/v2/app/tests/unit/command-center-store.test.ts` (rearranged widget persists across reload); e2e "rearranged Command Center tools persist across restart" (desktop) and "slim profile exposes tools through focused panels without changing the Scene" (mobile). |
| CMD-007 | `command-center.save-preset` snapshots the home Scene's visual settings, sections, and widgets into a named `CommandCenterPreset`; `command-center.apply-preset` restores it onto **only** the home Scene (fresh widget/section/group ids), regenerating valid widgets and reporting `missingWidgetTypes` for widget types whose package is missing/removed. Implemented in `apps/v2/packages/core/src/commands/command-center.ts`. Preset save/apply UI in `apps/v2/app/src/routes/+page.svelte`. | `apps/v2/packages/core/tests/command-center.test.ts` (restore only changes the Command Center Scene; missing widget type reported while valid widgets restored; unknown-preset and not-configured rejections); `apps/v2/app/tests/unit/command-center-store.test.ts` (preset persists and restores across reload); e2e "a saved preset restores the Command Center layout". |

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** All durable mutations (home creation, preset
  save/apply, widget rearrange) enter the Processing Core as commands; the GUI only dispatches
  commands and renders `getSceneForActor` query results. The new `CommandCenterState` document is a
  core-owned bounded state partition. Platform profile detection is shell-owned
  (`PlatformProfileStore`); feature code branches on `viewportClass`/`isCompact`, never on raw
  `window.innerWidth`. The app storage adapter rejects durable Command Center changes that bypass an
  accepted operation.
- **Contract 4 (Scene and Widget Contract):** The Command Center is a Scene; its tools are widgets.
  Presets capture only Scene-owned data (layout, configuration, sections, visual settings) and never
  clone canonical entity data. Restore re-derives widget instance ids and group ids and leaves bound
  entities untouched. Slim profiles render the same widget instances as focused panels with the same
  command contract (Widget/Canvas Accessibility and Platform Rules).
- DM-only authority: every Command Center command requires the DM role and fails closed for
  non-DM actors. Command Center Scenes default to `dm-only` visibility (Player-safe: dm-only).

## Local-First / Persistence

- `CommandCenterState` (home pointer + presets) is persisted to IndexedDB through the app storage
  adapter (`apps/v2/app/src/lib/platform/storage/scene-store.ts`) under the `command-center-state`
  document key, and rehydrated on load. Home creation, preset save, and preset apply each append
  local operation-log records (`scene.create`, `command-center.set-home`,
  `command-center.save-preset`, `command-center.apply-preset`) carrying actor, entity, revision, and
  dependency metadata for future sync replay. All behavior is single-device and offline (Offline:
  yes).

## Verification Run

```bash
pnpm --filter @dndtools/v2-core typecheck   # pass
pnpm --filter @dndtools/v2-core test        # 71 tests pass (10 files)
pnpm --filter @dndtools/v2-app typecheck    # svelte-check: 0 errors, 0 warnings
pnpm --filter @dndtools/v2-app test         # 7 tests pass (2 files)
pnpm --filter @dndtools/v2-app e2e          # 13 passed, 3 profile-skipped (desktop + mobile)
pnpm v2:lint                                # v2 boundary lint passed
pnpm v2:check                               # workpack validate + lint + typecheck + test pass
pnpm v2:workpack:complete -- --epic CMD-home-scene
pnpm v2:workpack:validate                   # v2 workpack validation passed
```

## Known Gaps / Deferred

- Active map embed and live map switching (CMD-003), the per-participant Player View controller
  (CMD-004), the searchable quick-access widget library (CMD-005), and session workflow switching
  (CMD-006) are intentionally out of this epic and owned by sibling CMD epics. The default Command
  Center template therefore includes the six enumerated DM tool widgets but not a map-embed or
  player-view-controller widget.
- The slim/compact profile is detected from viewport width and exposes tools as focused tab panels.
  Full per-tool runtime interaction surfaces (rolling dice, running timers beyond the existing
  `timer.start` slice, audio playback) belong to the AUDIO/SES tool epics; here the tools are
  rearrangeable, preset-able widget instances.
- Preset restore reports missing widget types but does not yet offer an in-UI "reinstall package"
  affordance; that pairs with the widget library/admin epics.

## Git Evidence

Branch: `epic/CMD-home-scene` (based on `v2-clean-slate`).

Final `git status --short` after `pnpm v2:workpack:complete -- --epic CMD-home-scene` and before
commit:

```text
 M apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
 M apps/v2/app/src/lib/platform/storage/scene-store.ts
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/+page.svelte
 M apps/v2/app/src/routes/scene/[id]/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/app/tests/e2e/scene-create.spec.ts
 M apps/v2/packages/core/src/commands/dispatch.ts
 M apps/v2/packages/core/src/commands/types.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/schemas/commands.ts
 M apps/v2/packages/core/src/state/widget-package-state.ts
 M apps/v2/packages/core/src/testing/fixtures.ts
 M docs/planning/v2/epics/CMD-home-scene.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/app/src/lib/platform/platform-profile.svelte.ts
?? apps/v2/app/src/routes/scenes/
?? apps/v2/app/tests/e2e/command-center.spec.ts
?? apps/v2/app/tests/unit/command-center-store.test.ts
?? apps/v2/packages/core/src/commands/command-center.ts
?? apps/v2/packages/core/src/state/command-center-state.ts
?? apps/v2/packages/core/tests/command-center.test.ts
?? docs/planning/v2/epics/CMD-home-scene.completion.md
```

After committing all of the above, `git status --short` is clean.

All listed changes are scoped to the CMD-home-scene epic: the `apps/v2` Command Center
implementation, its tests, and the generated workpack status files updated by the programmatic
status/complete commands. Build output (`apps/v2/app/build/`, `.svelte-kit/`, `test-results/`)
remains untracked per the repo's ignore rules.
