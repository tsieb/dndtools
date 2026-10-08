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
         onboarding, becomes the campaign name. The placeholder never does.
       - The released `partyNotes` roster (`dndtools:react:invites`, vault-scoped) becomes player
         actors through `permission.add-players`. Email entries stay in the preference, because
         `rosterAttendeeEmails` still reads them for the Google Calendar invite. The preference is
         removed when nothing is left in it.
    2. After that, it renames the catalog entry whenever the campaign name changes.
- **Surfaces**:
  - Sidebar chip: the campaign name, or the placeholder. The GM name prefers
    `campaign.gmDisplayName`.
  - Switcher: the open vault's row shows the campaign name, and other rows show their catalog name.
    An unnamed vault shows "Your campaign" as a label, and its Rename field starts empty with
    "Your campaign" as the placeholder. Renaming the open vault dispatches `campaign.set-identity`.
    Renaming another vault renames its catalog entry, and that vault takes the name up when it
    next opens.
  - Hero: the idle heading is the campaign name, or the placeholder.
  - Widget `campaign` source: the campaign name.
  - The phone More sheet row reads the catalog, which follows the campaign name.
- **Onboarding** names the campaign and its system through `campaign.set-identity`. A skip names
  nothing. A replay prefills the stored name.
- **Settings › Players** gains "Add your party": comma-separated names, dispatched as one
  `permission.add-players`. An email address is refused before dispatch with a localized message.
  Other rejections show the schema issue. The new seats appear in the roster with role pickers and
  in the view-as menu.
- Copy: `settings.players.addParty` / `addPartyLabel` / `addPartyHint` / `addPartyAction` / `added` /
  `addFailed` / `namesOnly` (en, es); pseudo catalog regenerated.
- `docs/architecture/DATA_MODEL.md`: new "Campaign identity (RC-UX-6.2)" section and the additive
  field listed under §2.

## Scope notes

- Outside Owns (non-companion), kept because the acceptance needs them:
  - `apps/gm-react/src/app/Onboarding.tsx`: "name the campaign in onboarding, see it in the
    sidebar, hero and switcher". Onboarding wrote only the catalog name, so the name never reached
    the campaign. The edit swaps that write for the command and removes the skip's
    `t('home.yourCampaign')` write, which stored the placeholder as a name.
  - `apps/gm-react/src/app/widgets/homeSources.ts`: the hero's idle heading was the literal
    `home.yourCampaign`. One line now reads `campaignNameOf(state.commandCenter)` first.
  - `apps/gm-react/src/app/widgets/dataEnvironment.ts`: `useWidgetHostContext` read the catalog
    once per vault (memoised on `vaultId`), so the widget campaign source did not follow a rename.
    It now reads the campaign name. This is for "every surface follows", and it is small.
- Companion paths: `App.tsx`, core `index.ts` / `dispatch.ts` / `types.ts` / `schemas/commands.ts`,
  i18n catalogs, tests, `docs/architecture/DATA_MODEL.md`.
- Handler placement: the roadmap says party names create actors "through the existing permission
  commands", but no existing command creates an actor; demo participants are injected by the
  runtime. `permission.add-players` is new. It lives in `command-center.ts` (owned) beside
  `campaign.set-identity` rather than in a new `commands/add-players.ts`, so it adds no unowned
  file. Its operation and event use the permission vocabulary.
- Not done (outside the acceptance criteria, follow-ups):
  - Hero avatars still come from party PCs (`party` source in `dataEnvironment.ts`). Player actors
    without a character are not drawn there.
  - The invite screen's campaign-name field (`PlayerInvites.tsx`) still starts empty.
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
