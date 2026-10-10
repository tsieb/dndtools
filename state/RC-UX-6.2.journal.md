# RC-UX-6.2 run journal

Base: `515d714c`. Headroom tools were not used; exact command output was read directly.

## Implementation

- **Core block** (`packages/core/src/state/command-center-state.ts`): the optional
  `CommandCenterState.campaign?: CampaignIdentity` holds `{ name, systemPackageId, gmDisplayName }`.
  It is absent until the campaign is named: not in `EMPTY_COMMAND_CENTER_STATE`, not in the
  runtime's empty slice, and not in storage's default document. A vault from before the block
  round-trips byte-identically, so there is no schema bump. `campaignNameOf` is the one reader.
  `isCampaignIdentityShape` checks a persisted block: exact keys, a trimmed name of 1–80
  characters, no control characters, nullable ids.
- **Commands** (`packages/core/src/commands/command-center.ts`):
  - `campaign.set-identity` is owner-only. The first naming creates the block; later calls merge
    into it. A system or GM name alone is refused (`invalid-state`), so no placeholder name is ever
    stored. An unknown system package is refused. An unchanged identity is accepted with no
    operation. The operation is `command-center`/`campaign` with `{ campaign, previous }`, and the
    event is `campaign.identity-set`.
  - `permission.add-players` is owner-only, like `assign-role`. It creates one
    `{ id, role: 'player', displayName }` actor per name, each with a `permission-actor` /
    `permission.add-player` operation and a `permission.player-added` event. Up to 20 names per
    call. It refuses email-shaped names, a name already on the roster (case-insensitive), and a
    name given twice. The existing `permission.rename-actor` and `permission.assign-role` manage
    the new actors afterwards.
  - Input schemas live in `schemas/commands.ts`. Command and event types are in `types.ts`, the
    dispatch cases in `dispatch.ts`, and the exports in `index.ts`.
