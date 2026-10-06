# RC-WID-6.6 run journal

Base: `fe996760` (the task branch head at start).

## Implementation

### Core

- **`widget.package.fork`** (`commands/widget-package.ts`): copies one widget of any installed
  package into a new `user-authored` package with `authoring.forkedFrom` (`{ packageId, version,
widgetType }`).
  - The caller names only the source, plus optional slug ids and a display name (the app passes a
    localized "{name} (copy)").
  - The definition and assets are read from the core's own state. The copy gets a fresh type and
    id from `widgetPackageForkIdentity` (`user.<type>` / `<type>-copy`, numbered from `-2`; removed
    ids and any declared type count as taken), version 1.0.0, `author: 'user'`, and no migrations.
  - It then goes through the install schema, validation and `normalizeDefinition`.
  - Install's commit is factored into `commitInstalledPackage`, so a copy lands exactly as an
    install with the same trust would: the op, the author-trust audit op and the events. The fork
    op is `widget.package.fork`, recording `forkedFrom` and the starting trust. Its first event is
    `widget.package-forked`.
  - A `builtin`-rendered widget is refused, because its renderer is keyed by its own type.
- **Fork trust** (`evaluateWidgetPackageForkTrust`): the RC-WID-6.2 rule runs on the copy, and
  nothing about the source's trust carries over. Two source states keep the copy on the review path
  whatever it contains: a **denied** source, and a **generated** source nobody has trusted. This
  closes the RC-WID-6.2 handoff.
- **`authoring.forkedFrom`**: added to `WidgetAuthoringProvenance`, and accepted by install and
  upgrade through a schema extension in `schemas/commands.ts` (a companion path), so the builder
  can save the copy again. `schemas/widget-package.ts` (the module-bundle importer) is unchanged;
  see the scope notes.
- **`scene.repoint-widget`** (`commands/scene.ts`): moves a placed instance onto its fork, or back
  to the widget a fork came from.
  - It refuses any other type, so it cannot bypass `scene.add-widget`'s checks.
  - The target must be installed. It may be off; the scene read then reports the tile `disabled`.
  - The instance's configuration must fit the target's schema. Id, layout, binding and local state
    are kept; `disabled` is cleared.
  - DM-only, with op `scene.repoint-widget` and event `scene.widget-repointed`.
- Registered in `types.ts`, `dispatch.ts` and `index.ts` (companion paths).

### App

- **Kept drafts** (`draft.ts`, `WidgetBuilder.tsx`):
  - A draft that differs from what the builder opened with is kept under the id of the package the
    builder opened on (the empty key for a new widget) until it is installed, saved or discarded.
  - Closing it (Escape, Back, the platform gesture) asks **Keep draft / Discard draft** in a DS
    Dialog. Escape on that question returns to the builder.
  - Opening the builder on a package with a kept draft asks **Resume draft / Start over**. It is a
    forced choice, and focus returns to the builder afterwards.
  - The store functions are pure: `readStoredDraft` / `writeStoredDraft` / `removeStoredDraft`, at
    most 12 drafts, oldest dropped first. A stale or corrupt value is read over fresh defaults.
  - `isDraftDirty` ignores key order. `resumeDraft` rebases the version fields when the package
    moved on since the draft was kept.
  - The builder closes in an effect after the Dialog's cleanup, so focus returns to its opener: the
    Dialog's isolation otherwise left the opener inert at that moment (it failed `toBeFocused`).
