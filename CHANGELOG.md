# Changelog

User-facing release notes for the GM command platform (`@dndtools/gm-react`). Entries from the retired
v1 document-editor have been removed; that application's last state is preserved at the git tag
`v1-final`.

## [Unreleased]

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
