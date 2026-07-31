---
name: audio-upgrade-scenes-creator-cluster
description: Audio.tsx / Upgrade.tsx / ScenesCreator.tsx / ConnectedSources.tsx / screen-kit.tsx — run #12 re-verify (2026-07-30 @ 016b696c) with a FIXED vs STILL-OPEN split, spec coupling, and verified non-issues.
metadata:
  type: project
---

Run #8 = first sweep. Run #10 @ `8fa95d31`. Run #11 @ `9aeebdde`. **Run #12 (2026-07-30 @ `016b696c`) = latest.**
Line numbers from `auto/visual-review-loop`. Re-check by grepping the anchor string, not the line.

⚠️ `ConnectedSources.tsx` lives at `src/app/`, NOT `src/screens/`. `screen-kit.tsx` is `src/app/screen-kit.tsx`.
⚠️ `ConnectedSourcesPanel` only mounts in `Knowledge.tsx` behind `canAuthor && showSources` (a toggle) —
   so NO gate, responsive or axe, has ever rendered it. Free to change; also low user impact.
⚠️ Paths are `apps/gm-react/...`; prepaint is `apps/gm-react/public/prepaint.js` (there is no repo-root `public/`).
⚠️ e2e lives at `apps/gm-react/tests/e2e/`, NOT repo-root `tests/e2e/`.

## Root-cause facts to reuse (re-verified in `runtime/SceneRuntime.ts`)
- `dispatch()` persists FULL state to Dexie per accepted command → per-input-event dispatch = write amplification.
- **`dispatch` THROWS on persist failure.** But `main.tsx:17` globally toasts unhandled rejections, so a
  missing catch is GENERIC, not silent — only report it where the UI ALSO lies.
- **`this.lifecycle` is reset ONLY in `hydrateFromStorage`** — never on route change. `lastLifecycle`-derived
  badges survive unmount/remount. Confirmed defect vector (ScenesCreator).
- `runtime.lastError` / `lastLifecycle` are SINGLE GLOBAL SLOTS.

## FIXED — do NOT re-report
Runs ≤#11: CommitSlider adopted by both faders; `addedName` banner clearing; `executePush` catch;
`connect-folder` error clearing; `Seg` full roving-tabindex radiogroup; DS `Tabs` ARIA; DS `Field`;
`signInGoogle` try/catch/finally; `clearStatusFor()` on retry; automation-row phone crush
(`flex:'1 1 auto'`); `BackBar` grown to 24px WITH PADDING + hover (`screen-kit.tsx:316`).
**New as of run #12 (@`016b696c`):**
- `CommitSlider` (`Audio.tsx:216-250`) is fully correct now: `draftRef`, `onClick` added to the commit
  triggers, and `valueLabel={format(shown)}` so the readout AND `aria-valuetext` track the draft.
  Both the frozen-readout and the dead-stepper findings are CLOSED.
- `Audio.tsx:368` `failure()` helper + `:350` `dispatch()` helper — all ~11 previously-uncaught dispatch
  sites now routed through them, including `importAudio`'s orphaned-bytes path. CLOSED.
- `Audio.tsx:1567/:1576` `unbindScene` clears the scene's WHOLE binding; `Bind`/`Unbind` carry
  per-scene `aria-label`s. CLOSED (and `audio-presets.spec.ts:276/295` now PINS those labels).
- `screen-kit radioGroupKeyDown` (`:22+`) has Home/End + disabled-skip.
- `screen-kit LoadingRegion` + `srOnly` (`:91`, `:114`) replaced all seven empty `role=status` skeleton
  regions; a source scan in `screen-kit-loading-region.test.tsx` bans the old shape.

## STILL-OPEN (run #12) — ranked
1. **`Audio.tsx:1258` source row phone crush.** `display:flex; alignItems:center; gap:10`, NO `flexWrap`;
   name column is `flex:1` (= `1 1 0%`). Fixed children (15px Icon + Badge "Blocked on desktop" +
   "Via soundboard"/Play + 3 gaps) ≈ 233 of the ~327px Panel box on a Pixel 5 ⇒ name column ≈ 94px.
   Same shape the automation row (`:1886`) was already fixed for — copy that fix verbatim.
2. **`Audio.tsx:1576` `Bind` is HARD-`disabled={!webStreamSource}`**, and the reason lives in an
   unassociated note at the bottom of the Panel (`:1586`). In the DESKTOP app every Bind is
   permanently dead. House idiom is soft-disable (`aria-disabled` + `title` + Toaster) — see
   `Settings.tsx:3260` provider cards. `audio-presets.spec.ts` never CLICKS Bind, so this is safe.
