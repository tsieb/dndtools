# Releasing

Desktop/Android packaging and cloud/web promotion are separate workflows. Both fail closed; neither
publishes merely because a tag exists. v0.3.0 is a GitHub **prerelease** with a permanent-alpha-key
signed Android APK/AAB and unsigned Windows, macOS, and Linux desktop installers.

## v0.3.0 desktop + Android alpha

### Source and version gate

1. Merge the release PR only after every required PR check succeeds. Fetch `origin/main` and verify
   the intended commit is reachable from it.
2. Set `package.json`, `packages/core/package.json`, and `apps/gm-react/package.json` to `0.3.0`.
   Confirm `apps/gm-react/android/app/build.gradle` uses `versionName "0.3.0"` and `versionCode 3000`.
   Android version codes follow `major × 1,000,000 + minor × 1,000 + patch`.
3. On the exact merged commit, run the full browser, accessibility, core coverage, secret scan,
   dependency audit, production bundle, Electron smoke, and Android checks described in
   [VALIDATION.md](VALIDATION.md) and the [Android runbook](../runbooks/android-alpha.md).
4. Create one annotated tag from that merged `main` commit and push it:

   ```bash
   git tag -a v0.3.0 -m "Lamplight GM 0.3.0 alpha"
   git push origin v0.3.0
   ```

`.github/workflows/release.yml` checks out the tag, resolves its peeled commit, requires that commit to
be reachable from `origin/main`, and verifies all three package versions. Do not move or replace a tag;
fix forward with a new version.

### Android signing prerequisite

The release repository must contain these encrypted Actions secrets before the tag is pushed:

- `ANDROID_ALPHA_KEYSTORE_BASE64`
- `ANDROID_ALPHA_KEYSTORE_PASSWORD`
- `ANDROID_ALPHA_KEY_ALIAS`
- `ANDROID_ALPHA_KEY_PASSWORD`

They represent the permanent 4096-bit `dndtools-alpha` signing identity for `com.dndtools.gm`.
Recovery material lives outside git with mode-`0600` permissions; the release workflow materializes a
temporary runner copy and fails if any input is missing. Never generate a replacement key for a later
v0.3.x build: Android would refuse to update an installed alpha. Generation, fingerprint checks, local
signed builds, and recovery handling are documented in
[`../runbooks/android-alpha.md`](../runbooks/android-alpha.md).

### Automated release gates

A semver tag push always selects the alpha/preview path:

- the full static, type, unit/tooling, coverage, lint, production-build, browser E2E, axe, dependency,
  secret-scan, and Electron boot/persistence gates run first;
- macOS arm64/x64, Linux x86_64, and Windows x64 package fresh **unsigned** desktop installers;
- a pinned JDK 21/API 36 Android environment builds the renderer, synchronizes Capacitor, runs Gradle
  release unit/lint checks, and produces signed APK/AAB packages;
- `apksigner` and `jarsigner` verify Android signatures, and an API 36 emulator installs and
  cold-launches the signed APK;
- release verification rejects anything other than the complete six-package set;
- `SHA256SUMS.txt` covers every package and both SPDX documents;
- `dndtools.spdx.json` inventories source dependencies, while
  `dndtools-artifacts.spdx.json` records the SHA-256 identity of every package; and
- GitHub build-provenance attestations are created for packages, checksum manifest, and SPDX files.

The exact required package names are:

```text
Lamplight-GM-0.3.0-arm64.dmg
Lamplight-GM-0.3.0-x64.dmg
Lamplight-GM-0.3.0-x86_64.AppImage
Lamplight-GM-0.3.0-x64.exe
Lamplight-GM-0.3.0-android.apk
Lamplight-GM-0.3.0-android.aab
```

The workflow refuses to mutate a published release and refuses to replace a signed production draft
with preview artifacts.

### Draft inspection and publication

Automation creates or refreshes a draft GitHub prerelease. Before publishing:

1. Confirm the tag still peels to the verified `origin/main` commit and the release workflow is green.
2. Confirm the title is exactly
   `Lamplight GM 0.3.0 — Alpha (Windows · macOS · Linux · Android)` and prerelease is enabled.
3. Confirm all six named packages, `SHA256SUMS.txt`, `dndtools.spdx.json`, and
   `dndtools-artifacts.spdx.json` are attached. The notes must identify Android as alpha-key signed and
   every desktop installer as unsigned.
