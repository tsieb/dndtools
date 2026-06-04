# CMD-widget-library-and-actions - Completion Evidence

Epic packet: `docs/planning/v2/epics/CMD-widget-library-and-actions.yaml`
Workpack status: `complete`.
Implemented against ADR-014 (Accepted) `docs/adr/014-v2-stack-and-subproject-boundary.md`.

Requirements covered: **CMD-005**, **CMD-008**.

## Demo Path

Run `pnpm v2:dev` from the repo root and open `http://localhost:5183/` (the Command Center home).

### CMD-005 — quick-access widget library

1. Scroll to the **Widget library** panel on the Command Center.
2. Type `dice` in the library search box. The list narrows to the **Dice** widget shown with
   its name and version (CMD-005 AC1). Clear the box to see every installed system widget.
3. The **Map** and **Character** rows display their required data binding under the name
   (`requires: Map`, `requires: Character`) — the library previews required bindings before a
   widget is added (CMD-005 AC1).
4. Click **Add** on the **Note** row. A Note widget is added to the Command Center through the
   `scene.add-widget` command and renders in the tools grid (`cc-widget-note`).
5. Platform-profile gating (CMD-005 AC2): a widget whose `supportedProfiles` excludes the active
   profile is listed with `Not available on the <profile> profile.` and its **Add** button is
   disabled; `resolveAddWidgetCommand` returns `null` so it cannot be added. No shipped system
   widget is profile-limited, so this path is exercised by a desktop-only custom widget in
   `apps/v2/packages/core/tests/widget-library.test.ts` (desktop available + addable; mobile
   unavailable + unaddable).

### CMD-008 — global command palette

1. Click **⌘K Actions** in the header (or press **Ctrl/Cmd+K**). A modal command palette opens,
   focused on its search box. **Escape** or a backdrop click closes it.
2. Search `preset`. The **Save Command Center preset** action appears with a name field; type a
   name and click **Run**. The palette dispatches the **same** `command-center.save-preset`
   command the visible "Save preset" form dispatches, and the new preset appears in the Presets
   list (CMD-008 AC1).
3. Search the preset name. **Apply preset: <name>** appears; **Run** dispatches the same
   `command-center.apply-preset` command the visible **Apply** button uses and restores the
   Command Center layout (CMD-008 AC1).
4. **Add <widget>** actions dispatch the identical `scene.add-widget` command the widget library's
   Add button uses (asserted byte-for-byte in core tests).
5. Unavailable actions (CMD-008 AC2): before a Command Center is configured, the save/add actions
   are shown **disabled** with the non-leaking reason `Set up the Command Center first.`; a non-DM
   actor sees **no** palette actions at all (hidden, fail closed). Both are exercised in
   `apps/v2/packages/core/tests/command-actions.test.ts`.

Playwright specs `apps/v2/app/tests/e2e/widget-library.spec.ts` and
`apps/v2/app/tests/e2e/command-palette.spec.ts` drive these flows in desktop and mobile Chromium.

## Requirement Traceability

