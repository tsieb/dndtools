# Android/desktop install

Choose the screen that suits your table. Lamplight has a browser app, a desktop shell, and an Android shell; release availability depends on the build you have been given.

## Desktop

Use the installer supplied with your Lamplight release for your operating system. Close the running app before installing an upgrade, then reopen it and check that your vault is present. Keep a vault export before changing devices or replacing an installation.

In the packaged desktop app, the App updates panel in Settings lets you check, download, and install an update explicitly. Wait for a break in play before installing. Some builds, including Linux distribution packages and development builds without an update feed, do not offer those buttons; use the distribution method that supplied your build. If verification fails, read the reported reason and keep the current version.

## Android

The Android shell requires Android 7.0 or later. If your release provides an APK, transfer it to the device, open it with Android's installer, and follow the device's install prompts. For an update, install over the existing app using a build from the same signing source. If Android refuses it, retain the existing installation and check with the release provider before removing anything.

Open Lamplight and confirm your vault after installation. Native exports use Android's share or save chooser; complete that chooser to keep the file. The Android map editor drops the precision geometry tools for a touch-first canvas; author that geometry on desktop.

## Browser installation and offline use

If your browser offers installation for the Lamplight site, use that control to add the app to your device. Installation does not move a vault from another browser profile or desktop installation.

Open the screens you expect to use while online before going offline. The app caches its shell, but screens loaded later are available offline only after they have been fetched. Cloud connections and hosted services still need a network. Try an offline reopen before depending on it at the table. Accept the update reload prompt between sessions.

## Implementation references

Source review: 2026-09-12, repository baseline `b54cf4c7` (app 0.3.7). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [electron-builder.yml](../../apps/gm-react/electron-builder.yml)
- [AppUpdates.tsx](../../apps/gm-react/src/screens/settings/AppUpdates.tsx)
- [build.gradle](../../apps/gm-react/android/app/build.gradle)
- [service-worker.js](../../apps/gm-react/src/sw/service-worker.js)
- [pwa-offline.spec.ts](../../apps/gm-react/tests/e2e/pwa-offline.spec.ts)

Additional source check: 2026-09-20, task baseline `45f59ee4` (app 0.3.7).

- [variables.gradle](../../apps/gm-react/android/variables.gradle)
