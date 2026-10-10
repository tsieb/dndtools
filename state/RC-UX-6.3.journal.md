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
  above everything else on the home screen). `resolveOnboarding().steps` is now the guide's rows,
  so Help, the widget and onboarding status agree. `wantsFirstSessionGuide` = no GM board yet, no
  preset, no authored scene.

- **Widget** (`GettingStartedBody.tsx`, owned): heading, a polite progress readout, Hide guide, and
  the six rows (number or check mark with a spoken state, title, reason, links). A complete guide
  collapses to one line. `FirstSessionGuideList` is shared with Help.
- **Help** (`HelpMenu.tsx`, owned): Getting started shows the same list and, when the guide is not
  on the home screen, "Show the guide on the Command Center", which puts it back and goes to `/`.
- **Copy** (en/es, pseudo regenerated): `firstSession.*`; `home.noScenes` → "No screens yet",
  `home.createFirstScene` → "New screen from a template" (the scenes card's empty state). Dead keys
  `widgetBody.gettingStarted.{setup,tier,tier.*,complete}` and `help.gettingStarted{Progress,Complete}`
  removed. Wording avoids "go live" (`session-start-copy.test.ts`).
- `CommandCenter.tsx` (owned): doc comment only. `demo-seed.ts` (owned): no change needed; the new
  `demo-seed.first-session.test.ts` pins what the base and demo seeds read as.
- `docs/user/getting-started.md` (owned): "Your first session" section.

## Scope crossings (operator: please adjudicate)

Each is required by an acceptance criterion and kept as small as possible:

1. `packages/core/src/commands/command-center.ts` — `buildDefaultHomeScreen` takes `{ guide }` and
   `ensure-home` passes `wantsFirstSessionGuide(state)` (read before the board is created). Required
   by "a fresh vault shows six open rows … dismiss hides the widget and Help restores it" and "the
   ENG-8.1 first-run journey asserts the guide is present": the widget must be on the fresh home
   screen, which only `ensure-home` provisions. The guide's id is drawn last so the parts keep theirs.
2. `apps/gm-react/src/app/Onboarding.tsx` — the post-close focus looks for
   `FIRST_SESSION_FOCUS_SELECTOR` before `#main-content` (one import, one expression). Required by
   "focus lands on the guide's first row after onboarding closes".
3. `apps/gm-react/src/app/widgets/parity.ts` — required by "the WID-5.5 parity test passes for the
   widget". A builtin on a default screen is a finding by construction, so the ledger gains
   `getting-started: draws through a hand-written builtin body …` (RC-WID-5.7) and the private read
   entry changes from `read:resolveOnboarding` to `read:resolveFirstSessionGuide`. Two presentational
   shared modules (`../../onboarding/shared`, `../../../platform/preferences`) are classified with no
   uses. `docs/architecture/WIDGETS.md` §6.1 (companion) records it. Making the guide a public template
   widget instead would need a new query source and template kind across five more non-owned files.

Companion paths touched: catalogs, pseudo catalog, tests, snapshots, e2e specs, the raw-style
allow-list (GettingStartedBody now has 0 raw values; entry removed), visual baselines, WIDGETS.md.

## Verification (this worktree, 2026-10-10)

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
