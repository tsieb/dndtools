# RC-ENG-8.16 run journal

## Scope

B2-2 of the RC-ENG-8.3 second run: every new screen was GM-only and nothing in the app could change
a scene's visibility, so only seeded scenes could ever be shown to players. Acceptance: an e2e on
both profiles builds a screen from a template on a fresh vault, shares it, starts a session on it,
and a joined player's stage shows it. No agents, dispatcher mutations, push or promotion.

## Attempt 1 (2026-10-24, base `3cbf4b7cc` = `loop/rc`)

The story was already implemented on `loop/rc`. RC-ENG-8.3 fixed its own finding on its branch,
and the operator kept the files and widened that claim on 2026-10-17 (RC-ENG-8.3 journal,
attempt 13; `docs/planning/EARLY_ACCESS.md` §7):

- `f1b81db8a`: Scene details (`SceneMetaPanel.tsx`) has a "Who can see this screen" select
  (`sceneEditor.whoCanSee*` in en/es). Its Save writes the visibility first through
  `useScreenActions().setVisibility`, which dispatches `scene.update-metadata` with `{ visibility }`
  (`screens/screen/useScreens.ts`). `useSceneCommands.saveMetadata` still sends no visibility, so
  the two writes cannot clobber each other.
- `0033dd551` and `d1b4e6e4d` (the Start-dialog half, filed again as RC-ENG-8.19): `Lifecycle.tsx`
  shows a visible reason when the screen is GM-only (`session.start.gmOnly`), wired to the disabled
  "Show … to the table" box with `aria-describedby`. A "Share with players" action
  (`session.start.share`) shares the screen, moves focus to the box, and posts a status
  (`session.start.shared`). All three strings are in en and es. The field is withheld on the home
  screen, the Session screen and the Command Center home.
- `tests/e2e/screen-visibility.spec.ts`: "a screen made from a template can be shared and a joined
  player sees it" is this story's acceptance, step for step. It covers a fresh vault, a Combat scene
  template, Scene details → Players, when you show it → Save, Start session with the box enabled and
  checked, and a player joining over the fake LAN whose `player-stage` names the screen.

Nothing in the app needed changing, and nothing did change.

## Evidence

- `DNDTOOLS_E2E_PORT=43423 npx playwright test tests/e2e/screen-visibility.spec.ts
--project=desktop-chromium --project=mobile-chromium --repeat-each=3`: 18 passed, 0 failed
  (42.6s), all three tests ×3 on each profile. Log: `/tmp/rc-eng-8-16/e2e.log`.

## Needs operator

- Nothing in the code. The store entry for RC-ENG-8.16 was still `proposed` when RC-ENG-8.3 landed,
  and its Owns still carries the three non-path tokens (`useScreens.ts:194`,
  `scene.update-metadata`, `visibility`). Both are dispatcher state, which this run does not edit.
