# RC-UX-5.4 run journal

## Plan

Implement the owned local-vault storage and runtime boundaries, legacy registration in place,
privacy namespaces and desktop management surface; validate and commit the coherent subset.

## Ledger

- coreStore.ts — registry, stable per-document selection, storage namespaces — DONE
- privateStore.ts — vault and character namespaces, preserve legacy database names — DONE
- vaultMode.ts — use vault preference namespace — DONE
- SceneRuntime.ts / RuntimeContext.tsx — expose selected vault, drain before reload — DONE
- VaultSwitcher.tsx / Sidebar.tsx — accessible management dialog — DONE

## Decisions

- The roadmap §0.2 explicitly makes Owns a write fence; tests and message catalogs are exceptions.
- Keep the legacy primary vault in dndtools-v2 and its original private databases. No copying,
  schema changes, rewritten operation IDs, or key migration is needed.
- Pin the storage namespace for the lifetime of the document. Selecting a different vault takes
  effect only after a full reload, so pending work and other tabs cannot retarget writes.
- Do not expose switching until out-of-scope preference and cloud consumers use the namespace.
  The desktop dialog can register and rename vaults; opening another vault explains unavailability.
- Key custody already scopes by account plus vault. Preserve its cryptographic contract.

## Handoffs

HANDOFF RC-UX-5.4 → apps/gm-react/src/platform/preferences.ts: use the vaultPreferenceKey adapter
for campaign preferences (including palette recents, spotlights, invites, tier and vault choice);
retain device accessibility/language choices according to their contracts.
HANDOFF RC-UX-5.4 → apps/gm-react/src/cloud/syncEngine.ts, apps/gm-react/src/cloud/cloudSync.ts,
apps/gm-react/src/screens/settings: replace primary defaults and backup/recovery contexts with the
selected local vault ID; scope opt-in intent; verify active-only backup/sync before enabling switching.
HANDOFF RC-UX-5.4 → apps/gm-react/src/app/shell/RailNav.tsx,
apps/gm-react/src/app/shell/MoreSheet.tsx: mount the shared switcher on tablet and phone.

## Tests

Headroom tools are not available in this session; native command output is used.

## Report

Partial implementation ready for operator review. No push, promotion, extra agents, loop or dispatcher state changes.

## Edits made

- DONE: catalog and per-document namespace APIs in coreStore; legacy names unchanged.
- DONE: private records use disjoint vault/character database names; privacy mode uses the vault key.
- DONE: runtime switch preparation waits for maintenance/dispatch queue; new campaigns skip demos.
- DONE: lazy desktop catalog dialog registers/renames, reports last opened and keeps opening disabled.
- DONE: shared dialog has explicit opening/demo callbacks for the remaining shell integration.
- DONE: EN/ES copy, migration/isolation/backup tests, same-account key isolation test, desktop catalog e2e.

## Validation progress

- App typecheck: exit 0 before tests were added; will rerun on final tree.
- Focused localVaults + SceneRuntime: 2 files / 13 tests passed, exit 0.
- Full app run 1: 126 passed / 1 failed files; 1338 passed / 1 failed tests. The structural private
  store allowlist also scans test sources. Added the new isolation test to its test-only entries;
  production import allowlist unchanged. Final rerun pending.
- Lint run 1: no-control-regex rejected the name validator. Replaced it with core's existing
  hasAsciiControlCharacter helper. Raw-style ratchet passed at 2581; final lint pending.
- Browser tests running: local-vaults, command-palette, settings, desktop/mobile Chromium.

## Remaining acceptance

PARTIAL RC-UX-5.4: isolated storage/runtime and desktop catalog — production switching, existing
preference consumers, cloud/recovery selection and phone/rail entry points require the handoffs above.
The browser test explicitly checks disabled opening; it is not the requested switch-isolation e2e.

## Final validation

