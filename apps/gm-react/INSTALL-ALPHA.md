# DND Tools GM — Alpha Install Guide

Thanks for helping test **DND Tools GM**, an offline Game-Master workspace for tabletop RPGs. It runs
entirely on your machine — **no account, no internet required** — and opens into a ready-to-explore
sample campaign so you can poke around immediately.

These alpha builds are **not code-signed**, so Windows, macOS, and Linux will show a one-time security
prompt the first time you open the app. That's expected for an unsigned alpha; the steps below get you
past it.

---

## 1. Download the right file

Grab the latest build from the project's **GitHub Releases** page and pick the file for your machine:

| Your machine | File to download |
| --- | --- |
| **Windows** (10/11, 64-bit) | `DND-Tools-GM-<version>-x64.exe` |
| **Mac — Apple Silicon** (M1/M2/M3/M4) | `DND-Tools-GM-<version>-arm64.dmg` |
| **Mac — Intel** | `DND-Tools-GM-<version>-x64.dmg` |
| **Linux** (x64) | `DND-Tools-GM-<version>-x86_64.AppImage` |

> Not sure which Mac you have? Apple menu →  **About This Mac**. "Apple M…" = Apple Silicon; "Intel" = Intel.

---

## 2a. Install on Windows

1. Double-click the downloaded `DND-Tools-GM-<version>-x64.exe`.
2. **You'll see a blue "Windows protected your PC" (SmartScreen) box** — this appears for any app that
   isn't code-signed yet, not because anything is wrong. Click **More info**, then **Run anyway**.
3. The installer opens. Pick a location (the default is fine — it installs just for your user, so there's
   no admin password prompt) and click **Install**. It adds a **Start-menu** and **desktop** shortcut and
   launches when done.
4. To remove it later: **Settings → Apps → Installed apps → DND Tools GM → Uninstall** (or "Add or remove
   programs"). Your saved data isn't touched by uninstalling — see the reset section below to clear it.

## 2b. Install on macOS

1. Open the downloaded `.dmg` and drag **DND Tools GM** into your **Applications** folder.
2. **First launch:** in Applications, **right-click** (or Control-click) **DND Tools GM → Open**, then click
   **Open** in the dialog. This is only needed once — after that you can open it normally.
   - Doing it this way (instead of double-clicking) is what lets an unsigned app through Gatekeeper's
     "unidentified developer" block.
3. **If macOS says the app "is damaged and can't be opened"** (this can happen on Apple Silicon because
   the download gets a quarantine flag), open **Terminal** and run:
   ```sh
   xattr -cr "/Applications/DND Tools GM.app"
   ```
   Then open the app again with right-click → Open. It's not actually damaged — this just clears the
   quarantine flag an unsigned build can't clear on its own.

## 2c. Install on Linux

1. Make the AppImage executable:
   ```sh
   chmod +x DND-Tools-GM-*-x86_64.AppImage
   ```
2. Run it — double-click in your file manager, or from a terminal:
   ```sh
   ./DND-Tools-GM-*-x86_64.AppImage
   ```
3. **If it fails to start with a FUSE error**, either install FUSE 2…
   - Debian/Ubuntu: `sudo apt install libfuse2`
   - Fedora: `sudo dnf install fuse`
   …**or** skip FUSE entirely by running:
   ```sh
   ./DND-Tools-GM-*-x86_64.AppImage --appimage-extract-and-run
   ```

---

## 3. Your data — where it lives & how to reset

Everything you create stays **on your computer only**. Nothing is uploaded.

| OS | Data folder |
| --- | --- |
| Windows | `%APPDATA%\DND Tools GM\` (paste that into the File Explorer address bar) |
| macOS | `~/Library/Application Support/DND Tools GM/` |
| Linux | `~/.config/DND Tools GM/` |

**To wipe everything and start fresh:** fully quit the app, delete that folder, and relaunch — the sample
campaign will re-seed automatically.

---

## 4. Good to know (alpha caveats)

- **Unsigned build** — hence the one-time security prompt above. A signed release will remove it later.
- **No auto-update yet** — when a new build is announced, download it from the Releases page and reinstall
  (your local data in the folder above is untouched by reinstalling).
- Found a bug or something confusing? Please send it along with your OS and what you were doing — that
  feedback is exactly what this alpha is for. 🎲
