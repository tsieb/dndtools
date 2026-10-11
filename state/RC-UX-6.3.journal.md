# RC-UX-6.3 run journal

Base: `0de08e09`. Headroom tools were not used; command output was read directly.

## Implementation

- **Core** (`packages/core/src/state/onboarding.ts`, owned). `resolveFirstSessionGuide(state, actorId)`
  returns six rows in first-evening order, each with an English label, a one-sentence reason, a
  `done` read from durable state, and its links:

  | Row                    | Done when                                                                                     | Links                                            |
  | ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
  | `name-campaign`        | `campaignNameOf(commandCenter)` is set (RC-UX-6.2)                                            | onboarding's campaign step (replay)              |
  | `add-party`            | a `player` actor, or a `pc` character                                                         | Settings › Players; `/characters`                |
  | `map-or-note`          | any map, or a live note                                                                       | create map; create note                          |
  | `screen-from-template` | a live, non-template scene that is not the GM board or a default screen                       | create screen (`/scenes` New screen)             |
  | `standby-session`      | a dice roll, a combatant, a combat log entry, or a session archive                            | `/session`                                       |
  | `open-table`           | workflow active/paused/ending/recap, an archive, a player-view assignment or a map projection | `/session` (Start a session); Settings › Players |

  Links are declared as WID-5.1 intents (`FIRST_SESSION_INTENTS`) and resolved with
  `resolveWidgetIntent` against the viewer's read gate. Naming the campaign has no intent target, so
  that row reopens onboarding's first step (the Settings › Account replay). The view also carries
  `dismiss` (`scene.destroy-widget` of the home screen's guide) and `restore` (`scene.add-widget`
  above everything else on the home screen). `resolveOnboarding()` now carries the view as `guide`
  and its `steps` are the guide's rows, so Help, the widget and onboarding status agree.
  `wantsFirstSessionGuide` = no GM board yet, no preset, no authored scene.

- **Widget** (`GettingStartedBody.tsx`, owned): heading, a polite progress readout, Hide guide, and
  the six rows (number or check mark with a spoken state, title, reason, links). A complete guide
  collapses to one line. `FirstSessionGuideList` is shared with Help. It reads the guide through
  `resolveOnboarding` (the read the WID-5.5 ledger already records for this body) and imports no
  unclassified module; "Name it" dispatches `FIRST_SESSION_NAME_EVENT`.
- **Help** (`HelpMenu.tsx`, owned): Getting started shows the same list and, when the guide is not
  on the home screen, "Show the guide on the Command Center", which puts it back and goes to `/`.
  `HelpHost` (mounted once on every route) answers `FIRST_SESSION_NAME_EVENT` with the Settings ›
  Account replay: clear the onboarded flag, fire the replay event.
- **Command Center** (`CommandCenter.tsx`, owned): `useProvisionedHome` reads
  `wantsFirstSessionGuide` before `ensure-home` and, when true, dispatches the guide view's
  `restore` once the home exists, so a fresh vault's home opens on the guide (bare, first in reading
  order). `useFocusGuideAfterOnboarding` moves the one `#main-content` focus that follows onboarding's
  finish (it fires `LOCAL_VAULT_RENAMED_EVENT` first) onto the guide's first row.
