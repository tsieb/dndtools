# RC-UX-3.7 run journal

## Entry — 2026-09-23

- HEAD `a7e711cb` (= `loop/rc`, RC-UX-5.4 merged), tree clean. The previous attempt stopped on a
  provider allowance limit before committing anything; no earlier journal existed.
- Existing foundations from RC-UX-5.4: the catalog already accepts `kind: 'demo'`, and
  `SceneRuntime.freshVaultChosen` already seeds a demo-kind vault on its first load (other extra
  vaults start empty). Cloud backup already refuses every non-primary vault (`cloudBackupSupportedFor`).

## Plan

1. `demo-seed.ts`: keep the base seed byte-for-byte for the primary vault (the e2e fixture vault and
   golden routes depend on it) and add a showcase layer that runs only in a demo-kind vault.
2. `VaultSwitcher.tsx`: "Explore the demo campaign" (create once, then open), a Demo badge on the
   demo row, Reset (only while inside the demo) and "Back to my campaign".
3. Refusals: sync and local backup refuse a demo vault; hosting and joining a table refuse it.
4. Badges wherever the vault name shows (sidebar chip, phone More sheet, rail accessible name).
5. e2e: open demo from the switcher, edit, reset, return; GM vault op count unchanged.
6. Tests: seed through the real core with zero rejections; sync/backup refusals.

## Ledger

- DONE `runtime/demo-seed.ts` (owned): the base seed is unchanged and still the only seed the
  original vault gets. A showcase layer runs only when this document's vault is catalogued as
  `kind: 'demo'` (`seedDemoContent(rt, { showcase })`, default from the catalog). Every item goes
  through real commands inside the same single commit, each group guarded on its own absence:
  - system-package switch: `system.fork` 5e → `custom:saltreach-house-rules`, then `system.select`;
  - custom widget: `workspace.tide-clock` (custom-html-js, sandboxed) installed + enabled;
  - screen "Showdown at the reliquary": map tile (bound), initiative tracker, the custom widget
    (three widgets, one custom);
  - running encounter with tokens: `encounter.build` (3 PCs + 3 monsters), session goes live on that
    screen, `command-center.ensure-home` + `session.set-active-map`, `combat.start` places 6 tokens;
  - scene package with audio: a same-origin starter-pack web stream (`audio/starter/cavern-drone.wav`)
    is played, saved as a preset, then STOPPED; the scene card carries that preset + a lighting hint;
  - quests: two `quest` objects with objectives;
  - typed relationships: `relations:` front matter on the faction note "Faction · The Ashen Hand"
    and a new "Quest hook · The missing shipment" note (RC-KNW-3.3 edges are note→note only);
  - calendar + dated notes: already in the base seed;
  - saved searches: two (`content.create-saved-search`), one pinned;
  - level-2 character: Tormund Ironfist via `character.apply-advancement` (milestone) + Second Wind
    and Action Surge class resources;
  - one staged assistant proposal: MCP enabled, `prep-assistant` bound with `strict_review` on
    `note.update`, one pending rewrite of the Campaign Primer.
- DONE `app/shell/VaultSwitcher.tsx` (owned): "Explore the demo campaign" creates the single demo
  vault on first use (then reopens it) and opens it; Demo badge on the demo row; inside the demo:
  hint, "Back to my campaign" (most recently opened campaign vault, else the original) and Reset
  with an inline confirmation. Reset runs under `runExclusiveMaintenance`: `resetCoreStorage()`,
  forget the demo's vault-scoped preferences, `reloadFromStorage()`, then reload the document, which
  reseeds the empty demo on its next load. It refuses unless the catalog positively lists the
  current vault as the demo.
- DONE e2e `tests/e2e/demo-vault.spec.ts` (granted): opens the demo from the switcher, checks the
  badge and the seeded showcase, the cloud/backup/host refusals, edits it, resets it (edit gone,
  showcase back, same vault id), returns via "Back to my campaign" with the GM vault's op ids
  EQUAL to the settled baseline, and re-exploring reopens the same demo. Runs on the profile's own
  viewport: desktop via the sidebar chip/top bar, phone via More sheet/Table controls.

## Scope crossings (outside Owns — flag for the operator)

Each is the minimum to make an acceptance criterion hold; the logic lives in owned files or in
tiny helpers next to the vault catalog.

- `platform/storage/coreStore.ts` (RC-UX-5.4's file): `isDemoLocalVault` (fail closed: an extra
  vault missing from the catalog counts as the demo), `findDemoLocalVault`,
  `forgetLocalVaultPreferences`. Needed by the refusals and the reset.
- `platform/backup.ts`: `exportFullVault`/`importFullVault` refuse in the demo vault — criterion
  "never backed up".
- `cloud/cloudSync.ts`: `cloudBackupSupportedFor` also excludes the demo; demo-specific refusal
  message — criterion "never synced". (Already refused as a non-primary vault; this keeps it refused
  if the server ever accepts more vault ids.)
- `net/SessionContext.tsx`, `net/HostModal.tsx`, `net/SessionPanel.tsx`: hosting and joining throw
  in the demo; both dialogs show a notice instead of controls — criterion "unable to host or join".
