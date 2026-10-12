# Getting started

Bring one scene, a few notes, and the people at your table. You can add the rest as you go.

## Set up your vault

A vault is the campaign stored on this device. On first launch, choose **Get started**. Use the sample vault to explore, or start fresh for your own world. Choose a privacy mode, read its explanation, and finish the confirmation shown on screen. Setup needs this choice before it can close.

Pick the amount of detail you want on screen and work through the remaining setup steps. You can change the experience level later in Settings. Start small if you are learning; advanced authoring does not need to be part of your first evening.

Each campaign can live in its own vault. To add one or switch between them, open **Local vaults**: the campaign card near the top of the sidebar, the button at the top of the narrow rail, or **More** on a phone.

The first row in **Local vaults** is **Explore the demo campaign**, marked **Demo**: a finished campaign to borrow ideas from. It stays on this device. It is never synced or backed up, and it can't host or join a table. While the demo is open, the campaign card and the rail button show the **Demo** badge too. Inside the demo, **Start my own campaign** creates a new, empty campaign and opens it on its Command Center, **Back to my campaign** returns to the one you had, and **Reset the demo** puts it back the way it started.

To add a campaign of your own, choose **New campaign**, type its name and choose **Create and open**. The new vault opens straight away with nothing in it but that name. Your other vaults are untouched.

## Your first session

A new campaign's **Command Center** opens on a short guide called **Your first session**. It lists six things to do before your first evening at the table, in the order most GMs need them:

1. **Name your campaign.** Reopens the first setup step, where you type the name.
2. **Add your party.** Add players by name in **Settings → Players**, or import characters.
3. **Add a map or a note.** Opens the new map form or a new note.
4. **Build a screen from a template.** Opens **New screen** in the Screens library.
5. **Try a session in Standby.** Roll a die or add a combatant on **Session**. Nothing in Standby is recorded.
6. **Invite players or open the player view.** Start a session to send each player a view, or invite them from **Settings → Players**.

A row is ticked when your campaign shows it was done, wherever you did it, so following a link alone never ticks it. Once all six are done, the guide shrinks to one line.

To hide the guide, choose **Hide guide**. The same list stays in **Help → Getting started**, and **Show the guide on the Command Center** puts it back.

## Find your table

**Command Center** is your starting point. **GM screen** holds the widgets you want beside you. **Session** holds live play; **Characters**, **Maps**, and **Notes** hold your material. On a phone, use **More** for destinations that do not fit in the bottom bar. Your chosen game system may use a different name for the GM.

Open **Help** for the first-session guide, these guides, and what changed in the latest release. It is the Help button in the top bar, or the Help row just above the tab bar on a phone. Help opens on the guide for the screen you are on; **All help topics** goes back to the full list. To prepare your first evening, read **Running a session**. If people are joining from their own devices, read **Remote play** too.

<!-- keyboard -->

With a keyboard, press Ctrl+K (⌘K on a Mac) to search for any screen, character, map or note, and press ? for the list of keyboard shortcuts.

<!-- touch -->

On a phone, tap **Search** in the top bar to find any screen, character, map or note.

## Keep a copy

Before moving devices, use the vault export controls in **Settings → Backup & history**. Keep the exported file somewhere you can find again. Signing in alone is not proof that your campaign or its map images have been backed up. The **Privacy modes** guide explains cloud recovery keys.

## Implementation references

Source review: 2026-09-12, repository baseline `b54cf4c7` (app 0.3.7). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [Onboarding.tsx](../../apps/gm-react/src/app/Onboarding.tsx)
- [nav.ts](../../apps/gm-react/src/app/nav.ts)
- [onboarding-consent.spec.ts](../../apps/gm-react/tests/e2e/onboarding-consent.spec.ts)

Additional source check: 2026-09-20, task baseline `45f59ee4` (app 0.3.7).

- [HelpMenu.tsx](../../apps/gm-react/src/app/help/HelpMenu.tsx)
- [TopBar.tsx](../../apps/gm-react/src/app/shell/TopBar.tsx)
- [Footer.tsx](../../apps/gm-react/src/app/shell/Footer.tsx)
- [help-guides.spec.ts](../../apps/gm-react/tests/e2e/help-guides.spec.ts)

Vault switching check: 2026-09-23, merged `loop/rc` `74b4fb64` (RC-UX-5.4).

- [VaultSwitcher.tsx](../../apps/gm-react/src/app/shell/VaultSwitcher.tsx)
- [Sidebar.tsx](../../apps/gm-react/src/app/shell/Sidebar.tsx)
- [RailNav.tsx](../../apps/gm-react/src/app/shell/RailNav.tsx)
- [MoreSheet.tsx](../../apps/gm-react/src/app/shell/MoreSheet.tsx)

Guides added in RC-UX-6.6 (2026-10-04, base `9a7b675d`), which Help opens for their own screens:

- [screens.md](screens.md)
- [characters.md](characters.md)
- [notes.md](notes.md)
- [settings.md](settings.md)

First-session guide: 2026-10-10, RC-UX-6.3.

- [onboarding.ts](../../packages/core/src/state/onboarding.ts) (`resolveFirstSessionGuide`)
- [GettingStartedBody.tsx](../../apps/gm-react/src/app/widgets/builtin/GettingStartedBody.tsx)
- [first-session-guide.spec.ts](../../apps/gm-react/tests/e2e/first-session-guide.spec.ts)

Vault switcher that explains itself: 2026-10-12, RC-UX-6.8.

- [VaultSwitcher.tsx](../../apps/gm-react/src/app/shell/VaultSwitcher.tsx)
- [local-vaults.spec.ts](../../apps/gm-react/tests/e2e/local-vaults.spec.ts)
- [demo-vault.spec.ts](../../apps/gm-react/tests/e2e/demo-vault.spec.ts)
