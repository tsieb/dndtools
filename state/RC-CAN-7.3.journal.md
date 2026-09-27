# RC-CAN-7.3 — The screens library and switcher

## 2026-09-26 — attempt 2 (resumed after a provider allowance stop)

- The first attempt left no commits and a clean tree; this attempt starts from `fad0cf60`
  (loop/rc is 23 commits ahead with RC-SES-6.1 session work only, none of it in the owned paths).
- Inputs read: ADR-041, RC_ROADMAP CAN-7 epic, the CAN-7.2 core read (`listScreensForActor`),
  CAN-7.7 `FlowBoard`, CAN-4.4 `TemplatePicker`, the manifest gates (visual container, full e2e).
- Coupling found: 18 e2e specs boot through `/scenes`, four use its create form (`#scene-name`,
  "Create scene"), and the golden-routes visual suite snapshots `/board` and `/scenes` (18 PNGs).

### What shipped

- `/screens` (`screens/ScenesCreator.tsx`, the page; `/scenes` renders it too and
  `screens/screen/routeAliases.tsx`, mounted outside the routes' Suspense, replaces the entry with
  `/screens`): search,
  sort (pinned first / name / recently changed), tag filter, layout thumbnails, visibility named
  "GM only" / "Shared" / "Player visible" (the Draft/Ready badge is gone), live and pinned markers,
  new from template, pin, rename (+ description/tags), duplicate (`scene.duplicate`), delete with an
  Undo toast (`scene.delete` → `scene.restore`). The player-facing SceneCardsPanel stays below it.
- Templates (`screens/screen/screenModel.ts`): Command Center (flow, spans 7+5), GM screen (the home
  board's seven tools), Session, Prep (`session-prep`), Blank, the four other CAN-4.4 built-ins, and
  the GM's saved layouts/template scenes. Create = `scene.create` (GM only) → `scene.set-layout-policy`
  when flow → `scene.apply-template` or one `scene.add-widget` per tile.
- `/screen/:id` (`screens/screen/ScreenView.tsx`): the board engine renders any screen — the bounded
  board for canvas, `FlowBoard` for flow (Board.tsx gained a `screen` prop and the flow branch; its
  heading and layout-issue banner moved to `screens/board/` to stay under 800 lines: 790 → ~690).
  Header: the switcher (menu, `aria-current` on the current screen, "All screens"), the pin, and
  "Open in scene editor" (→ `/scene/:id`). Unknown/deleted/unshared ids get an unavailable state.
- `/board` → `BoardAlias`: provisions the home board if missing (`command-center.ensure-home`),
  renders nothing meanwhile, then `<Navigate replace>` to `/screen/:home` carrying route state, so
  the board mounts once. Non-GM actors and a failed provisioning write still get `<Board />`.
- Palette: screen rows (group "Screens", home excluded because Go to already lists it), "All
  screens" in Go to, "New screen" (→ `/screens` with the dialog open), and `/screen/:id` mapped to
  the canvas surface (home → `board`, else `scene`) so Add tile / Edit layout work there.
- `nav.ts`: `/screens` and `/screen/*` resolve to a `screens` pseudo-section ("Screens" top bar).

### Decisions and deviations (for review)

- Why `/scenes` is not a `<Navigate>` route: with a `<Navigate>` element, a hash change to
  `#/scenes` while `/screens`' lazy chunk was still loading (a reload followed at once by the hash
  change — exactly `bootShell`/`seedFresh` in co-dm.spec and collab.spec) committed the Navigate but
  never ran its effect: an empty pane on `/scenes`, `history.replaceState` never called (traced by
  patching it in-page). Later hash changes redirected fine. The alias effect now lives outside the
  boundary; probed reload → `#/scenes` and reload → `#/board` from three routes on both profiles.
- Presets and safe points (`command-center.*`) act on the HOME board, so a non-home canvas screen
  hides Layouts and skips the safe-point snapshot (screens.spec asserts it). Otherwise applying a
  preset from another screen would have rewritten the GM screen.
- "Edit layout opens the scene editor": the bounded board keeps its in-place Edit layout (dozens of
  `/board` specs drive it), and the screen header adds "Open in scene editor" for the free editor.
- The library provisions the GM screen (`useEnsureHomeScreen`) as `/board` always did, or a fresh
  vault's library would not list it.
- The top bar reads "Screens" on every screen, the GM screen included: `activeSectionId` only sees
  the pathname. The pane's own h2 names the screen ("DM screen" under 5e). `systems.spec` now reads
  that h2; the More-sheet row for `/board` is no longer marked current (CAN-7.4 owns pins there).
- `ScenesCreator.tsx` stays as the page file (RC-POL-1.1 owns the path; the feature-audit tooling
  test requires every routed screen file to be wired, so the library lives in it rather than in a
  wrapper).
