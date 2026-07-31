---
name: audio-upgrade-scenes-creator-cluster
description: Audio.tsx / Upgrade.tsx / ScenesCreator.tsx / ConnectedSources.tsx / screen-kit.tsx — run #13 re-verify (2026-07-31 @ 21e4f86e); the phone source-row crush is FIXED, 12 open, led by Bind being hard-disabled in the whole desktop app and ScenesCreator's rejection span being invisible to AT.
metadata:
  type: project
---

Run #8 = first sweep. Run #10 @`8fa95d31`. Run #11 @`9aeebdde`. Run #12 @`016b696c`.
**Run #13 (2026-07-31 @ `21e4f86e`) = latest.**
Line numbers from `auto/visual-review-loop`. Re-check by grepping the anchor string, not the line.

⚠️ **The agent definition points at `/home/trinkle/Programming/dndtools-review-loop-ctl/…` — that path
does NOT exist.** Memory lives at `/home/trinkle/Programming/dndtools-review-loop/.claude/agent-memory/ux-ui-reviewer/`.
⚠️ `ConnectedSources.tsx` lives at `src/app/`, NOT `src/screens/`. `screen-kit.tsx` is `src/app/screen-kit.tsx`.
⚠️ `ConnectedSourcesPanel` only mounts in `Knowledge.tsx` behind `canAuthor && showSources` (a toggle) —
   so NO gate, responsive or axe, has ever rendered it. Free to change; also low user impact.
⚠️ e2e lives at `apps/gm-react/tests/e2e/`, NOT repo-root `tests/e2e/` (which does not exist).

## Root-cause facts to reuse (re-verified in `runtime/SceneRuntime.ts`)
- `dispatch()` persists FULL state to Dexie per accepted command → per-input-event dispatch = write amplification.
- **`dispatch` THROWS on persist failure.** But `main.tsx:17` globally toasts unhandled rejections, so a
  missing catch is GENERIC, not silent — only report it where the UI ALSO lies.
- **`this.lifecycle` is reset ONLY in `hydrateFromStorage`** — never on route change. `lastLifecycle`-derived
  badges survive unmount/remount. Confirmed defect vector (ScenesCreator).
- `runtime.lastError` / `lastLifecycle` are SINGLE GLOBAL SLOTS.

## FIXED — do NOT re-report
Runs ≤#12: CommitSlider (`draftRef` + `onClick` + `valueLabel`); `addedName` banner clearing;
`executePush` catch; `connect-folder` error clearing; `Seg` full roving-tabindex radiogroup; DS `Tabs`
ARIA; DS `Field`; `signInGoogle` try/catch/finally; `clearStatusFor()` on retry; automation-row phone
crush; `BackBar` 24px + padding + hover; `Audio.tsx:368 failure()` + `:350 dispatch()` helpers routing
all ~11 previously-uncaught dispatches; `unbindScene` clearing the whole binding + per-scene
`aria-label`s on Bind/Unbind; `screen-kit radioGroupKeyDown` Home/End + disabled-skip;
`screen-kit LoadingRegion`/`srOnly` replacing all seven empty `role=status` skeleton regions.
**New as of run #13 (@`21e4f86e`):**
- **run#12 §1 CLOSED** — `Audio.tsx:1266` + `:1281` the source row now wraps on phone
  (`flexWrap: isPhone ? 'wrap':'nowrap'` + `flex: isPhone ? '1 1 auto' : 1`), same shape as the
  automation row at `:1883`/`:1893`.

## STILL-OPEN (run #13) — ranked

### NEW this run
1. **`ScenesCreator.tsx:514-526` — the meta editor hand-rolls a silent error span when DS `Field`
   already does it right.** `Field` (`ds/components/forms/Field.jsx:75-85`) renders `error` as
   `role="alert"` AND puts `aria-invalid` + `aria-describedby` on the control. `SceneRowMetaEditor`
   ignores it, so a rejected `scene.update-metadata` ("a scene with that name already exists") is
   announced to nobody and the Name input is never marked invalid. Same shape in the create form
   (`:249-261`). Fix: `<Field label="Name" required error={error}>` and delete the span.
   ⚠️ `canvas.spec.ts:546` pins the `Save details` BUTTON name only — the fix is SAFE.
2. **`Audio.tsx:2089-2096` a rule-creation ERROR is `role="status"` (polite), not `role="alert"`**, and
   it is a sibling span rather than the offending `Field`'s `error` prop, so nothing marks the control
   invalid. Same shape at `Audio.tsx:1017-1024` (`importError`) and `:1120-1127` (`playError`).
3. **`Audio.tsx:2037-2051` the "Source" `Select` renders with an EMPTY options list and
   `disabled={usableSources.length===0}`** — an empty disabled combobox whose explanation lives beside
   the submit button (`:2084`), not on the field. Fix: pass it as the Field's `help`/`error`.

