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

## Review follow-up: Spanish renders English vocabulary

- Read the rejection and reproduced its high finding before changing anything. Confirmed at the
  source: `SystemVocabulary` is ten plain string fields (`state/system-package.ts:472`), both built-in
  packages were authored in English (`systems/dnd5e.ts:283`, `systems/generic.ts:71`),
  `SystemContext.tsx:37` passes the vocabulary through untouched, and `vocabularyValues()` uses its
  `locale` argument only to lowercase. A `{hitPoints}` in a Spanish string therefore renders
  `Hit points`. The reviewer's count is right: 9 keys carried these tokens at base, 24 at head.
- Prototyped the real fix — a locale-keyed translation of the shipped packages' words, applied per
  field in `vocabularyValues()`, with a DM-authored package passed through untouched. It fixes all 24
  keys including the 9 that were already wrong. Then reverted it: `apps/gm-react/src/i18n/vocabulary.tsx`
  is neither in this story's `Owns:` nor in the manifest's `companion_paths`, so committing it trips
  `candidate changes paths outside its claim` before any gate runs (`dispatcher/engine.py:805`).
- The reviewer's third remedy — Spanish nouns in `es.ts`, English tokens left in `en.ts` — is blocked
  by an invariant that predates this story: `index.test.ts` asserts every Spanish string carries the
  same sorted argument shape as its English source. Exempting the vocabulary names from that guard
  would weaken a real check to accommodate a change that cannot be correct in Spanish yet.
- So the 12 newly tokenized keys went back to their nouns in BOTH catalogs, keeping the copy pass's
  rewording. Restored `HP` / `PG` at the three width-constrained labels the medium finding named
  (`characters.hpLabel`, `widgetBody.initiative.hp`, `encounter.hp`) and the two widget-body snapshots
  that recorded the expansion. The 9 pre-existing placeholder keys are untouched, so the catalogs sit
  exactly at base for every `{hitPoints}` / `{spell*}` token.
- `{gm}` (14 → 156 uses) is kept. A Spanish reader sees `DM`, where the base catalog spelled out `DJ`
  — an abbreviation crosses the language boundary where a full noun does not. It is the owner's call,
  and it is written down rather than left to be rediscovered.
- Recorded the whole limit as `DEBT-2026-007`, in the shape `DEBT-2026-006` set for the same
  situation: the fix is understood, it is outside the claim, it needs its own story.
- Low finding fixed: `settings.ai.batchSelectGroup` is now `Select all proposed by {agent}` /
  `Seleccionar todo lo propuesto por {agent}`. Swept the rest of the panel for the same jargon and
  found three more English-only leaks the Spanish had already avoided — `approving as staged` in
  `conflictIntro` and `# change staged for your review` across the three assistant-outcome messages —
  now `approving it as it stands` and `# change proposed for your review`.
- Reproduced the reviewer's own scenario against the fixed catalogs (`/tmp/rc-ux-44-render.log`):
  rendering every Spanish string that carries an argument through `formatMessage('es', …)` under both
  packages' real vocabularies. The 15 regressions are gone; the 14 that remain under 5e are the
  pre-existing `{spell*}` and `{levelUp}` keys, unchanged from base.
- Validation, original output read in full: `pnpm test:app` 133 files / 1,467 tests passed; app
  typecheck passed; ESLint passed on all 27 changed TypeScript files; Prettier and `git diff --check`
  passed; `pnpm feature-audit` reported 48 declared limits with 0 stale and 0 screens needing wiring.
  Browser: 56 cases (`ai-batch-review`, `command-palette`, `encounter-builder`, `character-resources`)
  and then 26 cases (`ai-assistant`, `ai-proposal-conflict`, `ai-batch-review`) passed on desktop and
  mobile with `--retries=0` on `DNDTOOLS_E2E_PORT=5311` — `/tmp/rc-ux-44-e2e-1.log`,
  `/tmp/rc-ux-44-e2e-2.log`. No retries, skips or failures.
- No pixels were captured for the medium finding's layout risk, and none are needed: the three labels
  are byte-identical to base again, and the one label that did change case (`player.hp.label`,
  `HIT POINTS` → `Hit points`) renders narrower, not wider.
- Full-suite revalidation and independent reviewer sign-off remain with the central operator.

## Post-rebase follow-up: vault recovery translations