3. **`Audio.tsx:1905-1918` silent 4th automation state.** An ENABLED rule whose outcome is not yet in
   `ruleOutcomes` (`outcome === undefined`) renders NO badge at all, and `:1920` also hides "Run now".
   Add a `Badge status="neutral">Not checked yet` fallback.
4. **ScenesCreator "Saved"/failure spans (`:236-261`)** read the GLOBAL `runtime.lastLifecycle`
   (`:58-59`) ⇒ green "Saved" beside a fresh EMPTY form after navigating away and back. Neither span
   is a live region. Fix: a local `justCreated` flag set in `submit`'s accepted branch.
5. **ScenesCreator `SceneRowMetaEditor` (`:441-543`)** — `save()` (`:460`) try/finally NO catch ⇒ a
   persist throw leaves `error` null and the button just resets (generic global toast only); on
   SUCCESS the editor unmounts with no confirmation and focus drops to `<body>`; the trigger
   `IconButton` (`:356`) has no `aria-expanded`/`aria-controls`; nothing autofocuses into the editor
   so its own Escape handler (`:477`) is dead in the common case; the `error` span (`:514`) is not a
   live region.
6. **`Upgrade.tsx:453`/`:462`** — CTAs HARD-disabled during `ent.loading` while still reading
   "Try Lantern preview"/"Switch to X"; no spinner, no explanation. Spec-safe fix: keep `disabled`
   (Playwright waits for enabled) but swap the label to "Checking plans…" + `aria-busy`.
7. **`Upgrade.tsx:579-581`** — the group band is `role="columnheader" aria-colspan={4}` inside a
   `rowgroup`; should be `role="rowheader"` (or a plain `cell`), else every following cell inherits
   "Collaboration" as its COLUMN header. axe table rules are moderate ⇒ gate misses it.
   **`Upgrade.tsx:508` + `:518`** carry the IDENTICAL `aria-label="Plan feature comparison"` on the
   outer `role=region` AND the inner `role=table` (double announcement). Drop the inner one.
8. **`ConnectedSources` status lines are colour-blind to outcome** — `:711`, `:802`, `:872` render
   `color: T.sub` whether the text is "Imported 3 new" or "Folder access was denied". Only
   `connect-folder` (`:662`) uses `T.err`. Store `{tone, text}` instead of a bare string.
9. **`ConnectedSources` `busy` already holds the ROW KEY** (`setBusy(record.id)` etc.) but nothing on
   screen uses it: every button in every row is `disabled={busy!==null}` with its NORMAL label and no
   per-row progress. Cheap fix: when `busy === key`, render "Working…" in that row's status line.
10. **Hover: NO global `button:hover` in this app** (verified: 0 "hover" matches in `styles/index.css`).
    Inline styles cannot express `:hover`. Sites with ZERO pointer feedback: `Audio.tsx:1057`
    soundboard tile (it even carries a `transition` on background/border — the hover was intended),
    `Audio.tsx:1352` ambience mute, `screen-kit.tsx:253` `Seg` radios, `Settings.tsx:4876` the whole
    settings nav rail, `Settings.tsx:3257` provider cards, `Settings.tsx:4489` AI-usage radios,
    `Extensions.tsx:1123`, `Community.tsx:326`. In-repo pattern: `useState` hover +
    `onMouseEnter/Leave` — `ScenesCreator.tsx:320` and `screen-kit.tsx:316` (BackBar).
11. **`ConnectedSources` `Select` inside `SourceRow` (`:821` region)** — DS `Select`'s wrapper has no
    `minWidth:0`/`maxWidth:100%` and a native `<select>` sizes to its widest `<option>`. Unverified.
12. **ScenesCreator empty state (`:279-288`)** is an ad-hoc `Card` + text; every sibling uses DS
    `EmptyState` (Audio uses it 4×).

## Gate blind spots (re-verified run #12)
- `responsive.spec.ts:4-19 ROUTES` includes `/audio`, `/upgrade`, `/scenes`, but the loops at `:202`
  and `:692` only set `location.hash` ⇒ they only ever see each route's DEFAULT tab. **Audio's
  Presets and Automation tabs have NEVER been overflow-checked.** Applies to every tabbed route.
  Fix shape: an optional `tabs: string[]` per route, clicked by `getByRole('tab', {name})`.
- `clippedControls` (`:22-86`) only flags controls escaping the viewport with no scrolling ancestor.
  A flex row that CRUSHES a text column to 90px passes cleanly. Two `fr` tracks likewise.