- `pnpm typecheck`: exit 0 (core, cloud functions and React app).
- `pnpm lint`: exit 0; existing warnings only. Boundary and non-text contrast gates passed.
- `pnpm test:app`: exit 0, 127 files / 1339 tests passed on the final runtime/storage changes.
- `pnpm test:cloud`: exit 0, 36 files / 483 tests passed, including independent same-account vault
  keyrings, cache-loss reload, cross-vault decryption rejection and isolated key deletion.
- `pnpm build`: exit 0; production bundle check confirms no runtime test seam or component gallery.
- Browser run 1: 52 passed, 2 failed. Catalog op-count assertion raced Board's ensure-home command
  (41 became 43). The test now waits for real painted widgets before taking its baseline.
- Browser run 2: local-vaults, command-palette and settings on desktop/mobile Chromium — exit 0,
  54 passed. local-vaults deliberately uses desktop width for both mouse and touch profiles;
  this does not claim phone/rail entry coverage.
- Added truncation for long vault names in the existing sidebar chip; targeted ESLint exit 0 and
  final local-vaults browser rerun exit 0, 2 passed.
- `pnpm feature-audit`: exit 0, 48 declared limits with 0 stale; 0/23 screens need wiring review.
- `pnpm perf:capture --only scene-first-render --port 15594 --out /tmp/rc-ux-5.4-perf.json`:
  exit 0; raw samples 1103.3, 1117.9, 1097 ms. Duration budgets grade the maximum: 1117.9 ms
  is below 1500 ms. This is the harness's seven-widget demo fixture on desktop, not the full
  declared 50-widget / 10-binding reference dataset or a phone performance measurement.
- Prettier on changed code/test/catalog files and `git diff --check`: passed.
- Original uncompressed command logs retained at `/tmp/rc-ux-5.4-{app,cloud,typecheck,lint,build,
e2e,e2e-final,perf,audit}.log`; performance samples at `/tmp/rc-ux-5.4-perf.json`.

## Final report

PARTIAL RC-UX-5.4: committed foundations and desktop vault management. Existing vault data stays
in place; isolated namespaces and runtime reload preparation have real storage/key/backup tests.
Switching remains unavailable in the shipped UI until the out-of-scope preference/cloud consumers
and rail/phone entry points are integrated. The required user-driven switch-isolation e2e and active
cloud sync acceptance are therefore NOT complete. Do not mark the entire story done from these gates.

Specific recovery-key consumer: `apps/gm-react/src/screens/settings/SyncPrivacy.tsx` uses
`CLOUD_VAULT_ID` for both recovery export and import; scope both with the sync-engine handoff.
No pushes, promotion, extra agents, loops, or dispatcher control-state edits occurred.

## Review remediation — 2026-09-12

- Read current roadmap §0.2: Owns is an explicit write fence, with tests/catalogs granted.
- Headroom tools are available for this run; use retained original output for gate conclusions.
- Confirmed production blockers: preferences.ts reads unscoped campaign keys; syncEngine.ts defaults
  to primary (also consumed by SyncPrivacy recovery); cloudSync.ts opt-in is account-only;
  RailNav.tsx and MoreSheet.tsx have no switcher entry.
- Requested explicit ownership extension for those integration files. No extension received yet;
  do not enable switching against shared cloud/preferences or bypass the fence with runtime patches.
- Independent owned work: harden the runtime switch lifecycle against hydration races, navigation
  failure and post-switch writes; add real regression tests. PENDING.
- Full switching/search/keyring journey and declared performance fixture remain acceptance work,
  not satisfied by the earlier catalog test or seven-widget timing.

### Remediation ledger and verification

- DONE coreStore.ts: staged selection returns conditional rollback for navigation failure.
- DONE SceneRuntime.ts: wait for hydration and its queued seed; reject competing switches; stop
  later mutations once departing; roll back navigation failures and permit retry/editing.
- DONE localVaults.test.ts: real IndexedDB tests for rollback, retained edits, selection in another
  tab, and rejecting late writes; SceneRuntime.test.ts covers initial hydration and failed loads.
