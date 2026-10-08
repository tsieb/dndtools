# RC-WID-5.5 — Builder parity gate

## Session 1 — 2026-10-07

Started on `dispatch/dndtools/80db44d8b1ff14fbab5e` at `515d714c` (RC-CAN-7.6 merged in) with a
clean tree. No Headroom tools in this session; command output read directly or kept in
`/tmp/rcwid55/`.

Inputs read: RC_ROADMAP §0.3 rule 12 and the WID-5 epic, ADR-041 "Defaults and preservation",
SCREENS_PARITY §2 and §4, the RC-CAN-7.6 journal, WIDGETS.md §2–§6, `builtin/*.tsx`,
`dataEnvironment.ts`, `homeSources.ts`, `resolveRenderer.ts`, `widgetBuilder/draft.ts`,
`command-center.ts`, `widget-package.ts` (fork, export).

### What landed

- `apps/gm-react/src/app/widgets/parity.ts` (new, owned): the rule, the declared map
  (`BUILTIN_PARITY`, keyed by `BuiltinWidgetType`), the scanners (`extractBodyUses`,
  `deriveQueryExposure`, `builtinBodyModules`), the check (`checkBuiltinParity`) and the
  default-screen round trip (`defaultScreenParityProblems`).
- `apps/gm-react/src/app/widgets/builtin/index.tsx` (owned): `BUILTIN_WIDGET_TYPES` is `as const`
  and exports `BuiltinWidgetType`, so a new body without a parity entry does not compile. The set
  stays a `ReadonlySet<string>`; no caller changed.
- `apps/gm-react/src/app/widgets/parity.test.ts` (new test, runs in `pnpm test:app`).
- `docs/architecture/WIDGETS.md` §6.1 records the rule and its two halves, plus a §8 row. Outside
  Owns: the acceptance names WIDGETS.md explicitly.

### Decisions

- **Which screens are "shipped default screens".** Those `command-center.ensure-home` provisions
  with `origin.kind === 'default'`: the Command Center today, the Session screen when CAN-7.8
  provisions it the same way. The GM screen board (`commandCenter.homeSceneId`) is a canvas board of
  seven builtin bodies that ADR-041 keeps untouched for existing vaults, so it cannot pass a
  "template only" rule without CAN-7.9. It is covered by the builtin half instead: the test
  requires every tile on it to have a parity entry. **Operator decision:** if the GM screen must
  be held to the template rule now, the half-1 check fails on all seven tiles until they are
  converted.
- **"Template" means drawn by no builtin body.** The first negative test showed it: the system
  Dice definition declares `runtime: 'template'` but the render slot lets its hand-written body
  win. The default-screen half therefore asks `hasBuiltinBody(type)` first, then the declared
  runtime.
- **What "round-trips byte-identically" checks.** Measured on the five Command Center parts:
  - The fork equals the shipped definition apart from identity and key order (the install schema
    reorders keys), so that comparison is canonical (sorted keys).
  - The builder's first save of a shipped definition adds three derived fields the hand-written
    system definitions leave out: `style.cssVariables`, `computedFields: []` and
    `configSchema.properties`. So the shipped package is not a byte-level fixed point. What is
    checked: (1) the builder drops or changes no declared field (`changedFields`; additions
    allowed); (2) the builder's own save is a fixed point. The bytes are the export file
    (`JSON.stringify(exportWidgetPackage(...).package, null, '\t')`, as `downloadJsonFile` writes
    it), imported with `readPackage(…, 'proposed')`, saved with `buildPackage`, installed with
    `widget.package.install` and exported again. All five parts pass. Making the shipped
    definitions byte-identical to the builder's output would mean adding those three fields to
    the system definitions in `widget-package-state.ts`, which is outside this claim. Follow-up.
- **How "uses" is known.** By scanning source text, not by a hand list, so a new private read
  cannot be added without the test seeing it. A body's module comes from the `WidgetBody` switch;
  its `./` imports are followed. A whole slice handed to a read is that read's input; a deeper
  path is a read. Modules outside `builtin/` must be classified in `SHARED_MODULE_USES`, and the
  test scans each one against its declaration (`widget-body-kit`'s `useSessionOnlyReason` reads
  `session.workflow`; no body imports it today). A query source's exposure comes from its `case`
  block in the resolver plus the helpers it calls, so a declared source covers only what it really
  reads. Limits: only these idioms are seen (`runtime.state` chains and destructuring, core value
  imports, `type:`/`command:`/`onCommand`/`op(`/`.includes(` command literals, hash/`navigate`/
  `to`/`href` routes), and only one level of shared modules is scanned.