- `responsive.spec.ts:680` runs the whole sweep a second time under
  `emulateMedia({reducedMotion:'reduce'})` — relevant to any prepaint motion change.
- `a11y-axe-gate.spec.ts` blocks only on `critical`/`serious`; moderate rules (table semantics,
  heading-order, region) are reported and ignored.
- Mobile profile = `devices['Pixel 5']` = **393×851**. Phone content box after `Page` padding ~365px;
  inside a `Panel` (pad 18) ~327px.
- The responsive loop waits on `page.locator('h1')` owned by the SHELL — screens starting at `<h2>`
  (Upgrade `:255`, every `Panel`) are NOT a heading-order defect.

## SPEC COUPLING (re-checked run #12)
- `audio-presets.spec.ts:138-141` clicks `Delete ${name}` and immediately expects `/Deleted/` — a
  confirm dialog BREAKS it. ⚠️ And an Undo is IMPOSSIBLE: `audio.save-preset` RE-CAPTURES from live
  session audio (`payload:{name,category}` only), so the deleted definition cannot be restored.
  **`deletePreset` is permanently unfixable by confirm-or-undo — stop re-opening it.**
- `audio-presets.spec.ts:276/295` now PINS `Unbind audio from ${scene.name}` / `Bind audio to
  ${scene.name}`. Same file pins tab `Presets`, `Atmosphere library`, `Apply ${name}`,
  `Apply Stone Corridor`, `Save current audio`, `Package name`, `No scene packages yet.`,
  `Presets are DM-only`, `1 package`. It never CLICKS Bind (only asserts visibility).
- `upgrade.spec.ts` pins the hero `Local play stays free. Cloud plans are in preview.`,
  `Your current plan`, `Try Lantern preview`, `Save plan choice`, switch `Show planned annual
  pricing`, `Compare every feature`, `/Offline comparison — connect an account/`. Runs SIGNED-OUT.
- **No spec anywhere references ConnectedSources** ⇒ items 8/9/11 are free to change.
- ⚠️ **`canvas.spec.ts:546` clicks `getByRole('button',{name:'Save details'})`** — the same label
  ScenesCreator's meta editor uses (`ScenesCreator.tsx:535`). Do NOT rename it.
  `Edit details of …` / `Delete …` are unpinned.
- Audio's `Master volume`, `Add layer`, `Run now`, `Add rule`, `Add track` appear in NO spec.

## VERIFIED NON-ISSUES (do not re-open)
- `ScenesCreator.submit` (`:61-88`) try/finally-no-catch is NOT a silent failure: the runtime emits
  `markFailure` before rethrowing and `:249` renders it.
- `ConnectedSources.confirmDisconnect` closes the dialog BEFORE awaiting; has a real catch.
- `ensureFolderPermission` and `connectGoogleAccount` both catch internally.
- `Dialog` is `position:fixed` + `zIndex: var(--z-modal)`, so nesting it in a grid parent is harmless.
- DS `Switch` clears the 24px floor via a transparent hit box; `Slider` steppers use
  `--density-touch-target`.
- Audio ambience mute (`:1352`) is 32×32 — over the WCAG 2.5.8 AA floor of 24; its `aria-label`
  flips Mute/Unmute so the missing `aria-pressed` is fine.
- `Upgrade.tsx:312` `<Switch label="" aria-label=…>`: `label=""` is falsy, `aria-label` wins.
- `Upgrade.tsx:509` `tabIndex={0}` on the `overflowX:auto` matrix is CORRECT (WCAG 2.1.1).
- `Upgrade.confirmChange` (`:206-226`) is a correct `.then/.catch/.finally`.
- `SceneRowMetaEditor` drafts do NOT bleed across rows (`editingId` is single-valued).
- Audio's `useAssetBytesPresence` tri-state and the `'checking'` outcome are deliberate async honesty.
- DS `Tabs` hardcodes `aria-label="Sections"` but `{...rest}` spreads last ⇒ overridable.
- `screen-kit Panel` renders `<section>` with an `<h2>` but no `aria-labelledby` — deliberate
  (naming every Panel would make 13 landmarks per screen). Not a defect. But it also means Panel
  accepts NO `ref`/`id`, so any focus-the-detail-panel fix needs a wrapper `<div tabIndex={-1}>`.
- DS `Button` already implements soft-disable: `aria-disabled` keeps it focusable
  (`ds/components/core/Button.jsx:20-26`). Use it instead of inventing one.