- Read the original app-test failure in attempt `3233c64a-45d6-4134-a454-5f584aff82be`
  and reproduced it locally: the exact-key-coverage test identified 11 missing Spanish vault
  recovery/storage keys. The earlier copy pass and review fixes are already in this branch.
- Read the content fundamentals and the vault recovery UI. Added all 11 Spanish translations,
  preserving `{percent}`, `{name}` and `{bytes}`. Kept the existing coverage and argument checks.
- Added a retry action to the recovery-export failure in both locales and replaced the internal
  quarantine heading with “Documents needing recovery”. Updated its one companion e2e assertion
  under roadmap §0.2; no behavioral assertion changed.
- Delegated only the two longer help strings to natural-writer, following its local instructions;
  incorporated its EN/ES guidance on freeing space and retaining originals for recovery.
- Headroom tools are unavailable; diagnostics below use original command logs. Initial full app
  run: 119 files / 1,386 tests passed, 15 suites could not load with `Unknown system error -122`
  on write. Initial browser run: both profiles reached the final reload and timed out waiting for
  the runtime. `/tmp` uses a per-user quota; rerunning with a task-specific `TMPDIR` under
  `/home/trinkle/.cache/rc-ux-44-tmp`, without deleting shared temporary files. Validation pending.
- Final app rerun passed: 134 files / 1,484 tests, including exact Spanish coverage and argument
  parity (`/tmp/rc-ux-44-app-recheck.log`). Browser rerun passed both desktop and mobile with one
  worker and zero retries (`/tmp/rc-ux-44-storage-recheck.log`), including original export and reload.
  This establishes the rerun result; it does not prove the initial browser timeout's cause.
- `pnpm check` also passed in full (`/tmp/rc-ux-44-check.log`): system/Android validation, quality
  gates, boundary lint, all three package typechecks, core (4,814 tests), cloud (491), app (1,484),
  and tooling (191). Changed-file ESLint, Prettier and `git diff --check` passed. Read original
  summaries and confirmed exit code 0 for each completed validation command.
- The earlier per-package vocabulary limitation remains recorded in `DEBT-2026-007`; this follow-up
  introduces no vocabulary changes. Independent reviewer sign-off remains with the central operator.
  No push, promotion, additional loop or dispatcher control-state changes.

## Integration reconciliation onto 2d9f566d

- Reproduced the rebase conflicts and replayed all six task commits onto
  `2d9f566d194d10e597c8001015b7e8be31811d59`. Preserved the integration branch's newer
  privacy disclosures (features unavailable in this edition and fresh consent before server
  readability), theme guidance, scene-preview keys, illustration captions and atlas library.
  Retained task vocabulary placeholders and the clearer high-contrast description.
- Reconciled the requirements inventory against the newer table, changing only the two existing
  copy anchors. Reviewed `git range-diff`; the later task commits replayed without conflicts.
- The first rebased app run found two failures: ten new Markdown-folder keys lacked Spanish,
  and new integration messages spelled out DM/DMs. Added the ten translations, delegated only
  the long description to natural-writer, and applied `{gm}` in both locales to the new role
  references. The folder-transfer rejection now offers a retry. Existing guards are unchanged.
- Original diagnostics: `/tmp/rc-ux-44-rebase-app.log`; Headroom remains unavailable.
  Final validation pending. Independent reviewer sign-off remains with the central operator.
- Final `pnpm check` passed (`/tmp/rc-ux-44-rebase-check.log`, exit 0): quality gates,
  boundary lint, package typechecks, core 4,902 tests, cloud 521, app 1,587 across 144 files,
  and tooling 196. The app run includes Spanish coverage and vocabulary guards after the fixes.
  `pnpm feature-audit` passed all 48 anchors with zero stale limits and zero unwired screens
  (`/tmp/rc-ux-44-rebase-audit.log`). Changed-file format, catalog ESLint and diff checks passed.
- Browser validation: binding inspector and Markdown-folder specs passed both profiles; player
  preview passed desktop but initially timed out on mobile waiting for `#main-content` before
  copy assertions (10 passed / 2 failed, `/tmp/rc-ux-44-rebase-e2e.log`). Re-ran preview with one
  worker and included the integration privacy-limit spec: all 10 cases passed on desktop/mobile,
  zero retries (`/tmp/rc-ux-44-rebase-privacy-preview.log`). No assertion or timeout was weakened.
- Confirmed `2d9f566d` is an ancestor of the reconciled task branch. No push, promotion or
  dispatcher-state changes. Central independent review remains pending.
