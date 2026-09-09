# Changelog

User-facing release notes for the GM command platform (`@dndtools/gm-react`). Entries from the retired
v1 document-editor have been removed; that application's last state is preserved at the git tag
`v1-final`.

## [Unreleased]

## [0.3.7] - 2026-09-09

Same application code as 0.3.6, plus the three Android fixes below. 0.3.6's release build never
completed — its Android job could not compile — so it produced no installers and is superseded.

- Fixed the Android build: a shared-file reader caught `IOException | SecurityException |
RuntimeException`, and `SecurityException` extends `RuntimeException`, which javac rejects in a
  multi-catch. No Android package could be built from 0.3.6.
- A home-screen shortcut now leaves the app root directly beneath it: one Back from Session or Play
  returns home from any depth. Shortcuts previously stacked on the history, so Back landed on
  whichever shortcut was tapped before and home was only reached after as many Backs as shortcuts
  used that session.

## [0.3.6] - 2026-09-09

The RC loop's second integration batch: 75 stories across maps, audio, knowledge, session play,
characters, cloud and the platform shells.

- **Maps.** Combat tokens now live on the editor canvas and follow the running fight onto every map
  surface; range, path and area-of-effect measuring tools; fog the DM lifts fades off the player's
  own screen; the raster import wizard calibrates the map it imports; generation knobs re-threshold
  without hammering the generator; a breadcrumb for drilling into nested maps; and a POI can spawn a
  linked note that previews in its popover.
- **Audio.** Assets carry duration, a waveform thumbnail and tags. A bundled CC0 starter pack
  installs on demand. Scene packages link to POIs and export/import as `.dndscene`. Combat music
  fires automatically on real combat start and end, a natural 20 can make a noise (every sound effect
  has its own switch), and the assistant can set the atmosphere and suggest one in the prep digest.
- **Knowledge.** Templates and snippets, filters and saved searches each get a real screen; a saved
  search runs straight from the command palette, which itself grows actions, contextual rows, a `>`
  prefix and recents. A campaign calendar can be defined and notes dated against it, notes get typed
  relationship edges, clusters/momentum/dormant-arc surfacing, and one-click repair for broken
  wikilinks.
- **Session.** Rollable tables from the console; conditions carry a duration and run out on the round
  tick; a stat block opens from a tracker row; encounter builder v2 with counts, saved encounters,
  map placement and ambush; a continuity check after capture; and a countdown/break timer with lap
  marks in the quick panel, also operable from a widget tile.
- **Characters.** Package-driven advancement with party-wide XP and level-up (the assistant can
  propose a whole level-up and apply it atomically on approval), a downtime journal kind, a history
  timeline, party stash v2, player-private notes the DM cannot read, and highlight compilation.
- **Cloud and remote play.** Cross-device merge sync over the ciphertext op-log; connection status,
  presence and a dictated room + PIN in the host/join panel; the player companion draws the projected
  map with the DM's fog and tokens; a between-session inbox with a wiki recap feed; opt-in,
  content-free product analytics; marketplace listing kinds with a `.dndmodule` bundle format and
  creator tooling (publish checklist, license and changelog); and the Cloud-Enhanced phase-2 KMS key
  with a plaintext-upload gate.
- **Platform.** Desktop auto-update through electron-updater and GitHub Releases; Lamplight installs
  from the browser and keeps working offline; files share into the app and open from a shortcut into
  a live session; a game system shares as a module file and the shelf filters by kind. The iOS shell
  is deferred in an ADR, with iOS given its own runtime kind.
- **Canvas.** Fit / Comfortable / Detail zoom presets and scroll-natural pan on both the board and
  the scene canvas; the map tile draws the real map, the running fight and the DM's map actions.
- Fixed on the way in, all found by running the whole browser suite across the batch rather than
  story by story: a selected point of interest laid a pointer trap across the map editor, so no
  token or marker could be dragged while one was open; closing the quick-map properties sheet was
  undone the moment you picked another tool with something selected, and the sheet's scrim then ate
  the next press on the canvas; the import wizard offered SVG and then refused to let go of one,
  because it never read the file's size; the combat tile's new Next-turn button filled a phone
  tile's whole body and clipped every combatant row out of it; the map tile's DM actions sat under
  the 48dp Android touch floor; and the map tile's zoom cluster could slip under a neighbouring
  tile on a phone.
- Internal: the core suite runs in ~20s so the e2e shards are no longer blocked, five oversized
  `.tsx` files are split back under the file-size gate, and the `js-yaml` override is lifted to
  4.3.2 for GHSA-2883-xcg3-v3hh.

## [0.3.5] - 2026-09-07

- Fixed the Android release build: the Gradle wrapper is pinned back to 8.14.3, since Gradle 9.6+
  drops an internal API the Android Gradle Plugin 8.x still uses. Dependabot now ignores wrapper
  bumps past 9.5 until AGP itself moves to 9. Same application code as 0.3.4.
- The core movement-range frame budget is judged only outside coverage-instrumented runs.

## [0.3.4] - 2026-09-07

- Fixed the sidebar account block: the presence label no longer squeezes the name column, the DM
  seat reads "Dungeon Master" until named, and clicking it opens Settings › Players. A DM (or any
  actor, for their own seat) can now set their display name from the roster; the rename is a durable
  `permission.rename-actor` command that replicates to a connected table.
- Fixed the Electron shell's permanent window scrollbar (the title-strip inset collapsed through the
  body), themed the scrollbars, and removed the sidebar's own overflow at short window heights.
