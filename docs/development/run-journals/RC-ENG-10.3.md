# RC-ENG-10.3 — Android system backup excludes the vault

Run journal for the implement pass on `dispatch/dndtools/fd214cbfd4e4abc673d2`, based on `d740e7fe`.

## Change

- `AndroidManifest.xml`: `android:allowBackup="false"`. The `fullBackupContent` and
  `dataExtractionRules` references stay, because on Android 12+ that flag stops cloud backup but not
  device-to-device transfer.
- `backup_rules.xml` and both sections of `data_extraction_rules.xml` exclude every domain (`root`,
  `file`, `database`, `sharedpref`, `external` and the four `device_*` domains) with `path="."`.
  The WebView IndexedDB vault lives under `root/app_webview`, so a `database` exclude alone would
  not have covered it.
- `tests/unit/android-backup-rules.test.ts` parses the manifest and both rule files with `saxes`
  and lists every leak: `allowBackup` not `false`, a declared `backupAgent`, rule files not wired,
  a missing `<cloud-backup>`/`<device-transfer>` section, or any section that would back up
  representative WebView IndexedDB, WebView Local Storage and database files in credential- or
  device-protected storage (honouring `<include>`/`<exclude>` semantics).
- `docs/runbooks/android-alpha.md` §4 states the rule and what a restored phone looks like.

## Evidence

- Mutation check: restoring the pre-fix `data_extraction_rules.xml` fails the shipped-files test
  with 10 cloud-backup/device-transfer leaks; flipping `allowBackup` back to `true` fails it with
  `android:allowBackup is not false`. The test also pins the pre-fix configuration as a fixture.
- `vitest run tests/unit/android-backup-rules.test.ts tests/unit/check-android.test.ts`: 19 passed.
  `node scripts/check-android.mjs`, `pnpm gates`, `eslint` and `prettier --check` on the changed
  files pass.
- Gradle (`testDebugUnitTest lintDebug assembleDebug`) could not run on this host: the
  `java-21-openjdk` and `java-24-openjdk` directories now hold only man pages, and Gradle 8.14.3
  does not run on JDK 25. Instead I read the lint 31.13.0 `FullBackupContentDetector` and
  `ManifestDetector` from the Gradle cache: they reject `//`, `..`, sharedpref/database
  subdirectories, unknown domains and excludes outside an include, and warn only when
  `dataExtractionRules` or `fullBackupContent` is missing. None of those apply. The CI
  `android-checks` job still has to prove the build.
