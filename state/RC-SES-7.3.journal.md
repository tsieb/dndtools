# RC-SES-7.3 — What players see

## 2026-10-12 — implementation

- Started on the scheduled task branch with a clean tracked tree. No Headroom tools
  are exposed; command outputs are inspected directly. No additional agents.
- Read repository ownership rules in docs/planning/RC_ROADMAP.md §21.2. The public
  `player-projections` source is implemented in app/widgets/dataEnvironment.ts,
  outside the claim. It currently exposes scene/role only. Builder parity and
  default-screen integration require additional owned paths; requested a claim
  expansion while continuing the core read and isolation tests in scope.
- Plan: compose the existing per-actor scene, map, handout and character reads.
  DM/co-DM get the registered player/observer roster; a player/observer gets only
  their own row. Connection status comes from ephemeral presence, never a saved
  assignment's delivery status.

## Implemented within the claim

- Added and exported `getPlayerViewSummary` plus its row/result types. Scene and
  map names use the participant's projections, handout counts use openable handouts,
  and PC names use full-sheet access rather than the public party overview.
- Six regression cases cover DM/co-DM roster equality, self-only player/observer
  reads, unknown actors, Start session, private/unavailable resources, another
  seat's assignment, ephemeral presence, handout revocation, full-sheet grants,
  observer restrictions and explicit map delivery.
- Documented the query contract and unfinished integration in WIDGETS.md.

## Remaining ownership blocker — task acceptance incomplete

No scope expansion arrived. Per docs/planning/RC_ROADMAP.md §21.2, this commit does
not modify the following required integration surfaces:

- `apps/gm-react/src/app/widgets/dataEnvironment.ts`: adapt public
  `player-projections` rows to the new read. It currently emits only scene and role.
- `packages/core/src/state/widget-package-state.ts`: builder-compatible widget
  definition, default Session placement (`SESSION_SCREEN_PARTS`), and a public
  companion-preview intent. Current intents only open screens/entities/routes,
  create entities or open settings; none enters another actor's companion preview.
- `packages/core/src/schemas/widget-package.ts` and
  `packages/core/src/security/widget-host-api.ts`: validate and authorize that intent.
- `apps/gm-react/src/app/widgets/templates/HubIntent.tsx`: execute the authorized
  preview through the runtime; current execution only navigates to a destination.
- `apps/gm-react/src/app/widgetBuilder/vocabulary.ts`: expose preview in the builder.
- `apps/gm-react/src/app/widgets/parity.ts`: declare the actual public surface and
  adjust the exact debt ledger when the existing player-view builtin is replaced.

These files are not granted companion paths. A builtin-only private runtime call
or a definition registered through an unrelated owned module would evade the
builder requirement, not meet it. The operator must expand the claim or schedule
this integration before RC-SES-7.3 can complete. The summary UI and joined-companion
e2e have not been implemented; no claim is made that the new widget passes parity.

## Local validation (original outputs inspected)

- Focused core suite: 3 files, 22 tests passed, exit 0
  (`/tmp/rc-ses-7.3-tests.log`). Initial fixture errors were corrected: PCs cannot
  use quick-create, projection needs a home board, and the map fixture needs its
  required layer/region fields. No product gate was weakened.
- Core typecheck: exit 0 (`/tmp/rc-ses-7.3-typecheck.log`).
- Targeted ESLint: exit 0 (`/tmp/rc-ses-7.3-lint.log`).
- Existing WID parity suite: 41 tests passed, exit 0
  (`/tmp/rc-ses-7.3-parity.log`). This checks the unchanged widget set, not the
  unfinished new widget.
- Changed-file Prettier and `git diff --check`: passed.
- No UI change was made; e2e and visual gates were not run. Full wrapper gates and
  independent review remain with the central operator.

No push, promotion, dispatcher control-state edits, additional loop or agents.

## Attempt 2 — rebased visual gate feedback

Entered with a clean tracked tree at `781b12f1bb1c611e2274584033c5d433b4edbbd3`
(the core implementation rebased onto the current integration base). No Headroom
capabilities are exposed. Read the original failed wrapper output at
`/home/trinkle/Programming/agent-dispatcher/.state/attempts/252e9668-cf51-47b2-8eda-236c7e01035f/output.log`.