- `app/shell/Sidebar.tsx`, `MoreSheet.tsx`, `RailNav.tsx`: Demo badge where the vault name shows
  (the rail shows no name, so its label says "· Demo" and it carries a small badge) — criterion
  "badged Demo wherever the vault name shows". Rendering only changes inside the demo.
- `runtime/SceneRuntime.ts`: the staged seed object gains `invokeAgentTool` (the same
  `invokeMcpToolAsAgent` pipeline the live runtime uses), so the proposal lands in the one seed
  commit — criterion "one staged assistant proposal" + "commits as one batch".
- Message catalogs (granted): `vaults.demo*` keys, EN + ES; the unused `vaults.demoUnavailable`
  seam copy is gone.

## Decisions

- Base seed untouched: the original vault's seed is the e2e fixture and golden-route content, so
  "every e2e that relied on the old seed passes" holds by construction. The widening lives in the
  showcase layer the demo vault alone runs.
- The base seed's `data:` audio loop is still refused (known since `32dffe67`, see RC-ENG-8.2); the
  showcase uses an http(s) same-origin starter track instead and does not change the base.
- The showcase leaves nothing playing: opening the demo must not start a drone.
- Reset is offered only inside the demo; outside it the switcher offers "Explore".

## Tests added

- `runtime/demo-seed.showcase.test.ts`: the showcase through the real core reducer and the real
  agent pipeline — zero showcase rejections, every item above asserted; a second boot dispatches
  nothing new; the original vault (no catalog selection) gets no showcase.
- `runtime/SceneRuntime.test.ts`: the staged proposal lands in the SAME single seed commit
  (`persistFullState` called once, proposal pending in it).
- `cloud/cloudSync.test.ts`: the demo vault refuses cloud backup (status + enable), by document and
  by id.
- `platform/storage/localVaults.test.ts`: backup and restore refuse in the demo vault and leave it
  unchanged, and work again in the original vault; `isDemoLocalVault` fails closed;
  `forgetLocalVaultPreferences` touches only the demo's keys and refuses the original vault.
- `tests/e2e/demo-vault.spec.ts`: the journey above, plus an opt-in (`DNDTOOLS_VAULT_PERF=1`)
  interleaved cold first-render A/B of the demo vault against the original vault.

## Validation (uncommitted tree before the commit)

- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0, 15 warnings, all in files this story does not
  touch (CommandPalette, compendium, MapEditor, useCombatKeyboard); raw-style ratchet passed.
- `pnpm test:app`: first run 1 failed / 1644 passed — `styles/token-references.test.ts` caught the
  custom widget's `var(--widget-tide)` in demo-seed.ts. Added the fallback
  (`var(--widget-tide, #5f8fa8)`); rerun exit 0, 147 files / 1645 tests.
- `pnpm test:cloud`: exit 0, 42 files / 535 tests. `pnpm build`: exit 0, prod-bundle check OK.
- Prettier `--check` on every changed file: clean.
- e2e `demo-vault` + `local-vaults`, desktop-chromium + mobile-chromium: 6 passed, exit 0.
- e2e affected set (demo-vault, local-vaults, join, collab, co-dm, session-tables, backup-restore,
  sync, settings, a11y-axe-gate, responsive, player-view, onboarding-consent), `--workers=3`, load
  ≈13: 265 passed, 2 skipped, 1 failed — `responsive.spec.ts:242` mobile `/scene/:id` "left 725px of
  the main pane unused", the known base flake (hash-goto race). `--repeat-each=5` on both
  profiles: 19 passed, 1 failed (same message), consistent with its ~3–5% base rate. NOT claimed
  fixed; this story does not touch the scene canvas route.
- Visual check (screenshots, desktop 1280, tablet 834, phone): sidebar chip badge first wrapped
  ("Dem/o"); fixed with a non-shrinking wrapper. Switcher dialog, More sheet row and rail mark OK.

### scene-first-render

- The seed reducer cost is negligible: base 3–5 ms warm (41 ops, 82 KB state), base + showcase
  6–8 ms warm (74 ops, 125 KB), first cold call 23 vs 36 ms. Still one commit.
- The perf harness's own scenario (original vault; base seed unchanged by this story),
  `pnpm perf:capture --only scene-first-render --port 15637`, load ≈11: 21 samples 1355.8–1686.8 ms,
  batch medians ≈1580–1660 ms — i.e. the UNCHANGED original vault breaches 1500 ms on this host now.
  Output `/tmp/rc-ux-3.7-perf-primary.json`.
- Interleaved cold A/B (opt-in spec, `--workers=1`, load ≈11), five pairs each:
  desktop demo median 1669.7 ms (1625–1777.2) vs original 1611.4 ms (1461.8–1673.3): +58 ms;
  phone demo median 1640.5 ms (1507–1691.5) vs original 1590.8 ms (1500.4–1652.3): +50 ms.
  The spec asserts the demo median ≤ 1500 ms and FAILED on this host, as the original vault would.
  NOT claimed in budget: the showcase costs ≈50–60 ms over the original vault's first load; an
  idle-host rerun is needed for an absolute verdict. Log `/tmp/rc-ux-3.7-perf-2.log`.
