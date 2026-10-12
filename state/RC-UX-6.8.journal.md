# RC-UX-6.8 — The vault switcher explains itself

Branch `dispatch/dndtools/b52f7de914910b3b9b2a`, base `dbd7084b1`, 2026-10-12.

## What changed

- `VaultSwitcher.tsx`: the dialog description is the one-sentence "what a vault is" while the device
  holds at most one campaign (`vaults.intro`), else the old description. Rows are a list ("Vaults on
  this device"); outside the demo the first row is "Explore the demo campaign" with its Demo badge and
  hint, and the demo vault's own catalog row is folded into it (no second "Open Demo campaign").
  The name form shows only for Rename or after "New campaign"; "Create and open" creates the vault
  and opens it (document reload). Inside the demo, "Start my own campaign" (primary) creates an
  unnamed campaign vault and opens it in one step. Closing the form returns focus to "New campaign".
- `coreStore.ts`: `createUnnamedLocalVault()` — catalog entry carries the placeholder name, so the
  campaign stays unnamed and the guide's "Name your campaign" row stays open.
- Sidebar chip / rail button already badge the demo (RC-UX-3.7); now covered by e2e at tablet width.
- `docs/user/getting-started.md`: demo row, New campaign, Start my own campaign.

## Companion paths touched (manifest `companion_paths`)

- `i18n/messages/en.ts`, `es.ts` (new keys `vaults.intro`, `vaults.list`, `vaults.newCampaign`,
  `vaults.startOwn`; `vaults.name` → "Campaign name", `vaults.create` → "Create and open"),
  `i18n/dev/qps-ploc.ts` regenerated.
- `tests/e2e/local-vaults.spec.ts`, `demo-vault.spec.ts` (acceptance), `shell-polish.spec.ts` (waited
  on the always-visible name field / asserted create-without-open).
- `tests/visual/shell-polish.spec.ts` ready-wait, 30 `shell-vault-{ready,error}--*` goldens
  re-baselined in the pinned container, Zopfli-recompressed (budget 37681.4 / 37888 KiB).

## Evidence (local)

- `local-vaults.spec.ts` + `demo-vault.spec.ts`, desktop-chromium + mobile-chromium: 10 passed,
  2 skipped (opt-in perf).
- `shell-polish`, `campaign-identity`, `feature-spotlight`, `pinned-screens`, `shell-pin-bounds`,
  `first-session-guide`, both profiles: 61 passed, 1 skipped.
- Visual `shell-polish.spec.ts` in container `--update-snapshots=none`: 15 passed.
- vitest `src/i18n src/platform/storage src/app/help src/app/shell`: passed. tsc, eslint on changed
  files, `lint:raw-style-count`, `lint:emphasis`, `lint:boundary`: passed.
