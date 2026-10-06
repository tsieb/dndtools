# RC-WID-6.2 run journal

Base: `c61d8cdb` (the task branch head at start).

## Implementation

- **The rule** (`queries/widget-package-review.ts`, `evaluateWidgetPackageAuthorTrust`): pure, shared
  by the install command, the upgrade re-check, the builder and the gallery. A package is cleared
  only when:
  - every widget's entrypoint is `template` (a missing entrypoint counts as not a template);
  - every asset is a plain `asset` (html, javascript, css, worker, module and an unstated kind are
    all refused);
  - no widget declares a stylesheet path or `custom-stylesheet`;
  - no widget requests a host permission or a network destination;
  - the review summary says `trusted-after-review`, which already rules out generated packages and
    any player-visible or lower-privilege command or output write.
    It returns every refusal with a code, not only the first.
- **Install** (`commands/widget-package.ts`): `installWidgetPackageInputSchema` gains
  `authorTrust: z.literal(true).optional()` (`schemas/commands.ts`, a companion path). A cleared
  package is recorded `trusted`, `basis: 'author'` (new optional field on
  `WidgetPackageTrustReview`, `state/widget-package-state.ts`), `reviewedBy` = the installing DM,
  every permission still denied, and `enabled: true`. The audit entry is a second op,
  `widget.package.review` (`trustState`, `approvedPermissions: []`, the verdict, `basis: 'author'`),
  next to the install op, which itself records `trust: 'author'`. Events: installed, reviewed,
  enabled. A package the rule refuses is rejected with the new code `author-trust-refused`
  (`commands/types.ts`, a companion path), one issue per reason, and nothing is installed. Without
  the flag nothing changed.
- **Upgrade**: an author-trusted package whose upgrade no longer qualifies drops to `unreviewed`
  with every permission denied, and the op records `trust: 'unreviewed'`. Without this, a template
  trusted on the author's word could become custom code and keep `trusted`. A sheet review replaces
  the trust record, so `basis` only ever means "nobody reviewed this in the sheet".