- **Edit widget** (`useEditWidget` in `WidgetBuilder.tsx`; `widgetEditTarget` in `draft.ts`):
  - It is in the canvas tile menu, the flow tile menu (`TileActionMenu.tsx`) and the Inspector
    (whose "Edit widget definition" button now uses it).
  - The GM's own single-widget package opens as it is. Otherwise an unplaced copy from an earlier
    edit is reused (its kept draft resumes), or the widget is forked.
  - The tile moves onto the copy at once. A copy that starts off (custom code) reads "disabled,
    preserved" until the builder saves it: the upgrade turns it on and the slot mounts a fresh
    sandbox with the saved code. Closed with the copy still off, the tile goes back to the original.
  - The builder opens on Data, or Advanced for custom code.
  - The builder is portalled behind a fence that stops key, wheel and context-menu events reaching
    the canvas through React (Ctrl+Z would undo the board, the wheel would pan it). The builder now
    hears Escape/Tab on its own overlay, plus the document for a key pressed outside it.
- **`readPackage` reads a starter's own files.** The builder only knew its own root paths
  (`index.html`, `styles.css`, `main.js`). Torchlight keeps its files under `widgets/torchlight/`
  with a whole HTML document, so a forked Torchlight opened with empty CSS and JS and lost both on
  save. `readPackageCustomCode` finds the stylesheet and script by declaration and kind, and lifts
  the body out of the document without the link and script tags the builder's document adds back.
- Copy: EN/ES `extensions.builder.keepTitle/keepBody/keepDraft/discardDraft/resumeTitle/resumeBody/
resumeDraft/startOver/forkName/forked`. `qps-ploc.ts` regenerated. The tile menus' "Edit widget"
  is English-only, like the rest of their `TEXT`.
- `docs/architecture/WIDGETS.md`: new §5.2 Forks; §6 kept drafts and Edit widget; "where to look".

## Attempt 2 — the claim fence

Attempt 1 crossed two paths, and the gate refused both. Both are reverted to `fe996760`:

- **`platform/preferences.ts`** (a `widgetDrafts` key). The Acceptance line asks for "Escape on a
  dirty draft then reopen resumes it". It does not ask for survival across a reload, so device
  preferences are not required. Drafts are now held for the life of the document (`keptDraftStore`
  in `draft.ts`), which also keeps them per vault, because a vault switch reloads the document. The
  store holds the same serialized value the tested functions read and write, so moving it to device
  preferences is one `PREFERENCE_KEYS` entry plus the store's two lines. HANDOFF below.