| Requirement | Implementation | Test evidence |
| ----------- | -------------- | ------------- |
| CMD-005 | `listWidgetLibrary` (`apps/v2/packages/core/src/queries/widget-library.ts`) returns DM-only, profile-evaluated widget entries with names, versions, and required/optional bindings; availability fails closed for disabled packages (removed packages are dropped) and for widgets unsupported on the active platform profile. `resolveAddWidgetCommand` returns the dispatch-ready `scene.add-widget` command or `null` for unavailable entries. Entity-backed system widgets `map` and `character` declare a required binding (`apps/v2/packages/core/src/state/widget-package-state.ts`). GUI: Widget library panel in `apps/v2/app/src/routes/+page.svelte` (search, binding preview, Add). | `apps/v2/packages/core/tests/widget-library.test.ts` (filter by name; binding labels; profile-unsupported unavailable + unaddable AC2; disabled package; removed package dropped; non-DM empty). `apps/v2/app/tests/unit/widget-library-store.test.ts` (library add persists across reload). e2e `widget-library.spec.ts` (filter "dice"; preview Character binding; add Note). |
| CMD-008 | `listCommandActions` / `resolveCommandAction` / `searchCommandActions` (`apps/v2/packages/core/src/queries/command-actions.ts`) build an actor-filtered Command Center action catalog. Each action carries the same Processing Core `commandType` + payload a visible control dispatches (`command-center.save-preset`, `command-center.apply-preset`, `scene.add-widget`); `resolveCommandAction` returns the identical command or `null` when unavailable / missing input. Non-DM actors get an empty catalog (hidden); invalid state (no Command Center) yields disabled actions with a non-leaking reason. GUI: global `apps/v2/app/src/lib/gui/CommandPalette.svelte` mounted in `apps/v2/app/src/routes/+layout.svelte` (header button + Ctrl/Cmd+K + Escape). | `apps/v2/packages/core/tests/command-actions.test.ts` (non-DM hidden; available actions; identical-command-as-visible-control AC1 for apply/save/add; applied palette command accepted; no-home disabled-with-reason AC2; missing input refused; search). `apps/v2/app/tests/unit/widget-library-store.test.ts` (palette save-preset persists). e2e `command-palette.spec.ts` (run save action → preset appears; keyboard open/Escape; apply restores layout). |

## Architecture Contracts Satisfied

- **Contract 1 (Processing / Display Decoupling):** The widget library and command palette are
  pure read-model queries in `@dndtools/v2-core`. The GUI renders the returned descriptors and
  dispatches the core command the query resolves; it never decides availability, never invents
  layout coordinates, and never mutates durable state directly. The palette exposes no alternate
  mutation path — it dispatches the exact same `CoreCommand` the visible controls dispatch (the
  catalog reuses `resolveAddWidgetCommand`, and tests assert byte-identical commands). Platform
  profile is shell-owned (`PlatformProfileStore.profileId`) and passed into the queries; feature
  code never reads `window.innerWidth`.
- **Contract 4 (Scene and Widget Contract):** The library surfaces each widget type's declared
  `WidgetDefinition` (`displayName`, `version`, `requiredBindings`, `supportedProfiles`,
  `defaultSize`). Adding a widget creates an unbound widget instance via `scene.add-widget`; the
  bound entity is never cloned. Profile support is advisory at add-time only — the core
  `scene.add-widget` reducer stays profile-agnostic, so "the same command produces the same core
  result on every profile" holds; the library/palette simply do not offer an unsupported widget.

## Permissions / Data Safety

- Both queries fail closed: non-DM actors receive an empty widget library and an empty action
  catalog (CMD-005 and CMD-008 are `Player-safe: dm-only`). Unavailable reasons are generic
  (`Set up the Command Center first.`, `Not available on the <profile> profile.`,
  `The <package> package is disabled.`) and never leak permission internals or hidden content.
- Adding a widget and saving/applying presets reuse the existing DM-gated core commands, which
  append local operation-log records for sync replay. All behavior is single-device and offline
  (Offline: yes); no new persistence surface was introduced — added widgets and palette-saved
  presets round-trip through the existing IndexedDB adapter (covered by
  `widget-library-store.test.ts`).

## Verification Run

```bash
pnpm --filter @dndtools/v2-core test     # 122 tests pass (15 files)
pnpm --filter @dndtools/v2-app test      # 9 tests pass (3 files)
pnpm --filter @dndtools/v2-app e2e       # 30 passed, 6 profile-skipped (desktop + mobile Chromium)
pnpm v2:typecheck                        # core tsc + app svelte-check: 0 errors, 0 warnings
pnpm v2:lint                             # v2 boundary lint passed
pnpm v2:check                            # workpack validate + lint + typecheck + unit tests pass
pnpm v2:workpack:complete -- --epic CMD-widget-library-and-actions
pnpm v2:workpack:validate                # v2 workpack validation passed
```

