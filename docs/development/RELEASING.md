# Releasing

Desktop and Android packaging (`release.yml`) and cloud promotion (`promote-production.yml`) are
separate, fail-closed workflows. Neither publishes because a tag exists. Releases are GitHub
prereleases with a permanent-alpha-key signed Android APK/AAB and unsigned desktop installers until
signing certificates exist (RC-PLT-1.1).

## 1. Cut a release

1. Merge only after every required check passes; verify the commit is reachable from `origin/main`.
2. Set `package.json`, `packages/core/package.json`, and `apps/gm-react/package.json` to the same
   `X.Y.Z` (plain semver; Android rejects a `-rc` suffix). `apps/gm-react/android/app/build.gradle`
   derives `versionName` and `versionCode` (`major × 1,000,000 + minor × 1,000 + patch`) from it;
   `pnpm check:android` asserts the contract.
3. On that commit run the gates in [TESTING.md](TESTING.md) and the Android checks in the
   [Android runbook](../runbooks/android-alpha.md).
4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "Lamplight GM X.Y.Z"
   git push origin vX.Y.Z
   ```

`release.yml` checks out the tag, requires its commit to be reachable from `origin/main`, verifies
all three versions agree, runs the static, unit, coverage, build, browser, axe, dependency, secret,
and Electron gates, packages macOS arm64 and x64, Linux x86*64, and Windows x64 installers, builds
and signs the Android APK/AAB with the `dndtools-alpha` key from the four `ANDROID_ALPHA*\*`secrets,
verifies both signatures, installs and cold-launches the APK on an API 36 emulator, writes`SHA256SUMS.txt`, two SPDX documents, and build-provenance attestations, and creates or refreshes a
draft prerelease. It refuses to mutate a published release or to replace a signed production draft
with preview artifacts. Never move a tag; fix forward with a new version. Never generate a
replacement Android key; installed alphas would refuse to update.

Required packages: `Lamplight-GM-X.Y.Z-{arm64,x64}.dmg`, `-x86_64.AppImage`, `-x64.exe`,
`-android.apk`, `-android.aab`.

## 2. Publish the draft

1. Confirm the workflow is green and the tag still peels to the verified commit.
2. Title `Lamplight GM X.Y.Z — Alpha (Windows · macOS · Linux · Android)`, prerelease enabled, all
   six packages plus `SHA256SUMS.txt` and both SPDX files attached. The notes must say Android is
   alpha-key signed and desktop installers are unsigned, and include install, backup, upgrade,
   uninstall, platform-limitation, checksum, and attestation guidance.
3. In an empty directory: `sha256sum -c SHA256SUMS.txt` and
   `gh attestation verify <file> --repo tsieb/dndtools` for every package, both SPDX files, and the
   manifest.
4. Install the signed APK on the API 36 emulator and run the runbook's acceptance checklist; install
   each desktop target you can.
5. Run `pnpm release:verify`. Publishing is a deliberate human action.

## 3. Data compatibility

- Export a full vault backup before installing or upgrading on every platform; on Android save it
  outside the app, because uninstalling removes the vault and Keystore secrets.
- Install over the previous version with a nontrivial vault and confirm documents, history, an
  in-flight migration journal, media bytes, and preferences survive. `pnpm --filter
@dndtools/gm-react desktop:smoke` rehearses the `file://` → `dndtools://app` migration and boots
  twice to prove persistence.
- On Android use `adb install --replace`; a signing mismatch is a release blocker.
- Any storage origin, IndexedDB store, backup envelope, or key-namespace change is a data migration:
  ship it with its upgrade fixture, never rely on reinstalling. State downgrade behaviour in the notes.

## 4. Signed desktop builds

A production desktop candidate is dispatched manually for an existing tag with channel
`production`. The `desktop-release` environment needs required reviewers and the secrets
`MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID`, `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`. Packaging verifies the macOS
signature and notarization ticket and the Windows Authenticode signature; a missing credential fails
the job. Auto-update accepts only packages whose signature matches ([PLATFORMS.md](../architecture/PLATFORMS.md)).

## 5. Promote cloud and web to production

`promote-production.yml` is manual, uses the protected `production` environment
(`AWS_PROD_DEPLOY_ROLE_ARN`, `COGNITO_EMAIL_SOURCE_ARN`, `COGNITO_EMAIL_FROM` set on it), pins the
tag's commit before waiting for approval, re-runs release gates, blocks on CloudFormation drift,
deploys `identity → turn → app-api → signaling → sync-api → app-api purge-proof refresh →
web-hosting → identity/API origin refresh`, publishes the SPA, waits for the CloudFront
invalidation, and runs non-mutating probes. `foundation` is bootstrapped by an administrator, never
by the deploy role. Rollback is a re-dispatch from `main` with the previous known-good tag. The
first full promotion was `v0.3.7` on 2026-09-09.

`pnpm cloud:env:validate --required` checks all seven cloud coordinates together before a bundle is
accepted; desktop packaging passes `--policy apps/gm-react/dist/electron-network-policy.json`, which
must contain exactly the configured cloud and AI origins. A build with every coordinate absent is a
valid local-only build; a partial one fails.

`deploy.yml` remains the path-filtered automatic dev deploy; `cloud-drift.yml` watches dev weekly.