- **`app/widgets/WidgetRenderSlot.tsx`** (keying the renderer by version). It was needed because
  attempt 1 re-pointed a custom-code tile only after the save. The tile's sandbox was already
  mounted, and `SandboxHost` sends its document once, at load, so it kept drawing the old markup
  ("Pause flicker"). Attempt 2 re-points at once, as the story orders it ("re-points the placed copy
  … and opens the builder"), and allows a switched-off target in `scene.repoint-widget`. The tile
  shows the placeholder while the copy is off, and the save mounts a fresh sandbox. HANDOFF below
  for a second edit of an already-placed custom widget.

## Tests and evidence

- **Core `packages/core/tests/widget-fork.test.ts`: 11 pass.**
  - A bundle's widget forks into `user.<type>`. The test checks: provenance, one widget, fresh type
    and version, author-trusted and enabled with all permissions denied, the source untouched, the
    ops (`widget.package.fork`, then `widget.package.review` basis author) and the events.
  - Torchlight forks `unreviewed`, off, all permissions denied, with its assets. The rule's refusals
    are `not-template` and `code-asset`.
  - A denied source and an unreviewed generated source keep a qualifying copy off; a trusted
    generated source does not.
  - An approved `clipboard` permission is not copied.
  - Numbering, caller ids, and taken/non-slug ids refused.
  - A player, a missing source or widget, and a builtin renderer are refused.
  - A fork is saved again through upgrade with `forkedFrom` intact.
  - Repoint onto the fork and back keeps id, layout and settings. It refuses an unrelated sibling,
    the same type, a player, and a removed fork. A switched-off copy reads `disabled` and turns on
    with the saved version.
- **App `apps/gm-react/src/app/widgetBuilder/draftStore.test.ts`: 11 pass.** Covered: keep/read by
  package id, replace and remove, the 12-draft cap, malformed and stale values, the round trip
  through build and read, Torchlight's own files read and built back runnable (one link, one script),
  `resumeDraft`'s rebase, key-order-insensitive dirtiness, the edit step, and `widgetEditTarget`
  (fork → copy reuse → own; nothing for builtin or removed).
- **E2E `apps/gm-react/tests/e2e/widget-edit-fork.spec.ts`, `--project=desktop-chromium
--project=mobile-chromium`: 4 passed.**
  - **Drafts:** an untouched builder closes on Escape with no question. A dirty one asks; Escape on
    the question returns to the builder. Keep closes and focuses the opener. After leaving
    Extensions and coming back, opening the builder asks to resume; Resume focuses the builder and
    restores the step and the name. Nothing was installed. Discard forgets the draft.
  - **Torchlight:** Edit widget makes `user.torchlight` and moves the tile onto `torchlight-copy`;
    Escape moves the tile back. A second Edit widget reuses the copy (no new package) and opens on
    Advanced, with the copy `unreviewed` and off. The markup edit "Pause flicker" → "Hold the flame"
    is followed by Review and Save new version. Then: `user.torchlight` 1.0.1, enabled,
    `user-authored`, `forkedFrom` the starter; the tile is on `torchlight-copy`; the starter record
    is unchanged; and the tile's sandbox shows a "Hold the flame" button, with the script drawing
    "… of 10".
  - **Negative control:** with `keptDraftStore.write` a no-op, the drafts test fails (no resume
    question). Restored and verified. Attempt 1's run is the control for the tile: with the re-point
    after the save, the frame still showed "Pause flicker".
- `widget-builder.spec.ts` updated for the new behaviour. The Inspector edit opens on Data, and
  Escape on the dirty edit is answered with Discard draft.
- Neighbouring e2e, both profiles (add-panel, binding-inspector, board-layouts, canvas-arrange,
  canvas-history, canvas-keyboard, canvas, custom-widgets, extensions-polish, flow-layout,
  hub-templates, scene-editor-polish, starter-widgets, widget-author-trust, widget-builder,
  widget-commands, widget-edit-fork, widget-generate, widget-intents, widget-kit,
  widget-query-sources, widget-trust-review): see "Neighbour run" below.
- `pnpm typecheck` exit 0. `pnpm lint` exit 0, with 16 warnings, none in a file this task touches.
- `pnpm gates` exit 0. The 800-line gate passes: WidgetBuilder 770, TileActionMenu 747; both are
  warn-only.
- `pnpm test`, all four configs: core 5265, cloud 569, app 2048, tooling 246, all passed.
- Prettier was run on each changed file. The `DefinitionPane` "Function components cannot be given
  refs" console warning in the dev-server log comes from the untouched `BuilderPanes.tsx`.
- Headroom tools were not used; I read native command output and log files directly.

## Security review

The `/security-review` report is [`state/RC-WID-6.6.security-review.md`](RC-WID-6.6.security-review.md).
It found **no HIGH or MEDIUM finding at confidence ≥ 8**. It covers:

- the fork's authority and caller-controlled fields;
- trust laundering: approved permissions, denied and untrusted generated sources, custom code;
- id/type hijack;
- `forkedFrom` as provenance only;
- the repoint lineage and the switched-off target;
- drafts and the sandboxed code reader.

It notes one pre-existing issue, out of scope: an upgrade re-enables an unreviewed or denied
package. The dispatcher brief forbids extra agents, so the skill's sub-task phases ran inline.

## Scope notes

- Changed paths are owned or companions: `schemas/commands.ts`, `commands/types.ts`,
  `commands/dispatch.ts`, `index.ts`, the i18n catalogs and `qps-ploc.ts`, `*.test.ts`,
  `tests/e2e/*.spec.ts`, `docs/architecture/WIDGETS.md`, and this journal and report.
- "Through the existing layout command": no existing command changes a tile's type. The re-point is
  a new scene command in the owned `scene.ts`.
- `app/widgetBuilder/index.tsx` (`CanvasWidgetBuilder`) has no caller left after the Inspector
  moved to `useEditWidget`. It is not owned, so it is left in place.
- HANDOFF (RC-UX-4.1 / preferences owner): add `widgetDrafts` to `PREFERENCE_KEYS` (vault-scoped,
  in `VAULT_PREFERENCES`), then point `keptDraftStore` at `readPreference`/`writePreference`/
  `removePreference`, so kept drafts survive a reload as the story's prose asks.
- HANDOFF (widget render owner, `WidgetRenderSlot.tsx` / `SandboxHost.tsx`): a saved new version of
  a custom widget whose tile stays mounted (a second edit of your own copy, or any builder upgrade)
  keeps drawing the old code until the tile remounts. Keying `WidgetErrorBoundary` by
  `${widget.type}@${definition.version}` fixes it (tried in attempt 1).
- HANDOFF (`schemas/widget-package.ts` owner): the module-bundle importer still parses `authoring`
  strictly, so a bundle carrying a forked package's `forkedFrom` is refused. Install and upgrade
  accept it.
- HANDOFF (RC-WID-6.7 / a new story): `widget.package.upgrade` sets `enabled: !failed` regardless of
  trust. Saving an `unreviewed` copy turns it on (sandboxed, every permission denied), and an upgrade
  re-enables a `denied` package.
- No push, promotion, loop launch, dispatcher state edit or additional agents.

## Neighbour run

The 22 specs listed above, `--project=desktop-chromium --project=mobile-chromium`, on the attempt-2
code (`DNDTOOLS_E2E_PORT=5391`, a private port): **251 passed, 5 skipped, 0 failed** (256 tests,
5.9 min, exit 0). Attempt 1's partial run of the same set, cut off when that session ended at 86 of
256, had no failure either.

## Attempt 3: visual regression red on `scene editor inspector` (head `76cc57d0`)

The pinned-container visual gate failed 15 tests and passed 501. All 15 were
`tests/visual/scene-editor-polish.spec.ts:62` "scene editor inspector": 5 themes on each of
`visual-desktop`, `visual-rail` and `visual-phone`, with 6–10% of pixels different. The actual image
showed one extra row, an **"Edit widget definition"** button on the Inspector of **Dice**.

That was a logic error, not a stale baseline. Dice is a system widget ("System · locked content")
that renders through an `action-panel` template, but the app draws it with a hand-written body keyed
by its type. My edit target admitted every `template`/`custom-html-js` widget, so it offered to copy
Dice. A copy under a new type would have lost that body and drawn as the bare template.

Fix: system widgets (`author: 'system'`) are neither copyable nor editable.

- **Core:** `widget.package.fork` refuses them ("is a system widget, so it cannot be copied").
- **App:** `widgetEditTarget` returns null for them, so neither the tile menus nor the Inspector
  offer "Edit widget".
- Starters (`workspace`) and the GM's own packages (`user`) are unaffected; Torchlight is a starter.
  The baselines are unchanged.

Evidence:

- Core `widget-fork.test.ts`: 11 pass. The refusal test now also forks a system template widget and
  expects "system widget".
- App `draftStore.test.ts`: 11 pass. The edit-target test asserts Dice is `author: 'system'` with a
  `template` entrypoint and gets no target.
- **Negative control:** with the app-side check removed, that test fails. Restored.
- `apps/gm-react/tests/visual/run-in-container.sh tests/visual/scene-editor-polish.spec.ts` (the
  pinned image, all three visual projects): **15 passed**, exit 0, with no `--update-snapshots`.
- E2E on both profiles for `widget-edit-fork`, `widget-builder`, `scene-editor-polish` and `canvas`:
  **122 passed, 2 skipped**.
- `docs/architecture/WIDGETS.md` §5.2 now says system widgets are not copied.
