# RC-POL-1.9 — Atlas and map editor polish

## Scope and baseline

- Task branch: `dispatch/dndtools/bff1c8e7b38ad94c9684`; initially clean.
- Owned surfaces: `src/screens/atlas` and `src/app/map`; supporting tests, translations,
  visual baselines and FEATURE-GAPS inventory are part of the requested acceptance evidence.
- No push, promotion, dispatcher changes or additional agents.
- Baseline inspection: ten source files exceed the required 499-line maximum (largest:
  MapEditor 1140, EditorCanvas 1071). Existing library thumbnails and coach marks make the
  FEATURE-GAPS Atlas row stale. Visual suite currently supports Tavern, Parchment and High Contrast.
- Original base revision: `2d9f566d194d10e597c8001015b7e8be31811d59`; rebased on 2026-09-24 onto
  `loop/rc` `deec5c9d834b97b49e2baed0515139bd351b716f` (see "Resumed attempt" below).

## Work log

- Read roadmap §20.2–§20.5, route/editor composition, current visual runner and owned-file inventory.

- Split Atlas orchestration, editor shell/header/notices/palette, canvas navigation/rendering and
  marker commands, import state, generation preview state, inspector panels, layer dialogs and
  tool controls. Keep actor reads, command dispatch, pointer capture and undo behavior intact.
- Migrated owned inline spacing/radii to DS tokens and removed 39 owned style allowance entries.
  The native color input's authored light pigment remains an explicitly documented data literal.
- Added library skeletons, search-specific empty illustration, meaningful sub-24px sans headings,
  localized Atlas outcomes and editor export/sheet copy in EN/ES, delayed deep-link validation until
  hydration, and caught failed POI restoration instead of leaving an unhandled rejection.
- Initial functional run: 153 passed, 5 intentionally skipped, 4 failed. Two tests on each profile
  depended on the old empty illustration/circle CSS value; updated them to check search-none and
  the actual brush-preview element. No behavioral failures in this run.
- Strict axe scans found low-contrast import helper text and a shortcuts scroll region without a
  keyboard target. Fixed the import text; the shared `app/help/ShortcutsDialog.tsx` receives one
  focusable named region because that overlay is mounted by the map editor. This is a minimal
  supporting accessibility fix outside the owned directories; no registry exemption added.
- Axe waits for finite entrance animations to finish, avoiding a scan of partially transparent
  dialog text. Empty, creation, filtered, unavailable-link, base-editor, export, import, command
  palette, shortcuts and mobile panel states pass on both profiles (six tests at this stage).
- Source confirms five presets, despite the old golden-route suite registering only three. Added
  a dedicated Atlas visual suite sharing the deterministic clock/font/seed fixture; empty library,
  populated library and open editor now each have five themes × three tiers (45 images).
- Focused map/Atlas/i18n unit suite: 9 files, 90 tests passed.
- `pnpm gates` passes; its unrelated source warnings remain, with zero warnings for owned paths.
- Visual contact-sheet review caught the rail editor header wrapping its Export label vertically;
  compact header treatment now applies to the rail tier. Final review covered all 45 Atlas images.
- Strict layer-overlay scans also found invalid list nesting and selected-row/danger-action
  contrast. Corrected the semantics and token choices without axe exclusions. A locked-layer
  rejection test verifies tag drafts survive a failed save and can be retried successfully.
- The full functional run caught the new compact saved icon narrowing the phone title below its
  existing width guard; reducing the compact header gap to the half-space token restores room.

### Resumed attempt (2026-09-24)

- The 2026-09-20 candidate was refused for paths outside its claim. The operator has since added
  `app/help/ShortcutsDialog.tsx` to owns, and the manifest now grants `tests/visual/*.ts` and
  `state/RC-POL-1.9.*`, so every changed path is now in scope.
- Rebased onto `loop/rc` `deec5c9d` (136 commits ahead). Conflicts resolved: `golden-routes.spec.ts`
  kept `loop/rc`'s version (it had grown five-theme /display and /audio blocks), so the first attempt's
  `route-fixture.ts` extraction was dropped and the Atlas golden test stays where it was. FEATURE-GAPS is `loop/rc`'s
  table with this story's Atlas row. The raw-style allowlist drops both the Atlas and the RC-POL-1.13
  Audio entries; `pnpm lint:raw-style-count --write` regenerated identical entries (only the stale
  total comment changed).