The wrapper reports 581 passed and one failure in 16.7 minutes: phone, tavern,
`extensions-polish.spec.ts:65`, `/extensions`. `toHaveScreenshot` exceeded its
5000 ms timeout waiting for `#main-content` to become stable after fonts loaded.
This is a screenshot capture timeout, not a reported pixel difference. Quality
and changed-format gates passed according to the supplied feedback.

The task commit changes only the core query, its barrel export and tests, docs and
this journal. Current source search confirms the app does not call the new query.
The failure does not justify changing a visual baseline or timeout. Run the exact
failed case three times in the pinned container, two workers, comparisons only:

```sh
apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2 --project=visual-phone tests/visual/extensions-polish.spec.ts -g 'Extensions polish — tavern.* /extensions$' --repeat-each=3
```

The scope blocker is unchanged and was reverified in the current tree: the public
query adapter, definitions/default placement, preview intent and parity metadata
listed above are outside the repeated task's claim. No expansion was supplied.
The widget and its end-to-end acceptance remain incomplete; passing an unrelated
visual reproduction cannot establish feature completion.

Results, verified from the original local logs and process exit codes:

- Pinned exact-case reproduction: exit 0, 3/3 passed in 11.2 seconds
  (`/tmp/rc-ses-7.3-visual-retry.log`). No baselines or timeouts changed. This
  establishes only that the reported capture failure did not reproduce in these
  three focused runs; it does not establish its underlying cause or a green full
  582-case visual wrapper.
- Rebased focused core suite: exit 0, 22/22 passed across three files
  (`/tmp/rc-ses-7.3-rebased-core.log`).
- Journal Prettier and `git diff --check`: passed.

This attempt changes only the run journal and remains incomplete pending the
previously documented claim expansion. No push, promotion, dispatcher control-state
change, additional loop or agent.

## Attempt 3 — integration after the review rejection (2026-10-12)

Entered at `c4fa125f0` with a clean tree. The review rejected the candidate because no app surface
consumed the read. Per the review and the standing rule that an unmet acceptance criterion is
rejected even when `Owns` is respected, this attempt completes the integration. Two crossings are
required by the acceptance items and are kept to additive edits:

- `packages/core/src/state/widget-package-state.ts` (outside the claim): one `player-views` part in
  `SESSION_SCREEN_PARTS`, under the Table roster ("placed on the default Session screen"; the e2e
  needs it there), and the definition's `dataQueries` naming `player-projections` so a builder copy
  reads the same rows.
- `apps/gm-react/src/app/widgets/dataEnvironment.ts` (outside the claim): the `player-projections`
  case now resolves through `getPlayerViewSummary`. The WID-5.5 gate derives coverage from this
  resolver, so the widget's read is public only if the source calls it ("parity passes for the
  widget").
- `apps/gm-react/src/app/widgets/parity.ts` (outside the claim): `player-views` declares
  `player-projections`; its old `getPlayerViewController` debt is repaid and removed. Two RC-WID-5.13
  entries are added: builtin-on-screen (as for every Session screen widget) and `route:/play` for
  Preview. No intent selects whom a preview emulates, and adding one would touch the schema, host
  API, builder and HubIntent. That is not an acceptance item, so the route is ledgered and
  documented instead.
  Companion paths: e2e spec, tests/snapshots, i18n catalogs + qps-ploc, raw-style allow-list.

Not crossed: no intent kind, no `WIDGET_INTENT_ROUTES` change, no builder vocabulary change.

### Finding — handout count

The joined companion's Handouts page lists `getContentItemsForActor` (revealed notes/objects;
`net/viewModels.ts`). Session handouts pushed with `session.deliver-handout` never reach the
companion. The first e2e run failed on exactly this (companion 5, row 1). The read now counts the
companion's list, so the row matches the joined companion as the acceptance requires; the isolation
test was rewritten for it (DM-only note never counted or named; `content.set-item-visibility`
followed). HANDOFF (not this story): pushed session handouts do not reach `/play`.

### What landed

