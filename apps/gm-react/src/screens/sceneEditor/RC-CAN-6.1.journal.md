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
  + shared `usePreviewActions`, EN/ES keys, `tests/e2e/player-preview.spec.ts`.
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