- Focused regression suite: exit 0, 17 tests. Original Headroom artifact
  `6604098eff054e059a9caf242d5cba2c` retrieved.
- `pnpm test:app`: exit 0, 127 files / 1343 tests. Original stdout retrieved in full from
  `94646b11f45a47e2ab5c5a0020713c2f`.
- `pnpm typecheck`: exit 0; original `9c927ac38b47458592847b9bd4b438a5` retrieved.
- `pnpm lint`: exit 0, 15 existing warnings; boundary/contrast passed. Original
  `ea5ab78c0c8049e5a753fc982ee3e4f6` retrieved.
- `pnpm check`: exit 0; core 4779, cloud 483, app 1343, tooling 162 tests passed.
  Original stdout `9e9671ad5df343e6ba0401052fc0abc4` retrieved in full. Android check is static only.
- Existing local-vault catalog e2e: exit 0, 2 passed on Chromium profiles. Original
  `8e61d46eee5b4dcbad207a0471638f71` retrieved. It remains a desktop-width catalog test;
  this is regression coverage only, not phone reachability or switching acceptance.
- No performance acceptance claimed: declared 50-widget/10-binding fixture has not been run.

### Remediation report

PARTIAL RC-UX-5.4: lifecycle failure/race fixes are verified. Full story remains BLOCKED by the
unchanged ownership fence. The requested scope extension is pending; no answer received.
The prior review rejection's production switching, preference/cloud isolation, responsive entries,
and actual switch-isolation e2e findings remain unresolved. Do not mark this story complete.

Required explicit integration ownership:

- `apps/gm-react/src/platform/preferences.ts`: namespace campaign choices/history/preferences.
- `apps/gm-react/src/cloud/cloudSync.ts`: vault-scoped opt-in and cleanup defaults.
- `apps/gm-react/src/cloud/syncEngine.ts`: default engine to active runtime vault.
- `apps/gm-react/src/screens/settings/SyncPrivacy.tsx`: active-vault recovery export/import.
- `apps/gm-react/src/app/shell/RailNav.tsx`: campaign switcher trigger.
- `apps/gm-react/src/app/shell/MoreSheet.tsx`: phone switcher entry.

This is a repository write-fence blocker (RC_ROADMAP.md §0.2), not an automatic approval rejection.
No dispatcher state, unrelated files, pushes, promotion, loops, or additional agents changed.

## Wrapper gate follow-up — 2026-09-13

- Candidate after central rebase: `238c811a47b53c05d78681f904cad5844e239aa5`.
- Read exact failed wrapper log `d298afd3-44a9-457b-bfba-e137e2a49d95/output.log`;
  retained excerpt `e0c8f314527248b689c8d72d9b46e005`, original retrieved.
- App gate: 1342 passed, 1 failed. `app/help/changelog.test.ts:85` expects `0.3.7` but
  `latestRelease()` returns `Unreleased` after baseline commit `66b7ab7f` populated draft notes.
- Fresh targeted reproduction: `pnpm test:app apps/gm-react/src/app/help/changelog.test.ts`
  exits 1, 6 passed / 1 failed; original stdout/stderr artifact
  `f42eb657e8c14b0f91c5fc5e7eb2b528` retrieved. No fix or passing gate claimed.
- Neither the changelog parser, its test, nor CHANGELOG.md is modified by the vault candidate.
- HANDOFF RC-UX-5.4 → `apps/gm-react/src/app/help/changelog.ts:51`: latestRelease must skip
  `[Unreleased]` regardless of whether it has notes; retain the shipped-version assertion.
  Add regressions for a populated draft preceding a release and a draft-only changelog.
- Prepared reviewable patch at `tmp/RC-UX-5.4-changelog-gate-fix.patch` (untracked, not applied).
- Requested explicit scope for that production parser repair; no answer yet. Earlier required
  vault-integration ownership extension also remains unresolved. Current task is still partial.
