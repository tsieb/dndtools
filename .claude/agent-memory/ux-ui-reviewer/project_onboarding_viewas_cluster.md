---
name: onboarding-viewas-cluster
description: App-shell chrome cluster — Onboarding, ViewAsControl, CommandPalette, ProjectionControl, SceneDisplayOverlay, screen-kit, Join. FIXED-vs-OPEN split re-verified 2026-07-31 @ e702bb6f (run #21).
metadata:
  type: project
---

Cluster = `src/app/{Onboarding,CommandPalette,ProjectionControl,ViewAsControl,SceneDisplayOverlay,
screen-kit}.tsx` + `src/screens/Join.tsx`. Re-verified on `auto/visual-review-loop` @ `e702bb6f`.
Re-check by grepping the anchor string, not the line number.

## FILE LOCATIONS
App-level palette = `src/app/CommandPalette.tsx` (273 ln). There is NO `app/CommandPalette.jsx`; the
DS component is `src/ds/components/command/CommandPalette.jsx`. Icon registry = `ds/components/core/Icon.jsx`.

## FIXED — do NOT re-report (verified @ e702bb6f)
- **ViewAsControl**: roving Arrow/Home/End, `role="separator"` (`:179`), `role="presentation"`
  MenuLabel (`:230`), `role="menuitemradio"`+`aria-checked`, Tab dismisses with `close(true)`,
  `maxHeight`+`overflowY:auto`, MenuItem hover.
- **SceneDisplayOverlay**: `advance()`/`clear()` share `dispatchDisplay` with try/catch + result check;
  the second-screen button is soft-disabled (`:208`) with a reachable `title`/`aria-label` and handles
  `window.open` → null (`:219-222`).
- **ProjectionControl**: `setWorkflow` try/catch (`:67-79`); Go live / End uses `aria-disabled` + a
  reason `title` AND `aria-label` for BOTH blocked cases (`:111-133`); `WORKFLOW_LABEL` exported.
- **Onboarding**: `skip()` persists tier/AI/party; Escape-from-a-text-field guarded; step-change focus
  goes to the panel; **the ack `Input` now has `aria-invalid` + `aria-describedby` + a `role="alert"`
  mismatch message (`:882-905`)**; Continue is now `aria-disabled` + `title`, not hard-`disabled`.
- **CommandPalette**: "Build encounter" carries `{createEncounter:true}` (`:210`).
- `Icon.jsx:324` `dm-only` → `VenetianMask`.
- `isolateModalSiblings` no longer inerts the ToastViewport.

## PREMISE CORRECTIONS / verified NON-defects
- `Button.jsx:26,:74` `aria-disabled` REALLY swallows clicks; Playwright 1.61 `toBeDisabled()` honours it.
- `ds/command/CommandPalette.jsx:22` explicitly does NOT portal, so `app/CommandPalette.tsx:248-254`'s
  bubbling-`onInput` mirror is sound.
- `SceneDisplayOverlay.tsx:90-92`'s `offsetParent !== null` filter does NOT break the Tab trap.
- There is NO `<iframe>` in gm-react. Global `:focus-visible` ring: `styles/tokens/base.css:36-38`.
- `Onboarding.tsx:554`/`:699` and `CommandPalette` inline `outline:'none'` are non-defects.
- ⚠️ **`getByRole` name matching is SUBSTRING** — `{name:'Continue'}` also matches
  "Choose an option to continue". Keep that in mind before renaming any Onboarding button.

## STILL OPEN @ e702bb6f — ranked (run #21)
1. **`Onboarding.tsx:1263-1281` the Continue fix is HALF done.** When `privacy === null` the LABEL
   self-describes ("Choose an option to continue"); when the user picked Private (E2EE) and mistyped
   the ack, the label falls back to plain **"Continue"** and the only explanation is a hover `title`
   (`:1272`) — unreachable on touch. The visible label and the `title` also disagree in the
   `privacy===null` branch. Fix: give the mistyped-ack state its own label. ⚠️ `responsive.spec.ts:466`
   pins the name "Choose an option to continue" + `toBeDisabled()`, and `:462/:473` click
   `{name:'Continue'}` in states where the label really is "Continue" ⇒ spec-safe.
2. **`Onboarding.tsx` still has essentially NO live regions** — grep for `aria-live|role="status"|
   aria-current` returns ZERO; the only `role="alert"` in 1303 lines is the new ack error (`:897`).
   The desktop step rail is `aria-hidden`, "Step {i+1} of {N}" (`:1254-1256`) is inert, step-change
   focus lands on a roleless `tabIndex={-1}` div, and the finish button's "Clearing vault…" /
   "Restoring sample…" (`:1289-1295`) is announced only because it is the focused button's own label.
   Advancing the wizard announces NOTHING.
3. **`SceneDisplayOverlay.tsx:182` measured contrast failure.** The control bar hard-codes
   `background:'rgba(6,9,14,0.72)'` over `#05070c` with `border:'1px solid rgba(255,255,255,0.14)'`,
   and "Clear display" (`:198`) + "Second screen" (`:201`) are `ghost` Buttons =
   `--color-text-secondary`, which in parchment is `#5c4a39` ⇒ **≈2.4:1**. Under
   `forced-colors:active` the token → `CanvasText` while the bar keeps its literal rgba ⇒
   black-on-black in HC light. Fix: theme the bar with a surface token + `variant="secondary"`.
   `scene-cards.spec.ts:133,212,223` match by NAME only ⇒ spec-safe.
4. **`SceneDisplayOverlay:191/:198` hard-disable inside the focus trap.** "Next card"
   (`disabled={queuedCount===0}`) and "Clear display" (`disabled={!display.active}`) drop focus to the
   trapped `<body>` on their own click. The same file already does the soft form at `:208`, and
   `scene-cards.spec.ts:235-247` explicitly documents this exact fix for a DIFFERENT "Next card"
   instance — ⚠️ that spec asserts `aria-disabled='true'` + `title=/Queue a scene card first/i` +
   `el.disabled === false`, so this instance may already be spec-tracked; check which component the
   spec resolves before touching.
5. **`SceneDisplayOverlay` has NO pointer entry point.** `grep setDisplayOpen` → exactly
   `AppShell.tsx:986/:1029/:1066` (the Ctrl/Cmd+Shift+S hotkey and a close). No button, no menu row,
   no palette command ⇒ unreachable on phone/tablet, undiscoverable on desktop.
   `scene-cards.spec.ts:133` opens it by hotkey ⇒ ADDING a launcher is spec-safe.
6. **`ProjectionControl.tsx:84` compact hides the ENTIRE StatusDot + `WORKFLOW_LABEL` pill**, so on a
   phone Standby / Prep / Paused / Recap / Wrapping up are indistinguishable on the app's most
   consequential control — and `:141` also drops the button text. What remains is one glyph, and
   `:106` picks **`audio-off`** (Lucide `VolumeX`) for "End live session" and `visibility-players`
   (`Eye`) for "Go live" — a muted speaker and an eyeball for a start/stop transport. The compact
   `aria-label` (`:125-133`) also omits the workflow state. Fix: stop/power glyph + fold
   `WORKFLOW_LABEL` into the compact `aria-label`, or keep a dot.
7. **`Onboarding.tsx:1141-1160` the checklist `aria-label` ERASES the done state.** The label
   (`vault==='fresh' ? '${c.label} — clear the sample campaign, finish setup and open ${c.dest}' : …`)
   replaces the whole button subtree, so the check glyph and the `line-through` — the ONLY done
   signals — are never announced. Append "— done" / "— not started". The rows are also
   `disabled={wiping}` (hard) — focus drop on their own click.
8. **`Onboarding.tsx:517-537`** is still the ONLY full-screen `aria-modal` overlay that neither locks
   body scroll nor calls `isolateModalSiblings` (contrast `MapEditor:184`, `SceneDisplayOverlay:76`,
   `Dialog.jsx:71-72`). Its Tab trap also lacks the `offsetParent` visibility filter.
9. **`Onboarding.tsx:381-392`** — `writeStorage(VAULT_CHOICE_KEY,'fresh')` runs BEFORE
   `resetCoreStorage()`, whose failure is a bare `catch {}` followed by an unconditional
   `reloadAtRoute(to)`. A failed wipe tells the user they started fresh, keeps all their data, AND
   suppresses the sample seed forever.
10. **`ViewAsControl.tsx:182/:188`** — "Any player" (`visibility-players`) and "Observer" (`eye`) both
    resolve to Lucide `Eye` (`Icon.jsx:327`, `:377`), in the control that decides what a player sees.
    `:113` `role="menu"` still has no `aria-label`; the trigger has no `aria-controls`.
    `graph.spec.ts:97,:179` match a DIFFERENT control ⇒ icon changes are spec-safe.
11. **`CommandPalette.tsx:155-160` `new:scene` is the only Create launcher with no intent**
    (`goTo('/scenes')` vs `{create:true}` at `:168,:176,:184,:192,:200,:210`). `ScenesCreator.tsx` has
    no `location.state` reader, so this is ~8 lines in two files.
    `command-palette.spec.ts:183-184` matches the option NAME only ⇒ safe. `:183` "New note" keywords
    carry `quest thread lore location place handout journal wiki`, so ⌘K "quest"/"handout" mis-route to
    `/knowledge`; there is no `new:quest` entry; `:191` `new:map` duplicates `location place`.
12. `Onboarding.tsx:826-832`/`:892-898` — `role="radiogroup"` wraps the step `<h2>` and `<p>`, so the
    group owns non-radio content. `screen-kit.radioGroupKeyDown` (`:22-32`) still has no Home/End and
    no disabled filter, unlike its siblings `Seg` (`:205-215`) and `Tabs` (`:80-91`).
13. `Onboarding.tsx:184-247` `ChoiceCard` is a `role="radio"` containing the title, a "Recommended"
    Badge AND a ~50-word desc ⇒ each of the six first-run cards announces its whole paragraph as its
    name. `responsive.spec.ts:524` matches with a REGEX ⇒ an `aria-label={title}` + `aria-describedby`
    split is spec-safe. It also has NO hover.
14. Raw z-index hygiene: `ViewAsControl:110/161` (40/50), `SceneDisplayOverlay:165/174` (120/121),
    `Onboarding:529` (400) use raw numbers while `--z-*` tokens exist.

## STILL OPEN — screen-kit.tsx / Join.tsx
- `radioGroupKeyDown` (`:22-32`) — see item 12.
- `Join.tsx:192-196` "Try again" unmounts itself (the effect sets `phase:'loading'`, dropping both the
  `role="alert"` and the button) ⇒ focus to `<body>`. `join.spec.ts:62` pins the name `Try again`.

See also [[map-editor-cluster]], [[ds-layer-audit]].
