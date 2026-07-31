---
name: audio-upgrade-scenes-creator-cluster
description: Audio.tsx / Upgrade.tsx / ScenesCreator.tsx / ConnectedSources.tsx / screen-kit.tsx — run #15 re-verify (2026-07-31 @ 7f84aeb7); the Seg tab-stop BLOCKER, BackBar target and Audio's bound[0]-only Unbind are all CLOSED; 13 open, led by a blocked-playback line that reads as neutral chatter and 3 error regions still role=status.
metadata:
  type: project
---

Run #8 = first sweep. #10 @`8fa95d31`. #11 @`9aeebdde`. #12 @`016b696c`. #13 @`21e4f86e`.
**Run #14 (2026-07-31 @ `98e0211f`) = latest.**
Line numbers from `auto/visual-review-loop`. Re-check by grepping the anchor string, not the line.

⚠️ **The agent definition points at `/home/trinkle/Programming/dndtools-review-loop-ctl/…` — that path
does NOT exist.** Memory lives at `/home/trinkle/Programming/dndtools-review-loop/.claude/agent-memory/ux-ui-reviewer/`.
⚠️ `ConnectedSources.tsx` lives at `src/app/`, NOT `src/screens/`. `screen-kit.tsx` is `src/app/screen-kit.tsx`.
⚠️ `ConnectedSourcesPanel` only mounts in `Knowledge.tsx` behind `canAuthor && showSources` — no gate,
   responsive or axe, has ever rendered it. Free to change; also low user impact.
⚠️ e2e lives at `apps/gm-react/tests/e2e/`, NOT repo-root `tests/e2e/`.

## Root-cause facts to reuse (re-verified in `runtime/SceneRuntime.ts`)
- `dispatch()` persists FULL state to Dexie per accepted command → per-input-event dispatch = write amplification.
- **`dispatch` THROWS on persist failure.** `main.tsx:17` globally toasts unhandled rejections, so a
  missing catch is GENERIC, not silent — only report it where the UI ALSO lies.
- **`this.lifecycle` is reset ONLY in `hydrateFromStorage`** — never on route change.
  `runtime.lastError` / `lastLifecycle` are SINGLE GLOBAL SLOTS. **Never derive per-form feedback from
  them** — ScenesCreator's fix (below) is the reference for doing it locally.

## FIXED — do NOT re-report
Runs ≤#12: CommitSlider; `addedName` banner clearing; `executePush` catch; `connect-folder` error
clearing; `Seg` roving tabindex; DS `Tabs` ARIA; DS `Field`; `signInGoogle` try/catch/finally;
`clearStatusFor()`; automation-row phone crush; `BackBar` 24px + hover; `Audio.tsx:368 failure()` +
`:350 dispatch()` helpers; `unbindScene` + per-scene Bind/Unbind `aria-label`s; `radioGroupKeyDown`
Home/End; `LoadingRegion`/`srOnly` for all seven empty skeleton regions.
Run #13: `Audio.tsx:1266`/`:1281` phone source-row wrap.
**New as of run #14 (@`98e0211f`):**
- **run#13 §6 CLOSED** — `ScenesCreator.tsx:44-46` + `:85-103` + `:252-278`: a LOCAL
  `feedback: {tone,text}` state replaces the global-`lastLifecycle`-derived "Saved" tick, carries the
  real rejection message, is cleared on the next keystroke (`:206-209`), has a `catch`, and lives in
  ONE persistent `role="status"` span (`data-testid="scene-create-feedback"`) rather than two
  swapping `{cond && …}` siblings. This is the model for every "global slot leaks into a form" fix.
- **run#13 §2 PARTLY CLOSED** — `role="status"` → `role="alert"` at `Audio.tsx:1019` (importError),
  `:1122` (playError), `:2091` (ruleError). **Three siblings were MISSED — see open item 2.**