- Per roadmap §0.2 and the user's instruction that repository restrictions take precedence, do
  not edit an unowned parser, weaken tests, remove draft release notes, or patch global behavior.

## Review remediation — 2026-09-19

- Current HEAD on entry: `06dbba05646169c292b082d4678a985a85d4a5c8`; tracked tree clean.
- Re-read roadmap §0.2 and §21.2. The ownership fence still explicitly blocks edits outside Owns
  and granted companion paths. Requested an extension for preferences.ts, cloudSync.ts,
  syncEngine.ts, CloudSyncContext.tsx, SyncPrivacy.tsx, RailNav.tsx, MoreSheet.tsx and the performance
  fixture if needed. No authorization received. No out-of-scope production edits made.
- DONE (granted e2e companion): `local-vault-performance.spec.ts` supplies the missing declared-size
  fixture through real commands: 50 widgets, including 10 map bindings to a persisted map and 40
  dice widgets. Every reload waits for all 50 frames AND all 10 resolved map bodies, then crosses
  two animation frames. One warmup is discarded and three samples are graded by their maximum
  against 1500 ms. Uses the actual desktop and phone profile viewports without forcing desktop.
- The test is opt-in to avoid measuring contention from parallel functional workers. It records
  commit, worktree status, viewport, fixture and raw samples in stdout and a JSON test attachment.
  This is a workstation browser measurement with a warm Vite module graph and persisted fixture;
  it is not a physical reference-phone measurement or a claim that switching works.
- Initial fixture construction failed because the home template has dice, not notes, and the add
  command accepts only the input layout fields, not the full persisted layout. Corrected the test;
  retrieved exact failure and passing output before recording results.
- `pnpm check`: exit 0; core 4902, cloud 522, app 1536, tooling 193 tests passed. All 130341 stdout
  bytes and 402749 stderr bytes retrieved from Headroom artifact `2c0a0be8f06d4749b763afa38fba7f87`.
- Final fixture plus catalog regression e2e: exit 0, 4 passed. Exact original artifact
  `960c87ca95f74cd489c838bd0b3870c9` retrieved. Final fixture maxima before commit: desktop
  882.3 ms; phone 908.2 ms. The catalog spec still intentionally checks disabled switching;
  its pass is NOT the missing two-way UI journey. Performance will also be rerun on the committed
  candidate so the retained output carries that exact SHA and a clean worktree status.
- Reproduce: `DNDTOOLS_VAULT_PERF=1 DNDTOOLS_E2E_PORT=15614 pnpm --filter @dndtools/gm-react exec
playwright test tests/e2e/local-vault-performance.spec.ts --workers=1`.
- Remaining BLOCKED acceptance: production switching, active-vault cloud/key recovery and intent,
  real per-vault preference consumers, rail/phone switcher entries, and their two-way browser journey.
  Do not mark RC-UX-5.4 complete. No push, promotion, dispatcher-state edits or additional agents.

## Review follow-up — 2026-09-19, candidate 31457b6d

- Entry tree was clean. Re-read production callers and roadmap sections 0.2 and 21.2.
  The seven required integration paths remain outside the supplied Owns list. The task explicitly
  gives repository restrictions precedence; section 21.2 says "Never widen scope."
- Requested explicit scope extension for platform/preferences.ts, cloud/cloudSync.ts,
  cloud/syncEngine.ts, cloud/CloudSyncContext.tsx, screens/settings/SyncPrivacy.tsx,
  app/shell/RailNav.tsx and app/shell/MoreSheet.tsx (all beneath apps/gm-react/src).
  No response received as of this entry. Did not edit dispatcher claims or control state.