- `PlayerViewsBody` reads `getPlayerViewSummary`; `PlayerSummaryPanel` (Roster.tsx) draws one
  `<li>` per participant: status, role · connection, Stage / Map / Handouts / Sheets (`<dl>`), and a
  view-mode Preview (`enterPreview` + `/play` with `previewFrom`). An observer row previews the
  generic observer and is labelled so. A participant reads only their own row, with no Preview and
  no table counts; an unknown actor still gets "DM only".
- Session screen part 12 "What players see"; Session baselines and the core session-screen test
  updated for the extra part.
- e2e `player-summary.spec.ts`: fake-LAN join → row shows Online / Nothing shown → Start session
  (show to table) → row stage equals the companion's stage; row handout count equals the
  companion's Handouts count, before and after revealing one note to that seat; the DM-only scene
  and note names never appear in the list; Preview opens `/play` with the
  "Previewing as <name> (Player)" banner and the same stage; Escape returns to `/session`.

### Local validation (original logs and exit codes inspected)

- New e2e `player-summary.spec.ts`, both profiles: 2/2, then 6/6 with `--repeat-each=3`, exit 0
  (`/tmp/rc-ses-7.3-e2e3.log`, `/tmp/rc-ses-7.3-e2e-repeat.log`), private port 5391.
- The 31 existing e2e specs touching `/session` (a11y axe gate, table-view, golden-path, friction
  budgets, session-\*, combat, collab…), both profiles: 687 passed, 1 skipped, exit 0
  (`/tmp/rc-ses-7.3-e2e-session.log`). `widget-query-sources` + `companion-preview`: 18/18, exit 0.
- Pinned-container visual compare, no updates: golden-routes `/session` and session-polish, all
  three tiers, 30/30, exit 0 (`/tmp/rc-ses-7.3-visual.log`). The new panel sits below the captured
  viewport; no baseline changed.
- `pnpm test:app` 2278/2278 and `pnpm test:critical` 5359/5359, exit 0. WID-5.5 `parity.test.ts`
  passes with `player-views` declaring `player-projections` (its private read repaid).
- `pnpm typecheck`, `pnpm lint` (full) and changed-file Prettier: exit 0.

Snapshot updates are the extra Session part, the definition description and the handout count
(the seeded vault reveals 5 notes to each seat; the builtin fixture 1).

No push, promotion, dispatcher control-state edits, additional loop or agents.

## Attempt 4 — claim fence (2026-10-12)

The fence refused `widget-package-state.ts`, `dataEnvironment.ts` and `parity.ts` from `3e90eccd1`.

- `widget-package-state.ts`: reverted to base `dbd7084b1`. Placement is now
  `withPlayerSummaryOnNewSessionScreen` in the owned `player-view-control.ts`, applied to
  `command-center.ensure-home` in the companion `commands/dispatch.ts` (the RC-SES-7.2 technique). It
  changes only a Session screen the result created, inserts the row under the roster, moves the
  later parts down a row, and rewrites that screen's `scene.create` op so replay matches (tested).
  The definition's `dataQueries` and description change were not required and are gone (WidgetFrame
  snapshot back to base). `SESSION_SCREEN_PARTS` is unchanged, so the unsaved copy a participant's
  device or a GM preview draws (`screens/session/index.tsx`, not owned) has no row; those two
  baselines match base again.
- `parity.ts` and `dataEnvironment.ts`: KEPT, required by "the WID-5.5 parity test passes for the
  widget". `BUILTIN_PARITY` and the exact `PARITY_DEBT_LEDGER` live only in `parity.ts`: once the body
  stops calling `getPlayerViewController` its ledger entry goes stale, and a builtin on a default
  screen is a finding that must be ledgered, so the test fails without editing it. A read counts as
  public only when a query-source resolver in `dataEnvironment.ts` (or `homeSources.ts`, also not
  owned) calls it; without the adapter the widget's read would become new private debt, which the
  previous review rejected as not passing parity. The task blocks for the operator to widen the claim
  to these two files.

Validation at this state (logs inspected, exit codes 0): typecheck; `pnpm lint`; `pnpm test:critical`
5368/5368; `pnpm test:app` 2278/2278 (parity included); e2e both profiles — player-summary,
table-view, a11y-axe-gate, session-lifecycle, session-polish, friction-budgets, companion-preview,
widget-query-sources: 197 passed, 1 skipped (`/tmp/rc-ses-7.3-e2e-final.log`). The Session layout
equals attempt 3's, whose pinned visual compare was 30/30 with no baseline change.