- **Viewer role.** `permissions.actors` counts as public because every template already receives
  the viewer's role (`WidgetTemplateData.isDm`). The scan works on paths, so Map's read of other
  players' roles (for projection) is covered by this too. The projection itself is a recorded gap.

### The gap ledger (existing private uses, recorded, exact)

Clean (public surface only): note, handout, dice (`dice-history` + `dice.roll`), quick-reference
(`content-objects`), prep (`notes`), data-hub (`table-scenes`, `vault-counts`), characters
(`visible-characters`), notes (`notes`).

With gaps. Only G-11 is in the SCREENS_PARITY §4 register; the rest are **unfiled** and should
be filed as WID follow-ups:

| Body               | Gap                                                                                                                            | Register             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| initiative-tracker | `combat.advance-turn`, `combat.apply-resource`, `combat.set-combatant-visibility`                                              | G-11 (5.12)          |
| map                | map view/layers/delivered maps (`getMapViewForActor`, `queryMapLayers`, `deliveredMapIdsForActor`, `maps.maps`, `maps.assets`) | unfiled, BD-20       |
| map                | self-reconfigure (`scene.configure-widget`, `scenes.scenes` to find its scene)                                                 | unfiled, BD-20       |
| map                | `session.set-active-map`, `session.project-active-map`                                                                         | unfiled, BD-20/SE-19 |
| timer              | `session.timers` (no source reads the timer the start/pause/resume executors run)                                              | unfiled, BD-23       |
| audio              | `getSessionAudioView`, `audio.assets`, `audio.sources`, `session.audioPlayback`                                                | unfiled, BD-24/SE-18 |
| character          | `getCharacterForActor` (one bound character)                                                                                   | unfiled              |
| session            | `getSessionStatusStrip`                                                                                                        | unfiled              |
| getting-started    | `resolveOnboarding`                                                                                                            | unfiled              |
| tools              | `commandCenter.presets`, `commandCenter.autoSave`, `commandCenter.homeSceneId`                                                 | unfiled              |
| atlas              | `getActiveMapProjectionSummary`                                                                                                | unfiled              |
| player-views       | `getPlayerViewController`                                                                                                      | unfiled              |
| combat             | `listEncountersForActor`                                                                                                       | unfiled              |
| search             | `getSavedSearchesForActor`                                                                                                     | unfiled              |

### Acceptance

- The test runs in `pnpm test` (`pnpm test:app`, `vitest.app.config.ts` includes
  `apps/gm-react/src/**/*.test.ts`): 13 cases.
- A deliberately private builtin read makes it fail: the case injects
  `import { listFactionsForActor }` and `runtime.state.session.timers` into `NotesBody` and gets
  exactly two failures naming them. Further cases cover a private command (`session.end`), an
  undeclared route (`/campaign`), a stale gap, a gap that is now public, an unused declared
  command, a body with no entry, and a builtin Dice tile added to the Command Center screen.
- WIDGETS.md §6.1 records the rule.

### Evidence (local)

- `parity.test.ts`: 13/13. `apps/gm-react/src/app/widgets/`: 16 files / 448 tests. `pnpm test:app`:
  175 files / 2147 tests, exit 0 (before two final edits: a comment, and skipping imports with only
  inline `type` specifiers; the parity test, `tsc` and eslint were re-run after them: 13/13, 0, 0).
- `tsc --noEmit` (gm-react) 0 errors; eslint on the three files 0; `pnpm gates` passed (warnings only;
  `parity.ts` is 772 lines, under the 800-line gate).

## Session 2 — independent-review corrections — 2026-10-07

The Session 1 decisions above are superseded: gap declarations cannot waive failures;
the fresh GM board is a shipped default; the FIRST builder round trip must preserve bytes.
No Headroom tools were available. Original local diagnostics are retained in
`/tmp/rcwid55-review-{test,lint,types,gates}.log` and were read directly.

