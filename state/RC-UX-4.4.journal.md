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