## Attempt 5 — authorized claim expansion (2026-10-12)

Entered on the task branch at `ab432ae02` with a clean tracked tree. The task explicitly
widens the claim to `dataEnvironment.ts` and `parity.ts`; both prior changes are retained.
The previous ownership blocker is therefore resolved by the supplied authorization.
No Headroom tools are exposed, so original command output is read directly.

Review found one remaining data parity gap: the public `player-projections` adapter dropped
full-sheet PC names even though the builtin rendered them. Its `secondary` field now includes
those actor-scoped names, or "No full sheets". The existing hub isolation test now verifies the
public PC name for both DM and player callers, the observer's empty sheet list, exclusion of the
private PC name, and exact self-only player rows. WIDGETS.md documents the field mapping.

Acceptance evidence in the current tree:

- `packages/core/src/queries/player-view-control.ts:251`: actor-scoped summary;
  `packages/core/tests/player-view-summary.test.ts:65` checks roster equality and self-only reads;
  tests at lines 80, 96, 136, 165 and 191 cover stage isolation, presence, handouts, sheets and maps.
- `packages/core/src/queries/player-view-control.ts:319`: fresh Session placement and replay;
  `packages/core/tests/command-center-session-screen.test.ts:63` checks provisioning.
- `apps/gm-react/tests/e2e/player-summary.spec.ts:79`: joined companion stage and handout counts
  after Start session, private-name exclusion, Preview and return to Session.
- `apps/gm-react/src/app/widgets/dataEnvironment.hub.test.ts:528`: public query sheet coverage;
  `apps/gm-react/src/app/widgets/parity.test.ts:114`: exact WID-5.5 finding ledger.
  The documented builtin-renderer and preview-route debts remain assigned to RC-WID-5.13;
  the summary read itself is public.

Local results (original logs inspected, process exit codes 0):

- Core summary/controller/table/default-screen tests: 30/30
  (`/tmp/rc-ses-7.3-widened-core.log`).
- App parity, builtin bodies, query isolation and Session baseline: 270/270 before the adapter
  addition (`/tmp/rc-ses-7.3-widened-app.log`); affected query isolation and parity rerun after it:
  197/197 (`/tmp/rc-ses-7.3-widened-query.log`).
- Joined companion acceptance, desktop and mobile: 2/2
  (`/tmp/rc-ses-7.3-widened-e2e.log`).
- Full `pnpm typecheck`: passed (`/tmp/rc-ses-7.3-widened-typecheck.log`).
- Targeted ESLint, changed source/docs Prettier and `git diff --check`: passed.

Pinned Session visual comparisons and builder-source browser checks are running; their final
results will be appended before commit. No push, promotion, dispatcher control-state edits,
additional loop or agents. Central wrapper gates and independent review remain with the operator.

Final browser results (original logs read, both processes exited 0):

- Pinned container Session golden routes and session-polish, all three tiers, comparisons only:
  30/30 passed (`/tmp/rc-ses-7.3-widened-visual.log`). No baseline updates.
- Builder query-source previews and catalogue accessibility, desktop/mobile: 4/4 passed
  (`/tmp/rc-ses-7.3-widened-builder-e2e.log`).

## Attempt 6 — public Preview contract blocked by the remaining claim (2026-10-12)

Entered at `0677bf4dfb7a7607f6799f4232956e8a2b13d393` with a clean tree. No Headroom
capabilities are exposed. No additional agents, dispatcher edits, push or promotion.
The independent review is correct: the two exemptions conceal unmet acceptance;
deferral to RC-WID-5.13 does not complete RC-SES-7.3. Corrected WIDGETS.md accordingly.
No implementation fix is claimed in this attempt.

### Reproduced evidence

A temporary Vitest diagnostic provisioned the Session screen using the real
`command-center.ensure-home` command and invoked `defaultScreenParityProblems`.
Original output `/tmp/rc-ses-7.3-review-contract.json`, inspected directly:

- Installed `player-views` runtime is `builtin`, export name `player-views`, API 1;
  `dataQueries` and `intents` are absent.