- Visual budget: `loop/rc` holds 32,746 of 32,768 KiB, so the 36 new full-page Atlas images (≈4.2 MiB)
  could not land. Following RC-POL-1.5's precedent, `atlas.spec.ts` now pins Scholar and Dungeon as
  clipped, text-free bands (editor tool rail; map-library illustration) on every tier. The library/
  loading/search-none states keep their functional and axe coverage in `atlas-polish.spec.ts`.
- Re-verified on the rebased tree: typecheck, owned ESLint, 93 unit tests, `pnpm gates`, full visual
  suite (378 passed) and the surface e2e set on both profiles (167 passed / 5 profile-specific skips,
  `--retries=0`, 5.6 min).

### Gate feedback: Lint (candidate `ff4ca07f`)

- The central Lint gate failed on `pnpm lint:emphasis` (not ESLint): `MapChips.tsx` could show two gold
  primaries (Open was always `primary` and New map was `primary` with nothing selected, so an empty DM
  Atlas really did show both), and the Atlas region's surplus rose from 2 to 3. My earlier check had
  run ESLint on the owned files only, not the full `pnpm lint` chain.
- Fix: the chips bar renders one gold action per branch (Open for a selection, New map for a DM with
  none), and the canvas Fog of war overlay button is `secondary`. The emphasis baseline is unchanged
  (it may only shrink and is outside this claim). `multiple-accent-primaries` total is now 53 (was 55 on the candidate).
- Re-verified: full `pnpm lint` exit 0 (13 pre-existing warnings elsewhere); surface e2e on both profiles
  167 passed / 5 profile-specific skips with `--retries=0`; the 21 Atlas visual captures (9 golden +
  12 crops) match with `--update-snapshots=none`.

## Embedded §20.2–§20.5 audit

Checked boxes mean reviewed with the stated evidence or explicit waiver; they do not erase the
limitations written beneath them.

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
      Partial waiver: the spatial SVG/canvas renderer and native file/color/number inputs remain because DS primitives do not implement those semantics. Fixed geometry and compact font metrics remain intentional; spacing/radii and UI colors use tokens. Owned DSN lint is clean; the one authored light pigment is a documented data exception, not a UI color.
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
      Checked against the vendored `templates/map-editor/MapEditor.dc.html`: breadcrumb, visibility, projection action, tool rail, canvas, layers and minimap remain. Deviations: accessible list view, Android navigation-first rail and bounded phone sheets implement later requirements. Live external prototype comparison waived: no DesignSync provider is available in this task.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
      Open editor (or New map while a DM has nothing selected) is the top-region primary action, rendered as whole-element branches so only one gold button can show; the canvas Fog of war overlay is secondary; Project is the editor header primary action. Supporting library cards stay flat. The map canvas uses the shared DS surface/border treatment; a full-window workspace does not need a floating-card shadow (waived for the viewport itself).
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
      No owned Cinzel text remains below 24px; editor/map/generation headings use sans. Numeric status and coordinates use mono. Partial waiver: the established dense tool/metadata hierarchy retains 10.5–13px steps; collapsing every specialized numeric readout to a single size would increase wrapping in the existing control set.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
      Notice severity has distinct warning/info/check icons, visibility has labelled chips and DM styling, and selected library cards expose aria-current. Layer selected/locked state remains named.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
      Every theme on every tier, within the shared baseline budget: the golden-route `atlas-map-editor` full captures (Tavern/Parchment/High Contrast × desktop/rail/phone, 9 images re-baselined for the polished header) plus `tests/visual/atlas.spec.ts` clipped, text-free bands for Scholar and Dungeon on every tier (editor tool rail with the gold active tool, and the map-library empty illustration; 12 images, ~0.9 KiB each). Waiver: the 45 full-page captures from the first attempt (5.5 MiB) no longer fit — `loop/rc` holds 32,746 of 32,768 KiB — so library/search-none/loading states are covered by `tests/e2e/atlas-polish.spec.ts` assertions and axe scans rather than pixels. Raising the cap is an owner decision outside this story. Reviewed; the rail header defect found in the first attempt's review stays fixed in the golden captures.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
      No new animation added. Shared Skeleton and overlay motion use the app motion preference/clamp; visual tests set reduced motion. Existing renderer reveal motion stays in its shared hook.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.
      Library empty and search-none illustrations, loading skeleton cards, unavailable editor recovery, and role=alert rejection paths are present. There is no error/loading-specific illustration key in the current registry; those states use skeletons or warning icons instead of an unrelated drawing.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state.
      Commands set busy state before awaiting dispatch; accepted edits immediately update the actor view. Notices/toasts report outcomes. Rejected tag saves now keep the dialog and draft open with the actual rejection.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing.
      Editor destructive commands retain undo history; layer deletion and clear-fog confirmations retain their named targets. Atlas POI deletion offers Undo; restore failure now reports an error instead of an unhandled promise.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next.
      Atlas and every editor header tier expose Saved/Saving status (compact editor uses a named status icon); failures are inline alerts. Import failure recovery stays in the wizard.