- **Storage** (`apps/gm-react/src/platform/storage/coreStore.ts`):
  - A present but malformed `campaign` damages the command-center document. It is quarantined,
    which is the existing rule for optional containers.
  - `isPlaceholderVaultName` recognises the legacy catalog default "Your campaign" (and the Spanish
    "Tu campaña" that a pre-story onboarding skip could have written).
  - `followCampaignIdentity(host)` is mounted once the runtime loads, from `App.tsx` (a companion
    path). It does two things:
    1. Once per open, it adopts device data into the campaign:
       - A catalog name the GM chose, from the switcher's Create or Rename or from a pre-story
         onboarding, becomes the campaign name (the first naming also records the active system).
         The placeholder never does.
       - The released `partyNotes` roster (`dndtools:react:invites`, vault-scoped) becomes player
         actors through `permission.add-players`. Email entries stay in the preference, because
         `rosterAttendeeEmails` still reads them for the Google Calendar invite. The preference is
         removed when nothing is left in it.
    2. After that, it renames the catalog entry whenever the campaign name changes, and adopts the
       catalog name again whenever `dndtools:local-vault-renamed` fires (onboarding's path).
- **Surfaces**:
  - Sidebar chip: the campaign name, or the placeholder. The GM name prefers
    `campaign.gmDisplayName`.
  - Switcher: the open vault's row shows the campaign name, and other rows show their catalog name.
    An unnamed vault shows "Your campaign" as a label, and its Rename field starts empty with
    "Your campaign" as the placeholder. Renaming the open vault dispatches `campaign.set-identity`.
    Renaming another vault renames its catalog entry, and that vault takes the name up when it
    next opens.
  - Hero: the idle heading is the campaign name, or the placeholder.
  - The phone More sheet row reads the catalog, which follows the campaign name.
- **Onboarding** is unchanged (base). It selects the system, renames the catalog and fires
  `dndtools:local-vault-renamed`; the follower turns that into `campaign.set-identity` with the name
  and the now-active system. A skip writes the placeholder to the catalog, which is never adopted,
  and the catalog is put back to the campaign's name if it has one. A replay prefills from the
  catalog, which follows the campaign name.
- **Settings › Players** gains "Add your party": comma-separated names, dispatched as one
  `permission.add-players`. An email address is refused before dispatch with a localized message.
  Other rejections show the schema issue. The new seats appear in the roster with role pickers and
  in the view-as menu.
- Copy: `settings.players.addParty` / `addPartyLabel` / `addPartyHint` / `addPartyAction` / `added` /
  `addFailed` / `namesOnly` (en, es); pseudo catalog regenerated.
- `docs/architecture/DATA_MODEL.md`: new "Campaign identity (RC-UX-6.2)" section and the additive
  field listed under §2.

## Scope notes

- Claim gate (2026-10-07) flagged three paths outside Owns:
  - `apps/gm-react/src/app/Onboarding.tsx`: **reverted to base.** The follower in `coreStore.ts`
    (owned) now adopts the catalog name onboarding writes, on the rename event onboarding already
    fires, so onboarding needs no edit.
  - `apps/gm-react/src/app/widgets/dataEnvironment.ts`: **reverted to base.** The widget
    `campaign` source is not in the acceptance list. It still reads the catalog name (which follows
    the campaign) memoised per vault, so it shows a rename after a remount. Follow-up.
  - `apps/gm-react/src/app/widgets/homeSources.ts`: **kept; the acceptance requires it.** The
    criterion is "see it in the sidebar, hero and switcher ... see every surface follow". The
    hero's idle heading is the `resume` row's `primary`, which `resolveHomeSource` hard-codes to
    `t('home.yourCampaign')`. No owned or companion file feeds that row: the hero widget renders
    `first.primary`, and the row is built only here. The change is one line, which reads
    `campaignNameOf(state.commandCenter)` before the placeholder. The operator decides whether to
    widen the claim.
- Companion paths: `App.tsx`, core `index.ts` / `dispatch.ts` / `types.ts` / `schemas/commands.ts`,
  i18n catalogs, tests, `docs/architecture/DATA_MODEL.md`.
- Handler placement: the roadmap says party names create actors "through the existing permission
  commands", but no existing command creates an actor; demo participants are injected by the
  runtime. `permission.add-players` is new. It lives in `command-center.ts` (owned) beside
  `campaign.set-identity` rather than in a new `commands/add-players.ts`, so it adds no unowned
  file. Its operation and event use the permission vocabulary.
- Not done (outside the acceptance criteria, follow-ups):
  - ~~Hero avatars still come from party PCs only.~~ Done in the review rework below.
  - ~~The invite screen's campaign-name field still starts empty.~~ Done in the review rework below.
  - Session archives show no campaign name today, so nothing changed there.
  - The demo badge still keys off the catalog `kind` (device data) beside the one name.

## Gates (local, at `b20ee897` + docs)

- `pnpm test:critical`: 291 files, 5300 tests passed (includes `tests/campaign-identity.test.ts`,
  13 tests).
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0.
- `pnpm test:app`: 175 files, 2141 tests passed (exit 0).
- App vitest: `src/platform/storage`, `src/app/widgets`, `src/screens/settings` and
  `CommandCenter.baseline.test.tsx`: 25 files, 552 tests passed. New
  `src/platform/storage/campaignIdentity.test.ts`: 7 passed (round trip, quarantine, placeholder
  never stored, adoption, catalog follow, partyNotes migration with emails kept off actors).
- Playwright, desktop-chromium + mobile-chromium: `campaign-identity` (new), `local-vaults`
  (updated), `onboarding-consent`, `golden-path`, `demo-vault`, `shell-polish`, `shell-pin-bounds`,
  `command-palette`, `hub-templates`, `co-dm`, `settings`, `settings-polish`, `settings-tiers`,
  `a11y-axe-gate`: 293 passed, 7 skipped, 0 failed. The skips are the spec files' own
  `test.skip` guards: the demo-vault perf capture on both profiles, four hub-templates desktop-only
  checks on mobile, and the a11y Layout-view check on desktop.

## Claim-gate rework (2026-10-07)

- Reverted `Onboarding.tsx` and `dataEnvironment.ts` to `515d714c`; kept `homeSources.ts` (see
  Scope notes). `followCampaignIdentity` listens for `dndtools:local-vault-renamed` and adopts the
  catalog name (with the active system on the first naming).
- New unit test in `campaignIdentity.test.ts`: an onboarding-style catalog rename plus the event
  names the campaign with the active system; a placeholder write stores nothing; a stopped follower
  adopts nothing. `src/platform/storage`: 6 files, 77 tests passed.
- `tsc --noEmit` (gm-react) and eslint on the changed files: clean.
- Playwright, desktop-chromium + mobile-chromium: `campaign-identity`, `local-vaults`,
  `onboarding-consent`, `golden-path`, `demo-vault`, `shell-polish`, `hub-templates`,
  `command-palette`: 168 passed, 6 skipped (the same `test.skip` guards: demo-vault perf on both
  profiles, four hub-templates desktop-only checks on mobile), 0 failed.

## Claim widened (operator brief 2026-10-08)

- Owns now includes `apps/gm-react/src/app/widgets/homeSources.ts`. The crossing is unchanged
  since `d0120cd4`: one import and one fallback line (`campaignNameOf(state.commandCenter)` before
  `t('home.yourCampaign')`), plus two comment lines. No other path outside Owns or the companion
  paths differs from `515d714c`.
- Gates at `d0120cd4`, re-run 2026-10-08: `pnpm typecheck` exit 0; `pnpm lint` exit 0;
  `pnpm test:critical` 291 files, 5300 tests passed; `pnpm test:app` 175 files, 2142 tests passed.
  The rework's Playwright run (168 passed, 6 skipped, 0 failed, above) covers the same code.

## Review rework (2026-10-08)

Independent review of `b9ec48be` rejected two acceptance gaps. Both are fixed here.

1. **Party names never reached the hero avatars.** The hero draws avatars from the `party` source,
   which lists PCs only, so a player added in Settings › Players never showed.
   - `homeSources.ts` (owned): the `resume` source now returns the seated players who own no PC
     after its hero row (role `player`, no singular owner grant on any PC, the same test
     Settings › Players uses to list a player's characters). Each row carries the player's name
     and initials. A player drops out of the list once they own a PC, because the `party` source
     then draws that PC. Observers and the DM are never listed.
   - `templates/Hub.tsx` (**outside Owns**, one statement): the hero's avatar list is the `party`
     rows followed by `rows.slice(1)` when its primary query is `resume`. No other path feeds the
     hero's avatars. The `party` source in `dataEnvironment.ts` was left alone because its rows are
     character rows (`CHARACTER_ROW_SOURCES`) that character intents target by id, and actor rows
     there would break that contract.
2. **The invite screen kept a second campaign name.**
   - `PlayerInvites.tsx` (**outside Owns**): `InvitesPanel` takes `campaign` (the stored name, or
     null) and `onNameCampaign`. Once the campaign is named, Create invite shows that name as text
     with no field, and the invite is minted with it. A rename while the dialog is open shows
     straight away. While the campaign is unnamed, the field remains, and minting first names the
     campaign through `onNameCampaign`. If that is refused, nothing is minted. The join screen
     shows the invite's server-side `campaignName`, so it carries the same name.
   - `Players.tsx` (owned): passes `campaignNameOf(state.commandCenter)` and a `nameCampaign` that
     dispatches `campaign.set-identity`, the switcher's command, so the catalog follows.

- **Scope.** The operator brief of 2026-10-08 said not to widen past `homeSources.ts`. The review
  then required both behaviours, and neither can be built inside Owns: the hero's avatars are
  drawn only in `Hub.tsx`, and the invite form state lives only in `PlayerInvites.tsx`. I kept
  both crossings as small as I could (Hub: one statement; PlayerInvites: two props and the form
  field), and the operator should resolve the claim for these two paths.
- **Tests.**
  - New `src/app/widgets/homeSources.test.ts` (3): the hero heading is the placeholder, then the
    campaign name. Two added players follow the hero row with initials, and the observer and DM
    are absent. A player who owns a PC drops out.
  - New `src/screens/settings/PlayerInvites.test.tsx` (4, account API stubbed): a named campaign
    shows its name with no field and mints with it; a rename while open is followed; an unnamed
    campaign is named first, then minted; a refused name mints nothing.
  - `tests/e2e/campaign-identity.spec.ts`: the party test now opens the Command Center and asserts
    hero images named "Ada Quill" and "Brannoc". (A signed-in invite flow cannot run in e2e, which
    has no account API, so the invite coverage is the stubbed component test.)
- **Gates (local, this rework):**
  - `pnpm typecheck`: exit 0.
  - `pnpm lint`: exit 0. The first run failed on a `matchMedia` stub in the new component test
    (PLAT-006 boundary lint); I removed the stub.
  - `pnpm test:app`: 180 files, 2201 tests passed.
  - Prettier check on the changed and new files: clean.
  - Playwright, desktop-chromium + mobile-chromium (`DNDTOOLS_E2E_PORT=5310`): `campaign-identity`,
    `hub-templates`, `golden-path`, `demo-vault`, `command-center-polish`, `co-dm`, `settings`,
    `settings-polish`, `settings-tiers`, `widget-query-sources`, `local-vaults`,
    `onboarding-consent`, `a11y-axe-gate`, `party-summary`. Result: 243 passed, 7 skipped (the
    specs' own `test.skip` guards), 0 failed.
  - Not run locally: the pinned visual gate and `pnpm test:critical` (core is unchanged in this
    rework). The seeded vault's demo players all own PCs, so the seeded Command Center hero should
    draw the same three avatars as before.

## Claim gate after the review rework (2026-10-08)

The claim gate flagged `apps/gm-react/src/app/widgets/templates/Hub.tsx` and
`apps/gm-react/src/screens/settings/PlayerInvites.tsx`. **Both are kept**, and the task is expected
to block for the operator.

- **Why not revert.** The independent review of `b9ec48be` rejected the story for exactly these two
  behaviours: party names as hero avatars, and the invite screen reading the one campaign name.
  Both are in the story's "What to build" ("the hero, sidebar chip, switcher row, session
  archives, invite screens and the demo badge read one name"; "Settings › Players, the player view
  switcher and the hero avatars show them"). The review asked for them "within authorized ownership
  or an explicit operator scope resolution". Reverting would bring back the rejected candidate, and
  the next review would reject it the same way.
- **Why they cannot be built inside Owns.**
  - The hero's avatars are drawn only in `Hub.tsx`, from the `party` query rows. `homeSources.ts`
    (owned) now supplies the seated players, but only `Hub.tsx` can draw them. The `party` source
    in `dataEnvironment.ts` is also unowned, and its rows are character rows.
  - The invite form's campaign-name state and the `createInvite` call live only in
    `PlayerInvites.tsx`. Players.tsx (owned) could only avoid it by copying the whole invite
    dialog.
- **Size.** In `Hub.tsx`, one statement changed (+7/−1 lines). In `PlayerInvites.tsx`, two props
  were added and the name field now shows only while the campaign is unnamed (+39/−13).
- **Operator decision needed.** Either widen the claim to these two paths, or narrow the story's
  hero-avatar and invite-screen requirements (and tell the reviewer). If narrowed, revert both
  paths to `1028592b`, drop `PlayerInvites.test.tsx`, drop the hero-avatar assertion in
  `campaign-identity.spec.ts`, and drop the `resume` extra rows in `homeSources.ts`.
- **Re-check on the rebased head (base `1028592b`):**
  - `pnpm typecheck`: exit 0.
  - Vitest on `PlayerInvites.test.tsx`, `homeSources.test.ts` and `dataEnvironment.hub.test.ts`:
    163 passed.
  - Playwright, `campaign-identity` + `hub-templates`, desktop + mobile: 20 passed, 4 skipped
    (the `hub-templates` desktop-only guards), 0 failed.

## Self-heal round 1 — authorized scope resolution (2026-10-10)

- The scheduled task explicitly widens the claim to `Hub.tsx` and `PlayerInvites.tsx`; the
  previous operator-decision blocker is resolved. Both review fixes are retained.
- The operator still limits `homeSources.ts` to its five-line campaign-name diff. Moved the
  party-avatar selection and initials into `Hub.tsx`, where the live hero reads runtime actors.
  The resume query again returns only its hero row. Preview widgets do not require a runtime;
  withheld resume queries do not receive extra avatars. Updated the existing focused tests to
  exercise the moved helper, preserving the owner/observer exclusions and PC deduplication.
- Verified the diff against rebased base `1028592b`: `homeSources.ts` is +4/-1 lines. No new
  production path is touched in this self-heal. Headroom tools are unavailable; exact native
  command output is retained in `/var/tmp/rc-ux-6.2-*.log` for the browser and static checks.
- Core campaign reducer/schema tests: 13 passed. Focused app identity storage/round-trip,
  home sources, hub data and invite tests: 171 passed across four files.
- `pnpm typecheck`: exit 0. ESLint on the three changed source/test files: exit 0.
- The first browser run overlapped the pinned visual runner and failed one dynamic import
  (`node_modules/.vite/deps/react.js` disappeared during Vite cache regeneration): 19 passed,
  four intentional mobile skips, one failed. Stopped the overlapping visual run (exit 143);
  rerunning browser checks sequentially before the targeted pinned Command Center visual suite.

- Sequential functional browser rerun: exit 0, 20 passed and four explicit desktop-only
  guards skipped on mobile (campaign identity and hub templates, desktop + mobile Chromium).
  This includes onboarding name, rename propagation/reload, unnamed-vault placeholder,
  two name-only actors, player-view choices and hero avatars.
- Added an assertion that player seats do not change the resume query's single-row contract;
  the three focused hero tests pass again. ESLint, Prettier and `git diff --check` pass.
- Targeted pinned visual suite (`command-center-polish`, five themes across three layouts):
  13 passed; two rail cases timed out waiting for `home-screen` before screenshot comparison.
  Exact error context shows `Loading your vault…`, not a pixel mismatch. Retrying only those
  two cases with one worker; no snapshots or production loading logic changed.

- Single-worker visual retry: exit 0, both rail cases passed (14.9 seconds), no code or baseline
  changes. All 15 targeted visual cases have passed across the initial run and targeted retry;
  this is not a claim that the complete 531-case visual suite ran successfully.
- Candidate is ready for the central operator's gates and independent review. No push,
  promotion, dispatcher-state edit, additional loop or delegated agent was performed.

## App-gate retry after rebase (2026-10-10)

- Candidate head is now `356999028c190950cbf7840fd4283e7685d33248` (rebased version of the
  preceding scope correction). Worktree was clean on entry. The scheduled feedback reports
  successful quality, changed-format, pinned visual, typecheck, lint and core-test gates.
- Read the original failed app-gate log directly:
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/2dc31e5c-e54a-402a-8225-40c8f75f3622/output.log`.
  It records 183 passing files / 2259 passing tests and one failure: the owner-controls case
  in `screens/play/Sheet.test.tsx:178` exceeded the default 5000 ms timeout (5022 ms). The
  read-only and combat-participant cases passed; no assertion mismatch was reported.
- Inspected the test: it remounts a complete companion sheet for each enabled control and
  validates the emitted commands against core permissions. This path is outside the story's
  production claim; no evidence yet supports changing campaign code or weakening the test.
- Headroom tools remain unavailable. Running the original `pnpm test:app` gate unchanged,
  with the inherited `DNDTOOLS_TEST_WORKERS=3`, retaining its exact output in
  `/var/tmp/rc-ux-6.2-app-recheck.log`. No timeout, test, implementation or dispatcher changes.

- Unchanged full app gate completed with exit 0: **184 files / 2260 tests passed**, 93.44
  seconds. Read the original retained output before recording success. The previously timed-out
  owner-controls test is included. No retries, skipped tests, timeout increases or worker-cap
  overrides were added.
- The timeout did not reproduce; this run supplies a successful local gate, not proof that
  load-sensitive timeouts can never recur. No production fix is warranted by the observed
  evidence. Only this journal changes in the recovery commit; the campaign implementation and
  five-line `homeSources.ts` allowance are preserved for central revalidation/review.

## Independent-review restore rework (2026-10-10)

- Reproduced the reported defect at `4a098c59` with regression tests using actual
  `restoreCoreState` and `restoreFullVaultState`, `loadCoreState`, the identity follower and
  `persistFullState`. The host models hydration subscriber notification and document restart,
  and drains adoption persistence before inspecting the state. Both unnamed restores failed:
  `Current campaign` reappeared in the restored campaign block. Both named controls passed.
  Original red output: `/var/tmp/rc-ux-6.2-restore-before.log` (read directly).
- `catalogFollowsCampaign` now mirrors absent identity with the existing device-local unnamed
  catalog placeholder. Hydration therefore invalidates the replaced vault's stale name before
  reload. Placeholder adoption remains prohibited; explicit catalog renames still use the existing
  open/event adoption path. No schema change, new stored campaign default or expanded source claim.
- Added four restore/hydration/reload regressions: unnamed and named backups through both restore
  APIs. They verify byte-identical command-center data, no adoption command after restart, catalog
  identity and durable state after another database reopen. Existing onboarding and cross-vault
  rename tests remain in the same suite.
- Storage suite: **6 files / 81 tests passed**, exit 0. Original output read from
  `/var/tmp/rc-ux-6.2-restore-after.log`. Focused ESLint and `git diff --check` passed.
- Headroom tools were unavailable. No delegated agents, pushes, promotion, dispatcher control
  edits or additional scheduling loops were used. Central wrapper gates and independent review
  remain the operator's responsibility.
- Repository `pnpm typecheck`: exit 0; original output read from
  `/var/tmp/rc-ux-6.2-restore-typecheck.log`. Prettier check passed for all four changed files.
  No UI pixels changed; browser and pinned visual gates were not rerun for this storage-only fix.

## Browser-gate demo reset rework (2026-10-10)

- Read the original browser gate output at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/f2419cf3-6ad1-402d-83ed-d8186e1efaff/output.log`.
  At `7109e368` it reports 1981 passed, 43 skipped and two failed: the demo reset journey on
  desktop and mobile, each failing all three attempts at `demo-vault.spec.ts:236` because
  `Open Demo campaign` was absent. The original desktop error context lists the demo row as
  `Open Your campaign`. Headroom tools remain unavailable.
- Cause: demo reset hydrates empty state before reloading, so the preceding restore fix correctly
  clears the removed identity's catalog name. Unlike backup restore, demo reset must then stage
  the demo's default name for its fresh seed. `VaultSwitcher.resetDemo` now does so after the
  maintenance/hydration completes, using the existing localized demo name and catalog rename API.
  The next document adopts it through the existing campaign identity command. The unnamed-backup
  restore fix is retained unchanged.
- Added a browser assertion that the reset demo's core campaign identity is `Demo campaign`,
  alongside the existing catalog-row assertion after returning to the GM vault. Production change
  is confined to the owned switcher (three lines); no additional production claim is needed.
- Campaign storage suite: 12 tests passed, including all four named/unnamed cloud/local backup
  restore-and-reload regressions. Original output read from `/var/tmp/rc-ux-6.2-demo-storage.log`.
  Focused ESLint, Prettier and `git diff --check` passed.
- Targeted Playwright run (`demo-vault`, `campaign-identity`, `local-vaults`, desktop and mobile
  Chromium, two workers, zero retries): **12 passed, two skipped**, exit 0, 46.8 seconds. Both
  previously failing demo-reset cases pass with the new core-identity assertion. The two skips
  are the opt-in demo first-render performance checks. Original output read from
  `/var/tmp/rc-ux-6.2-demo-browser.log`.
- App `tsc --noEmit` passed (exit 0); original output read from
  `/var/tmp/rc-ux-6.2-demo-typecheck.log`. Journal formatting also passed. The full browser and
  pinned visual wrapper gates were not rerun locally; central validation and independent review
  remain pending. No push, promotion, dispatcher control edit, additional loop or agent delegation.