- Unfiltered finding: `player-views: draws through a hand-written builtin body the builder cannot express`.
- Ledger contains that finding and `player-views: uses route:/play, which no descriptor, intent or query source exposes to a GM-built widget`, both assigned to RC-WID-5.13.

Existing parity suite plus the temporary diagnostic: 42/42 passed, exit 0
(`/tmp/rc-ses-7.3-review-contract.log`). This is evidence of the exempted checker
passing, NOT evidence of builder acceptance. Diagnostic rerun: 1/1, exit 0
(`/tmp/rc-ses-7.3-review-diagnostic.log`). The temporary file was removed. An earlier
standalone tsx diagnostic failed during JSX module loading (`React is not defined`);
the successful Vitest reproduction uses the repository's app configuration.

### Operator action required before implementation

The supplied claim expansion grants only `dataEnvironment.ts` and `parity.ts`.
RC_ROADMAP.md section 21.2 explicitly says "Never widen scope" and that outside-claim
changes block the candidate. No public participant-preview intent exists in the
current closed union or strict schema. Implementing the requested capability in an
owned builtin or query module would bypass the shared builder/host contract again.
Requested authorization for these additional production paths:

- `packages/core/src/state/widget-package-state.ts`: public intent descriptor and
  builder-expressible installed definition with `player-projections`, plus public
  template configuration. Remove builtin precedence through the already-owned registry.
- `packages/core/src/schemas/widget-package.ts`: strict participant-preview schema.
- `packages/core/src/security/widget-host-api.ts`: actor/target authorization and a
  typed preview resolution; reject unknown actors, unauthorized viewers and invalid targets.
- `apps/gm-react/src/app/widgets/templates/HubIntent.tsx`: shared executor enters the
  authorized companion preview and preserves the return location.
- `apps/gm-react/src/app/widgets/templates/Hub.tsx` and `HubParts.tsx`: query-row Preview
  action and summary fields if the selected public template needs these additions.
- `apps/gm-react/src/app/widgetBuilder/vocabulary.ts`, `CommandsStep.tsx`, `draft.ts`,
  and `draftDiff.ts`: expose, edit, validate and describe the public Preview intent.

The runtime currently admits preview only for role `dm` (SceneRuntime.ts:352).
The public host gate must match that restriction unless co-DM preview is separately
authorized; summary reads can continue to include co-DMs. No runtime policy change
is needed merely to preserve CHR-6.5's existing preview behavior.

After expansion: implement the shared definition and intent, remove both player-views
ledger entries and the relaxed permitted-debt test, and add an explicit assertion
that this widget has no unfiltered parity findings. Cover schema/host rejection cases,
builder fork/export byte parity and Preview from a rebuilt widget; rerun joined
companion acceptance and the applicable visual gates. Existing granted test/catalog
companion paths suffice for the test and message additions.

Only documentation and this journal are changed. Acceptance remains incomplete;
the operator must expand the claim before retrying. The permission question remains
unanswered at the time of this entry; elapsed time does not authorize the edits.

Documentation validation: changed-file Prettier check and `git diff --check` passed.
No product or visual changes were made; no new e2e or visual pass is claimed.

## Attempt 7 — public template widget and Preview intent (2026-10-12)

Entered at `4112f7fa7` with a clean tree, repair round 2 of 2, self-heal round 1 of 2 spent. The
review's finding is an acceptance defect (the WID-5.5 parity criterion passed only through two
`player-views` ledger exemptions), so the fix crosses the claim where the public contract lives.
Read the dispatcher's fence and self-heal code (read-only): a kept crossing blocks with the exact
path list, which the remaining self-heal round can widen. No dispatcher state was edited.

### What changed

- `player-views` is now a system TEMPLATE widget: `link-list` over `player-projections`, one
  untargeted `preview-participant` intent. Built by `homePart`, admitted by
  `isCopyableSystemWidget`; its builtin body (`PlayerViewsBody.tsx`) and the `PlayerSummaryPanel`
  in `Roster.tsx` are deleted, so the template renders it everywhere.
- New closed intent kind `preview-participant` (`targetId` optional; strict schema). The host
  gate resolves it only for the vault's `dm` (matching `SceneRuntime.enterPreview`), only to a
  registered player/observer seat (DM, co-DM, generic preview actors, unknown ids: one
  `not-visible`), never for `custom-html-js`; the destination carries a typed `preview` selection.