- [x] One clear route back; browser back works; Android Back follows the documented order.
      Back to Atlas restores opener focus; URL navigation remains React Router owned. Existing breadcrumb and Android Back tests exercise hierarchy and overlay ordering.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android).
      Primary authoring has both keyboard/list and pointer paths; shortcuts are discoverable in tooltips and the ? dialog. Shared density rules supply touch sizing and Android 48dp targets. Spatial markers are exempt from 44px geometry because enlarging the artwork changes the map; the list provides the full non-spatial equivalent.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet.
      Compact editor keeps Project primary; Export/import are in the bounded popover and panels in the bounded sheet. The rail header now uses compact controls instead of vertically wrapping action names.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present.
      Atlas outcomes, export/sheet copy and canvas operation feedback have matching EN/ES catalog entries. Names supplied by the user and core rejection details are preserved verbatim. Partial waiver: shared bulk-result phrasing and DS-internal labels are owned by their common components; changing their cross-surface translation contract is outside this surface pass.
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips.
      ToolRail and options keep their named hints and shortcut tooltips; ? reads the shared shortcut registry. Dedicated HelpTip duplication is waived where the same control already has visible guidance or its named tooltip; generation/import retain inline explanations.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged.
      Strict axe test scans the route and creation/filter/error states, editor, export/import, palette, shortcuts, mobile panels, layer menu, tags/rejection and delete confirmation on both profiles, with no register exemptions. Existing graph/list axe specs also run.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR; focus visible everywhere.
      Keyboard trace: focus Open in map editor → Enter → editor dialog; Search opens palette → Escape returns; ? opens shortcuts and its focusable scroll region → close; Back to Atlas returns focus to opener. Existing keyboard-only list test renames a POI and keyboard drawing/selection specs cover the primary authoring paths.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled.
      AppShell owns the Atlas h1 from SECTION_TITLES; editor isolates the shell and owns its map-name h1 and labelled breadcrumb. Library now has a semantic h2. Layer listitem owns its action dialog, with the inner interactive row a named group.
- [x] Live regions announce operations; no announcement spam.
      Busy/completion status is polite; command refusals are alerts. EmptyState is not a permanent live region. Announcements occur after accepted commands, and unchanged status text is stable.
- [x] Screen-reader spot check on one platform noted.
      Waived spoken screen-reader session: this environment exposes Chromium automation, not a configured screen-reader/audio session. Chromium accessibility-tree and keyboard tests verify names, roles, focus restoration, list editing and the newly focusable shortcuts region; no claim of human NVDA/VoiceOver testing.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions.
      200% root text test reaches list view and returns to Atlas on both profiles. Existing native/compact reachability tests run; new rail case bounds action heights and the right edge of the header. The only new keyboard target is inside the existing shortcuts scroll region.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering.
      Durable writes remain runtime.dispatch only. Atlas/useMapEditor read actor-scoped list/view/layer queries; canvas filtering is viewport culling and display-enabled layers, not permission logic.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly.
      Existing map-editor preview/no-leak test verifies player-safe content; authoring controls follow editor.isDm and runtime dispatch retains read-only preview rejection.
- [x] Player projection of this surface verified through an actor read in an e2e.
      Atlas projected-shared-map regression reads through the projected player and checks its layers; map-tile tests cover projected fog and combat visibility.
- [x] e2e on both profiles covers the primary task and one failure path.
      Both profiles run Atlas, editor, library, coach, room graph, tile and Android quick-map specs, plus the new polish states and locked-layer tag-save rejection/retry.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression.
      Interleaved ENG-1.1 map-pan-zoom capture compares this work to the unchanged task base with 4 layers/100 POIs on the same workstation. Raw samples and the graded summary are attached as local journal artifacts; measured budgets and limitations are recorded below.
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved.
      FEATURE-GAPS Atlas row now includes the shipped gallery/coach and current polish coverage, retaining the legacy-token-array gap. No core, persistence, actor-read or projection contract changed, so no architecture document change is required.

## Verification commands and results