- Prepared a concrete, unapplied integration draft at tmp/RC-UX-5.4-integration-draft.patch.
  It proposes scoped campaign preferences and cloud intent, runtime-bound sync/recovery context,
  shared runtime reload activation, and rail/phone dialog entry points. Nine source files total:
  the seven requested extensions plus already-owned coreStore.ts and VaultSwitcher.tsx.
  Draft copies live under tmp/RC-UX-5.4-integration-draft/; no production sources were changed.
- Draft parses through Prettier and `git apply --check` exits 0. This establishes only syntax
  formatting and applicability, NOT type safety, functional correctness or acceptance.
  Exact Headroom applicability result ec38b33f6cbc4dc189b636474657d532 retrieved; rule excerpts
  and patch summary e4a5800f078546b385aac44185341376 retrieved.
- After scope authorization, apply and finish the draft, add consumer-level preference/cloud/
  recovery tests and the actual desktop/rail/phone two-way op-count/search/keyring browser journey,
  check account-deletion cleanup across the new namespaces, then run required gates and the
  declared scene-first-render fixture. The draft is not a validated fix and must not be auto-applied
  or treated as completion evidence.
- BLOCKED: all four independent-review findings remain unresolved in production. No application
  tests or performance checks rerun because production is unchanged. Journal-only commit records
  the concrete handoff; it does not satisfy RC-UX-5.4. No push, promotion, loop or extra agents.

## Integration pass — 2026-09-22 (operator brief widened Owns)

Entry HEAD `f6f7c3c7`, tree clean. The operator brief added MoreSheet, RailNav, CloudSyncContext,
cloudSync, syncEngine and preferences to Owns. The unapplied draft in `tmp/` was the starting point;
SyncPrivacy.tsx is still NOT owned, so recovery export/import is scoped without editing it (below).

### Ledger

- DONE switching: VaultSwitcher opens by default via `runtime.openLocalVault(id,
reloadLocalVaultDocument)`; coreStore's reload lands on `#/` (routes name the departing vault's
  records). Buttons are labelled "Open {name}"; the "unavailable" copy is gone (EN/ES).
- DONE entry points: RailNav's campaign mark is now a button (same pixels as the old decorative
  badge, so rail golden routes should not move); MoreSheet lists "Local vaults" with the current
  vault's name first. Sidebar chip unchanged.
- DONE preferences: `preferenceStorageKey` routes vaultChoice, partyNotes, paletteRecents and
  seenSpotlights through `vaultPreferenceKey`. Theme/density/motion/locale/tier/onboarded/what's-new
  stay device-wide (person, not campaign). Primary keeps its released keys (migration in place).
- DONE cloud: opt-in key is `vaultPreferenceKey(<account key>, vault)`; status/enable/disable take
  the document vault; CloudSyncContext pins it once and passes `vaultId` to the engine.
  The sync API accepts only `primary` (packages/cloud-fns/src/sync/handler.ts `requireVaultId`,
  not owned), so `getCloudSyncStatus` reports `vaultSupported:false` and refuses enablement for
  other vaults: they never write into or restore from the original vault's cloud copy.
- DONE keys/recovery: `CLOUD_VAULT_ID` is now the document's vault (resolved once; a document never
  changes vault without reloading). SyncPrivacy's unchanged import therefore exports/imports the
  ACTIVE vault's keyring. An unreadable catalog yields `''`, which key custody and the engine refuse.
- DONE account deletion: `forgetCloudSyncAccount(account)` without a vault forgets intent,
  high-waters (incl. agreed-rev) and keys in EVERY local vault; pending-marker bound raised to 512.

### Remaining handoffs (not owned)

- HANDOFF RC-UX-5.4 → `apps/gm-react/src/cloud/googleCalendar.ts:171`: `rosterAttendeeEmails` reads
  `dndtools:react:invites` raw; route it through `readPreference(PREFERENCE_KEYS.partyNotes)` so a
  non-primary vault's calendar never suggests the original vault's roster. Primary unaffected.