## CLOSED at `7f84aeb7` (run #15) — do NOT re-report
- **run#14 §1 (Seg tab-stop BLOCKER) FIXED** — `screen-kit.tsx:245-246` finds the CHECKED option
  first regardless of `disabled`; `moveSelection` (`:252`) can land on it too.
- **`Audio.tsx:525-538 unbindScene` now clears the scene's WHOLE binding** (loops `bound`, stops at
  the first refusal, then one success toast). The `bound[0]`-only item is CLOSED.
- `BackBar` padding + hover CLOSED. `Join.tsx` "Try again" self-unmount CLOSED.

## STILL-OPEN (run #15) — ranked

### NEW this run
1. **`Audio.tsx:951-967` a FAILED/blocked playback state is styled as neutral chatter.** The line
   renders only when `playbackState.status` is `blocked`/`no-stream`/`error`, yet it is
   `role="status"` (polite), `color: T.ter`, and led by a neutral `Icon name="audio"` — identical to
   an informational note. The durable track still reads "Playing", so the DM's only cue that this
   device is silent is grey 11.5px text. Fix: `role="alert"`, `icon="warning"`,
   `--color-status-warning-text`. (Contrast itself is fine — the strip is `T.raised`.)
2. **`Audio.tsx` still has THREE error regions the `role="alert"` pass missed**: `:1215 addError`,
   `:1478 ambienceError`, `:1678 presetError` — all `role="status"` (polite) while painted
   `--color-status-error-text`. None is on its `Field`'s `error` prop, so no control is `aria-invalid`.
3. **`screen-kit.tsx:225-230` + `:280` the new `title` option prop is DEAD API** — zero call sites pass
   it (grepped all `src/`), so the "mute 0.4-opacity option with no explanation" its own JSDoc
   describes is still fully live. `title` on a natively `disabled` button is pointer-only anyway;
   soft-disable is the house idiom (`Settings.tsx:3272-3283`).
4. **`screen-kit.tsx:288-297` Seg hover leaks.** Imperative `currentTarget.style.background` on
   mouseEnter + a mouseLeave that early-returns on `on || off` ⇒ an option disabled under the pointer
   keeps its hover tint forever (React does not rewrite a style prop whose value did not change).
   Use the `useState` hover pattern from `BackBar` (`screen-kit.tsx:345`).

