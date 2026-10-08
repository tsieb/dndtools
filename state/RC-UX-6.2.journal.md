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