- HANDOFF RC-UX-5.4 → `apps/gm-react/src/screens/settings/SyncPrivacy.tsx`: surface
  `gate.vaultSupported === false` as "cloud backup covers your original campaign vault" instead of
  the generic enable error. Behaviour is already fail-closed.
- HANDOFF RC-UX-5.4 → `packages/cloud-fns/src/sync/handler.ts`: per-vault cloud backup for extra
  local vaults needs the server to accept more ids with a per-account vault cap.

### Tests added

- `localVaults.test.ts`: real preference consumers isolate both ways; device prefs stay shared.
- `cloudSync.test.ts`: primary opt-in migrates in place and never leaks into vault B; B refuses
  enablement; unreadable selection fails closed; account deletion covers every local vault.
- `local-vaults.spec.ts` (desktop chip / phone More sheet by project viewport, plus a 834px rail
  test): create a second vault, switch, and prove op-id sets, command-palette full-text search and
  keyrings (Electron override + localStorage-backed secure-store bridge, production vaultKeyManager
  and CLOUD_VAULT_ID) isolated both ways, then back again. Mutation check: pinning
  `CLOUD_VAULT_ID = 'primary'` fails the journey at the keyring assertion (restored).

### Validation (this pass, uncommitted tree before commit)

- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0 (15 existing warnings; raw-style ratchet respected).
- `pnpm test:app`: exit 0, 142 files / 1548 tests. `pnpm test:cloud`: exit 0, 39 files / 525 tests.
- Prettier check on all changed files: clean.
- `local-vaults.spec.ts`: 4/4 passed on desktop-chromium and mobile-chromium (log `/tmp` run, exit 0).
- Full Playwright suite (default workers, host load average 25→77 from other worktrees):
  1197 passed, 13 skipped, 28 failed, exit 1. All 28 were timeouts (`waitReady` 20 s boot, lazy
  palette 5 s, context close 30 s) across 13 unrelated specs; none failed an assertion about vaults,
  preferences, rail or More sheet. NOT claimed green: a low-parallelism rerun of those 13 specs was
  interrupted when the session ended; see the next entry.

### Post-commit verification — candidate `3abc72a3`

- Low-parallelism rerun (`--workers=3`, load ≈11) of the 13 specs that timed out, plus
  local-vaults: 395 passed, 4 skipped, 3 failed. None of the 28 earlier timeouts recurred. New
  failures: `responsive.spec.ts:242` `/scene/:id` canvas 0 px (both profiles; matches the known
  `/scene/:id` hash-goto race that is also red on base) and `map-editor.spec.ts:716` layer reorder.
  Repeating both with `--repeat-each=5`: 30/30 passed, exit 0. Intermittent, not claimed as fixed.
- `local-vault-performance.spec.ts` (declared 50 widgets / 10 bindings) failed on the fourth reload
  of ONE renderer with Chromium `ERR_INSUFFICIENT_RESOURCES` (blank page). Identical failure with
  the parent commit's `apps/gm-react/src` checked out (restored from HEAD afterwards; tree clean),
  so it is environmental (swap exhausted, 10 GB available), not this change. The fixture now boots
  each sample in a fresh page of the same context (same IndexedDB, same timing origin).
  Result on `3abc72a3` (only that spec modified): desktop samples 996.6 / 1006.5 / 1044.7 ms,
  max 1044.7; phone samples 1020.3 / 998.8 / 1014.8 ms, max 1020.3; budget 1500 ms. 2 passed,
  exit 0. Workstation Vite measurement, not a physical reference phone.

## Report

RC-UX-5.4 is implemented. The GM can create, rename and switch vaults from the desktop chip, the
tablet rail and the phone More sheet. Op log, search, keyring, preferences, privacy mode, private
store and cloud opt-in are isolated per vault. The original vault is registered in place, and backup
and cloud sync act on the active vault only (extra vaults stay device-only until the server accepts
more ids). The unowned follow-ups are listed under "Remaining handoffs". No push, promotion, loops,
extra agents or dispatcher-state edits.