- **Builder** (`WidgetBuilder.tsx`): a new install asks for `authorTrust` only when the same rule
  clears the built package. In that case it hands the package to `onInstalled` (the host places it),
  or, opened from Extensions with no host, toasts "Installed X. It is on and ready to place.".
  Anything else installs on the fail-closed path and opens `TrustReviewSheet` over the builder. The
  sheet owns the keyboard while it is up (the builder's Escape/Tab handler stands down). If the
  package is trusted when the sheet closes, the builder dispatches `widget.package.enable` and
  finishes the same way. If it was cancelled or denied, the builder closes with a warning toast
  whose "Open package" action navigates to Extensions. Upgrades are unchanged.
- **Placement** (`AddWidgetGallery.tsx`, `Board.tsx`, `sceneEditor/index.tsx`): hosts keep the
  `onInstalled` package and pass it back as `placePackage`. Once the library lists it, the gallery
  calls its own `pick` (the CAN-8.5 path: `placeNewTile`, close, `onPlaced`, focus, scroll into view,
  "Added X"). It does this one tick later so `widgets` is the surface the builder closed onto, then
  calls `onPlacePackageDone`. The scene editor now passes `onPlaced={select}` (the CAN-8.5 handoff),
  so a pick there selects too.
- **In-place Enable**: `InPlaceEnable` renders its own `<li>` under a dimmed row ("Enable
  <widget>"), because a button cannot sit inside the row's button and `WidgetLibraryCard` lives in
  the unowned `WidgetFrame.tsx`. It is offered to the DM, outside preview, for a disabled, not
  removed package that is either `trusted` or `unreviewed` and cleared by the rule. Custom code and
  permission requests are not offered (still via review). On success the gallery announces
  "<widget> is on. Pick it to add it." and focuses the now-addable row. The component lives in
  `WidgetBuilder.tsx` because the gallery is at the 800-line gate (797 now) and that file owns the
  install/trust outcome.
- Copy: EN/ES `extensions.builder.installedEnabled`, `.installedNeedsReview`, `.openPackage`,
  `boardCanvas.add.enable`, `.enabled`; `qps-ploc.ts` regenerated (`npx tsx scripts/i18n-catalog.ts
pseudo`).
- `docs/architecture/WIDGETS.md`: new §5.1 Author trust, plus the builder, gallery Enable,
  `placePackage` and the scene editor `onPlaced`. I also corrected §5's claim that any upgrade
  requesting a new permission resets to `unreviewed`. The code never did that; the new permission
  just stays denied.

## Tests and evidence

- Core `packages/core/tests/widget-author-trust.test.ts`: 20 pass.
  - The rule clears a template package.
  - It refuses custom code (with and without files), a stray script asset, an unstated asset kind,
    a missing entrypoint, each of the 7 host permissions (`it.each`), network destinations, a
    stylesheet, a player-visible output write and a generated package.
  - Install with the flag: trusted, enabled, `basis: 'author'`, `reviewedBy` = DM, all permissions
    denied, the install and review ops with their values, three events.
  - Without the flag: unchanged. With the flag, custom code and a clipboard permission are each
    refused, with nothing installed and no op appended. DM-only. `authorTrust: 'yes'` is a schema
    refusal.
  - Upgrade keeps author trust while the package qualifies and lapses it on custom code. A
    sheet-reviewed package is left alone.
  - **Negative control:** with the rule forced to `eligible: true`, 10 of 20 fail. Restored and
    re-run green.
- E2E `apps/gm-react/tests/e2e/widget-author-trust.spec.ts`, `--project=desktop-chromium
--project=mobile-chromium`: **6 passed**.
  - The 8-click flow, counted from Add on a board in Edit layout: Add, Build your own, Data,
    Template kind = data-table, Add data query, Source = visible-characters, Review, Install widget.
    The name is typed. That is exactly 8 counted pointer actions, asserted `<= 8`. Then: builder
    closed, no review sheet, route unchanged (the board's own `/screen/:id`, never Extensions), the
    tile focused, selected (chip), announced "Added Party HP" and inside the viewport. The record is
    trusted/enabled/`basis: 'author'`/`reviewedBy` DM, and the op log holds exactly one author
    review entry.
  - A custom-code build from the gallery ends in "Review Torch card" over the builder while the
    package is unreviewed and disabled. Trust package then enables and places it (focused,
    announced) without leaving the board.
  - Gallery Enable: a disabled unreviewed template package gets "Enable Quiet list"; a disabled
    custom-code package gets none. Enable announces, focuses the row, which is now addable, and
    one more click places it.
  - **Negative control:** with the builder's `authorTrust` forced false, the 8-click test fails on
    both profiles (the builder stays open on the review sheet). Restored and verified.
- Companion specs updated for the new outcome: a builder template install is now on, so the old
  "click the Enable switch" steps would have turned it off.
  - `widget-builder.spec.ts`: two installs now assert trusted/enabled. The custom-code test leaves
    the embedded sheet with Cancel and still asserts unreviewed/disabled, plus the "Open package"
    toast.
  - `widget-commands`, `widget-intents` (×2) and `hub-templates` assert the switch is already
    checked.
  - `widget-generate.spec.ts`: a generated package opens the review sheet; it is cancelled and the
    package is still installed as generated.
- Neighbouring e2e on both profiles: widget-builder, widget-commands, widget-intents,
  hub-templates, add-panel, widget-trust-review, custom-widgets, starter-widgets, widget-generate,
  extensions-polish, widget-query-sources and widget-kit gave 107 passed, 3 skipped, 2 failed. Both
  failures were `widget-generate` (the embedded sheet, fixed above); a re-run of that spec gave 6/6.
- Wider board/canvas e2e: see "Wider e2e" below.
- `pnpm typecheck` exit 0. The first run caught the core test's `outputWrites` shape, which I
  fixed. `pnpm lint` exit 0; its 16 warnings are all in files this task does not touch.
  `pnpm gates` exit 0 (800-line gate: gallery 797, builder 524).
- `pnpm test`, all four configs: core 5254, cloud 569, app 2028, tooling 246; all passed.
- Prettier was run on each changed file only.
- Headroom tools were not used; I read native command output and log files directly.

## Security review

See "Security review" below; the `/security-review` report is `state/RC-WID-6.2.security-review.md`.

## Scope notes

- Changed paths are owned or companions: `schemas/commands.ts`, `commands/types.ts`, `index.ts`,
  i18n catalogs + `qps-ploc.ts`, `*.test.ts`, `tests/e2e/*.spec.ts` and this journal.
- I did not touch `FlowBoard.tsx`: it hosts no gallery or builder, so nothing to change.
- The gallery Enable is deliberately narrower than the Extensions switch, which still enables any
  non-denied package, unreviewed custom code included. Changing that switch is RC-WID-6.7's file.
- HANDOFF (RC-WID-6.7, `TrustReviewSheet.tsx`): the sheet still says "Trust package", and the
  builder adds the enable after it closes. A primary "Allow and enable" belongs to 6.7.
- HANDOFF (RC-WID-6.6): `widget.package.fork` should evaluate `evaluateWidgetPackageAuthorTrust`
  on the forked package and install with `authorTrust` only when it clears.
- No push, promotion, loop launch, dispatcher state edit or additional agents.