Changes:

- Missing public exposure always produces a finding, even with a recorded gap.
- Fresh provisioning includes `commandCenter.homeSceneId` regardless of origin metadata.
- Compare the eligible original export with its first builder import/save/install/export;
  remove the additive-field allowance and second-cycle comparison.
- TypeScript syntax analysis detects state aliases, chained aliases, nested destructuring,
  and literal indexed reads. Dynamic indexed paths are conservatively reported.
- Regression tests cover all four review reproductions. WIDGETS.md states the strict rule.

Validation:

- Focused app parity suite: exit 1, 16 passed / 2 failed (18 total). The two unskipped
  enforcement assertions still require zero findings. They report 41 private-access
  findings (including newly visible dynamic member paths) and 12 default-widget findings:
  seven handwritten GM board bodies plus five first-import byte mismatches.
- ESLint on parity.ts and parity.test.ts: exit 0.
- gm-react typecheck (`tsc --noEmit`): exit 0.
- `pnpm gates`: exit 0, existing file-size warnings only.
- `git diff --check`: exit 0.
- `pnpm test` wiring verified from package.json and vitest.app.config.ts; the complete
  chain and browser/visual wrappers were not rerun. No claim of a green acceptance gate.

Remaining blocker: the strict gate exposes existing product parity debt. This correction
keeps those failures visible, as requested by the review's expose/remove-or-fail instruction.
Converting the default board and exposing all private dependencies is not implemented here.
No push, promotion, extra agent, loop launch or dispatcher-state change.

## Session 3 — wrapper failure investigation — 2026-10-07

Read the original dispatcher App tests log for run
`70efa902-b64c-4277-af38-60005def4a16` (candidate `6a565ea0`). It records
174 passing files / 1 failing file and 2150 passing tests / 2 failing tests.
Both failures are the strict production parity assertions, not test infrastructure.
No Headroom tools are available in this session.

Corrected two regression fixtures: inject a CSS variable the builder loses instead of
requiring every shipped home definition to remain broken; inject a builtin on the GM
board instead of requiring its shipped seven private bodies to remain forever. The two
production assertions remain unchanged and unskipped.

Validation of this correction:

- `pnpm test:app apps/gm-react/src/app/widgets/parity.test.ts`: exit 1, 16 passed,
  2 failed. Original output read from `/tmp/rcwid55-retry-test.log`. Still 41 builtin
  findings and 12 default findings; no claim that the wrapper failure is resolved.
- ESLint on the changed test: exit 0 (`/tmp/rcwid55-retry-lint.log`).
- gm-react typecheck: exit 0 (`/tmp/rcwid55-retry-types.log`).
- `git diff --check`: exit 0. Full wrapper chain not rerun.

### Ownership blocker and concrete follow-up scope

RC_ROADMAP section 0.2 defines Owns as a write fence; section 21.2(4) says
"Never widen scope" and requires needed core changes to land as separate stories first.
Tests are companion paths under section 21.2(2). The following product changes do not
fit the two owned production files:

1. Make `createHomeWidgetDefinitions` / `homePart` in
   `packages/core/src/state/widget-package-state.ts` agree with the builder's serialized
   definition. `systemWidget` omits computedFields and style.cssVariables and uses an
   empty configuration schema; `widgetBuilder/draft.ts` emits computedFields, derives
   CSS variables and declares config properties. Compare original export bytes after
   a single builder import/install/export; do not normalize the test input.
2. Replace the fresh GM board's seven builtin bodies with builder-editable public
   definitions, preserving the shipped map/combat/dice/timer/audio/reference/prep
   functionality. Provisioning is in `packages/core/src/commands/command-center.ts`
   (`ensureHomeBoard`); definitions, copyability and the template renderer must agree.
   Existing customized boards must remain preserved.
3. Add real, actor-scoped public query/command exposure for the private dependencies
   reported by the gate (timer/audio/map/combat and legacy hub bodies), with builder
   catalogue/schema support and permission tests. Relevant production owners include
   widget query state/schema modules, `commands/widget-command.ts`,
   `widgets/dataEnvironment.ts`, `widgets/homeSources.ts`, builder vocabulary, and
   renderer/builtin files. Merely declaring a query or command in BUILTIN_PARITY is
   not exposure and must not turn the gate green.

