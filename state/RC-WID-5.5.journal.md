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
