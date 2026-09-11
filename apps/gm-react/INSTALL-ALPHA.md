# Lamplight GM: Alpha Install Guide

This guide covers the **unsigned preview builds**. Signed production releases will not ask you to
bypass Gatekeeper or SmartScreen.

Lamplight GM is an offline Game-Master workspace for tabletop RPGs. It runs entirely on your
machine, needs no account or internet connection, and opens into a sample campaign.

## 1. Download

From the project's GitHub Releases page:

| Your machine                      | File                                     |
| --------------------------------- | ---------------------------------------- |
| Windows (10/11, 64-bit)           | `Lamplight-GM-<version>-x64.exe`         |
| Mac, Apple Silicon (M1 and later) | `Lamplight-GM-<version>-arm64.dmg`       |
| Mac, Intel                        | `Lamplight-GM-<version>-x64.dmg`         |
| Linux (x64)                       | `Lamplight-GM-<version>-x86_64.AppImage` |
| Android                           | `Lamplight-GM-<version>-android.apk`     |

Not sure which Mac you have? Apple menu → About This Mac. Verify downloads with `SHA256SUMS.txt`
from the same release.

## 2. Install

**Windows.** Run the `.exe`. SmartScreen shows "Windows protected your PC" because the build is not
code-signed; click More info, then Run anyway. The installer is per-user (no admin prompt) and adds
Start-menu and desktop shortcuts. Uninstall from Settings → Apps.

**macOS.** Drag Lamplight GM to Applications. On first launch right-click the app → Open → Open;
this is only needed once. If macOS says the app "is damaged", clear the quarantine flag and try
again:

```sh
xattr -cr "/Applications/Lamplight GM.app"
```

**Linux.** `chmod +x Lamplight-GM-*-x86_64.AppImage` and run it. If it fails with a FUSE error,
install FUSE 2 (`sudo apt install libfuse2` or `sudo dnf install fuse`) or run it with
`--appimage-extract-and-run`.

**Android.** Open the APK from your file manager and allow "Install unknown apps" for that app only.
Export a vault before upgrading, and install over the existing app rather than uninstalling. Details:
`docs/runbooks/android-alpha.md`.

## 3. Your data

Everything you create is local by default. Data leaves your computer only when you enable an online
feature (cloud backup, internet play, Google Docs, an AI provider), and the app explains the
destination first.

| OS      | Data folder                                   |
| ------- | --------------------------------------------- |
| Windows | `%APPDATA%\Lamplight GM\`                     |
| macOS   | `~/Library/Application Support/Lamplight GM/` |
| Linux   | `~/.config/Lamplight GM/`                     |

To reset the workspace: export a local backup if you may need it, quit the app, delete that folder,
and relaunch. That does not delete an online account, its encrypted cloud copy, or keys held by the
operating system's credential manager; remove those from Settings → Account and Settings → AI &
tools first. When upgrading from v0.2.0, the first launch moves the old vault into the app's new
secure storage origin, keeps the old copy, and retries if interrupted; locally connected folders must
be reconnected once.

## 4. Alpha caveats

- Desktop installers are unsigned, hence the one-time prompts.
- The desktop app checks GitHub Releases for updates from Settings → About and installs only when
  you choose to restart; unsigned builds cannot verify a package signature yet, so a download may
  report an honest failure. Reinstalling from the Releases page keeps your data.
- Cloud backup is a recovery copy, not device sync by itself. Export a recovery key from Settings →
  Sync & privacy and keep a local vault backup, which unlike the cloud copy includes your media.
- Found a bug? Send it along with your OS and what you were doing. That feedback is what this alpha
  is for.