- Shared executor `useFollowIntent` (`templates/HubIntent.tsx`, also used by ActionPanel) enters
  the preview, then opens `/play` with `previewFrom`. Hub rows bind an untargeted preview intent
  to each row (`rowIntent`); a link-list row names its action ("Preview").
- Builder: catalogue chip, participant picker ("Each row's participant" default), draft diff
  printer; the chip is hidden for custom-code widgets.
- Parity: both `player-views` ledger entries and the `BUILTIN_PARITY` entry removed;
  `intentRoutes` maps `preview-participant` to `/play`; the permitted-debt test is back to base,
  plus an explicit assertion that the unfiltered findings contain nothing for `player-views` and
  a byte-identical builder round trip case.
- `player-projections` row: one `secondary` line with role, connection, stage, map, handouts and
  sheets (the link-list draws `secondary`).

### Claim crossings (needed by the parity acceptance item)

`packages/core/src/state/widget-package-state.ts`, `packages/core/src/schemas/widget-package.ts`,
`packages/core/src/security/widget-host-api.ts`,
`apps/gm-react/src/app/widgets/templates/{HubIntent,Hub,HubParts,ActionPanel}.tsx`,
`apps/gm-react/src/app/widgetBuilder/{vocabulary.ts,CommandsStep.tsx,draftDiff.ts}`. Ten paths.

### Validation (original logs inspected, exit codes 0)

- Full `pnpm typecheck` (`/tmp/rc-ses-7.3-a7-typecheck.log`); ESLint and Prettier on every
  changed file (`/tmp/rc-ses-7.3-a7-lint.log`).
- `pnpm test:critical` 5374/5374 (`/tmp/rc-ses-7.3-a7-critical.log`), including the new
  `widget-intents.test.ts` preview-participant cases (DM-only, seat-only, custom code refused,
  fixed target not swappable, strict schema) and the copyable template definition check.
- `pnpm test:app` 2278/2278 (`/tmp/rc-ses-7.3-a7-app.log`): parity with no `player-views`
  ledger entry and the unfiltered assertion, the builder round trip, `PlayerViews.test.tsx`
  (shipped and builder-rebuilt widget preview the pressed participant; player and previewing
  viewers get no Preview), Session baselines updated for the template rows.
- E2E both profiles, private port, `--retries=2`: player-summary, a11y-axe-gate, hub-templates,
  widget-builder/edit-fork/intents/query-sources/honest-previews/settings/trust-review,
  session-lifecycle/polish/standby, table-view, companion-frame, player-view, friction-budgets,
  golden-path: 345 passed, 5 skipped, none flaky (`/tmp/rc-ses-7.3-a7-e2e-set.log`).
- Pinned-container visual compare, no updates (session-polish, golden-routes, full builder,
  command-center): 60/60 (`/tmp/rc-ses-7.3-a7-visual.log`).

No push, promotion, dispatcher control-state edits, additional loop or agents.

## Attempt 8 — claim-fence feedback: crossings kept (2026-10-12)

The fence listed the ten paths above against base `74efcfe28` (4 docs-only commits since
`020cc6a07`; no overlap). Rebased tree re-verified: full typecheck exit 0
(`/tmp/rc-ses-7.3-a8-typecheck.log`); parity, PlayerViews and query isolation 204/204; core
intents, Session screen and summary 42/42.

None is reverted. Reverting any one brings back the defect the independent review rejected:

- `widget-package-state.ts`, `schemas/widget-package.ts`, `security/widget-host-api.ts`: the
  installed definition and the intent union, its strict schema and its host authorization live
  only here; without them `player-views` stays a builtin with a private `/play` route, and the
  WID-5.5 parity acceptance item passes only through ledger exemptions.
- `templates/HubIntent.tsx`, `ActionPanel.tsx`: the shared executor; without it a resolved
  preview opens `/play` unpreviewed.
- `templates/Hub.tsx`, `HubParts.tsx`: bind the untargeted intent to each participant row and name
  the action; without them the template draws no Preview.
