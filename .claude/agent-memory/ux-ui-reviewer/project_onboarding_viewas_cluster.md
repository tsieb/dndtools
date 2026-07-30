---
name: onboarding-viewas-cluster
description: App-shell chrome cluster — Onboarding, ViewAsControl, CommandPalette, ProjectionControl, SceneDisplayOverlay, screen-kit, Join. FIXED-vs-OPEN split re-verified 2026-07-30 @ 45adf828 (run #13).
metadata:
  type: project
---

Cluster = `src/app/{Onboarding,CommandPalette,ProjectionControl,ViewAsControl,SceneDisplayOverlay,
screen-kit}.tsx` + `src/screens/Join.tsx`. Re-verified on `auto/visual-review-loop` @ `45adf828`.
Re-check by grepping the anchor string, not the line number.

## FILE LOCATIONS
The app-level palette is `src/app/CommandPalette.tsx` (273 ln, wraps the DS one). There is NO
`src/app/CommandPalette.jsx` — the DS component is `src/ds/components/command/CommandPalette.jsx`.

## FIXED — do NOT re-report (verified @ 45adf828)
- **ViewAsControl is largely correct now**: roving Arrow/Home/End (`:134-155`), `role="separator"`
  (`:179`), `role="presentation"` on MenuLabel (`:230`), `role="menuitemradio"` + `aria-checked`
  (`:262-263`), Tab dismisses with `close(true)` (`:125-132`), `maxHeight:'min(70vh,420px)'` +
  `overflowY:auto`, hover on MenuItem (`:255,:277`).
- **SceneDisplayOverlay**: `advance()`/`clear()` now share `dispatchDisplay` with try/catch + result
  check (`:127-154`); the second-screen button is soft-disabled (`:208`) and handles `window.open`
  returning null (`:219-222`).
- **ProjectionControl**: `setWorkflow` has try/catch (`:65-77`); the Go live / End button uses
  `aria-disabled` + a reason `title`/`aria-label` for BOTH blocked cases (`:109-131`).
- **Onboarding**: `skip()` persists tier/AI/party (`:310-319`); Escape-from-a-text-field is guarded
  (`:487-498`); the checklist rows carry a consequence-naming `aria-label` (`:1147-1151`);
  step-change focus goes to `contentRef`, not "Skip setup" (`:295-298`).
- **CommandPalette**: "Build encounter" carries `{createEncounter:true}` (`:210`).
- **`isolateModalSiblings` no longer inerts the ToastViewport** (fixed at 9aeebdde).

## PREMISE CORRECTIONS / verified NON-defects (save future runs the hunt)
- **`Button.jsx:26,:74` — `onClick={soft ? undefined : onClick}`. `aria-disabled` REALLY swallows the
  click.** The soft-disable is a genuine fix everywhere, not a fake one.
- **Playwright 1.61's `toBeDisabled()` honours `aria-disabled`**, so converting Onboarding's Continue
  from hard `disabled` to the soft form does NOT break `onboarding-consent.spec.ts:66`.
- **`ds/command/CommandPalette.jsx:22` explicitly does NOT portal** ("Renders inline … no portal, no
  ReactDOM dep"), so `app/CommandPalette.tsx:248-254`'s bubbling-`onInput` mirror is sound and
  `searchVaultForActor` really runs. Not a dead integration.
- **`SceneDisplayOverlay.tsx:90-92`'s `offsetParent !== null` filter does NOT break the Tab trap.**
  The control bar is `position:fixed` (offsetParent null) but its BUTTONS are static children whose
  offsetParent is that bar — non-null. The trap works.
- There is NO `<iframe>` anywhere in gm-react. Global `:focus-visible` ring lives at
  `styles/tokens/base.css:36-38` — never report a missing focus ring without checking there.

## TOP OF QUEUE @ 45adf828 (run #13)
1. **HIGH `SceneDisplayOverlay.tsx:182/:198/:173/:165` — measured contrast failure.**
   The control bar hard-codes `background:'rgba(6,9,14,0.72)'` over `#05070c` with
   `border:'1px solid rgba(255,255,255,0.14)'`, and "Clear display" + "Second screen" are `ghost`
   Buttons = `--color-text-secondary`. In parchment that token is `#5c4a39` (`colors.css:160`) ⇒
   **≈2.4:1** (needs 4.5:1). Under `forced-colors: active`, `--color-text-secondary → CanvasText`
   (`colors.css:378`) while the bar keeps its literal rgba ⇒ black-on-black in HC light. Fix: theme
   the bar with a surface token (or scope it to a dark colour-scheme) and use `variant="secondary"`.
   `scene-cards.spec.ts:133,212,223` match by NAME only — spec-safe.
2. **HIGH `Onboarding.tsx:1243` Continue is HARD-`disabled` with the reason unreachable.**
   `disabled={step.id==='privacy' && !privacyDecided}` but the label (`:1245-1249`) only special-cases
   `privacy === null`. Pick E2EE + mistype the ack ⇒ plain greyed "Continue", out of the tab order, no
   title. The ack `Input` (`:880-887`) has no `aria-invalid`/`aria-describedby`/error text and a
   `maxLength` that blocks over-typing. Dead end on the one ADR-026 step that cannot be skipped.
   ⚠️ `responsive.spec.ts:158` pins `'Get started' | 'Continue' | 'Enter Command Center'` EXACTLY —
   keep "Continue" as a prefix. `onboarding-consent.spec.ts:66` is safe (see NON-defects).
3. **HIGH `Onboarding.tsx:1147-1151` the checklist `aria-label` ERASES the done state.** The label
   replaces the whole button subtree, so the check glyph (`:1179`) and the `line-through` (`:1186`) —
   the ONLY done signals — are never announced. Append `— done`/`— not started`.
4. **HIGH `Onboarding.tsx` still has ZERO `aria-live`/`role=status`/`aria-current`** (grep-verified: 0
   hits in 1272 lines). Desktop step rail `:607-611` is `aria-hidden="true"`; the phone indicator
   `:601-605` and "Step {i+1} of {N}" `:1235-1237` are inert text; step-change focus (`:296-298`)
   lands on a roleless `tabIndex={-1}` div. Advancing the wizard announces NOTHING.
5. **MED-HIGH `Onboarding.tsx:519-537`** is still the ONLY full-screen `aria-modal` overlay that
   neither locks body scroll nor calls `isolateModalSiblings`. Contrast `MapEditor.tsx:183`,
   `SceneDisplayOverlay.tsx:76`, `Dialog.jsx:71-72`. Its Tab trap (`:505`) also lacks the
   `offsetParent` visibility filter the other two traps have.
6. **MED-HIGH NEW `ProjectionControl.tsx:104` the compact "End live session" icon is `audio-off`**
   (`Icon.jsx:356` → Lucide `VolumeX`). On a phone the label is suppressed (`:139`) AND the status
   pill is hidden (`:82`), so a muted-speaker glyph is the ONLY visual for the app's most consequential
   control, and Standby/Prep/Paused/Recap are indistinguishable. Fix: a stop/power glyph + fold
   `WORKFLOW_LABEL` into the compact `aria-label`. (`canvas.spec.ts:548` matches a DIFFERENT control.)
7. **MED-HIGH — hard-disable-on-own-click drops focus to `<body>`:** `SceneDisplayOverlay.tsx:191`
   "Next card" + `:198` "Clear display" (the same file already does it right at `:208`);
   `Onboarding.tsx:1143` checklist rows + `:1256` finish (`disabled={wiping}`).
8. **MED `SceneDisplayOverlay` has NO pointer entry point.** `grep setDisplayOpen` across `src/app/`
   returns exactly two setters, both in `AppShell.tsx` (`:1031` the Ctrl/Cmd+Shift+S hotkey with an
   `isTyping` guard, `:1056` a close). No button, no menu row, no palette command ⇒ unreachable on
   phone/tablet, undiscoverable on desktop. `scene-cards.spec.ts:133` opens it by hotkey, so ADDING a
   launcher is spec-safe.
9. **MED `ViewAsControl.tsx:178/:182/:190` — "DM view", "Any player" and "Observer" render the SAME
   Lucide Eye glyph** (`Icon.jsx:320 'dm-only':'Eye'`, `:323 'visibility-players':'Eye'`,
   `:373 'eye':'Eye'`). Three of seven rows are indistinguishable in the control that decides what a
   player can see. `graph.spec.ts:97,:179` match `getByRole('radio',{name:'DM view'})` — a different
   control, so icon changes are spec-safe. Also open: `:112-113` `role="menu"` has no `aria-label`,
   trigger has no `aria-controls`.
10. **MED `CommandPalette.tsx:153-161` `new:scene` is still the only Create launcher with no intent**
    (`goTo('/scenes')` vs `{create:true}` everywhere else) and `screens/ScenesCreator.tsx` has no
    `location.state` reader. `command-palette.spec.ts:178-179` matches the option NAME only ⇒ safe.
    `:179-185` "New note" keywords carry `quest thread lore location place handout journal wiki`, so
    ⌘K "quest" and ⌘K "handout" mis-route to `/knowledge`; `:191` `new:map` duplicates `location place`.
11. **MED-LOW `Onboarding.tsx:826-832`/`:892-898`** — `role="radiogroup"` wraps the step `<h2>` and its
    `<p>`, so the group owns non-radio content. `screen-kit.radioGroupKeyDown` (`:22-32`) still has no
    Home/End and no disabled filter, unlike its siblings `Seg` (`:205-215`) and `Tabs` (`:80-91`).
12. **MED-LOW `Onboarding.tsx:385-392`** — `writeStorage(VAULT_CHOICE_KEY,'fresh')` runs BEFORE
    `resetCoreStorage()`, whose failure is a bare `catch {}` followed by an unconditional
    `reloadAtRoute`. A failed wipe tells the user they started fresh, keeps all their data, and
    suppresses the sample seed forever.
13. **LOW `Onboarding.tsx:184-247` `ChoiceCard` is a `role="radio"`** containing the title, a
    "Recommended" Badge AND a ~50-word desc ⇒ each of the six first-run cards announces its whole
    paragraph as its name. `responsive.spec.ts:524` matches with a REGEX ⇒ an `aria-label={title}` +
    `aria-describedby` split is spec-safe. It also has NO hover (`:191-204`).
14. **LOW — raw z-index hygiene** (not a live paint bug): `ViewAsControl:110/161` (40/50),
    `SceneDisplayOverlay:165/174` (120/121), `Onboarding:529` (400) use raw numbers while `--z-*`
    tokens exist. `--z-titlebar` and `--z-sticky` have ZERO consumers.

## STILL OPEN — screen-kit.tsx (shared primitive)
- `BackBar` (`:254-271`) `padding: 0` ⇒ ~17px tall button, WCAG 2.5.8. Only 2 real consumers
  (`Upgrade.tsx:234`, `Knowledge.tsx:446`) — `Characters.tsx:246` defines its OWN local `BackBar`.
- `radioGroupKeyDown` (`:22-32`) — see item 11.

## STILL OPEN — Join.tsx
- `:192-196` "Try again" unmounts itself (the effect sets `phase:'loading'`, dropping both the
  `role="alert"` and the button) ⇒ focus to `<body>`. `join.spec.ts:62` pins the name `Try again`, so
  keeping it mounted / refocusing is spec-safe; renaming is not.

See also [[map-editor-cluster]], [[ds-layer-audit]].
