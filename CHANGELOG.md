# Changelog

User-facing release notes for the GM command platform (`@dndtools/gm-react`). Entries from the retired
v1 document-editor have been removed; that application's last state is preserved at the git tag
`v1-final`.

## [Unreleased]

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
