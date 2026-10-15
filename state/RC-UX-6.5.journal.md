# RC-UX-6.5 — Bring your existing material

## Implementation

- Inspected existing file pickers and import flows. No Headroom tools are available in this session.
- System-package files use Community's existing `.dndmodule` review (also supports other module kinds); there is no separate system JSON picker.
- Adding a shared catalog and one-shot route launch intents, preserving existing parsing, previews and confirmations. Companion shell/flow wiring is necessary for the four requested entry points.
- No dispatcher state, publication or promotion changes.

## Findings

- Shared catalog covers Markdown ZIP/folder, note bundles, character JSON, Atlas images/external
  format review, audio, full backup, `.dndmodule` (including system packages), and `.dndscene`.
- Scope discrepancy: `useImportMap.ts` has no external map JSON parser; its external flow reviews
  format/declared elements with `asset: null`. The hub and user guide explicitly state this existing
  limitation. No new parser was added. Image launch opens the existing `ImportMapDialog` picker.
- First browser run: 22 passed, 2 failed on a new assertion using “Import notes” instead of the
  existing “Import a markdown vault” heading. Corrected the assertion and added preview/reopen tests.
- First registry scan identified the delegated Knowledge panel; its explicit exception now points
  to the registered route handler. Widget parity identified the UI-only import-hub event module;
  classified it without adding vault access or parity debt.

## Final implementation

- Four entry points: first-session widget, Help menu, command palette `Import…`, Settings › Vault
  connections. Knowledge › Sources and the note import panel link to the same hub; onboarding's
  pointer and English/Spanish catalogs now name it.
- Catalog routes feed one-shot launch handlers in the existing flows. The completeness test checks
  row/route/handler equality and detects unregistered file-picker call sites, with documented
  delegations and non-material exceptions. No parsers or import command semantics changed.
- Explicit Settings import links reveal only the corresponding section at Beginner level, without
  changing the saved experience level. Hub actions require a writable GM vault. Unsupported folder
  picking explains the ZIP alternative.
- Empty Atlas launches the existing create form, then its existing import dialog/picker. Cancelling
  clears the pending import. Character and system-module previews and backup confirmation remain.
- Companion files include shell entry points, existing destination route hooks, the Settings section
  disclosure context, catalogs/pseudo catalog, widget UI dependency classification, tests/snapshots.
  These are needed to implement the entry points and importer handoffs outside the listed flow files.

## Verification (local task branch)

- App typecheck: `pnpm --filter @dndtools/gm-react typecheck` passed.
- `pnpm lint` passed (existing emphasis warnings remain below their baseline).
- Focused app tests: registry, widget parity, builtin bodies, Settings experience: **112 passed**.
  Updated the one getting-started body snapshot for the new hub button.
- Browser batch: `import-hub`, `first-session-guide`, `characters-polish`, `markdown-folder`, both
  desktop-chromium and mobile-chromium: **52 passed**. Includes all four entry points, every catalog
  picker, character/module preview, backup confirmation, cancellation/reopen, unsupported folder
  guidance, Beginner ZIP launch and axe on the hub.
- Additional empty-vault map create/import and cancel/manual-create cases, both profiles:
  **4 passed**. These use actual first-run onboarding; setting the onboarded preference up front
  opts into the development demo fixture. The cancellation case fills a draft before clicking
  Cancel, then verifies a subsequent manual create does not open the importer.
- Pinned-container `palette-help` + `settings-polish`: updated 45 intended Help/palette/Vault PNGs,
  then comparison with `--update-snapshots=none`: **30 passed**. Reviewed representative captures.
  Baseline size check passed: 852 files, 37575.1 KiB / 37888.0 KiB.
- Changed-file formatting and `git diff --check` passed.
- Central gates and independent review have not run here. The map-JSON capability discrepancy above
  remains an explicit limitation of the existing importer, not a new parser added by this task.

## Claim-gate response

Reviewed candidate `7dd840dc4` against the gate's base
`7a287014e9909309739ab5e0512ee10031d9ff8f`. The working tree was clean. The gate rejected
19 implementation paths outside the effective five-file claim. The task description names
`apps/gm-react/src/app/importHub` as new owned code, but that directory is absent from the
reported effective claim. This is an unresolved claim mismatch, not authorization to change
dispatcher state.

The rejected paths are retained under the explicit exception in the retry instruction. Their
acceptance dependencies are listed below (paths are relative to `apps/gm-react/src/`):

