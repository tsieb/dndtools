---
name: onboarding-viewas-cluster
description: App-shell chrome cluster — Onboarding, ViewAsControl, CommandPalette, ProjectionControl, SceneDisplayOverlay, screen-kit, Join. FIXED-vs-OPEN split re-verified 2026-07-30 @ 33651613 (run #15).
metadata:
  type: project
---

Cluster = `src/app/{Onboarding,CommandPalette,ProjectionControl,ViewAsControl,SceneDisplayOverlay,
screen-kit}.tsx` + `src/screens/Join.tsx`. Re-verified on `auto/visual-review-loop` @ `33651613`.
Re-check by grepping the anchor string, not the line number.

## FILE LOCATIONS
App-level palette = `src/app/CommandPalette.tsx` (273 ln, wraps the DS one). There is NO
`app/CommandPalette.jsx`; the DS component is `src/ds/components/command/CommandPalette.jsx`.

## FIXED — do NOT re-report (verified @ 33651613)
- **ViewAsControl**: roving Arrow/Home/End (`:134-155`), `role="separator"` (`:179`),
  `role="presentation"` MenuLabel, `role="menuitemradio"`+`aria-checked` (`:262-263`), Tab dismisses
  with `close(true)` (`:125-132`), `maxHeight:'min(70vh,420px)'`+`overflowY:auto`, MenuItem hover.
- **SceneDisplayOverlay**: `advance()`/`clear()` share `dispatchDisplay` with try/catch + result check
  (`:127-154`); second-screen button soft-disabled (`:206`) and handles `window.open` → null (`:219`).
- **ProjectionControl**: `setWorkflow` try/catch (`:65-79`); Go live / End uses `aria-disabled` + a
  reason `title`/`aria-label` for BOTH blocked cases (`:107-133`); `WORKFLOW_LABEL` now exported so
  `/session` names the state identically.
- **Onboarding**: `skip()` persists tier/AI/party (`:305-321`); Escape-from-a-text-field guarded
  (`:487-500`); step-change focus goes to the panel, not "Skip setup".
- **CommandPalette**: "Build encounter" carries `{createEncounter:true}` (`:210`).
- **`Icon 'dm-only' → 'VenetianMask'`** (`Icon.jsx:324`) — no longer collides with
  `visibility-players`. Only `visibility-players` (`:327`) and `eye` (`:377`) still both map to `Eye`.
- `isolateModalSiblings` no longer inerts the ToastViewport.

## PREMISE CORRECTIONS / verified NON-defects
- `Button.jsx:26,:74` `onClick={soft ? undefined : onClick}` — `aria-disabled` REALLY swallows clicks.
- Playwright 1.61 `toBeDisabled()` honours `aria-disabled` ⇒ converting Onboarding's Continue to the
  soft form does NOT break `onboarding-consent.spec.ts:66`.
- `ds/command/CommandPalette.jsx:22` explicitly does NOT portal, so `app/CommandPalette.tsx:248-254`'s
  bubbling-`onInput` mirror is sound and `searchVaultForActor` really runs.
- `SceneDisplayOverlay.tsx:90-92`'s `offsetParent !== null` filter does NOT break the Tab trap (the
  fixed bar's BUTTONS are static children with a non-null offsetParent).
- There is NO `<iframe>` in gm-react. Global `:focus-visible` ring: `styles/tokens/base.css:36-38`.
- `Onboarding.tsx:554`/`:699` and `CommandPalette` inline `outline:'none'` are non-defects
  (`tabIndex=-1` scroll panes / borderless autofocused search input).

## STILL OPEN @ 33651613 — ranked (run #15)
1. **`Onboarding.tsx:1243` Continue is HARD-`disabled` with the reason unreachable.**
   `disabled={step.id==='privacy' && !privacyDecided}` where `privacyDecided = privacy !== null &&
   ackOk` (`:291`), but the label (`:1245-1249`) only special-cases `privacy === null`. Pick E2EE +
   mistype the ack ⇒ plain greyed "Continue", out of the tab order, no title. The ack `Input`
   (`:882-889`) has no `aria-invalid`/`aria-describedby`/error text, plus a `maxLength` that blocks
   over-typing. Dead end on the one ADR-026 step that cannot be skipped.
   ⚠️ `responsive.spec.ts:158` pins `'Get started'|'Continue'|'Enter Command Center'` EXACTLY — keep
   "Continue" as a prefix.
2. **`Onboarding.tsx` has ZERO `aria-live`/`role=status`/`aria-current`** (grep-verified: 0 hits in
   1272 lines). Desktop step rail `aria-hidden`, phone indicator + "Step {i+1} of {N}" (`:1235-1237`)
   inert, step-change focus lands on a roleless `tabIndex={-1}` div, and "Clearing vault…" /
   "Restoring sample…" (`:1259-1266`) is unannounced. Advancing the wizard announces NOTHING.
3. **`SceneDisplayOverlay.tsx:181` measured contrast failure.** The control bar hard-codes
   `background:'rgba(6,9,14,0.72)'` over `#05070c` with `border:'1px solid rgba(255,255,255,0.14)'`,
   and "Clear display" (`:196`) + "Second screen" (`:200`) are `ghost` Buttons =
   `--color-text-secondary` (`Button.jsx:61-64`), which in parchment is `#5c4a39` (`colors.css:160`)
   ⇒ **≈2.4:1**. Under `forced-colors:active` the token → `CanvasText` (`colors.css:378`) while the
   bar keeps its literal rgba ⇒ black-on-black in HC light. Fix: theme the bar with a surface token
   (or scope a dark colour-scheme) + `variant="secondary"`. `scene-cards.spec.ts:133,212,223` match
   by NAME only — spec-safe.
4. **`Onboarding.tsx:1141-1151` the checklist `aria-label` ERASES the done state.** The label replaces
   the whole button subtree, so the check glyph (`:1179`) and `line-through` (`:1186`) — the ONLY done
   signals — are never announced. Append `— done` / `— not started`.
5. **`Onboarding.tsx:517-537`** is still the ONLY full-screen `aria-modal` overlay that neither locks
   body scroll nor calls `isolateModalSiblings` (contrast `MapEditor:183`, `SceneDisplayOverlay:76`,
   `Dialog.jsx:71-72`). Its Tab trap (`:504-515`) also lacks the `offsetParent` visibility filter.
6. **`ProjectionControl.tsx:106` the compact "End live session" icon is `audio-off`** (`Icon.jsx:360`
   → Lucide `VolumeX`). Compact suppresses the label (`:141`) AND the status pill (`:84`), so a
   muted-speaker glyph is the ONLY visual for the app's most consequential control, and
   Standby/Prep/Paused/Recap are indistinguishable. Fix: a stop/power glyph + fold `WORKFLOW_LABEL`
   into the compact `aria-label`.
7. **Hard-disable-on-own-click drops focus to `<body>`:** `SceneDisplayOverlay:189` "Next card"
   (`disabled={queuedCount===0}`) + `:196` "Clear display" (`disabled={!display.active}`) — inside a
   focus trap, so focus lands on the trapped `<body>`. The same file already does it right at `:206`.
   `Onboarding:1143` checklist rows + `:1256` finish (`disabled={wiping}`).
8. **`SceneDisplayOverlay` has NO pointer entry point.** `grep setDisplayOpen` → exactly
   `AppShell.tsx:986/:1029/:1066` (the Ctrl/Cmd+Shift+S hotkey and a close). No button, no menu row,
   no palette command ⇒ unreachable on phone/tablet, undiscoverable on desktop.
   `scene-cards.spec.ts:133` opens it by hotkey, so ADDING a launcher is spec-safe.
9. **`Onboarding.tsx:381-392`** — `writeStorage(VAULT_CHOICE_KEY,'fresh')` runs BEFORE
   `resetCoreStorage()`, whose failure is a bare `catch {}` followed by an unconditional
   `reloadAtRoute(to)`. A failed wipe tells the user they started fresh, keeps all their data, AND
   suppresses the sample seed forever.
10. **`ViewAsControl.tsx:182/:188`** — "Any player" (`visibility-players`) and "Observer" (`eye`)
    render the SAME Lucide `Eye`, in the control that decides what a player can see. `:113`
    `role="menu"` has no `aria-label`; the trigger has no `aria-controls`.
    `graph.spec.ts:97,:179` match a DIFFERENT control ⇒ icon changes are spec-safe.
11. **`CommandPalette.tsx:153-161` `new:scene` is the only Create launcher with no intent**
    (`goTo('/scenes')` vs `{create:true}` everywhere else). `command-palette.spec.ts:178-179` matches
    the option NAME only ⇒ safe. `:183` "New note" keywords carry `quest thread lore location place
    handout journal wiki`, so ⌘K "quest"/"handout" mis-route to `/knowledge`; `:191` `new:map`
    duplicates `location place`.
12. `Onboarding.tsx:826-832`/`:892-898` — `role="radiogroup"` wraps the step `<h2>` and `<p>`, so the
    group owns non-radio content. `screen-kit.radioGroupKeyDown` (`:22-32`) still has no Home/End and
    no disabled filter, unlike its siblings `Seg` (`:205-215`) and `Tabs` (`:80-91`).
13. `Onboarding.tsx:184-247` `ChoiceCard` is a `role="radio"` containing the title, a "Recommended"
    Badge AND a ~50-word desc ⇒ each of the six first-run cards announces its whole paragraph as its
    name. `responsive.spec.ts:524` matches with a REGEX ⇒ an `aria-label={title}` +
    `aria-describedby` split is spec-safe. It also has NO hover.
14. Raw z-index hygiene (not a paint bug): `ViewAsControl:110/161` (40/50), `SceneDisplayOverlay:165/
    174` (120/121), `Onboarding:529` (400) use raw numbers while `--z-*` tokens exist.

## STILL OPEN — screen-kit.tsx (shared primitive)
- `radioGroupKeyDown` (`:22-32`) — see item 12.

## STILL OPEN — Join.tsx
- `:192-196` "Try again" unmounts itself (the effect sets `phase:'loading'`, dropping both the
  `role="alert"` and the button) ⇒ focus to `<body>`. `join.spec.ts:62` pins the name `Try again`, so
  keeping it mounted / refocusing is spec-safe; renaming is not.

See also [[map-editor-cluster]], [[ds-layer-audit]].