An ownership-scope clarification was requested; no answer arrived during this work.
No production files outside this task were changed, no dispatcher metadata or roadmap
status was rewritten, and no push, promotion, new loop or extra agent was launched.

## Session 4 — repeated ownership blocker — 2026-10-07

Status: BLOCKED; acceptance is not green. The repeated task instruction retains the
same two production-owned paths and does not authorize the wider changes requested
in Session 3. The working tree was clean at `d4a52a01` on entry.

Read the original App tests log for run `e73742e3-81ad-48f7-ba09-ffa687fd1ab0`
at `/home/trinkle/Programming/agent-dispatcher/.state/attempts/e73742e3-81ad-48f7-ba09-ffa687fd1ab0/output.log`.
It records exit 1, 174 passing files / 1 failing file, and 2150 passing tests / 2
failing tests. The failures remain the builtin-public-surface assertion and the
fresh-default builder-round-trip assertion. The latter still identifies seven
builtin board widgets and five first-import byte mismatches. No Headroom tools
are available; the original output was inspected directly.

Re-read RC_ROADMAP section 21.2: ownership is a write fence and item 4 explicitly
prohibits widening scope. Session 3 records the concrete production paths and
follow-up work needed. Retrying this unchanged claim cannot repair those product
incompatibilities. Operator action is required to schedule the prerequisite work
or explicitly authorize and arrange a wider claim. No scope answer has arrived.

No implementation or test changes were made, and unchanged tests were not rerun.
This journal-only commit records the blocked handoff, not task completion. The
strict assertions remain enabled. No dispatcher state, roadmap status, other
worktree, remote branch, loop or agent was changed.

## Session 5 — amended acceptance: exact debt ledger — 2026-10-07

The operator brief of 2026-10-08 amended the acceptance: land the gate strict, with every
current finding in an exact debt ledger naming RC-WID-5.6 or RC-WID-5.7. Gate feedback
for `6828ce37` (App tests run `553eeecb-…`, exit 1) was the same two strict assertions:
41 private builtin uses and 12 default-screen findings. Read from the original log.

### What changed

- `parity.ts`: the per-entry `gaps` waivers and the `GAP` table are gone;
  `BuiltinBodyParity` is queries, commands and intents only. The checker reports every
  uncovered use through `privateUseFinding` and never reads the ledger. New exports:
  `PARITY_DEBT_LEDGER` (53 entries, one per finding, word for word, each with
  `repaidBy: 'RC-WID-5.6' | 'RC-WID-5.7'`), `compareToLedger` (unledgered + stale),
  the three finding formatters, and `builderRoundTrip` / `exportedBytes` (the round trip
  the default-screen check already ran, extracted so the test can drive it directly).
- `parity.test.ts`: the ledger test compares the full finding list (builtin bodies plus
  the provisioned default screens) to the ledger and expects no unledgered and no stale
  entries. Negative cases: an unledgered private read in NotesBody, an aliased read
  (`const s = runtime.state; s.session.timers`), a stale entry, an entry for another
  widget, a private command and route, unused declared surface, a builtin added to the
  home screen, a builtin on the fresh GM board. A board test asserts the board's origin is
  null and that every board widget is enumerated. The round-trip test shows the builder's
  own output is a fixed point and that a field lost on import changes the bytes, so the
  original-vs-first-trip comparison is raw.
- WIDGETS.md §6.1 records the rule and the ledger; RC_ROADMAP.md carries RC-WID-5.6 and
  RC-WID-5.7 under Epic WID-5 (dispatcher task text) and in §23 (summary counts updated by
  hand; status cells not re-synced, rows blank = ready).

Ledger split: RC-WID-5.6 = 5 home round-trip findings; RC-WID-5.7 = 7 GM-board builtins +
41 private uses (its task text covers the legacy hub bodies too).

### Evidence (local)

- `vitest run --config vitest.app.config.ts …/parity.test.ts`: 21/21 passed.
- `pnpm test:app`: 175 files / 2155 tests passed, exit 0.
- `apps/gm-react` `tsc --noEmit`: exit 0. `pnpm lint`: exit 0.
- `pnpm format:check:changed -- --base loop/rc`: clean.
