# RC-POL-1.14 — Extensions polish (plugins, widget builder, systems, types, compendium)

## Scope and starting point

- Task branch `dispatch/dndtools/405d3e76eb98630539f6`. The previous attempt stopped at the provider
  allowance limit with no commits. The branch sat at `30db68d1` (RC-WID-4.4), an ancestor of
  loop/rc, so I fast-forwarded it to loop/rc `3f4b96e4` before starting. That tip carries the
  five-theme visual suite and the emphasis lint this checklist depends on.
- Owned: `screens/extensions`, `app/widgetBuilder`, `app/systemBuilder`, `app/compendium`. Companion
  edits the acceptance needs: EN/ES catalogs, the raw-style allow-list (regenerated, entries only
  removed), the FEATURE-GAPS Extensions row, `custom-types.spec.ts` (confirm copy now names the
  type), a new `tests/e2e/extensions-polish.spec.ts`, and a new `tests/visual/extensions-polish.spec.ts`
  with its baselines. No push, promotion, dispatcher state or other agents.
- Starting findings: 345 raw style values across the surface, five files over 500 lines
  (`System.tsx` 779, `Compendium.tsx` 667, `Plugins.tsx` 635, `CustomTypes.tsx` 629,
  `widgetBuilder/draft.ts` 594), 12 ad hoc font sizes and Cinzel at 13–21 px, five emphasis
  findings in owned files, no Extensions visual coverage, a hard-coded English dialog label, and
  confirms that neither named their target nor received focus.

## What changed

