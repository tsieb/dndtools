# RC-CAN-6.1 run journal — player-view preview overlay on the canvas

- Started from `0c1b0fde` (RC-CAN-2.2 tile identity) on the task branch; tree clean.
- Scope: `screens/sceneEditor/` and `app/ViewAsControl.tsx`, plus the additive EN/ES catalog keys
  the `i18n/no-literal-jsx-text` gate requires for any new copy, and a new e2e spec (the story's
  acceptance is an e2e).
- Finding: `getSceneForActor` never reads a tile's `configuration.visibility` — it is only the
  header chip. No player surface renders scene tiles today, so nothing leaks, but the actor read
  alone cannot say "this tile is DM only". The overlay's model (`playerPreview.ts`) takes scene,
  section and binding verdicts from `getSceneForActor` made as the previewed actor (with the core's
  character + content data environments, so bound tiles resolve `hidden`/`missing` for real), and
  evaluates the tile's own setting through the core policy engine (`evaluateVisibility`) for the
  same actor. Worth a core follow-up: enforce tile visibility in the scene read itself.
- The app passed no `dataEnvironment` to scene reads anywhere, so every binding was `available`
  through the permissive resolver. The preview builds one; binding types the core builders do not
  model (maps) are added as known keys so a map tile is not falsely reported `missing`.
- Built: `playerPreview.ts` (pure model) + unit test, `PlayerPreviewOverlay.tsx`, SceneEditor wiring
  (stage wrapper made `inert` while previewing; toolbar edit controls hidden; a preview-blocked
  scene shows the overlay instead of the "unavailable" card), `ViewAsControl` `placement="scene"`
  and a shared `usePreviewActions`, EN/ES keys, `tests/e2e/player-preview.spec.ts`.
- Editing is suspended, not reset: no UI state is cleared on entry, so an open panel's unsaved draft,
  the selection and the canvas view survive the preview.
- Validation so far: model unit test 5/5; sceneEditor + i18n Vitest 37/37 (EN/ES coverage gates
  included); `tsc --noEmit` for the app exit 0; the new spec typechecked on its own (the app
  tsconfig only includes `src`) exit 0; Prettier; ESLint on every changed file exit 0 (literal-text
  and raw-style ratchets unchanged); `git diff --check` clean. New e2e spec: 4/4 across
  desktop-chromium and mobile-chromium on an isolated server (`DNDTOOLS_E2E_PORT=43875`).
- Visual check (throwaway screenshot spec, deleted, never committed): desktop fits the tiles where
  the DM placed them with hatched/dashed dimming and the reason in words. The phone stack was
  clipping each tile's reason line — a tile clips its own overflow, so the flex column shrank it —
  fixed with `flex: 0 0 auto` on stacked tiles; re-captured and confirmed. After the fix: the new
  spec 4/4 again (plus the screenshot run, 6/6 total on port 41099); Prettier check and ESLint on
  the overlay clean.
- Regression sweep for the touched route and the preview flows, isolated server on port 46581:
  canvas, collab, co-dm, permissions, responsive and a11y-axe-gate specs — 230/230 across both
  profiles. (Run before the phone flex fix and a docblock move in `ViewAsControl`; neither touches
  what those specs render — the overlay only mounts while previewing.) Not run: the full suite; the
  central operator owns the gates and independent review.
- Final pre-commit checks on the committed tree: Prettier check clean on every changed file, ESLint
  exit 0 (ViewAsControl, sceneEditor/, the spec), app `tsc --noEmit` exit 0, `git diff --check` clean.
- No delegation, push, promotion or dispatcher state edits.

## Retry — 2026-09-11 ("candidate changes paths outside its claim")

- The flagged paths were `i18n/messages/en.ts`, `i18n/messages/es.ts` and
  `tests/e2e/player-preview.spec.ts`. Read (not edited) the dispatcher's fence: scopes are the
  story's `owns` + `journal_paths` + the manifest's `companion_paths`, matched exactly, by prefix, or
  with fnmatch. The manifest now grants `apps/gm-react/src/i18n/messages/*.ts` and
  `apps/gm-react/tests/e2e/*.spec.ts` as companion paths (the 2026-09-11 root-cause fix), and the
  story's `Owns:` now also lists `SceneBoardCanvas.tsx`, `canvas/WidgetFrame.tsx` and `Board.tsx`.
  Classifying every path in `0c1b0fde..HEAD` with those same rules: all owned or companion, none
  outside. So the candidate is kept as is. The copy stays in the central EN/ES catalogs rather than
  moving into a module-local dictionary, and the e2e stays where Playwright's `testDir` finds it.
- The newly owned canvas files are not needed: the overlay satisfies the story without touching them.
- Re-run this attempt: `tests/e2e/player-preview.spec.ts`, 4/4 across both profiles, isolated
  server on port 47015, Playwright exit 0. Source is byte-identical to the validated `d688bf58`;
  the earlier unit/typecheck/lint/regression results above apply to it unchanged.

## Retry — 2026-09-12 (same feedback text, carried over)

- The feedback is the task's stored `blocker`, not a new rejection. Read-only look at the
  dispatcher store: the one `attempt.failed` ("outside its claim") is 2026-09-11 14:59:23; the
  dispatcher process now serving started 18:19:36, after the fence gained `companion_paths`; the
  task went `blocked → ready` at 20:50 and was claimed again at 00:18 today. No failure since.