### Carried from runs #12–13
5. **`ScenesCreator.tsx:532-543` — the meta editor's rejection span has NO role**, while the create
   form directly above just got one. A rejected `scene.update-metadata` ("a scene with that name
   already exists") is announced to nobody and the Name `Field` is never `aria-invalid`.
   Fix: `<Field label="Name" required error={error}>` and delete the span.
   ⚠️ `canvas.spec.ts:546` pins the `Save details` BUTTON name only — the fix is SAFE.
6. **`Audio.tsx:2037-2051` the "Source" `Select` renders with an EMPTY options list and
   `disabled={usableSources.length===0}`** — an empty disabled combobox whose explanation lives beside
   the submit button (`:2084`), not on the field.
7. **`Audio.tsx:1583` `Bind` is HARD-`disabled={!webStreamSource}`** — in the DESKTOP app every Bind
   is permanently dead; the reason is an unassociated note at `:1593-1600`. ⚠️ `audio-presets.spec.ts`
   asserts Bind's VISIBILITY but never CLICKS it, so soft-disable is safe.
8. **`Audio.tsx:1912-1920` silent 4th automation state.** An ENABLED rule whose `outcome` is
   `undefined` renders NO badge, and `:1927` also hides "Run now". Add `Badge status="neutral">Not
   checked yet`.
9. **`ScenesCreator.SceneRowMetaEditor` (`:441-560`)** — on SUCCESS the editor unmounts with no
   confirmation and focus drops to `<body>`; the trigger `IconButton` (`:356`) has no
   `aria-expanded`/`aria-controls`; nothing autofocuses in, so its own Escape handler (`:477`) is dead.
10. **`Upgrade.tsx:453`/`:462`** — CTAs hard-disabled during `ent.loading` while still reading
    "Try Lantern preview"/"Switch to X"; no spinner, no explanation. (The `!canChangePlan` case DOES
    now swap to "Plan changes unavailable" — only the loading case lies.) Spec-safe fix: keep
    `disabled` and swap the label to "Checking plans…" + `aria-busy`.
11. **`Upgrade.tsx:579-581`** — the group band is `role="columnheader" aria-colspan={4}` inside a
    `rowgroup`; should be `role="rowheader"`. **`Upgrade.tsx:508` + `:518`** carry the IDENTICAL
    `aria-label="Plan feature comparison"` on the outer `role=region` AND the inner `role=table`.
12. **`ConnectedSources` status lines are colour-blind to outcome** — `:711`, `:802`, `:872` render
    `T.sub` whether the text is "Imported 3 new" or "Folder access was denied".
13. **`ConnectedSources` `busy` already holds the ROW KEY** but every button in every row is
    `disabled={busy!==null}` with its NORMAL label.
14. **Hover: NO global `button:hover` in this app** (0 "hover" matches in `styles/index.css`). ZERO
    pointer feedback at `Audio.tsx:1057` soundboard tile (it even carries a `transition` — the hover
    was intended), `Audio.tsx:1352` ambience mute, `Settings.tsx:4925` settings nav rail,
    `Settings.tsx:3272` provider cards, `Settings.tsx:4489` AI-usage radios, `Extensions.tsx:1123`,
    `Community.tsx:326`. `screen-kit Seg` got one this run (see item 4 for its flaw).
15. **`ConnectedSources` `Select` inside `SourceRow` (`:821`)** — DS `Select`'s wrapper has no
    `minWidth:0`/`maxWidth:100%`; a native `<select>` sizes to its widest `<option>`. Unverified.
16. **ScenesCreator empty state (`:279-288`)** is an ad-hoc `Card`; every sibling uses DS `EmptyState`.

## Gate blind spots (re-verified run #14)
- `responsive.spec.ts:4-19 ROUTES` includes `/audio`, `/upgrade`, `/scenes`, but the loops at `:202`
  and `:692` only set `location.hash` ⇒ they only ever see each route's DEFAULT tab. **Audio's
  Presets and Automation tabs have NEVER been overflow-checked.** Applies to every tabbed route.
- `clippedControls` (`:22-86`) only flags controls escaping the viewport with no scrolling ancestor.
  A flex row that CRUSHES a text column to 90px passes cleanly.
- `responsive.spec.ts:680` re-runs the sweep under `emulateMedia({reducedMotion:'reduce'})`.
- `a11y-axe-gate.spec.ts` blocks only on `critical`/`serious`; moderate rules (table semantics,
  heading-order, region) are reported and ignored. **`tabindex`/keyboard-reachability of a
  radiogroup is NOT covered by any axe rule** — item 1 would have shipped silently.
- Mobile profile = `devices['Pixel 5']` = **393×851**. Phone content box ~365px; inside a `Panel` ~327px.
- The responsive loop waits on `page.locator('h1')` owned by the SHELL — screens starting at `<h2>`
  (Upgrade `:255`, every `Panel`) are NOT a heading-order defect.

## SPEC COUPLING (re-checked run #14)
- `audio-presets.spec.ts:138-141` clicks `Delete ${name}` and immediately expects `/Deleted/` — a
  confirm dialog BREAKS it. ⚠️ And an Undo is IMPOSSIBLE: `audio.save-preset` RE-CAPTURES from live
  session audio, so the deleted definition cannot be restored.
  **`deletePreset` is permanently unfixable by confirm-or-undo — stop re-opening it.**
- `audio-presets.spec.ts:276/295` PINS `Unbind audio from ${scene.name}` / `Bind audio to
  ${scene.name}`. Same file pins `Presets`, `Atmosphere library`, `Apply ${name}`, `Save current
  audio`, `Package name`, `No scene packages yet.`, `Presets are DM-only`, `1 package`.
- `upgrade.spec.ts` pins the hero `Local play stays free. Cloud plans are in preview.`,
  `Your current plan`, `Try Lantern preview`, `Save plan choice`, `Show planned annual pricing`,
  `Compare every feature`, `/Offline comparison — connect an account/`. Runs SIGNED-OUT.
- **No spec anywhere references ConnectedSources** ⇒ items 12/13/15 are free to change.
- ⚠️ **`canvas.spec.ts:546` clicks `getByRole('button',{name:'Save details'})`** — the same label
  ScenesCreator's meta editor uses (`ScenesCreator.tsx:549`). Do NOT rename it.
- ScenesCreator's create feedback now carries `data-testid="scene-create-feedback"` — reuse it rather
  than adding another hook.
- Audio's `Master volume`, `Add layer`, `Run now`, `Add rule`, `Add track` appear in NO spec.

## VERIFIED NON-ISSUES (do not re-open)
- **DS `Field` auto-associates its label** (`Field.jsx:12-21`) and renders `error` as `role="alert"` +
  `aria-invalid` + `aria-describedby` (`:75-85`).
- `ScenesCreator.submit` now has a real `catch` — the old "try/finally-no-catch" note is retired.
- `ConnectedSources.confirmDisconnect` / `ensureFolderPermission` / `connectGoogleAccount` all catch.
- `Dialog` is `position:fixed` + `zIndex: var(--z-modal)`, so nesting it in a grid parent is harmless.
- DS `Switch` clears the 24px floor via a transparent hit box; `Slider` steppers use `--density-touch-target`.
- Audio ambience mute (`:1352`) is 32×32; its `aria-label` flips Mute/Unmute so no `aria-pressed` needed.
- `Upgrade.tsx:312` `<Switch label="" aria-label=…>`: `label=""` is falsy, `aria-label` wins.
- `Upgrade.tsx:509` `tabIndex={0}` on the `overflowX:auto` matrix is CORRECT (WCAG 2.1.1).
- `Upgrade.confirmChange` (`:206-226`) is correct; the failure path deliberately leaves the dialog OPEN.
- `Upgrade.MatrixCell` (`:37-51`) `role="img" aria-label="Included"/"Not included"` is correct.
- `Upgrade` plan grid `repeat(auto-fit, minmax(min(100%,240px),1fr))` is overflow-safe.
- **`icon="trash"` IS registered** (`Icon.jsx:335 → 'Trash2'`).
- `SceneRowMetaEditor` drafts do NOT bleed across rows (`editingId` is single-valued).
- Audio's `useAssetBytesPresence` tri-state and the `'checking'` outcome are deliberate async honesty.
- DS `Tabs` hardcodes `aria-label="Sections"` but `{...rest}` spreads last ⇒ overridable.
- **`screen-kit Seg`'s Home/End maths is CORRECT.** The broken part is `tabStopIndex` — item 1.
- `screen-kit Panel` renders `<section>` + `<h2>` with no `aria-labelledby` — deliberate; it accepts
  no `ref`/`id`, so a focus-the-panel fix needs a wrapper `<div tabIndex={-1}>`.
- **`screen-kit eb` is `T.sub` as of run #14** — the eyebrow-contrast item is CLOSED. `SetRow`'s help
  (`screen-kit.tsx:404`) is still `T.ter`, but it renders inside `Panel` (`T.raised`) where parchment
  `T.ter` measures 4.75 = PASS. Do not file it.
- DS `Button` soft-disables via `aria-disabled` and DROPS onClick (`Button.jsx:87`).

See also [[settings-extensions-community-cluster]], [[ds-layer-audit]].