- **Tokens.** All 345 raw spacing/radius values moved to `--space-*` / `--radius-*` (nearest step,
  ties round down), and the one raw hex (the custom-widget template's colour fallback) became
  `CanvasText`. Font sizes map onto `--text-xs/sm/base/md`. Cinzel stays only on the System detail
  title, now 24 px. The allow-list lost all 35 Extensions entries. Two 1 px values the codemod had
  zeroed were checked: the System "declares" grid hairline is restored as
  `calc(var(--space-0-5) / 2)`, and the other (a 1 px title/subtitle gap in BuilderPreview) is
  left at zero.
- **Splits (every owned file ≤ 468 lines).** `System.tsx` → `SystemDialogs.tsx` (dry-run and copy
  dialogs) + `SystemDetail.tsx` (detail panel and "Build your own" card). `Compendium.tsx` →
  `CompendiumSourcePicker.tsx`, `CompendiumResults.tsx`, `useCompendiumImport.ts`. `Plugins.tsx` →
  `PluginPackageCard.tsx`, `usePackageActions.ts`. `CustomTypes.tsx` → `CustomTypeRow.tsx`,
  `CustomObjectInstanceDialog.tsx`. `WidgetBuilder.tsx` → `app/widgetBuilder/BuilderPanes.tsx`.
  `draft.ts` → `validate.ts`. `DataStep.tsx` → `dataOptions.ts`. Behaviour is unchanged. The
  dispatch code moved verbatim.
- **Emphasis.** The JSON install and the widget-switch "Preview" are secondary now, so "Build a
  widget" and the package dry-run are each region's single gold action. The trust sheet's
  per-permission control is the screen-kit `Seg` tint (a gold fill on every row read as N
  primaries). Both builders render their step body inside the `role="dialog"` element, so the
  Review step's primary belongs to the overlay's region rather than the screen behind it.
- **Confirms and focus.** Remove, delete and re-import confirms name their target ("Yes, remove
  Table Roller", "Yes, delete Guild (1 in vault)"), and every trigger has a name-bearing label.
  `autoFocus` on the swapped-in confirm never took effect: focus sat on `<body>`, measured with
  `document.activeElement`. The new `useFocusOnReveal` moves focus onto the confirm for all three.
- **States.** Compendium no-match uses the `search-none` illustration and "unavailable" uses
  `connection-lost`. The source-list failure has an error icon, alert text, Retry and Cancel, and
  the "needs the live API" notice has a warning icon and a status role. Plugins and Custom types
  empty states use DS `EmptyState` (no illustration key exists for them). Every read-only notice
  is a `ReadOnlyNote` with a lock shape.
- **Contrast.** Parchment's tertiary text is only tuned for raised surfaces, so this surface uses
  `T.sub` wherever it had `T.ter`. `accent` badges are replaced by neutral + DM-only icon,
  neutral + permissions icon, or success + check. The compendium result count lost its 0.75
  opacity. Trust badges carry a distinct icon per state.
- **Copy (EN/ES).** New keys: builder dialog label, `importLabel`, `removeLabel`, `editLabel`,
  `deleteLabel`. The confirms and the Edit-type title now use the type's label, not its id. "Searching…"
  and "Unavailable" are capitalized like their sibling badge. The label/aria-label mismatch on
  the custom-type name field is gone (a wired `<label>`), and the now-unused `customTypes.label` key
  is removed.
- **Semantics.** The System "declares" `<dl>` puts each `dt`/`dd` directly in its row `div` (axe
  `dlitem`, serious). A scrolling finding group in the switch dialog is a named, focusable region
  (axe `scrollable-region-focusable`).

## Embedded checklist: each item checked or explicitly waived

### 20.2 Design fidelity

- [x] Composed only from `src/ds` primitives and `screen-kit`; zero raw hex/rgba/px literals (DSN-1.1 lint clean for this directory).
  - **Evidence:** An allowance-free `dsn/no-raw-style-values` run over the four owned directories
    reports 0 (was 345). The allow-list has no owned entries (35 removed, regenerated with
    `raw-style-count.js --write`, 2430 → 2085).
- [x] Matches the prototype view for this section (`docs/design/README.md` §4) and the design-package template where one exists; deviations listed with rationale.
  - **Evidence / waiver:** `templates/system-package-picker` (gallery ↔ detail) is what `System.tsx`
    already follows, and this pass kept that layout. There is no widget-builder template
    (`docs/design/README.md` §4 says so), and the remote prototype needs DesignSync, which this
    runner does not have. No other deviations were introduced.
- [x] One primary action per region in gold; supporting tiles flat/sunken; the primary panel raised with `--shadow-md`.
  - **Evidence:** `pnpm lint:emphasis` reports no finding in any owned file (5 before). The Board
    and Scene editor findings that counted the widget builder's Review primary cleared too, since
    the overlay is now its own region. The System detail panel, the tab's primary panel, is raised
    with `--shadow-md`. Cards and rows stay flat. I did not lower `scripts/emphasis-baseline.json`:
    it is shared and a fix does not have to touch it.
- [x] Type hierarchy uses 3–4 sizes; Cinzel only ≥ 24px; numbers in mono.
  - **Evidence:** Owned text uses xs/sm/base/md, plus xl for the one display title. Cinzel is gone
    below 24 px in owned code (emphasis lint `display-face-below-24px`: 0 owned). Counts, ids,
    versions and JSON are mono.
  - **Waiver:** Panel headings (`screen-kit` `Panel`, 14 px Cinzel small caps) belong to screen-kit,
    which this story does not own.
- [x] Every status color paired with a distinct icon shape; DM-only purple stripe where applicable.
  - **Evidence:** Trust badges show check / warning / error. Migration failure has an error icon,
    network destinations a warning icon, DM-only field counts the DM-only icon, and permission
    requests the permissions icon. Compendium notices carry error / warning icons.
  - **Waiver (stripe):** Every Extensions panel is DM configuration. Player preview gets the
    lock-marked `ReadOnlyNote` instead, so a purple stripe on every panel would carry no
    information.
- [x] Renders correctly in all themes and all three tiers; visual snapshots updated and reviewed.
  - **Evidence:** 75 new baselines in `tests/visual/extensions-polish.spec.ts`: the route, the
    named remove confirm, and Compendium loading / empty / error, each × five themes × three
    tiers. Strict container compare passed 45/45. I reviewed tavern and high-contrast desktop,
    parchment phone, dungeon rail confirm, scholar empty, high-contrast phone error and parchment
    rail loading by eye.
  - **Budget note:** The first full-page capture came to 3.6 MiB and broke the 32 MiB budget. Route
    captures are now `#main-content` (the shell has its own goldens) and the state captures are the
    changed element: +2161 KiB, 31881 / 32768 KiB.
- [x] Motion uses named tokens; nothing animates under `data-motion='reduced'`.
  - **Evidence:** Owned files declare no transition or animation, and nothing new was added. Specs
    and the visual projects run with reduced motion.
- [x] Empty, loading, error, and "unavailable because…" states all present and illustrated where the key exists.
  - **Evidence:** Compendium loading (announced `LoadingRegion` + skeletons), no match (`search-none`),
    unavailable (`connection-lost`), source-list failure (alert + Retry/Cancel), needs-live-API
    notice. Plugins and Custom types empty states use `EmptyState`. Every disabled write explains
    why in a lock-marked note.
  - **Waiver:** There are no illustration keys for widgets, types or systems, so those empty states
    use an icon.

### 20.3 Interaction and UX

- [x] Every action has feedback within 100 ms (optimistic or skeleton) and a completion toast or inline state.
  - **Evidence:** Busy flags are set synchronously before every dispatch ("Importing…",
    "Applying…", disabled controls, the compendium skeleton). Completion lands as a toast or inline
    state.
  - **Waiver:** I don't claim a measured 100 ms bound; IndexedDB timing depends on host load.
- [x] Every destructive action is undoable or confirmed; every confirm names the thing.
  - **Evidence:** Package remove ("Yes, remove {name}"), custom-type delete ("Yes, delete {label}",
    with the instance count), compendium re-import ("Import copy"), system switch (dry-run, then a
    typed "drop" phrase). Focus moves to the confirm. The e2e drives Remove → confirm focused →
    Keep and checks the op-log is unchanged.
- [x] Save status visible on auto-persisted surfaces; failures say what to do next.
  - **Evidence:** Nothing here autosaves. Every write is an explicit command and the builders hold
    drafts until Review. Rejections surface the core message with its per-field issues, and the
    source-list failure offers Retry and Cancel.
- [x] One clear route back; browser back works; Android Back follows the documented order.
  - **Evidence:** Shell navigation is the route back. Both builders close on Escape and register
    with `registerBackHandler`, and focus returns to the opener (asserted for "Build a widget").
    Dialogs and the sheet use the DS Escape/Back contract.
  - **Waiver:** Physical Android Back is not exercised; the runner is Chromium.
- [x] No hover-only or gesture-only discovery; touch targets ≥ 44 px (48 dp Android).
  - **Evidence:** Every action is a visible, labelled button, switch or radio, with no hover-only
    affordance.
  - **Waiver:** As in RC-POL-1.13, the shared desktop density allows `sm` controls below 44 px, and
    native 48 dp needs the Android harness.
- [x] The compact tier exposes one primary top-bar action; overflow in a bounded sheet.
  - **Waiver:** Extensions owns no top-bar action or overflow controller. The builders' compact
    mode uses one pane switch (Edit / Preview / Definition). Phone snapshots and the 200% text
    case cover reachability.
- [x] Copy follows the content fundamentals; strings via `t()`; ES present.
  - **Evidence:** I re-read the changed copy against the calm stage-manager voice. The builder
    dialog label went through `t()` (it was hard-coded English). Every new key has an ES
    counterpart, and the i18n parity tests pass.
  - **Waiver:** Starter package names and descriptions are durable package data, deliberately
    left in the source language (the comment in `Plugins.tsx`).
- [x] Contextual help (HelpTip) beside any non-obvious control; shortcuts in tooltips.
  - **Evidence:** `ContextHelp` beside the system picker; `HelpBeside` on Custom types.
  - **Waiver:** Plugins, Compendium and Theme studio explain themselves in persistent intro text
    and per-control notes (license, trust recommendation, permission reasons), which work on touch
    where an overlay tip does not. No shortcuts were added.

### 20.4 Accessibility

- [x] axe clean (desktop + mobile) for this route and its open overlays; register unchanged.
  - **Evidence:** The `a11y-axe-gate` `/extensions`, widget-builder and system-builder cases pass on
    both profiles. `extensions-polish.spec.ts` runs the full tag set with zero violations over
    Plugins, the named remove confirm, the trust review sheet, the widget builder, Compendium
    (loading, offline results, selected entry, source failure), Object types plus the instance
    dialog and delete confirm, System gallery / detail / switch dialog / copy dialog, and Theme
    studio. The register (`tests/a11y/known-violations.json`) is unchanged: still empty.
- [x] Keyboard-only walkthrough of the primary task recorded in the PR.
  - **Evidence:** Recorded in `extensions-polish.spec.ts`: focus "Install Table Roller", Enter,
    card appears. Focus "Remove Table Roller", Enter, "Yes, remove Table Roller" is focused. Tab
    to Keep, Enter, the package stays and the op-log is unchanged. No PR was created by this task;
    this journal is the record.
- [x] Landmarks and headings correct (`<h1>` once, from `SECTION_TITLES`); `nav` labelled.
  - **Evidence:** The shell supplies the one `<h1>` and labelled nav. Panels are `h2`, and tabs are
    labelled and wired through `tabPanelProps`. The builders' step rails are labelled `nav`s.
  - **Note:** Each builder is a full-screen `aria-modal` overlay with its own `<h1>` while the app
    behind it is isolated, which leaves one reachable `<h1>` at a time. Left as it is.
- [x] Live regions announce operations; no announcement spam.
  - **Evidence:** Compendium loading is a single `LoadingRegion`. Failures use `role="alert"` and the
    needs-live-API notice uses `role="status"`. Writes report through the Toaster. Empty states are
    not live regions.
- [x] Screen-reader spot check on one platform noted.
  - **Waiver:** No interactive screen reader is available in this headless runner. Names, roles,
    focus movement and live regions are machine-checked above; no human NVDA/VoiceOver pass is
    claimed.
- [x] 200% zoom / large text: no clipping; reachability spec case added if new scroll regions.
  - **Evidence:** A new both-profile case doubles the root font size, scrolls "Build a widget" and
    "Install Table Roller" into view, and asserts no horizontal overflow. The only new scroll
    region (the switch dialog's finding group) is focusable and named.

### 20.5 Core discipline and correctness

- [x] No state mutation outside `runtime.dispatch`; no client-side visibility filtering.
  - **Evidence:** All writes remain `widget.package.*`, `system.*`, `content.*` and
    `character.quick-create` dispatches (moved verbatim into the hooks). Duplicate guards and
    counts read `listCharactersForActor` / `getContentItemsForActor`. New local state is drafts,
    busy flags and which confirm is open.
- [x] Preview-as-player: writes rejected read-only and controls hidden/disabled accordingly.
  - **Evidence:** The e2e enters player preview and checks "Build a widget", "Install Table
    Roller", "Define type" and every compendium Import are disabled, with the lock-marked notes
    visible. The core rejects player writes regardless.
- [x] Player projection of this surface verified through an actor read in an e2e.
  - **Evidence:** The e2e defines a custom type with a DM-only field and creates an instance, then
    runs the core's own reads in the page (imported through the dev server; Node cannot import the
    core's system JSON without an import attribute). `getContentItemsForActor(…, 'actor-player')`
    omits the dm-only object, and `projectObjectFieldsForRole(…, 'player', registry)` keeps
    `motto` and drops `truePurpose` while the DM projection has both.
- [x] e2e on both profiles covers the primary task and one failure path.
  - **Evidence:** Primary task: starter install, remove confirm, custom type define. Failure paths:
    Open5e unreachable (bundled fallback announced), the source list failing with Retry/Cancel,
    and the existing custom-type delete refusal. All green on desktop and mobile.
- [x] Perf: the surface's budget measured before/after (ENG-1.1); no regression.
  - **Waiver:** `docs/development/PERFORMANCE.md` has no Extensions budget and `scripts/perf` no
    Extensions scenario, so there is no before/after number to report. The route stays lazy, the
    production build passes `check-prod-bundle`, and `check:bundle-budget` passes (core 605.7 KiB
    gzipped).
- [x] Docs: FEATURE-GAPS inventory row updated; architecture doc updated if a contract moved.
  - **Evidence:** The Extensions row now records this pass. The stale "no style-token step" limit is
    deleted (RC-WID-2.4 shipped `StyleStep.tsx`), an anchored offline-compendium limit is added, and
    the new spec and golden states are listed. `pnpm feature-audit`: 46 limits, 0 stale. No
    architecture contract moved.

## Findings for other lanes (not fixed here)

- **DS token pair, parchment:** `--color-accent` on `--color-accent-subtle` is 4.43:1 at 12 px. It
  hits every `accent` Badge, the DS `Chip tone="accent"` (the SystemPackageCard "Active" chip) and
  the screen-kit `Seg` selected option (used by the trust sheet). This surface stopped using accent
  badges. The all-theme contrast test skips only that pair on the System tab and says why.
- **DS parchment tertiary:** `HPBar`'s tertiary label on `--color-bg` is 4.01:1. The Theme studio
  preview sample shows DS components as the theme draws them, so the contrast test excludes that
  container.
- **`autoFocus` on DS `Button`:** It rendered as an `autofocus` attribute without moving focus in
  this swap-in pattern. I did not survey other screens; any confirm that replaces its own trigger and
  relies on `autoFocus` should be checked with `document.activeElement` the same way.
- The `a11y-axe-gate` system-builder case still looks for "Fork a system" / "Create the fork". It
  passes, but the visible copy is now "Copy a system" / "Create copy".

## Final validation (2026-09-24, loop/rc 3f4b96e4 + this branch)

All results below come from original tool output in this worktree.

| Check                                                                                                                                                                            | Result                                                                        | Log                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| Surface e2e: extensions-polish, custom-types, systems, widget-builder, widget-trust-review, widget-generate, starter-widgets, a11y-axe-gate, themes; desktop + mobile, retries 0 | 139 passed, 5 skipped (themes swatch board is desktop-only by design), exit 0 | /tmp/pol14-e2e-final.log                    |
| Shared-route specs touching /extensions: ux-audit, responsive, community-discover, widget-kit; both profiles, retries 0                                                          | 178 passed, exit 0 (final tree)                                               | /tmp/pol14-e2e-shared2.log                  |
| Visual: `extensions-polish` baselines, then strict `CI=1 --update-snapshots=none --retries=0` in the pinned container                                                            | 45 passed, 75 PNGs; strict compare 45 passed                                  | /tmp/pol14-visual-compare2.log              |
| Baseline budget                                                                                                                                                                  | 360 files, 31880.7 / 32768 KiB                                                | check-baseline-budget.mjs                   |
| `pnpm lint` (raw-style count, ESLint, boundary, emphasis, non-text contrast)                                                                                                     | exit 0                                                                        | /tmp/pol14-lint.log                         |
| `pnpm gates`                                                                                                                                                                     | exit 0; no `file-size-warn` for any owned file (largest owned file 468 lines) | /tmp/pol14-gates.log                        |
| `pnpm format:check:changed -- --base loop/rc`                                                                                                                                    | 60 files, clean                                                               | /tmp/pol14-format.log                       |
| gm-react `tsc --noEmit`                                                                                                                                                          | exit 0                                                                        | —                                           |
| Vitest (`vitest.app.config.ts`): ds, i18n, widgetBuilder, systemBuilder, compendium, extensions                                                                                  | 41 files, 402 tests passed                                                    | /tmp/pol14-vitest2.log                      |
| `pnpm build` + `check:bundle-budget`                                                                                                                                             | exit 0; core 605.7 KiB gzipped, within budget                                 | /tmp/pol14-build.log, /tmp/pol14-bundle.log |
| `pnpm feature-audit`                                                                                                                                                             | 46 declared limits, 0 stale                                                   | —                                           |

Not claimed: GitHub CI, a human screen-reader pass, physical Android Back or 48 dp targets, or a
measured 100 ms feedback bound. The waivers above stay explicit.