- The dispatcher rebased the candidate onto `5e6064d9`. Replaying the fence's exact rule (owns +
  journal paths + manifest `companion_paths`; exact, prefix or fnmatch) on `5e6064d9..HEAD`: 9
  changed paths, none outside. Candidate kept as is.
- Re-validated on the rebased tree: app `tsc --noEmit` exit 0; Vitest over `screens/sceneEditor`,
  `i18n` and `app/canvas` 110/110; ESLint on every changed file exit 0; Playwright
  `player-preview.spec.ts` + `canvas.spec.ts` 74/74 across both profiles on an isolated server
  (`DNDTOOLS_E2E_PORT=55209`), exit 0.
- Nothing in the dispatcher was edited; the store was opened read-only.

## Retry — 2026-09-12 ("Format (changed)" gate)

- Quality gates passed; `format:check:changed --base loop/rc` failed on this journal only — the one
  changed file never run through Prettier. Formatted it and re-ran the same script locally before
  committing. No source changes.

## Retry — 2026-09-12 ("Browser acceptance" gate)

- Every other gate passed on `a9b66967`. Browser acceptance reported 238 passed, 1 flaky, 8
  skipped and the rest failed — about 2,510 `page.goto: net::ERR_CONNECTION_REFUSED` against
  `localhost:5273`. All 12 `player-preview.spec.ts` failures are that same refusal; none reached
  an assertion.
- Cause: the gate runs `pnpm e2e --workers=2 --retries=2` with no environment, and
  `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`. Our run started at 00:25:52
  while worktree `c6b7f0d0`'s own Browser acceptance (00:12:12 → 00:30:13) held :5273, so it
  attached to that worktree's vite — a different tree — and lost it when that run finished. The
  first failure (test #243) is a 20 s waitReady timeout at that moment; everything after is refused.
  So even the 238 passes were against `c6b7f0d0`'s code: the gate said nothing about this candidate.
- The fix is in `playwright.config.ts` / the gate's environment, outside this story's claim (the
  e2e-port change is already in flight separately). Not touched here.

## Retry — 2026-09-12 ("Uncommitted work remains")

- The intended source and acceptance spec are already committed in `b77be76f`; the only dirty
  path on entry was this journal's prior Browser acceptance entry. Preserved that historical entry;
  its cross-worktree diagnostic was recorded by the previous attempt and was not re-investigated here.
- Current verification: preview model Vitest 5/5, exit 0. Playwright `player-preview.spec.ts` and
  `isolation-guard.spec.ts` 6/6 across desktop and mobile Chromium, exit 0, using
  `CI=1 DNDTOOLS_E2E_PORT=48361` with two workers and no retries. This run started its own server.
  The preview spec checks rendered verdicts against the preview actor's read and against the DM
  read, editing suspension, Escape restoration, unchanged scene data, and an inaccessible scene.
- Formatted and checked this journal before committing the remaining task documentation. No
  disposable untracked artifacts were present. Full browser acceptance remains with the operator.

## Retry — 2026-09-12 (review: false "visible" verdict for map tiles)

- Review of `a4e7a529` withheld approval: a map tile bound to a DM-only map rendered "visible" in
  the overlay, and a map tile bound to a map that no longer exists came out "visible" in the model.
- Cause: `previewDataEnvironment` added every map binding to `knownEntityKeys` without looking at
  the map, so the core resolver fell through to `available` and no map read was ever made. The
  earlier note above ("maps are added as known keys so a map tile is not falsely reported
  `missing`") fixed one lie by introducing another.
- Fix, in `playerPreview.ts` only: a map key is known only while `state.maps.maps` holds it, so a
  deleted map resolves `missing` (placeholder). A live map's verdict comes from `getMapViewForActor`
  made as the previewed actor with `deliveredMapIdsForActor(session, actor)`: the same read and
  deliveries the Map tile (`widgets/builtin/Map.tsx`) uses to decide whether it draws the map.
  When that read is `unavailable`, the tile is hidden as `bindingNotShared` for a `shared` map
  that was not delivered to this actor, and as `bindingDmOnly` otherwise. The blanket "unmodelled
  type is known" rule is gone. `TileBindDialog` binds only maps, characters and content items, and
  any other type now resolves `missing` rather than visible. No new copy; overlay and wiring unchanged.
- Tests: the unit model now covers the deleted, public, DM-only and undelivered-shared map cases,
  plus a shared map delivered to one player through `activeMapProjections`, which turns visible for
  that player and stays hidden for the generic preview player. The e2e seeds a player-visible map,
  a DM-only map and a deleted map as tiles. It asserts visible / hidden `bindingDmOnly` / placeholder
  `missing`, that the DM read calls the DM-only map visible, and that the rendered verdicts equal
  the actor read.
- Validation: preview model Vitest 6/6, exit 0; app `tsc --noEmit` exit 0; the spec typechecked
  through a throwaway tsconfig adding it to `src` (deleted), exit 0; Prettier check and ESLint on
  the three changed files, exit 0. Playwright `player-preview.spec.ts` + `isolation-guard.spec.ts`
  6/6 across desktop and mobile Chromium, `CI=1 DNDTOOLS_E2E_PORT=51837`, two workers, no retries.
  The run started its own server, exit 0.