- Crossed ownership (companion paths): `App.tsx` routes, `nav.ts`, i18n en/es, e2e specs and
  `_helpers.ts`, `FEATURE-GAPS.md`, `NAVIGATION.md`, the raw-style allow-list (Board 8 → 4,
  ScenesCreator removed), visual baselines.

### Spec edits

- New `screens.spec.ts` (both profiles): create from the Combat template, rename, pin, then switch
  by library link, header switcher and palette, asserting `history.length` grows by exactly one per
  switch and Back walks them; `/board` bookmark → `/screen/:home` with one entry, Back skips the
  alias; `/scenes` → `/screens`; unknown id → unavailable state.
- `command-palette.spec` (New screen, `/board` → `/screen/`), `sync.spec` and `missing-primitives`
  (library dialog / rename editor instead of the removed form), `canvas.spec` (create-form tests
  replaced by a library test), `responsive.spec` (`/screens` in ROUTES, alias-aware route waits),
  `systems.spec` (pane h2).

### Validation so far

- `pnpm --filter @dndtools/gm-react typecheck` clean; eslint on changed files: 0 errors (two
  pre-existing warnings); `pnpm lint:emphasis` passes; `pnpm feature-audit` exit 0.
- `pnpm test:app --maxWorkers=2`: 147 files / 1656 tests passed (before the screenModel test).
- `screenModel.test.ts`: 15 passed. `tests/unit/feature-audit.test.ts`: 7 passed.
- Targeted e2e (both profiles): screens, sync, systems, missing-primitives, canvas, command-palette,
  responsive — first run 34 failures (route guards, `/board` double mount), after fixes canvas +
  responsive + screens 244/244 passed.

### Visual baselines

- `run-in-container.sh tests/visual/golden-routes.spec.ts --update-snapshots=changed`: 216 passed,
  exactly 18 rewritten — `board--*` and `scenes--*` × parchment/tavern/high-contrast × desktop/rail/
  phone (the header switcher and pin on the GM screen; the Screens library on `/scenes`).
- Budget: the new captures put the set at 32,898.2 KiB of 32,768. Losslessly shrank ONLY these 18:
  IDAT re-deflate (zlib 9, best of default/filtered/RLE, decompressed stream asserted identical),
  then a pngjs re-encode choosing the smallest of adaptive/none/sub/up/paeth filters with each
  output decoded and asserted pixel-identical, then the re-deflate again. 1,825.9 → 1,359.3 KiB
  (the originals of these 18 were 1,584.1 KiB). Budget now **32,431.6 KiB of 32,768 KiB**.

### Full e2e (in progress at the time of writing)

- `pnpm e2e --workers=2 --retries=2` on the first commit: co-dm.spec:128 failed all three attempts
  (the `/scenes` alias bug above, fixed; co-dm + collab + screens then 32/32), responsive.spec:1552
  (/play skip link, the known ~30% base flake). The machine is loaded (load average ~15), so the run
  was at 629/1468 after an hour.

## 2026-09-26 — attempt 3 (resumed after a second provider allowance stop)

- Found both commits (`c4b06afe`, `3d7ac752`) in place. loop/rc had moved 20 commits (RC-CAN-5.2
  session action bar, RC-CAN-5.4 phone navigator, knowledge polish) and conflicted, so merged
  `origin/loop/rc` (`bbbbbd85`) in as `41ae7c61`:
  - `Board.tsx`: kept the flow branch and `BoardLayoutBanner`, took loop/rc's `ZoomPresetGroup`
    (still hidden for flow), `PhoneNavigator`, `SessionActionBar` and `chromeHidden` (the banner now
    hides on it). Raw-style allow-list: Board 3 (loop/rc had 7, this branch 4, the merge counts 3).
  - Phone `board--*` baselines: re-captured in the pinned container
    (`run-in-container.sh tests/visual/golden-routes.spec.ts --update-snapshots=changed`, 216
    passed, only those 3 rewritten), IDAT re-deflated losslessly, then re-compared: 18/18 board/scenes
    captures pass. Budget **32,427.4 KiB of 32,768 KiB**.
