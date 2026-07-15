# Releasing

Desktop packaging and cloud/web promotion are separate workflows. Both fail closed; neither publishes
a production release merely because a tag exists.

## Desktop releases

Versions in `package.json`, `packages/core/package.json`, and `apps/gm-react/package.json` must match
the existing `vX.Y.Z` tag. `.github/workflows/release.yml` runs the full static/unit/build gate,
browser E2E, the merged axe policy, and Electron boot/persistence smoke before any packaging job.

- A pushed semver tag produces an **unsigned preview** draft. The alpha install guide applies only to
  these artifacts.
- A production desktop candidate must be manually dispatched for the same tag with channel
  `production`. The `desktop-release` GitHub environment should have required reviewers and these
  secrets: `MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WINDOWS_CSC_LINK`, and
  `WINDOWS_CSC_KEY_PASSWORD`.
- Production packaging verifies the macOS code signature and stapled notarization ticket and the
  Windows Authenticode signature and trusted timestamp. Missing credentials or an invalid signature
  fails the job.
- The release is kept as a draft until all four documented installers are present (macOS arm64/x64,
  Linux x86_64, Windows x64). SHA-256 checksums and an SPDX SBOM are attached alongside them.
- GitHub signs build-provenance attestations for every installer, the checksum manifest, and the SBOM.
  Verify a downloaded artifact with `gh attestation verify <file> --repo tsieb/dndtools`.
- Automation refuses to mutate a published release or replace a signed production draft with unsigned
  preview artifacts.

Publishing the draft remains a human decision after install-testing each target OS. Code-signing
certificates and the protected GitHub environment are external prerequisites; without them, only a
preview is releasable.

### Desktop data compatibility checklist

- Install the candidate over the latest published version using a backed-up, nontrivial vault. Confirm
  documents, operation history, an in-flight migration journal, binary map/audio assets, and reviewed
  preferences survive; reconnect local folders when the release notes require it.
- Run `pnpm --filter @dndtools/gm-react desktop:smoke`. It interrupts and retries the v0.2.0
  `file://`-to-`dndtools://app` migration, verifies binary bytes and preference exclusions, then boots the
  normal renderer twice to prove persistence.
- Treat any storage origin, IndexedDB version/store, backup-envelope, or key-namespace change as a data
  migration. Ship the migration and its upgrade fixture before publishing; never rely on reinstalling to
  repair data.
- Verify downgrade behavior explicitly. If the previous release cannot safely read the new format, say
  so in the release notes and require a user-created backup before upgrade.

## Cloud and web production

`.github/workflows/promote-production.yml` is manual-only and uses the protected `production`
environment. Configure required reviewers and set `AWS_PROD_DEPLOY_ROLE_ARN` to the prod foundation
stack's OIDC role. Set `COGNITO_EMAIL_SOURCE_ARN` and `COGNITO_EMAIL_FROM` on that environment to a
sender already verified by SES in `ca-central-1`. The selected tag must be reachable from `main`; the
workflow pins its exact commit before waiting for production approval, so moving a tag cannot change
the approved source.

The workflow re-runs release-quality gates, blocks on CloudFormation drift, deploys stacks in dependency
order (`identity` → `turn` → `app-api` → `signaling` → `sync-api` → app-api purge-proof refresh →
`web-hosting` → identity/API origin refresh), publishes the SPA, waits for CloudFront invalidation, and
runs non-mutating production probes. `foundation` remains a bootstrap-administrator operation and is
never mutated by the deploy role it creates. SAM rolls back a failed stack update automatically. For an
application-level rollback, dispatch the workflow again from `main` with the previous known-good tag
and record the rollback reason.

The existing `.github/workflows/deploy.yml` remains the path-filtered automatic **dev** deployment.
Scheduled dev drift detection lives in `.github/workflows/cloud-drift.yml`.

Before a production bundle is accepted, `pnpm cloud:env:validate --required` validates all seven
cloud coordinates together: AWS region, Cognito pool and client, `wss:` signaling stage URL, the
two `https:` API stage URLs, and the public HTTPS SPA URL used by desktop join/wiki links. Desktop
packaging additionally passes
`--policy apps/gm-react/dist/electron-network-policy.json`; this must contain exactly the configured
cloud and AI origins. A malformed or partially populated cloud environment fails the release rather
than producing a half-connected client. A build with every cloud coordinate absent remains a valid
local-only build.