### Carried from run #12
4. **`Audio.tsx:1584` `Bind` is HARD-`disabled={!webStreamSource}`**, and the reason lives in an
   unassociated note at the bottom of the Panel (`:1593-1600`). In the DESKTOP app every Bind is
   permanently dead. House idiom is soft-disable (`aria-disabled` + `title` + Toaster). ⚠️
   `audio-presets.spec.ts` asserts Bind's VISIBILITY but never CLICKS it, so soft-disable is safe.
5. **`Audio.tsx:1912-1920` silent 4th automation state.** An ENABLED rule whose outcome is not yet in
   `ruleOutcomes` (`outcome === undefined`) renders NO badge at all, and `:1927` also hides "Run now".
   Add a `Badge status="neutral">Not checked yet` fallback.
6. **ScenesCreator "Saved"/failure spans (`:236-261`)** read the GLOBAL `runtime.lastLifecycle`
   (`:58-59`) ⇒ green "Saved" beside a fresh EMPTY form after navigating away and back. Neither span
   is a live region. Fix: a local `justCreated` flag set in `submit`'s accepted branch.
7. **`ScenesCreator.SceneRowMetaEditor` (`:441-543`)** — `save()` (`:460`) try/finally NO catch; on
   SUCCESS the editor unmounts with no confirmation and focus drops to `<body>`; the trigger
   `IconButton` (`:356`) has no `aria-expanded`/`aria-controls`; nothing autofocuses into the editor
   so its own Escape handler (`:477`) is dead in the common case.
8. **`Upgrade.tsx:453`/`:462`** — CTAs HARD-disabled during `ent.loading` while still reading
   "Try Lantern preview"/"Switch to X"; no spinner, no explanation. Spec-safe fix: keep `disabled`
   (Playwright waits for enabled) but swap the label to "Checking plans…" + `aria-busy`.
9. **`Upgrade.tsx:579-581`** — the group band is `role="columnheader" aria-colspan={4}` inside a
   `rowgroup`; should be `role="rowheader"`. **`Upgrade.tsx:508` + `:518`** carry the IDENTICAL
   `aria-label="Plan feature comparison"` on the outer `role=region` AND the inner `role=table`.
   axe table rules are moderate ⇒ the gate misses both.
10. **`ConnectedSources` status lines are colour-blind to outcome** — `:711`, `:802`, `:872` render
    `color: T.sub` whether the text is "Imported 3 new" or "Folder access was denied". Only
    `connect-folder` (`:662`) uses `T.err`. Store `{tone, text}` instead of a bare string.
11. **`ConnectedSources` `busy` already holds the ROW KEY** (`setBusy(record.id)`) but nothing uses it:
    every button in every row is `disabled={busy!==null}` with its NORMAL label. Cheap fix: when
    `busy === key`, render "Working…" in that row's status line.
12. **Hover: NO global `button:hover` in this app** (0 "hover" matches in `styles/index.css`). Inline
    styles cannot express `:hover`. ZERO pointer feedback at: `Audio.tsx:1057` soundboard tile (it even
    carries a `transition` on background/border — the hover was intended), `Audio.tsx:1352` ambience
    mute, `screen-kit.tsx:253` `Seg` radios, `Settings.tsx:4916` the settings nav rail,
    `Settings.tsx:3257` provider cards, `Settings.tsx:4489` AI-usage radios, `Extensions.tsx:1123`,
    `Community.tsx:326`. In-repo pattern: `useState` hover + `onMouseEnter/Leave` —
    `ScenesCreator.tsx:320` (inline `e.currentTarget.style`) and `screen-kit.tsx:316` (BackBar, `useState`).
13. **`ConnectedSources` `Select` inside `SourceRow` (`:821`)** — DS `Select`'s wrapper has no
    `minWidth:0`/`maxWidth:100%` and a native `<select>` sizes to its widest `<option>`. Unverified.
14. **ScenesCreator empty state (`:279-288`)** is an ad-hoc `Card` + text; every sibling uses DS
    `EmptyState` (Audio uses it 4×).

## Gate blind spots (re-verified run #13)
- `responsive.spec.ts:4-19 ROUTES` includes `/audio`, `/upgrade`, `/scenes`, but the loops at `:202`
  and `:692` only set `location.hash` ⇒ they only ever see each route's DEFAULT tab. **Audio's
  Presets and Automation tabs have NEVER been overflow-checked.** Applies to every tabbed route.
  Fix shape: an optional `tabs: string[]` per route, clicked by `getByRole('tab', {name})`.
- `clippedControls` (`:22-86`) only flags controls escaping the viewport with no scrolling ancestor.
  A flex row that CRUSHES a text column to 90px passes cleanly. Two `fr` tracks likewise.
- `responsive.spec.ts:680` runs the whole sweep a second time under `emulateMedia({reducedMotion:'reduce'})`.
- `a11y-axe-gate.spec.ts` blocks only on `critical`/`serious`; moderate rules (table semantics,
  heading-order, region) are reported and ignored.
- Mobile profile = `devices['Pixel 5']` = **393×851**. Phone content box after `Page` padding ~365px;
  inside a `Panel` (pad 18) ~327px.
