# Changelog

User-facing release notes for the GM command platform (`@dndtools/gm-react`). Entries from the retired
v1 document-editor have been removed; that application's last state is preserved at the git tag
`v1-final`.

## [Unreleased]

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