| Rejected path                                | Why the acceptance criteria need it                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `app/importHub/ImportHub.tsx`                | Implements the requested single hub, importer rows, descriptions and route actions.                                                     |
| `app/importHub/registry.ts`                  | Defines the registered importer routes and shared hub-opening event; supports the required completeness assertion.                      |
| `app/importHub/useImportLaunch.ts`           | Consumes route intents once and invokes existing import flows without a second click or reopening on Back.                              |
| `app/importHub/settingsImportSection.ts`     | Identifies the chosen Settings importer so first-session users can reach its section without changing experience level.                 |
| `app/CommandPalette.tsx`                     | Provides the explicitly required `Import…` command; no claimed file owns palette commands.                                              |
| `app/help/HelpMenu.tsx`                      | Provides the required Help entry and mounts one shared hub on every route.                                                              |
| `app/widgets/builtin/GettingStartedBody.tsx` | Provides the required first-session guide entry.                                                                                        |
| `app/widgets/parity.ts`                      | Classifies that guide's UI-only launcher dependency for the existing mandatory widget parity gate; adds no vault access or parity debt. |
| `app/ConnectedSources.tsx`                   | Provides the required Knowledge › Sources pointer to the hub; the owned ImportPanel is a different disclosure.                          |
| `screens/atlas/useAtlas.ts`                  | Receives the map launch intent, selects the existing destination or requests creation, and clears a cancelled pending import.           |
| `screens/atlas/index.tsx`                    | Mounts the existing ImportMapDialog on hub arrival and connects creation cancellation; editing the dialog alone cannot mount it.        |
| `screens/audio/useTrackEditor.ts`            | Calls the existing audio picker on hub arrival; its handler is local to this hook.                                                      |
| `screens/settings/LocalBackup.tsx`           | Calls the existing backup picker and preserves its validation and destructive confirmation.                                             |
| `screens/settings/index.tsx`                 | Allows the explicitly selected import section to mount when the ordinary Settings tab is hidden at Beginner level.                      |
| `screens/settings/Experience.tsx`            | Keeps the selected import section and its dialogs mounted at Beginner level; other sections retain their normal disclosure rules.       |
| `screens/knowledge/index.tsx`                | Opens and mounts the existing note ImportPanel with its picker intent; changing the panel alone cannot open its parent disclosure.      |
| `screens/community/index.tsx`                | Selects the Export tab where local module/system and scene importers live; the default Discover tab does not mount them.                |
| `screens/community/ModuleFile.tsx`           | Opens the existing system-package/module file picker and install review required by the task.                                           |
| `screens/community/Export.tsx`               | Opens the existing portable-scene picker, retaining coverage of every registered material importer.                                     |

Reverting these paths individually would remove required entry points, leave launch intents
unhandled, break imports/builds, or prevent existing dialogs from mounting. Keeping duplicate
parsers or manipulating another screen's DOM from an owned component would not be a suitable
substitute for these explicit integrations. No rejected path was reverted, and the effective
claim was not changed.

This follow-up changes only the run journal and records the same rationale in the commit
message, as the retry instruction requests. The implementation and prior test artifacts remain
unchanged. Prior verification above is historical evidence from the implementation attempt,
not a claim that the central gate accepted this rebased candidate. For this documentation-only
follow-up, run journal formatting and diff whitespace checks are sufficient; app/browser tests
are not rerun.

**Status: blocked on the central operator's decision whether to widen the claim for the listed
paths.** The existing map-JSON capability discrepancy remains separately documented above.
No push, promotion, additional loop, agent delegation or dispatcher control-state edit occurred.

## Operator-authorized rebase and gate rerun (2026-10-12)

- The operator widened the claim to the required crossings documented above. The previous
  claim-blocked status is superseded; no further claim expansion or control-state edit was made.
- Rebased onto current `loop/rc`, `74efcfe28dc4026a16bc436a6de9feff7a60842f`.
  Resolved the sole conflict in `docs/user/getting-started.md` by preserving the upstream
  RC-UX-6.8 vault-switcher references and the import-hub guide. Implementation diffs are unchanged.
- Rerunning the documented pre-handoff gate (`pnpm check`), lint, changed-file formatting,
  both-profile importer/adjacent browser checks, and pinned-container visual comparisons.
  Exact command logs are retained under `/var/tmp/rc-ux-6.5-rebase/` during this run.

- Focused browser rerun: **56 passed** on desktop-chromium and mobile-chromium, including
  importer completeness, all entry points, existing pickers/reviews and empty-map flows.
- Initial `pnpm check` passed static gates, all three typechecks and 5,362 core tests,
  then failed two configured-cloud tests because their standalone Settings fixture lacked a
  router. Added `MemoryRouter` to that fixture (no production behavior change) and reran.
- Initial pinned-container comparison: **30 passed**, with no visual differences. The combined
  upstream/task screenshot set exceeded the unchanged 37 MiB budget by 71.7 KiB. Losslessly
  recompressed only this task's 45 changed PNGs; verified every decoded RGBA byte and dimension
  matched before/after. Saved 328,744 bytes. Budget now passes: **888 files, 37,638.7 KiB /
  37,888.0 KiB**. Repeating comparison against the compressed files.