- The responsive loop waits on `page.locator('h1')` owned by the SHELL — screens starting at `<h2>`
  (Upgrade `:255`, every `Panel`) are NOT a heading-order defect.

## SPEC COUPLING (re-checked run #13)
- `audio-presets.spec.ts:138-141` clicks `Delete ${name}` and immediately expects `/Deleted/` — a
  confirm dialog BREAKS it. ⚠️ And an Undo is IMPOSSIBLE: `audio.save-preset` RE-CAPTURES from live
  session audio (`payload:{name,category}` only), so the deleted definition cannot be restored.
  **`deletePreset` is permanently unfixable by confirm-or-undo — stop re-opening it.**
- `audio-presets.spec.ts:276/295` PINS `Unbind audio from ${scene.name}` / `Bind audio to
  ${scene.name}`. Same file pins tab `Presets`, `Atmosphere library`, `Apply ${name}`,
  `Save current audio`, `Package name`, `No scene packages yet.`, `Presets are DM-only`, `1 package`.
  It never CLICKS Bind (only asserts visibility).
- `upgrade.spec.ts` pins the hero `Local play stays free. Cloud plans are in preview.`,
  `Your current plan`, `Try Lantern preview`, `Save plan choice`, switch `Show planned annual
  pricing`, `Compare every feature`, `/Offline comparison — connect an account/`. Runs SIGNED-OUT.
- **No spec anywhere references ConnectedSources** ⇒ items 10/11/13 are free to change.
- ⚠️ **`canvas.spec.ts:546` clicks `getByRole('button',{name:'Save details'})`** — the same label
  ScenesCreator's meta editor uses (`ScenesCreator.tsx:535`). Do NOT rename it.
  `Edit details of …` / `Delete …` are unpinned.
- Audio's `Master volume`, `Add layer`, `Run now`, `Add rule`, `Add track` appear in NO spec.

## VERIFIED NON-ISSUES (do not re-open)
- **DS `Field` auto-associates its label** (`Field.jsx:12-21`, `React.useId` + `cloneElement`) — a
  `<Field>` whose single child has no `id` is NOT an unlabelled control. Applies to every
  `SceneRowMetaEditor` field.
- `ScenesCreator.submit` (`:61-88`) try/finally-no-catch is NOT a silent failure: the runtime emits
  `markFailure` before rethrowing and `:249` renders it.
- `ConnectedSources.confirmDisconnect` closes the dialog BEFORE awaiting; has a real catch, and
  `startGdocPush` (`:471-476`) DOES guard the empty note selection with an inline status line.
- `ensureFolderPermission` and `connectGoogleAccount` both catch internally.
- `Dialog` is `position:fixed` + `zIndex: var(--z-modal)`, so nesting it in a grid parent is harmless.
- DS `Switch` clears the 24px floor via a transparent hit box; `Slider` steppers use `--density-touch-target`.
- Audio ambience mute (`:1352`) is 32×32 — over the WCAG 2.5.8 AA floor of 24; its `aria-label`
  flips Mute/Unmute so the missing `aria-pressed` is fine.
- `Upgrade.tsx:312` `<Switch label="" aria-label=…>`: `label=""` is falsy, `aria-label` wins.
- `Upgrade.tsx:509` `tabIndex={0}` on the `overflowX:auto` matrix is CORRECT (WCAG 2.1.1).
- `Upgrade.confirmChange` (`:206-226`) is a correct `.then/.catch/.finally`; the failure path
  deliberately leaves the dialog OPEN so the user can retry.
- `Upgrade.MatrixCell` (`:37-51`) `role="img" aria-label="Included"/"Not included"` is correct.
- `Upgrade` plan grid `repeat(auto-fit, minmax(min(100%,240px),1fr))` is overflow-safe.
- **`icon="trash"` IS registered** (`Icon.jsx:335 → 'Trash2'`) — not a fallback-Square bug.
- `SceneRowMetaEditor` drafts do NOT bleed across rows (`editingId` is single-valued).
- Audio's `useAssetBytesPresence` tri-state and the `'checking'` outcome are deliberate async honesty.
- DS `Tabs` hardcodes `aria-label="Sections"` but `{...rest}` spreads last ⇒ overridable.
- `screen-kit Panel` renders `<section>` with an `<h2>` but no `aria-labelledby` — deliberate. But it
  also accepts NO `ref`/`id`, so any focus-the-detail-panel fix needs a wrapper `<div tabIndex={-1}>`.
- **`screen-kit Seg`'s Home/End maths is CORRECT** — `moveSelection(-1,+1)` lands on index 0 and
  `moveSelection(0,-1)` lands on `len-1`. Verified run #13; do not "fix" it.
- DS `Button` already implements soft-disable: `aria-disabled` keeps it focusable
  (`ds/components/core/Button.jsx:20-26`). Use it instead of inventing one.

See also [[settings-extensions-community-cluster]], [[ds-layer-audit]].
