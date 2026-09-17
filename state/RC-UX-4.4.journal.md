# RC-UX-4.4 run journal

- Scope: English and Spanish message catalogs; copy only. Current task branch was clean.
- Read the binding content fundamentals and vocabulary injection contract. Headroom tools are
  unavailable in this session; using direct source reads and original command output.
- Reviewing the whole catalogs for plain state, actionable rejection messages, sentence case,
  explicit visibility and package vocabulary. Natural-writer is delegated long-form help only;
  it proposes paired translations without editing the repository.
- Independent reviewer sign-off and central gates remain pending; this implement run cannot
  supply independent sign-off. No push, promotion or dispatcher control changes authorized.
- Completed the catalog read-through. Natural-writer reviewed all long-form strings (at least
  140 characters) in both locales and supplied 60 paired rewrites; reviewed and incorporated
  those proposals with corrections for actual navigation and Open5e-specific vocabulary.
- Replaced fixed DM/GM/DJ role names with `{gm}`, and system-neutral ability/resource labels
  with supported vocabulary placeholders. Kept technical identifiers in authoring fields and
  code examples where the user must enter them; removed raw identifiers from package toasts
  and map-import outcomes. Core-side dynamic diagnostics are outside this catalog-only scope.
- Added recovery actions to rejected/failed operations. Checked session lifecycle, capture,
  map movement, package toasts, map-import outcomes and privacy confirmations against call sites.
- Standardized Spanish navigation on Configuración, Centro de comandos and bóveda. Added all
  74 missing Spanish keys for saved searches and templates. Source import/export actions now
  reserve “push” for handouts to players.
- Companion i18n tests (allowed by roadmap §0.2) update two stale wording expectations and cover
  custom Keeper vocabulary, absence of fixed role names, and full Spanish key coverage.
- First focused run: 3 failed / 58 passed. Found mismatched spell placeholder casing, two old
  wording expectations, and subsequently the existing placeholder-shape regex treating plural
  branch text as arguments. Fixed the catalogs and expectations; used natural “No hay filtros”
  to keep the existing plural-shape guard intact.
- Second focused run: i18n + app/help, 5 files / 76 tests passed. App typecheck passed.
  A final copy refinement followed; final validation pending.
- Full app run initially found six stale copy expectations (three snapshots, map access,
  malformed dice input and plan confirmation): 120 files passed, 4 failed. Read the exact
  diagnostics and updated only those expectations; the three snapshot diffs reflect the
  supported hit-points and game-master vocabulary. Companion paths are also explicitly
  permitted by the project's dispatcher manifest.
- Final validation: `pnpm test:app` passed all 124 files / 1,308 tests; app typecheck passed;
  ESLint passed all seven changed TypeScript files; changed-file formatting and
  `git diff --check` passed. Both catalogs have 5,249 keys, with exact coverage guarded by test.
- No browser acceptance run or independent reviewer sign-off in this implementation stage.
  Central validation and independent review remain pending. Intended commit contains the two
  catalogs, directly affected companion tests/snapshots and this journal only.

## Requirements-audit follow-up

- Read the original failed requirements-audit log from attempt
  `ae63513f-1e8b-495b-b0b1-90f93e3f3a56`. It reports exactly two stale literal anchors in
  `docs/requirements/FEATURE-GAPS.md`: Session standby and Settings cloud backup.
- Updated those inventory anchors to the revised English messages, and clarified that the
  live session must end before returning to Standby. The inventory remains intact; no audit
  logic or checks were weakened. The manifest explicitly permits this companion document.
- English and Spanish catalogs remain as committed in `d2a046cd`. Requirements audit
  passed: all 48 anchors match, with zero stale limits and zero unwired screens. All seven
  feature-audit unit tests passed. Changed-file formatting and `git diff --check` passed.
  Independent reviewer sign-off remains pending.

## Browser-acceptance follow-up

- Read the original browser log from attempt `9386ebfd-12ea-4066-8157-f74a1cda7562`, including
  each first-attempt failure. The 60 failures repeat 30 tests on desktop and mobile; each first
  failure refers to previous copy. Five other tests passed on retry in the central run.