- Full shared-route browser gate started on both profiles (2,230 tests; stop after 10 failures
  to bound diagnosis). This is separate from the successful focused acceptance batch.
- The second pre-handoff run passed the cloud suite (**569 tests**), then found the new hub
  button missing from six Command Center semantic snapshot sections and a hard-coded `GM`/`DJ`
  in the hub's read-only copy. Updated only those snapshot sections and changed that message to
  the existing `{gm}` vocabulary placeholder in English, Spanish and the generated pseudo catalog.
  The untouched base's 14 Command Center tests passed in an isolated temporary checkout.
- Compressed-baseline pinned-container rerun: **30 passed**, no snapshot changes.
- Stopped the first full browser attempt after catalog edits triggered Vite hot reload and
  `useI18n` context errors. Restarted it against the settled source; the interrupted attempt is
  not acceptance evidence. Logs: `full-e2e-final.log`, `check-final.log`, `lint-final.log`.
- Final `pnpm check`: **passed**, including systems validation, Android static preflight,
  quality gates, boundary lint, all three typechecks, and all four unit suites:
  core **5,362**, cloud **569**, app **2,280**, tooling **249** (8,460 tests total).
  `pnpm lint` and changed-file formatting also passed after the fixes.
- Full browser run completed (53.4 minutes): **2,181 passed, 44 skipped, 5 failed**.
  Two failures were the same obsolete Settings source-pointer assertion on both profiles;
  updated that test to verify/open the Import hub, then navigate to Knowledge for persistent
  source connection/export/disconnect coverage. The other three failures were mobile canvas
  keyboard removal (expected six frames, found seven), canvas text selection (`userSelect` was
  `none`), and a missing Resize menu item. No canvas implementation was changed. Retesting the
  four affected cases on both profiles; the full-run result remains recorded as failed.
- Follow-up browser evidence:
  - Corrected the Settings assertion to the actual no-cloud folder/ZIP copy and retained the
    existing **Manage in Knowledge** action. Full `settings-polish.spec.ts`: **18 passed**, both
    profiles (`settings-final.log`). The first follow-up used the cloud-enabled copy and failed;
    that intermediate result is not counted as a pass.
  - Both canvas keyboard-removal and text-selection cases passed on both profiles without any
    implementation or test changes (`followup.log`). Their original failures remain recorded.
  - Mobile tile resizing is intermittent: candidate single-worker repeats **2 passed, 1 failed**
    (`tile-repeat.log`). Untouched `loop/rc` at `74efcfe28`, in an isolated checkout using the same
    dependencies, first passed once and then repeated **4 passed, 1 failed** with the same missing
    Resize menu item at `tile-resize.spec.ts:60` (`base-tile.log`, `base-tile-repeat.log`). This is
    independently reproduced on the base, not a claim that the full browser gate is green.
    No out-of-claim canvas change was made; the temporary base checkout was removed afterward.
- Final scope: the required production integrations are retained at their prior size; only the
  hub vocabulary message, router test fixture, affected semantic/Settings expectations, lossless
  PNG encoding and this journal changed after rebase. No parser or dispatcher state changed.
- Handoff status: rebased implementation and task-specific acceptance checks are ready for central
  review. `pnpm check`, lint, formatting, 56 focused browser checks, 18 Settings checks, 30 visual
  comparisons and the screenshot budget pass. The full browser run is **not clean**: its task-owned
  stale assertions were corrected and retested, two canvas cases passed on rerun, and the remaining
  intermittent mobile Resize-menu failure was reproduced on the untouched base. No push,
  promotion, additional loop or agent delegation occurred.

## Operator completion (2026-10-12)

Reviewed and integrated by the operator session instead of a dispatcher review round. The three
commits were squashed and rebased onto `loop/rc` `e4707d443` (RC-WID-5.7, RC-SES-7.3 and RC-CAN-8.7
landed); no conflicts. Checked against the acceptance criteria:

- The hub opens from the first-session guide, Help, the command palette ("Import…") and Settings ›
  Vault connections. Knowledge › Sources names it.
- Every importer in `IMPORTERS` has a hub row, and `registry.test.ts` fails on a new material file
  picker without a `useImportLaunch` handler.
- `docs/user/getting-started.md` changes in the same commit.
- Nothing new is parsed.

Validation on the rebased tree: `pnpm typecheck` 0; `pnpm test` 0 (core 5,392, cloud 569, app
2,375, tooling 249); `pnpm lint` 0; `pnpm gates` 0; changed-file Prettier clean. Playwright on both
profiles: import-hub, settings-polish, command-palette, first-session-guide, knowledge-import,
characters and help, 104 passed. Pinned visual compare: 582 passed.