- Post-merge e2e fallout, fixed:
  - `session-action-bar.spec:161` (new on loop/rc) asserted the URL contains `/board`; `/board`
    now resolves to `/screen/:home`, so it asserts the URL is unchanged by Next turn.
  - `canvas.spec` "Move, Visibility and Remove" (mobile, 3/3): the screen header's extra row pushed
    the tile action menu's open Visibility group past the bottom of the phone viewport ("Players"
    unreachable; on base it only just fit — screenshot compared on a /tmp loop/rc worktree, 3/3
    pass there). Crossed into `app/canvas/TileActionMenu.tsx`: the fixed panel now caps its height
    to the side it opens on and scrolls, and its scroll-dismiss listener ignores the panel's own
    scroll (without that, End → Remove scrolled the panel and closed it). Tile-menu tests 24/24
    (repeat-each 2, both profiles).
  - `command-palette.spec:410` (this story's New screen test) failed 3/20: Escape pressed the moment
    the dialog was visible was dropped. It now waits for the palette to close and Name to be
    focused: 30/30.
- Validation on the merged tree: typecheck clean; `pnpm lint` exit 0 (0 errors);
  `format:check:changed -- --base origin/loop/rc` clean; `pnpm test:app`: 148 files / 1672 passed.
  Targeted e2e, both profiles (screens, phone-navigator, session-action-bar, canvas,
  command-palette, systems, missing-primitives, sync, co-dm, collab, responsive, a11y-axe-gate,
  widget-kit): 429 passed, 2 failed — palette:410 (fixed above) and `responsive.spec:1552`
  (/play skip link, the known ~30% base flake). The full `pnpm e2e` was not re-run.

## 2026-09-26 — attempt 4 (rebase conflict on 4b688ef5)

- Gate feedback: rebasing onto `4b688ef5` conflicted in `Board.tsx` and the raw-style allow-list.
  Cause: the rebase replays the pre-merge feature commits and drops `41ae7c61` (the loop/rc merge
  that had already reconciled them), so it re-met the same conflicts.
- Fix: rebuilt the branch linearly on `4b688ef5` (the loop/rc tip, one Android CI commit past the
  merged `bbbbbd85`). `6e298cc9` carries the reconciled tree (`git merge-tree 41ae7c61 4b688ef5`,
  clean) as the one feature commit; the post-merge fix is cherry-picked on top. The resulting tree
  differs from the old tip `769ad1b8` only by `4b688ef5`'s own three files, and
  `git rebase 4b688ef5` now reports up to date. Old tip kept locally as `can73-backup-769ad1b8`.
- Rechecked on the rebuilt tree: gm-react typecheck clean; eslint on the changed app code 0 errors;
  `android-emulator-acceptance.test.ts` 8 passed. The attempt-3 e2e/visual/unit evidence covers the
  same app tree.

## 2026-09-26 — attempt 5 (TileActionMenu now owned; rebased onto loop/rc a347e2c0)

- Gate feedback: `apps/gm-react/src/app/canvas/TileActionMenu.tsx` was outside the claim; the
  operator brief now owns it. **Why the edit is needed** (unchanged from attempt 3, 11 lines): the
  screen header adds a row (switcher + pin) above the bounded board, which pushed the tile action
  menu's open Visibility group past the bottom of a phone viewport, so "Players" could not be
  reached (`canvas.spec` "Move, Visibility and Remove", mobile, 3/3; on base it only just fit). The
  edit (1) caps the fixed panel's `maxHeight` to the room on the side it opens and sets
  `overflowY: auto`, and (2) makes the "dismiss on any scroll" listener ignore scrolls inside the
  panel itself; without (2), keyboard End → Remove scrolled the capped panel and closed it
  (`canvas.spec` keyboard-pattern test). Nothing else in the file changed.
- Rebased onto `origin/loop/rc` `a347e2c0` (19 commits: RC-ENG-8.1 golden-path journeys + journey
  health detector, RC-UX-3.7 demo vault, RC-SES-6.2, onboarding complexity). Conflicts:
  - `ScenesCreator.tsx`: loop/rc gave the old create form's disabled "Create scene" a reason
    `title`; that form is gone (the library replaced it), so this branch's file is kept as is.
  - `tests/e2e/_helpers.ts`: both sides appended; kept loop/rc's journey helpers and this branch's
    `createScreenInLibrary`.
  - Following the journey rule "disabled without reason", the rename editor's Save (disabled while
    the name is empty) now carries the same kind of reason title (`ScreenMetaEditor.tsx`). The
    other disabled states in `screens/screen` are the in-flight `busy` flags only.
- Validation on the rebased tree: gm-react typecheck clean; `pnpm lint` exit 0 (0 errors);
  `format:check:changed -- --base origin/loop/rc` clean; `pnpm test:app` 151 files / 1706 passed.
  Visual: `run-in-container.sh tests/visual/golden-routes.spec.ts` 216 passed with no baseline
  change; budget 32,392.7 KiB of 32,768.
  E2E both profiles: golden-path, demo-vault, session-standby, session-lifecycle, screens —
  86 passed, 2 skipped (golden-path visits `/scenes` → `/screens` and runs the health checkpoint
  there); phone-navigator, session-action-bar, canvas, command-palette, systems,
  missing-primitives, sync, co-dm, collab, responsive, a11y-axe-gate, combat — 489 passed,
  9 skipped, 0 failed. The full `pnpm e2e` was not run.