- **Copy** (en/es, pseudo regenerated): `firstSession.*`; `home.noScenes` → "No screens yet",
  `home.createFirstScene` → "New screen from a template" (the scenes card's empty state). Dead keys
  `widgetBody.gettingStarted.{setup,tier,tier.*,complete}` and `help.gettingStarted{Progress,Complete}`
  removed. Wording avoids "go live" (`session-start-copy.test.ts`).
- `demo-seed.ts` (owned): no change needed; the new `demo-seed.first-session.test.ts` pins what the
  base and demo seeds read as.
- `docs/user/getting-started.md` (owned): "Your first session" section.

## Scope (attempt 2)

The first attempt changed `packages/core/src/commands/command-center.ts`, `apps/gm-react/src/app/Onboarding.tsx`
and `apps/gm-react/src/app/widgets/parity.ts`; the claim gate refused them. All three are reverted to
base `0de08e09` (with `command-center-home-screen.test.ts` and the `WIDGETS.md` ledger note), and
every criterion is met inside the owned files instead:

- guide on a fresh home: placed by `CommandCenter.tsx` after `ensure-home` (core provisioning is
  unchanged, so the five parts' layout and ids are base);
- focus after onboarding: redirected by `CommandCenter.tsx` on the post-finish `#main-content` focus;
- parity: the body's only core read is the already-ledgered `resolveOnboarding`, and it imports no
  unclassified module, so `PARITY_DEBT_LEDGER` is unchanged and the gate passes. Because the parity
  gate inspects what `ensure-home` provisions, it does not see the guide the page adds afterwards;
  the guide stays a builtin body (its debt is the existing `read:resolveOnboarding` entry for
  RC-WID-5.7).

Companion paths touched: catalogs, pseudo catalog, core `index.ts`, tests, snapshots, e2e specs, the
raw-style allow-list (GettingStartedBody now has 0 raw values; entry removed), visual baselines.

## Verification, attempt 2 (2026-10-10, after the reverts)

- Core: `npx vitest run` in `packages/core` → 294 files, 5340 tests passed (`first-session-guide`
  places the guide the way the page does: `ensure-home`, then the view's `restore`).
- App unit: full `vitest.app.config.ts` → 2273 passed, 1 failed: `play/Sheet.test.tsx` "every control
  drawn for the owner…" hit its 5 s timeout (5104 ms) in the full run; alone it passes 3/3 (~3.8 s for
  the file's three tests). This branch touches no `/play` code. Parity test passes with the base
  ledger; CommandCenter baselines pass unchanged from attempt 1; one body snapshot updated (the
  fixture's home has no guide instance, so no "Hide guide").
- `tsc --noEmit` core and app clean; `pnpm lint` exit 0; Prettier clean on changed files.
- E2E, both profiles, Playwright-owned server: the same 14 specs → 385 passed, 7 skipped, 0 failed
  (`first-session-guide` 6/6: six open rows, each ticked through its link, hide + Help restore with
  health clean, focus on the first row after onboarding; `golden-path` first-run asserts the guide,
  its focus and a clean health detector).
- Visual: `palette, help` compared in the pinned container against attempt 1's baselines → 15 passed.

## Verification, attempt 1 (superseded where attempt 2 re-ran it)

- Core: `npx vitest run` in `packages/core` → 294 files, 5340 tests passed (new
  `tests/first-session-guide.test.ts`: every row on empty, partial and complete vaults, links,
  placement, hide/put back; `command-center-home-screen` and `onboarding` tests updated).
- App unit: full `vitest.app.config.ts` run → all passed except `play/Sheet.test.tsx` (5 s timeout
  while an e2e batch loaded the machine; passes 3/3 alone) and the two CommandCenter baselines,
  re-baselined for the intended change (guide first on an empty vault; new empty-state copy).
- `tsc --noEmit` core and app: clean. `pnpm lint`: exit 0. Prettier: changed files clean.
- E2E, both profiles, Playwright-owned dev server: `first-session-guide`, `golden-path`,
  `help-menu`, `help-guides`, `onboarding-consent`, `campaign-identity`, `local-vaults`,
  `demo-vault`, `command-center-polish`, `hub-templates`, `flow-layout`, `screens`, `a11y-axe-gate`,
  `responsive` → 385 passed, 7 skipped, 0 failed.
- Visual (pinned container): `palette, help` re-baselined (15 `help--*` PNGs, plus the two rail
  `shortcuts--*` captures, whose top edge row shows the taller Help dialog behind; failed twice on
  compare before re-baselining), Zopfli re-filtered (pixels asserted identical, −335 KiB), then
  compared clean (15 passed). Budget 37296.8 / 37888 KiB.

## Follow-ups

- At the Beginner (`core`) tier Settings › Players is hidden, so the "Add players" / "Invite players"
  links land on a tab the GM cannot see; "Import characters" still works. A tier-aware link list
  would need the tier in the core view.
- `open-table` cannot tell a session that was torn down from the top bar's End (active → idle, no
  archive) from one that never ran, so that path un-ticks the row. Recap or archive keeps it.
