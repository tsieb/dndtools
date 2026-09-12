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