## Quality Review Summary

- **Correctness:** Both stories' acceptance criteria implemented; CMD-005 AC2 (profile) and
  CMD-008 AC2 (permission/state) covered by core tests; CMD-008 AC1 verified by asserting the
  palette resolves to the identical command the visible control dispatches.
- **Architecture:** Core-owned read models; GUI dispatch-only; no v1 runtime imports; boundary
  lint passes. No new state documents or storage keys.
- **Tests:** 14 new core tests, 2 new app integration tests, 5 new e2e tests across two profiles;
  full prior suite still green (no regressions).
- **Accessibility:** Library is a labelled list with disabled Add buttons carrying visible
  reasons; the palette is a labelled `role="dialog"` opened by a button and Ctrl/Cmd+K, focuses
  its search field, closes on Escape, and exposes every action as a focusable control (works on
  touch profiles via the header button — CMD-008 is Mobile: yes).
- **Performance:** Queries are O(widgets/actions) pure functions over in-memory state; no new I/O.
- **Security / Permissions:** Fail-closed DM gating; non-leaking unavailable reasons.
- **Persistence / Sync / Offline:** Reuses existing DM-gated commands and the IndexedDB adapter;
  local-first and offline-safe; no sync assumptions changed.
- **UX:** Empty/loading/disabled states handled (`No widgets match`, `No matching actions.`,
  disabled Add/Run with reasons); consistent with the existing design tokens.
- **Docs:** This completion evidence; epic packet + status regenerated via the workpack commands.

## Known Gaps / Deferred

- The requirement's CMD-008 AC1 names "Start session" as the illustrative action. Session
  lifecycle (`session.start`) is owned by sibling epics (CMD-active-session-control / SES). This
  epic implements the **invariant** that AC1 tests — the palette dispatches the same Processing
  Core command as the visible control — and demonstrates it with the Command Center commands that
  exist today (save-preset, apply-preset, add-widget). When a session-start command and its
  visible button land, registering one descriptor in `listCommandActions` surfaces it in the
  palette with no new dispatch path.
- No shipped system widget is platform-limited, so the CMD-005 AC2 "unavailable on this profile"
  row is demonstrated through tests (desktop-only custom widget) rather than in the default app.
- Widget "preview" is the name + required-binding summary appropriate to the HTML prototype; a
  richer visual/thumbnail preview is out of scope (ADR-014 keeps the first slice HTML/CSS only).

## Git Evidence

Branch: `epic/CMD-widget-library-and-actions` (based on the completed `epic/CANVAS-layout-accessibility` HEAD).

Final `git status --short` after `pnpm v2:workpack:complete -- --epic CMD-widget-library-and-actions`
and before commit (the pre-existing unrelated `.claude/settings.json` edit is left untouched and
is not part of this epic):

```text
 M .claude/settings.json
 M apps/v2/app/src/routes/+layout.svelte
 M apps/v2/app/src/routes/+page.svelte
 M apps/v2/app/src/routes/styles.css
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/state/widget-package-state.ts
 M docs/planning/v2/epics/CMD-widget-library-and-actions.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/app/src/lib/gui/
?? apps/v2/app/tests/e2e/command-palette.spec.ts
?? apps/v2/app/tests/e2e/widget-library.spec.ts
?? apps/v2/app/tests/unit/widget-library-store.test.ts
?? apps/v2/packages/core/src/queries/command-actions.ts
?? apps/v2/packages/core/src/queries/widget-library.ts
?? apps/v2/packages/core/tests/command-actions.test.ts
?? apps/v2/packages/core/tests/widget-library.test.ts
?? docs/planning/v2/epics/CMD-widget-library-and-actions.completion.md
```

After committing the epic files (excluding `.claude/settings.json`), `git status --short` shows
only ` M .claude/settings.json`. Build output (`apps/v2/app/build/`, `.svelte-kit/`,
`test-results/`) remains untracked per the repo's ignore rules.