4. Download the complete draft into an empty directory and run:

   ```bash
   sha256sum -c SHA256SUMS.txt
   gh attestation verify Lamplight-GM-0.3.0-android.apk --repo tsieb/dndtools
   gh attestation verify Lamplight-GM-0.3.0-android.aab --repo tsieb/dndtools
   ```

   Repeat `gh attestation verify` for each desktop package, both SPDX files, and the checksum manifest.

5. Install the signed APK on the API 36 acceptance emulator and complete the fresh-install, offline,
   lifecycle, rotation, Back, vault, secure-store, share/import, external-link, Quick Map, and signed
   upgrade checklist in the Android runbook. Install-test each desktop target as available.
6. Read the rendered release notes. They must include install, backup, upgrade, uninstall/data-loss,
   platform limitations, checksum, SPDX, and attestation guidance.

Publish only when the draft is complete, signatures and checksums verify, the signed APK launches, and
the acceptance checklist passes. Publication is a deliberate human action; the workflow never
publishes the draft automatically.

## Data compatibility checklist

- Export a full vault backup before installing or upgrading on every platform. On Android, save it to
  storage outside the application; uninstalling removes app-private vault data and Keystore secrets.
- Install the candidate over the latest published version using a backed-up, nontrivial vault. Confirm
  documents, operation history, an in-flight migration journal, binary map/audio assets, and reviewed
  preferences survive; reconnect local folders when release notes require it.
- Run `pnpm --filter @dndtools/gm-react desktop:smoke`. It interrupts and retries the v0.2.0
  `file://`-to-`dndtools://app` migration, verifies binary bytes and preference exclusions, then boots
  the normal renderer twice to prove persistence.
- On Android, install with `adb install --replace`. A signing mismatch is a release blocker; never
  uninstall to bypass it before preserving the vault.
- Treat any storage origin, IndexedDB version/store, backup-envelope, or key-namespace change as a data
  migration. Ship the migration and its upgrade fixture before publishing; never rely on reinstalling
  to repair data.
- Verify downgrade behavior explicitly. If the previous release cannot safely read the new format,
  say so in the release notes and require a user-created backup before upgrade.

## Future signed desktop releases

v0.3.0 uses unsigned desktop alpha installers. A production desktop candidate must be manually
dispatched for an existing tag with channel `production`. The `desktop-release` GitHub environment
should have required reviewers and these secrets: `MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WINDOWS_CSC_LINK`, and
`WINDOWS_CSC_KEY_PASSWORD`.

Production packaging verifies the macOS code signature and stapled notarization ticket and the
Windows Authenticode signature and trusted timestamp. Missing credentials or an invalid signature
fails the job. Code-signing certificates and the protected environment are external prerequisites;
without them, only the unsigned desktop alpha is releasable. Android continues to use the permanent
alpha signing key until an explicitly planned package/signing transition.

## Cloud and web production

`.github/workflows/promote-production.yml` is manual-only and uses the protected `production`
environment. Configure required reviewers and set `AWS_PROD_DEPLOY_ROLE_ARN` to the prod foundation
stack's OIDC role. Set `COGNITO_EMAIL_SOURCE_ARN` and `COGNITO_EMAIL_FROM` on that environment to a
sender already verified by SES in `ca-central-1`. The selected tag must be reachable from `main`; the
workflow pins its exact commit before waiting for production approval, so moving a tag cannot change
the approved source.

The workflow re-runs release-quality gates, blocks on CloudFormation drift, deploys stacks in
dependency order (`identity` → `turn` → `app-api` → `signaling` → `sync-api` → app-api purge-proof
refresh → `web-hosting` → identity/API origin refresh), publishes the SPA, waits for CloudFront
invalidation, and runs non-mutating production probes. `foundation` remains a
bootstrap-administrator operation and is never mutated by the deploy role it creates. SAM rolls back
a failed stack update automatically. For an application-level rollback, dispatch the workflow again
from `main` with the previous known-good tag and record the rollback reason.

The existing `.github/workflows/deploy.yml` remains the path-filtered automatic **dev** deployment.
Scheduled dev drift detection lives in `.github/workflows/cloud-drift.yml`.

Before a production bundle is accepted, `pnpm cloud:env:validate --required` validates all seven
cloud coordinates together: AWS region, Cognito pool and client, `wss:` signaling stage URL, the two
`https:` API stage URLs, and the public HTTPS SPA URL used by desktop join/wiki links. Desktop
packaging additionally passes `--policy apps/gm-react/dist/electron-network-policy.json`; this must
contain exactly the configured cloud and AI origins. A malformed or partially populated cloud
environment fails the release rather than producing a half-connected client. A build with every cloud
coordinate absent remains a valid local-only build.