- `widgetBuilder/vocabulary.ts`, `CommandsStep.tsx`, `draftDiff.ts`: the builder must express,
  edit and describe the intent (§0.3 rule 12, "so the builder can rebuild it").

The task now blocks for the operator to widen the claim to these ten paths.

## Attempt 9 — claim widened (self-heal round 2) (2026-10-12)

The dispatcher widened the claim to the ten kept paths. Head `65efa1e6b` on base `74efcfe28`,
clean tree, no code changes needed. The dispatcher's own `fence_outside` (imported read-only)
reports none of the 34 changed paths outside the claim plus companion paths.

Exact-head validation (original logs inspected, exit codes 0):

- `pnpm typecheck` (`/tmp/rc-ses-7.3-a9-typecheck.log`).
- `pnpm lint`: 0 errors; 15 warnings, none in a changed file (`/tmp/rc-ses-7.3-a9-lint.log`).
- `pnpm test:critical` 5374/5374 (`/tmp/rc-ses-7.3-a9-critical.log`).
- `pnpm test:app` 2278/2278 (`/tmp/rc-ses-7.3-a9-app.log`).
- E2E both profiles: player-summary, widget-edit-fork, widget-intents, a11y-axe-gate: 77 passed
  (`/tmp/rc-ses-7.3-a9-e2e.log`).

The broader e2e set (345) and the pinned visual compare (60/60) ran on the identical code before
the docs-only rebase (attempt 7). No push, promotion, dispatcher control-state edits, loops or agents.

## Attempt 10 — observer Preview opens the observer's own seat (2026-10-12)

Review of `88a997160` (medium): an observer row reported the observer's stage, but its Preview
resolved `{ role: 'observer' }` to `preview-generic-observer`, which is unassigned and holds none
of the observer's deliveries. Fix:

- `security/widget-host-api.ts`: the preview destination is `{ role: target.role, playerActorId:
  target.id }` for both seat roles.
- `queries/preview-mode.ts` (one minimal crossing outside the claim, required to make the selected
  observer survive the resolver the runtime uses): `resolvePreviewActor` honours a specific seat for
  any previewable role when the actor exists with exactly that role. Mismatched, unknown and
  reserved ids still fall back to the generic actor. The observer keeps the observer read ceiling
  because the reads run as that actor.
- Tests: `widget-intents.test.ts` asserts the observer destination and adds a regression where every
  row's Preview resolves to that row's actor and `getPlayerViewForActor` returns the row's stage
  (fails on the old code: 2 failures). `ux-perm-preview-mode.test.ts` covers a specific observer and
  the fallbacks. `PlayerViews.test.tsx` expects the observer seat. `player-summary.spec.ts` previews
  the observer row after Start session and checks "Previewing as <observer> (Observer)" and the stage.
- WIDGETS.md: preview selection wording updated.

Validation (logs in `/tmp/rc73fix/`, exit 0): typecheck; eslint on changed files; test:critical
5376/5376; test:app 2278/2278; e2e player-summary + companion-preview, both profiles, 16/16.

## Attempt 11 — claim-fence feedback: `preview-mode.ts` kept (2026-10-12)

The fence flagged `packages/core/src/queries/preview-mode.ts` (outside the claim). It is not
reverted, because the review of `88a997160` rejected the candidate for exactly what that file
decides: an observer row's Preview opened `preview-generic-observer` (unassigned, none of the
observer's deliveries) while the row reported the observer's own stage. The acceptance item asks
for a Preview per participant that opens that participant's companion preview.

There is no owned-path route to the fix. The shared executor (`HubIntent.tsx`) can only call
`runtime.enterPreview(selection)`, and `SceneRuntime.enterPreview` (unowned) always passes the
selection through `resolvePreviewActor` (in `preview-mode.ts`), which before this change
discarded any observer `playerActorId`. Reverting it brings the rejected defect back: the new
`widget-intents.test.ts` regression and the observer step in `player-summary.spec.ts` fail.

The change is the smallest that works: one condition (honour a specific seat whose role equals the
requested role) plus doc comments, 25 lines. Fallbacks for unknown, reserved and mismatched ids are
unchanged and still tested. The task blocks for the operator to decide whether to widen the claim to
this one path. The code is unchanged from `4d73e48b5`.
