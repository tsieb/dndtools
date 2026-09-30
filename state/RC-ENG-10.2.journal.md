# RC-ENG-10.2 run journal

## 2026-09-30 — implementation

- Started from a clean task branch at `a0c885f9`. Headroom tools were not used; this journal cites native tool output.
- Finding confirmed in source. `boardWidgetsOf` mapped every instance of the raw scene and defaulted a missing payload to `available`. `getSceneForActor` leaves out instances outside the actor's assigned sections (`scene.playerViewAssignments[].sectionIds`). The real leak was on `/scene/:id`: the canvas under the CAN-6.1 preview overlay rendered the out-of-section tiles (titles and configuration) into the DOM. It is `inert`, but the tiles were still in the page source. On `/board` and `/screen/:id`, a non-DM actor (including a preview) currently gets `BoardPlayerNotice`, so nothing leaks there today. The Board filter is defensive.
- **board-helpers.** `boardWidgetsOf` takes `{ includeUndelivered }` and by default drops every instance with no payload. When an instance is kept, a missing payload paints `hidden` ("Hidden from this viewer") and never `available`.
- **Board.** `includeUndelivered: isDm && editing` (the DM's own edit view). `isDm` follows the previewed actor.
- **Scene editor.** `includeUndelivered: previewBlocked || (isDm && editing && !preview)`. A scene the previewed actor cannot open at all keeps every tile, painted `hidden`, so the CAN-6.1 overlay can still name each withheld tile ("can't open this scene"). That case is a scene-level denial, not section scoping, and `player-preview.spec.ts` locks it.
- **Behaviour change to note.** An out-of-section tile no longer appears in the preview overlay as "hidden: outside their sections". It is simply absent, which is what the acceptance requires ("no out-of-section widget title in the DOM"). `playerPreview.ts` still computes the `outsideSections` verdict; the overlay no longer receives those tiles.

## Evidence

- New `apps/gm-react/src/app/board-helpers.test.ts` (real core commands: two notes, two sections, player assigned only the Dock). The player's view-model drops the Cellar instance, the DM's lists both (with and without `includeUndelivered`), and a kept undelivered instance is `hidden`. **3 passed.** Mutation (filter disabled): the section test fails.
- New `apps/gm-react/tests/e2e/section-scoped-preview.spec.ts`, both profiles. It previews the shared screen as `actor-player` (limited to the Dock) on `/scene/:id` and `/screen/:id`, and asserts that neither `page.content()` nor the `body` aria snapshot contains the Cellar title. It also checks that the overlay shows the Dock tile and that the DM's Edit layout view lists both. **2 passed.** Mutation (filter disabled): **2 failed** on `page.content()` for `/scene/:id`.
- Full app vitest: **157 files / 1730 tests passed**.
- Related e2e on both profiles (player-preview, section-scoped-preview, scene-editor-polish, canvas, canvas-arrange, canvas-keyboard, screens, pinned-screens, flow-layout, scene-surfaces, co-dm, isolation-guard, permissions, binding-inspector, combat-tile, custom-widgets, starter-widgets, phone-navigator, session-action-bar, scene-templates): **238 passed, 16 skipped, 0 failed**.
- `pnpm --filter @dndtools/gm-react typecheck` exit 0. `pnpm lint` exit 0; its 17 warnings are pre-existing and none are in changed files. Prettier was run on the changed files.
- Not run: the visual suite (the DM's own view renders the same widgets as before) and the Electron smoke.
- No push, promotion, loop launch or dispatcher state edits.
