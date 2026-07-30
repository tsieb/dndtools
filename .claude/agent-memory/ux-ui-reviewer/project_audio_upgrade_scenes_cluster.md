---
name: audio-upgrade-scenes-creator-cluster
description: Audio.tsx / Upgrade.tsx / ScenesCreator.tsx / ConnectedSources.tsx / screen-kit.tsx — run #10 re-verify (2026-07-30 @ 8fa95d31) with a FIXED vs STILL-OPEN split, spec coupling, and verified non-issues.
metadata:
  type: project
---

Run #8 = first sweep. Run #10 (2026-07-30 @ `8fa95d31`) = re-verify + deeper sweep.
Line numbers from `auto/visual-review-loop`. Re-check by grepping the anchor string, not the line.

⚠️ `ConnectedSources.tsx` lives at `src/app/`, NOT `src/screens/`. `screen-kit.tsx` is `src/app/screen-kit.tsx`.

## Root-cause facts to reuse (re-verified in `runtime/SceneRuntime.ts`)
- `dispatch()` → `dispatchNow` persists FULL state to Dexie per accepted command, appends to
  `sync.operations`, fans out to P2P listeners. Per-input-event dispatch = write amplification.
- **`dispatch` THROWS on persist failure** (`:481 throw error`). Any `await runtime.dispatch` with no
  `catch` is a silent failure. ⚠️ BUT before rethrowing it does `markFailure` + `emit()`, so a screen
  that renders off `runtime.lastLifecycle` / `runtime.lastError` DOES show the failure
  (ScenesCreator's create form is the one place in this cluster that survives the throw for free).
- **`this.lifecycle` is reset ONLY in `hydrateFromStorage` (`:338`)** — never on route change. So
  `lastLifecycle`-derived "Saved" badges persist across unmount/remount. Confirmed defect vector.
- Preview rejects every command read-only; the screens fail closed with empty actor-filtered lists.
- `runtime.lastError` / `lastLifecycle` are SINGLE GLOBAL SLOTS.

## FIXED since run #8 — do NOT re-report
1. Audio's two volume faders → `CommitSlider` (`Audio.tsx:204-232`) commits on pointerup/keyup/blur.
2. Audio's `dispatch()` helper (`:331-340`) now surfaces both rejection and thrown error via Toaster.
3. Audio's `addedName` banner now cleared on submit (`:423`) and on typing (`:1094`).
4. `ConnectedSources.executePush` now has its `catch` (`:361-365`).
5. `ConnectedSources` `'connect-folder'` error key now deleted on retry (`:215`) and has `role=status`.
6. `screen-kit` `Seg` (`:147-235`) is now a FULL roving-tabindex radiogroup: Home/End + skips
   disabled + `maxWidth:100%` + `flexWrap`. (`radioGroupKeyDown` was NOT given the same treatment.)
7. DS `Tabs` ARIA complete (`idBase` + `tabPanelProps`); Audio uses both.
8. DS `Field` is exemplary: auto-id, `aria-required`, `aria-describedby`, `aria-invalid`,
   `role="alert"` on error, `*` kept out of the accessible name.

## STILL-OPEN (run #10) — ranked
1. **Audio: 11 dispatch sites with no `catch`.** `importAudio` (:342-371, try/finally only — bytes are
   already in the asset store, so a persist throw ORPHANS them silently), `addTrack` (:398),
   `saveCurrentPreset` (:585), `createRule` (:661) are try/finally-no-catch; `playAsset` (:373),
   `setLayer` (:490), `applyPreset` (:571), `deletePreset` (:607), `removeLayer` (:508),
   `deleteRule` (:710), `runRuleNow` (:748) have NO try at all. The fix is already in the file — route
   them through the `dispatch()` helper at `:331` or copy its `.catch`.
2. **`ConnectedSources.signInGoogle` (:374-385)** — `setBusy('google-auth')` … `await` …
   `setBusy(null)` with no `try/finally`. `busy` is a SINGLE panel-wide slot and every button is
   `disabled={busy!==null}`, so a non-settling GIS popup deadlocks the whole panel until remount.
3. **`Audio.tsx:1799` automation row** — `display:flex`, NO `flexWrap`, 6 children (Icon, flex-1 text,
   Badge, Switch, "Run now", delete). At 375px the fixed children eat ~275 of ~287px, crushing the
   label column to ~12px. `responsive.spec.ts` never selects the Automation tab, and `clippedControls`
   only detects viewport escape, not crushing. Same shape (less severe) at `:1194` and `:1288`.
4. **`CommitSlider` readout lies during a drag.** `valueLabel` (`:883`, `:1349`) is computed from the
   DURABLE value while `value` is the draft, and DS `Slider.jsx:86` maps `valueLabel` →
   `aria-valuetext` (which WINS over `aria-valuenow`). Keyboard arrows therefore announce the same %
   repeatedly. Fix: lift the draft out of CommitSlider, or accept `valueLabel` as `(v)=>string`.
5. **`CommitSlider` + Space on the ± steppers.** Space fires `keyup` BEFORE the synthesized `click`,
   so `commit()` sees `draft===null`; each press commits the PREVIOUS press's value and the last one
   only lands on blur. Enter is fine (click on keydown).
6. **ConnectedSources status lines are colour-blind to outcome.** `:686`, `:777`, `:847` all render
   `color: T.sub` whether the message is "Imported 3 new" or "Folder access was denied". Only
   `connect-folder` (:637) uses `T.err`.
7. **ConnectedSources never clears `statusBySource[key]` at the start of a retry.** `pullFolder`
   (:229), `startFolderPush` (:277), `pullGdoc` (:404), `createNewDoc` (:387), `signInGoogle` (:374)
   all leave the prior run's line up. Identical repeat outcome ⇒ zero feedback. `connectFolder` (:215)
   is the one that does it right.
8. **ScenesCreator's create-form "Saved"/failure badge (`:236-261`)** derives from the global
   `runtime.lastLifecycle`, which survives remount ⇒ "Saved" on a fresh empty form. Also has NO
   `role="status"` anywhere, so neither outcome is announced.
9. **ScenesCreator inline meta editor** — `IconButton` (:356) has no `aria-expanded`/`aria-controls`;
   focus never enters (so the Escape handler at `:477` on the CONTAINER is dead for the common case,
   despite the docblock claiming Escape works); `onClose`/success drop focus to `<body>`;
   `save()` (:460-473) try/finally with no catch; success gives NO confirmation at all.
10. **`ConnectedSources` panel-wide `busy`** — during any op every button in every row goes grey with
    its normal label ("Pull notes"), so nothing says which row is working or that anything is.
11. **`Audio.tsx:1501` "Unbind"** removes only `bound[0]` of N; both `Bind`/`Unbind` (`:1497`/`:1506`)
    lack a per-scene `aria-label`, unlike every sibling in the file (`Apply ${preset.name}` etc.).
12. **`Audio.tsx:607`/`:1658-1665` delete scene package** — no confirm, no undo, ghost button next to
    "Apply". ⚠️ See SPEC COUPLING: a confirm dialog BREAKS the spec; a Toaster undo does not.
13. **`screen-kit BackBar` (:254-271)** — `padding:0`, 16px icon + 13px text ⇒ ~17px tall target
    (WCAG 2.5.8 wants 24). Consumers: `Upgrade.tsx:234`, `Knowledge.tsx:465`.
14. **`screen-kit radioGroupKeyDown` (:22-32)** — still no Home/End and does not skip `disabled`
    radios, while its sibling `Seg` got both. Consumers: Onboarding ×4, Community ×1, Settings ×2.
15. **`Upgrade.tsx:453`/`:462`** — CTAs hard-disabled during `ent.loading` with the optimistic label
    and no spinner; `planChangesUnavailable` (:204) excludes `loading`, so hero + body + 3 buttons +
    footnote all re-label at once when the fetch settles.
16. **`Upgrade.tsx:578-584`** — group band is `role="columnheader" aria-colspan={4}` inside a
    `rowgroup`; should be `rowheader`/`cell`. axe's table rules are moderate-impact ⇒ gate misses it.
17. **`Upgrade.tsx:507` + `:518`** — outer `role=region` and inner `role=table` carry the IDENTICAL
    `aria-label="Plan feature comparison"` (double announcement).
18. **Audio live regions are mounted WITH their content** (`:954`, `:1057`, `:1151`, `:1407`, `:1603`,
    `:1994`) — the node is inserted along with the text, which many AT combos will not announce.
    Same in ConnectedSources (`:635`, `:680`, `:776`, `:843`).
19. **Audio soundboard tiles (`:994`) and ambience mute buttons (`:1289`)** are raw inline-styled
    `<button>`s with no hover and no focus-visible treatment. ScenesCreator's row button (`:320-325`)
    does hover via `onMouseEnter`/`onMouseLeave` — mouse-only, no keyboard parallel.
20. **`ConnectedSources` `Select` inside `SourceRow` (`:796`)** — DS `Select`'s wrapper has no
    `minWidth:0`/`maxWidth:100%`, and a native `<select>` sizes to its widest `<option>`. Long note
    titles can push the row past a 375px Panel. Unverified at runtime; flagged as a risk.
21. **`Audio.tsx:1817-1825`** — an ENABLED rule whose outcome isn't in `ruleOutcomes` renders NO badge
    at all (silent third state next to Ready / Blocked / Checking…).
22. **ScenesCreator empty state (`:279-288`)** is an ad-hoc `Card` + text; every sibling screen uses
    the DS `EmptyState` (Audio uses it 4×).

## Gate blind spots (re-verified)
- `responsive.spec.ts:4-20 ROUTES` includes `/audio` and `/upgrade`, but the loop only sets
  `location.hash` ⇒ it only ever sees each route's DEFAULT tab. Audio's Presets/Automation tabs have
  NEVER been overflow-checked. Applies to every tabbed route in ROUTES.
- `clippedControls` (`responsive.spec.ts:22-60`) only flags controls escaping the viewport with no
  scrolling ancestor. A flex row that CRUSHES a text column to 12px passes cleanly.
- `a11y-axe-gate.spec.ts` blocks only on `critical`/`serious`; moderate rules (table semantics,
  heading-order, region) are reported and ignored.
- The responsive loop waits on `page.locator('h1')` owned by the SHELL — screens starting at `<h2>`
  (Upgrade `:255`, every `Panel`) are NOT a heading-order defect.

## SPEC COUPLING (re-checked run #10)
- `audio-presets.spec.ts:138-141` clicks `Delete ${name}` and immediately expects `/Deleted/` — a
  confirm dialog for item 12 BREAKS it; a Toaster undo keeps it green. Same file pins tab `Presets`,
  heading `Atmosphere library`, `Apply ${name}`, `Apply Stone Corridor`, `Save current audio`, label
  `Package name`, `No scene packages yet.`, `Presets are DM-only`, `1 package`.
- `upgrade.spec.ts` pins the hero string `Local play stays free. Cloud plans are in preview.`,
  `Your current plan`, `Try Lantern preview`, `Save plan choice`, switch `Show planned annual
  pricing`, `Compare every feature`, breadcrumb button `Settings`. Runs SIGNED-OUT ⇒ item 15 untested.
- **No spec anywhere references ConnectedSources** (grep for `Pull notes`/`Push notes`/`Connect
  folder` returns nothing in `tests/e2e/`) ⇒ items 2/6/7/10/20 are free to change.
- Nothing pins ScenesCreator's `Edit details of …` / `Delete …` / `Save details` ⇒ items 8/9 safe.
  `scene-cards.spec.ts` drives `SceneCardsPanel` (`ScenesCreator.tsx:431`), not the scene form.
- Audio's `Master volume`, `Add layer`, `Run now`, `Add rule`, `Add track`, `Unbind` appear in NO
  spec (only `canvas.spec.ts`/`scene-cards.spec.ts` matched the grep, for unrelated strings).

## VERIFIED NON-ISSUES (do not re-open)
- `ScenesCreator.submit` (`:61-88`) has try/finally-no-catch but is NOT a silent failure: the runtime
  emits `markFailure` before rethrowing, and `:249` renders it. This is the exception, not the rule.
- `ensureFolderPermission` (`platform/fsSource.ts:155-173`) catches internally and returns `false`,
  so `startFolderPush`'s bare `setBusy`/`await`/`setBusy` cannot pin `busy` that way.
- `connectGoogleAccount` (`cloud/googleDocs.ts:211-262`) has a top-level catch; the only deadlock
  route is a GIS promise that never settles (item 2).
- `SceneCardsPanel` root carries `margin: var(--space-8) auto 0`, so there IS clearance below the
  ScenesCreator grid. `Dialog` (`ds/components/overlay/Dialog.jsx`) is `position:fixed` +
  `zIndex: var(--z-modal)`, so rendering it inside a `display:grid` parent is harmless.
- DS `Switch` clears the 24px floor via a transparent hit box; `Slider` steppers use
  `--density-touch-target`. No sub-24px targets in this cluster except `BackBar` (item 13).
- `Upgrade.tsx:312` `<Switch label="" aria-label=…>` — `label=""` is falsy, `aria-label` wins.
- `Upgrade.tsx:509` `tabIndex={0}` on the `overflowX:auto` matrix is CORRECT (WCAG 2.1.1).
- `Upgrade.confirmChange` (`:206-226`) is a correct `.then/.catch/.finally` — `busy` always clears.
- `SceneRowMetaEditor` drafts do NOT bleed across rows: `editingId` is single-valued and the editor is
  remounted per row, so `useState(name)` re-initializes.
- Audio's `useAssetBytesPresence` tri-state and the `'checking'` automation outcome are deliberate
  async honesty — never report "Checking…" as a missing loading state.
- `Audio.tsx:1069 title="Tracks &amp; sources"` renders correctly (JSX decodes attribute entities).
- DS `Tabs` hardcodes `aria-label="Sections"` but `{...rest}` is spread last, so it IS overridable.