- Map editor: token layer, stamp/prop library, lighting and line-of-sight, room-graph view and
  stocking editor, travel routes with distance and pace, party marker, fog brush ergonomics and
  polygon lasso, list view and screen-reader inventory, arrow-key POI navigation, and a touch gesture
  model (pinch, momentum, double-tap zoom, long-press menu). Dense static fills bake to a canvas.
- Session: start/end session flows, a session quick panel on every route, one-handed HP keypad with
  a five-second undo, tracker keyboard model, roll labels and per-die breakdown with an exportable
  roll log, inline `[[roll:…]]` in notes and handouts, end-of-session capture, and combat map
  persistence and archive. Damage prompts the concentration check and the tracker shows who is dying.
- Characters: class resources render from the active system package, a rest workflow that spends hit
  dice, a guided level-up wizard, and a live party panel over remote play.
- Systems and widgets: the System tab is a system package picker; a DM can fork a rules system and
  edit it field by field; a Pathfinder 2e sample installs from the picker; dice, turn model, chrome
  vocabulary and widget bodies read the active package; the starter library ships seven real widgets;
  the builder's Advanced step writes custom HTML and JavaScript; an assistant can propose, generate
  and iterate on a widget with a diffed re-run.
- Knowledge: one sanitized markdown renderer with callouts, tables, figures and wikilinks, and a note
  editor with a toolbar, `[[` autocomplete, `/` insert menu, preview and autosave. Scene packages
  play, show and push in one click over a Web Audio engine.
- AI: semantic diff preview and three-way conflict review for staged proposals, an audit browser
  with export, batch review, a model router with per-task backend choice, local embeddings with
  hybrid search ranking, and Ollama model management.
- UX and platform: one keyboard shortcut registry behind the handlers, the `?` overlay and Settings;
  a Help menu; maturity-signal badges; typed device preferences and a platform capability layer; RTL
  readiness; a community translation workflow; the axe gate extended to every durable workspace; a
  Settings › About › Diagnostics screen with redacted export.
- Engineering: file-size and coverage quality gates, typed `any` seams, SEC-008 regression gates,
  stage-scoped observability and cost guardrails (ADR-028), and dependency updates.

## [0.3.1] - 2026-07-28

- Fixed the incremental formatting baseline failures on `main` by formatting the dashboard and
  settings files that landed ahead of the CI baseline.
- Fixed cloud environment validation so omitted feature flags remain fail-closed as an empty flag set
  instead of breaking deploy-time validation.
- Fixed scheduled drift checks by skipping the bootstrap `foundation` stack, whose global budget and
  Cost Explorer resources do not report deterministic CloudFormation drift.
- Fixed supply-chain policy failures by normalizing GitHub Actions version annotations to the pinned
  revisions actually in use.

## [0.3.0] - 2026-07-15

- Added an alpha Android GM companion using the shared React renderer, `@dndtools/core`, Dexie vault,
  and Capacitor 8. The package is `com.dndtools.gm` (version code 3000; API 24 minimum, API 36 target).
- Added a centralized web/Electron/Android capability contract, Android lifecycle and Back handling,
  Keystore-backed encrypted credential storage, HTTPS-only native networking, notification opt-in,
  and native share/save export.
- Added Android Quick Map mode for touch-first live-session map use. Desktop-authored precision
  geometry continues to render and is preserved, while advanced drawing controls remain desktop-only.
- Added responsive and accessibility coverage for compact/landscape phones, large and folding
  layouts, safe areas, keyboards, text scaling, reduced motion, forced colors, focus, and 48px touch
  targets.
- Added staged multi-step AI assistant runs with cancellable streaming tool passes, richer guarded MCP
  write tools, guided provider setup, desktop-only local Ollama, and human approval before writes.
- Release automation now requires a permanent-alpha-key signed Android APK/AAB plus four refreshed
  unsigned desktop alpha installers, complete SHA-256/SPDX coverage, provenance attestations, and an
  API 36 install/cold-launch gate.
- Android alpha users should export a vault before every install or upgrade. Uninstalling removes the
  app-private vault and Keystore credentials; automatic LAN discovery, desktop windowing, local
  Ollama, advanced precision map authoring, iOS, and Google Play publication are not included. Native
  Android share/save exports are limited to 32 MiB; larger vaults can be exported from desktop.

- The desktop window now hides the traditional menu by default, keeps native window controls, and
  follows the selected application theme.
- Packaged pages now run from the secure `dndtools://app` origin with exact network and permission
  policies. Upgrades from v0.2.0 migrate and verify the legacy `file://` vault before opening; interrupted
  upgrades retry without deleting the source. Local folders must be reconnected once after this change.
- Cloud authentication, backup, remote play, production promotion, accessibility, and responsive layout
  paths received a broad release-hardening pass. See the release checklist for remaining operational
  prerequisites.
- Cloud backups now use account/vault/revision-bound encrypted envelopes, strict wire limits, atomic
  restore with runtime rollback, and fail-closed key custody. Existing unbound ciphertext is refreshed
  from the originating local vault and cannot be restored as-is.
- Local vault import now validates the complete backup, including content-addressed media, and replaces
  state/history/assets in one transaction. Normal command persistence is transactional as well.
- Account deletion now locks writes first, removes encrypted backup data in bounded pages, verifies a
  strongly consistent purge marker, removes public and account data, and deletes Cognito identity last.