- Updating the permitted companion browser specs to the reviewed visible labels and recovery
  messages. Core status values and behavioral assertions remain unchanged. Browser rerun pending.
- First targeted browser run: 58 passed / 4 failed (62 cases, no retries). The original failure
  output identifies two later old-copy expectations on each platform: the batch confirmation
  (`approved and committed`) and system gallery badge (`Forked`). Updated them to the exact
  singular confirmation (`1 proposal approved and saved.`) and `Your copy` badge. Re-running
  all originally failing tests plus the source-panel negative assertions updated in this pass.
- Final targeted browser validation passed all 64 cases on desktop and mobile with
  `pnpm e2e --workers=2 --retries=0 --grep <affected test titles>`: all 60 previously failing
  cases, two widget-builder accessibility cases matched by the same title, and the two
  connected-source cases whose negative label assertions were also updated. Original output:
  `/tmp/rc-ux-browser-final.log`. No retries, skips or failures in this targeted run.
- ESLint passed all 20 changed browser specs; the two subsequent expectation refinements
  also passed lint. Changed-file formatting and `git diff --check` passed. Application code,
  catalog copy, fixture protocol values and assertion behavior are unchanged by this follow-up.
- Full browser-suite revalidation and independent reviewer sign-off remain with the central
  operator. This run supplies targeted browser evidence, not a claim that the full suite passed.

## Review follow-up: audit status accuracy

- Read the independent review verdict and its retained evidence
  (`reproduce-audit-label.mts` / `.log`, `review.journal.md`, `wrapper-runs.json`) before editing.
  Two findings: a medium inaccurate audit status and a low Spanish agreement error.
- Confirmed the medium finding at the source. `McpAuditEntry.mode` records how a write was
  routed, not its resolution: `packages/core/src/commands/mcp-policy.ts:411` and `:657` append
  `mode: 'staged'` on a _successful_ approval, and `AiAuditBrowser.tsx:19` maps every entry's
  mode straight to `settings.ai.auditMode.staged`. "Awaiting review" therefore kept promising an
  unfinished review after the proposal was approved or rejected.
- Changed that label to a historic one that stays true after resolution: `Proposed` / `Propuesto`.
  It also matches `settings.ai.auditIntro`, which already calls these rows proposals, and keeps
  masculine-singular agreement with `cambio` alongside `Guardado` / `Denegado`. The baseline
  `Staged` / `En espera` was not restored: the first is engine jargon, the second is also a
  pending claim. The neighbouring assistant-transcript badge is unchanged — that feed narrates
  a run as it happens and was not flagged.
- Low finding: `mapGenerate.presets` in Spanish had been swept to `Configuración preestablecidos`
  (mismatched gender and number). Restored `Ajustes preestablecidos`, which agrees and matches
  the catalog's existing preset wording at `es.ts:341` and `es.ts:5787`. Swept the rest of the
  catalog for the same sweep damage: this was the only occurrence.
- Updated the one permitted companion assertion that pinned the old string
  (`ai-audit-browser.spec.ts:97`); no behavioral assertion changed.
- Validation on this follow-up, original output read in full: `pnpm test:app` 126 files /
  1,330 tests passed; app typecheck passed; ESLint passed on all three changed files;
  changed-file Prettier and `git diff --check` passed; `pnpm feature-audit` reported 48 declared
  limits with zero stale and zero screens needing wiring; the audit-browser spec passed all six
  cases on desktop and mobile with `--retries=0` (`DNDTOOLS_E2E_PORT=5301`).
- Re-ran the reviewer's own reproduction unmodified against the fixed catalogs
  (`/tmp/rc-ux-44-verify-audit-label.log`): with zero pending proposals, the approved run's two
  audit rows and the rejected run's row all read `Proposed` / `Propuesto`. The stated defect no
  longer reproduces.
- This is a targeted follow-up, not a claim that the full browser suite was re-run. Full-suite
  revalidation and independent reviewer sign-off remain with the central operator.