- `pnpm typecheck`: exit 0 for core, cloud functions and GM app (also after the rebase).
- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/map apps/gm-react/src/screens/atlas apps/gm-react/src/i18n`: 9 files / 90 tests passed; rerun after the rebase: 9 files / 93 tests passed.
- ESLint on both owned directories, shared ShortcutsDialog, EN/ES catalogs and changed browser/visual specs: exit 0. `pnpm lint:boundary`: passed.
- `pnpm gates`: exit 0; no warning for either owned directory. The existing 49 warnings elsewhere remain outside this task. Independent line inventory: 88 owned files, maximum 488 lines. After the rebase: `pnpm gates` exit 0 with 38 file-size warnings, none on `app/map`, `screens/atlas` or
  `ShortcutsDialog.tsx`; 86 owned TS/TSX files plus CSS, maximum 488 lines (`useEditorCanvas.ts`, `tools.ts`).
- First attempt (base `2d9f566d`): 45 full-page Atlas baselines, 156 visual tests passed, budget 17078 KiB. Superseded
  by the resumed attempt below because those images no longer fit on `loop/rc`.
- Resumed attempt (base `deec5c9d`): `bash apps/gm-react/tests/visual/run-in-container.sh atlas.spec.ts --update-snapshots=all --workers=2`
  wrote the 12 clipped Scholar/Dungeon baselines (12 passed); each reviewed by eye.
- `bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2`: **378 passed**, exit 0, no
  retries, including the 9 golden `atlas-map-editor` images carried from the first attempt. No other surface's baseline changed.
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`: 456 images, 32762.4 KiB of 32768 KiB; per-image limits pass.

Functional suite command (both profiles, no retries):

```sh
pnpm --filter @dndtools/gm-react exec playwright test \
  tests/e2e/atlas.spec.ts tests/e2e/atlas-polish.spec.ts \
  tests/e2e/map-editor.spec.ts tests/e2e/map-library.spec.ts \
  tests/e2e/map-onboarding.spec.ts tests/e2e/map-room-graph.spec.ts \
  tests/e2e/map-tile.spec.ts tests/e2e/android-quick-map.spec.ts \
  --project=desktop-chromium --project=mobile-chromium --workers=2
```

A run concurrent with the cold visual container/typecheck startup passed 165 tests, skipped five,
and timed out its first two Android-emulation tests at `waitReady` before runtime initialization.
Their captures were blank before any map action. The isolated rerun passed **167 tests**, with the same five profile-specific skips, in 2.9 minutes; no readiness timeout, assertion or retry setting was relaxed. The five existing skips cover
profile-specific hierarchy/flyout, compact-title and touch behavior, exercised by the other profile.

Final functional result: exit 0, **167 passed / 5 profile-specific skips**, no retries. This includes all ten new strict polish/axe tests. Rerun on the rebased tree (base `deec5c9d`) with `--retries=0`: same 167 passed / 5 skipped, exit 0.

## Before/after performance

Final capture ran alone, interleaving seven batches per revision on the same workstation using
`scripts/perf/capture.ts --only map-pan-zoom-desktop,map-pan-zoom-slim --port 5965 --out /tmp/atlas-perf-after.json --reference-root <archive-of-task-base> --reference-port 5966 --reference-out /tmp/atlas-perf-before.json`.
The reference is a Git archive of the base SHA above, using the same installed dependencies.
The candidate is this commit's source, captured before committing. No repository-wide performance
baseline was replaced. Hostname is sanitized; samples are unchanged.

| Budget               |     Before |      After |  Target | Result                   |
| -------------------- | ---------: | ---------: | ------: | ------------------------ |
| Map pan/zoom desktop | 59.880 fps | 59.524 fps | ≥50 fps | PASS; 0.6% drift, steady |
| Map pan/zoom slim    | 59.880 fps | 59.880 fps | ≥30 fps | PASS; 0% drift, steady   |

Grading uses the existing `measureCapture` median-of-seven aggregation and core `compareToBaseline`
with its 20% tolerance. This measures the registered 4-layer/100-POI fixture in desktop/slim Chromium;
it is not physical Android or dense-map hardware certification.

- [Before samples](RC-POL-1.9.perf-before.json)
- [After samples](RC-POL-1.9.perf-after.json)
- [Graded comparison](RC-POL-1.9.perf-summary.json)

## Handoff

All 28 embedded checklist items have evidence or an explicit limitation/waiver above. The intended
source, tests, EN/ES copy, FEATURE-GAPS row, 9 re-baselined golden Atlas images plus 12 clipped Scholar/Dungeon baselines and this evidence are committed together
on the task branch. Central independent review and integration remain the operator's responsibility.

Final staged-file formatting and `git diff --cached --check` pass. `pnpm gates` was rerun after adding the evidence and passes with the same 49 unrelated warnings and zero owned warnings.
