---
name: audio-upgrade-scenes-creator-cluster
description: Audio.tsx / Upgrade.tsx / ScenesCreator.tsx / ConnectedSources.tsx / screen-kit.tsx — run #11 re-verify (2026-07-30 @ 9aeebdde) with a FIXED vs STILL-OPEN split, spec coupling, and verified non-issues.
metadata:
  type: project
---

Run #8 = first sweep. Run #10 @ `8fa95d31`. **Run #11 (2026-07-30 @ `9aeebdde`) = latest.**
Line numbers from `auto/visual-review-loop`. Re-check by grepping the anchor string, not the line.

⚠️ `ConnectedSources.tsx` lives at `src/app/`, NOT `src/screens/`. `screen-kit.tsx` is `src/app/screen-kit.tsx`.
⚠️ `ConnectedSourcesPanel` only mounts at `Knowledge.tsx:1050` behind `canAuthor && showSources`
   (a toggle) — so NO gate, responsive or axe, has ever rendered it.

## Root-cause facts to reuse (re-verified in `runtime/SceneRuntime.ts`)
- `dispatch()` → `dispatchNow` persists FULL state to Dexie per accepted command, appends to
  `sync.operations`, fans out to P2P listeners. Per-input-event dispatch = write amplification.
- **`dispatch` THROWS on persist failure** (`:481 throw error`). Any `await runtime.dispatch` with no
  `catch` is a silent failure. ⚠️ BUT before rethrowing it does `markFailure` + `emit()`, so a screen
  that renders off `runtime.lastLifecycle` / `runtime.lastError` DOES show the failure
  (ScenesCreator's create form is the one place in this cluster that survives the throw for free).
- **`this.lifecycle` is reset ONLY in `hydrateFromStorage` (`:338`)** — never on route change. So
  `lastLifecycle`-derived "Saved" badges persist across unmount/remount. Confirmed defect vector.
- `runtime.lastError` / `lastLifecycle` are SINGLE GLOBAL SLOTS.

## FIXED — do NOT re-report
Run #10 and earlier: Audio CommitSlider adopted by both volume faders; Audio `dispatch()` helper
toasts results; `addedName` banner cleared; `ConnectedSources.executePush` catch; `connect-folder`
error clearing; `screen-kit Seg` full roving-tabindex radiogroup w/ Home/End + disabled-skip; DS
`Tabs` ARIA; DS `Field`.
**New in run #11 (@`7bdf2908`/`9aeebdde`):**
- `Audio.tsx:1799-1825` automation row now `flexWrap: isPhone?'wrap'` + `flex:'1 1 auto'`. Phone crush gone.
- `ConnectedSources.signInGoogle` (:388) now `try/catch/finally` — panel can no longer deadlock.
- `ConnectedSources` `clearStatusFor()` helper (:212) now called by `pullFolder`, `startFolderPush`,
  `signInGoogle`, `createNewDoc`, `pullGdoc`. Stale-status-on-retry is CLOSED.

## STILL-OPEN (run #11) — ranked
1. **`CommitSlider` `valueLabel` lies during a drag — and it is VISIBLE, not just SR.**
   `Audio.tsx:883` (`${masterPct}%`) and `:1349` (`${Math.round(layer.volume*100)}%`) compute from the
   DURABLE value while `Slider` gets `value={shown}` (the draft). `Slider.jsx:57` → `readout` renders
   as on-screen text AND `aria-valuetext` (`:88`). Thumb moves, number frozen.
2. **`CommitSlider` steppers never commit their own press.** Wrapper is
   `onPointerUp/onKeyUp/onBlur={commit}` (`Audio.tsx:228`) and both fire BEFORE the button's `click`,
   so `commit()` always sees `draft===null` and the click that follows only sets the next draft. A
   single ± click (mouse OR Space) makes NO durable change until blur or a second click. Enter is
   fine (click on keydown).
3. **`Audio.tsx:607-615 deletePreset` — destructive, no confirm, no undo**, ghost icon-only button
   flush against "Apply" (`:1648`/`:1658`). Its two siblings in the SAME file (`removeLayer` :523,
   `deleteRule` :720) both ship a Toaster Undo. ⚠️ SPEC: a confirm BREAKS `audio-presets.spec.ts:138`.
4. **`Audio.tsx:1501` "Unbind" removes only `bound[0]`** while the row reads "{bound.length} cues".
   Also `Bind`/`Unbind` (`:1497`/`:1506`) are the ONLY buttons in the file with no per-item
   `aria-label` — a list of identically-named buttons (WCAG 2.4.6).
5. **Audio: 11 dispatch sites with no `.catch`.** try/finally-only: `importAudio` :348 (bytes are
   already in the asset store ⇒ a throw ORPHANS them), `addTrack` :424, `saveCurrentPreset` :590,
   `createRule` :666. NO try at all: `playAsset` :381, `setLayer` :492, `removeLayer` :514,
   `applyPreset` :573, `deletePreset` :608, `deleteRule` :711, `runRuleNow` :752. All handle the
   REJECTION; none handles the THROW. Fix already in-file: the `dispatch()` helper at `:331`.
6. **ScenesCreator `SceneRowMetaEditor` (`:441-543`)** — `save()` (:460) try/finally no catch ⇒ a
   throw leaves `error` null and the editor just sits there; on SUCCESS the editor unmounts with NO
   confirmation and focus drops to `<body>`; the `IconButton` trigger (:356) has no
   `aria-expanded`/`aria-controls` and nothing autofocuses into the editor, so the container's
   Escape handler (:477) is dead for the common case despite the docblock claiming Escape works;
   the `error` span (:514) is not a live region.
7. **ScenesCreator "Saved"/failure badge (`:236-261`)** derives from the GLOBAL `runtime.lastLifecycle`
   (`:59`), which survives remount ⇒ green "Saved" beside a fresh empty form after navigating away and
   back. Neither span is a live region.
8. **`ConnectedSources` panel-wide `busy`** — a single slot; every button in every row is
   `disabled={busy!==null}` with its NORMAL label. During a pull on row A, rows B/C grey out and
   nothing anywhere says which row is working. No spinner, no "Pulling…".
9. **`ConnectedSources` status lines are colour-blind to outcome** — `:686`, `:777`, `:847` render
   `color: T.sub` whether the text is "Imported 3 new" or "Folder access was denied". Only
   `connect-folder` (:637) uses `T.err`.
10. **`screen-kit BackBar` (`:254-271`)** — `padding: 0`, 16px icon + 13px text ⇒ ~19px tall target
    (WCAG 2.5.8 wants 24). Also zero hover. Consumers: `Upgrade.tsx:234`, `Knowledge.tsx:465`.
11. **`screen-kit radioGroupKeyDown` (`:22-32`)** — no Home/End, and does not skip `disabled` radios
    (it `focus()`es + `click()`s them, so focus is silently lost on a disabled target). Its sibling
    `Seg` got both. Consumers: Onboarding ×4, Community ×1, Settings ×2.
12. **`Upgrade.tsx:453`/`:462`** — CTAs hard-disabled during `ent.loading` while still reading
    "Try Lantern preview", no spinner, no explanation; `planChangesUnavailable` (:204) excludes
    `loading`, so hero + body + 3 buttons + footnote all re-label at once when the fetch settles.
13. **`Upgrade.tsx:578-580`** — group band is `role="columnheader" aria-colspan={4}` inside a
    `rowgroup`; should be `rowheader`/`cell`, else every following cell inherits "Collaboration" as a
    column header. axe table rules are moderate-impact ⇒ gate misses it.
14. **`Upgrade.tsx:507` + `:518`** — outer `role=region` and inner `role=table` carry the IDENTICAL
    `aria-label="Plan feature comparison"` (double announcement).
15. **Audio live regions are mounted WITH their content** (`:954`, `:1057`, `:1151`, `:1407`, `:1603`,
    `:1876`, `:1994`) — the node is inserted along with the text, which many AT combos will not
    announce. Same in ConnectedSources (`:635`, `:680`, `:776`, `:843`, `:802`).
16. **Audio soundboard tiles (`:994`) and ambience mute buttons (`:1289`)** are raw inline-styled
    `<button>`s with NO hover (there is no global `button:hover` anywhere in the repo — verified). The
    soundboard tile even carries a `transition` on background/border, so the hover was clearly
    intended. ScenesCreator's row button (`:320-325`) is the in-repo pattern
    (`onMouseEnter`/`onMouseLeave`), though it too is mouse-only.
17. **`Audio.tsx:1194` source row** — same 4-child no-wrap flex shape the automation row was just
    fixed for: fixed children (15px Icon + Badge "Blocked on desktop"/"HTTPS required" + "Via
    soundboard"/Play) eat ~215 of ~305px, leaving the name+meta column ~90px on a Pixel 5. Not an
    overflow, so `clippedControls` can't see it. Apply the `:1809` fix.
18. **`Audio.tsx:1838-1846`** — an ENABLED rule whose outcome is not in `ruleOutcomes` renders NO
    badge at all (silent 4th state beside Disabled / Checking… / Ready / Blocked), and "Run now"
    (`:1853`) also disappears.
19. **`ConnectedSources` `Select` inside `SourceRow` (`:821`)** — DS `Select`'s wrapper
    (`Select.jsx:19`) has no `minWidth:0`/`maxWidth:100%`, and a native `<select>` sizes to its widest
    `<option>`. A long note title can push the row past a 365px phone box. Unverified at runtime.
20. **ScenesCreator empty state (`:279-288`)** is an ad-hoc `Card` + text; every sibling screen uses
    the DS `EmptyState` (Audio uses it 4×).

## Gate blind spots (re-verified run #11)
- `responsive.spec.ts:4-19 ROUTES` includes `/audio`, `/upgrade`, `/scenes`, but the loop only sets
  `location.hash` ⇒ it only ever sees each route's DEFAULT tab. Audio's Presets/Automation tabs have
  NEVER been overflow-checked. Applies to every tabbed route in ROUTES.
- `clippedControls` (`responsive.spec.ts:22-60`) only flags controls escaping the viewport with no
  scrolling ancestor. A flex row that CRUSHES a text column to 90px passes cleanly.
- `a11y-axe-gate.spec.ts` blocks only on `critical`/`serious`; moderate rules (table semantics,
  heading-order, region) are reported and ignored.
- Mobile profile is `devices['Pixel 5']` = **393×851**, not 375. Phone content box after `Page`
  padding is ~365px; inside a `Panel` (pad 18) ~327px. Use these numbers, not 375.
- The responsive loop waits on `page.locator('h1')` owned by the SHELL — screens starting at `<h2>`
  (Upgrade `:255`, every `Panel`) are NOT a heading-order defect.

## SPEC COUPLING (re-checked run #11)
- `audio-presets.spec.ts:138-141` clicks `Delete ${name}` and immediately expects `/Deleted/` — a
  confirm dialog for item 3 BREAKS it; a Toaster undo keeps it green (the success text already says
  "Deleted"). Same file pins tab `Presets`, heading `Atmosphere library`, `Apply ${name}`,
  `Apply Stone Corridor`, `Save current audio`, label `Package name`, `No scene packages yet.`,
  `Presets are DM-only`, `1 package`.
- `upgrade.spec.ts` pins the hero string `Local play stays free. Cloud plans are in preview.`,
  `Your current plan`, `Try Lantern preview`, `Save plan choice`, switch `Show planned annual
  pricing`, `Compare every feature`, breadcrumb button `Settings`. Runs SIGNED-OUT ⇒ item 12 untested.
- **No spec anywhere references ConnectedSources** (grep for `Pull notes`/`Push notes`/`Connect
  folder` returns nothing in `tests/e2e/`) ⇒ items 8/9/19 are free to change.
- ⚠️ **`canvas.spec.ts:508` clicks `getByRole('button',{name:'Save details'})`** — the same label
  ScenesCreator's meta editor uses (`ScenesCreator.tsx:535`). Do NOT rename it without checking which
  surface that spec is on. `Edit details of …` / `Delete …` are unpinned. `scene-cards.spec.ts`
  drives `SceneCardsPanel` (`ScenesCreator.tsx:431`), not the scene form.
- Audio's `Master volume`, `Add layer`, `Run now`, `Add rule`, `Add track`, `Unbind` appear in NO spec.

## VERIFIED NON-ISSUES (do not re-open)
- `ScenesCreator.submit` (`:61-88`) has try/finally-no-catch but is NOT a silent failure: the runtime
  emits `markFailure` before rethrowing, and `:249` renders it. This is the exception, not the rule.
- `ConnectedSources.confirmDisconnect` (`:500`) closes the dialog BEFORE awaiting, so no
  double-dispatch, and it has a real `catch`.
- `ensureFolderPermission` (`platform/fsSource.ts:155-173`) catches internally and returns `false`.
- `connectGoogleAccount` (`cloud/googleDocs.ts:211-262`) has a top-level catch.
- `SceneCardsPanel` root carries `margin: var(--space-8) auto 0`. `Dialog` is `position:fixed` +
  `zIndex: var(--z-modal)`, so rendering it inside a `display:grid` parent is harmless.
- DS `Switch` clears the 24px floor via a transparent hit box; `Slider` steppers use
  `--density-touch-target`. No sub-24px targets in this cluster except `BackBar` (item 10).
- Audio ambience mute button (`:1289`) is 32×32 — under 44 but over the WCAG 2.5.8 AA floor of 24,
  and its `aria-label` flips Mute/Unmute so the missing `aria-pressed` is fine.
- `Upgrade.tsx:312` `<Switch label="" aria-label=…>` — `label=""` is falsy, `aria-label` wins.
- `Upgrade.tsx:509` `tabIndex={0}` on the `overflowX:auto` matrix is CORRECT (WCAG 2.1.1).
- `Upgrade.confirmChange` (`:206-226`) is a correct `.then/.catch/.finally`.
- `SceneRowMetaEditor` drafts do NOT bleed across rows: `editingId` is single-valued.
- Audio's `useAssetBytesPresence` tri-state and the `'checking'` automation outcome are deliberate
  async honesty — never report "Checking…" as a missing loading state.
- `Audio.tsx:1069 title="Tracks &amp; sources"` renders correctly (JSX decodes attribute entities).
- DS `Tabs` hardcodes `aria-label="Sections"` but `{...rest}` is spread last, so it IS overridable.
- `Extensions.tsx:2291` `minmax(300px,1fr)` fits the ~365px phone box (it is OUTSIDE the Panel).
