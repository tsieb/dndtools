---
name: audio-upgrade-scenes-creator-cluster
description: First real audit (2026-07-30, run #8) of gm-react Audio.tsx / Upgrade.tsx / ScenesCreator.tsx / CommandPalette.tsx / ConnectedSources.tsx — open defects with file:line, spec coupling, and verified non-issues.
metadata:
  type: project
---

First sweep of these five surfaces (Audio/Upgrade/ScenesCreator had NEVER been reviewed).
Line numbers from branch `auto/visual-review-loop` @ `329bcc58`.

**Why:** the Settings/Extensions/Community backlog is now closed
([[settings-extensions-community-cluster]]), so this is where the remaining yield is.
**How to apply:** re-check by grepping the anchor string, not the line number.

## Root-cause facts to reuse (verified in `runtime/SceneRuntime.ts`)
- `dispatch()` → `dispatchNow` **persists the FULL state to Dexie on every accepted command**
  (`:459 persistFullState`), appends to `sync.operations`, and fans out to every P2P replication
  listener. So any control that dispatches per input event is a real write-amplification bug.
- **`dispatch` THROWS on persist failure** (`:481 throw error`) — it does not return a rejection.
  Any `try { await runtime.dispatch(…) } finally { setBusy(false) }` with **no `catch`** is a
  silent failure. This pattern is everywhere in this cluster; grep for it first.
- While previewing, every command is rejected read-only at `:438` — but the surrounding screens
  already fail closed (empty actor-filtered lists), so "control enabled during preview" findings
  are usually NOT reachable. Check the list source before claiming one.
- `lastLifecycle` / `lastError` are SINGLE GLOBAL SLOTS, cleared only by the next dispatch.
  Any per-form "Saved" badge derived from them is stale by construction.

## STILL-OPEN (2026-07-30, run #8) — ranked
1. `Audio.tsx:813` (master volume) + `:1281` (each ambience layer) — DS `Slider` `onChange` fires on
   every `input` tick (`ds/components/forms/Slider.jsx:84`), so one drag = ~100 dispatches, 100 full
   Dexie writes, 100 op-log entries replicated to players. **Fix already exists in-repo:**
   `CommitSlider` at `app/map/dock/InspectorPanel.tsx:42` (local draft + `onCommit`). Lift it.
2. `Audio.tsx:281-283` — the `dispatch()` helper discards `CommandResult`. Used by `playSource`
   (:389), `bindScene` (:401), `unbindScene` (:416), `toggleRuleEnabled` (:632), `chooseOutput`
   (:488), pause/resume/stop (:770/:782/:794). Rejection = Switch snaps back / Select reverts, no
   toast, no inline text. Sibling paths (`playAsset`, `setLayer`, `applyPreset`) do it right.
3. `Audio.tsx:547` + `:1596-1603` — delete a saved scene package: no confirm, no undo, ghost button
   adjacent to "Apply". `removeLayer` (:463) and `deleteRule` (:660) both ship Toaster undo.
4. `ConnectedSources.tsx:307-360` `executePush` — `try`/`finally`, **no `catch`**. A thrown persist
   aborts the loop before `setStatusFor` (:353): row returns to idle with NO status. Its three
   siblings (`pullFolder` :265, `pullGdoc` :429, `createNewDoc` :388) all have the catch.
5. `ConnectedSources.tsx:220-222` + `:626-630` — the `'connect-folder'` error key is never deleted
   (success writes `record.id` instead, :216), so one picker failure pins a permanent red line. It
   is also the ONLY status block in the file with no `role="status"` (cf. :674, :767, :835).
6. `ScenesCreator.tsx:356-381` — inline metadata editor: trigger IconButton has no `aria-expanded`/
   `aria-controls`; opening doesn't move focus in; `onClose` (:379) and Escape (:478) don't restore
   focus → `<body>` mid-list. The delete path on the same row uses DS `Dialog` and is correct.
7. `ScenesCreator.tsx:460-473` `SceneRowMetaEditor.save` — `try`/`finally`, no `catch`; a thrown
   dispatch reverts "Saving…" and shows nothing.
8. `CommandPalette.tsx:204-209` — `new:encounter` is the ONE Create launcher with no create-intent
   `state`. Siblings are consumed at `Characters.tsx:1614`, `Knowledge.tsx:845`,
   `Campaign.tsx:683`, `Atlas.tsx:133`; `Session.tsx` has no `useLocation` at all.
9. `Audio.tsx:275`/`:376`/`:1100-1113` — `addedName` success banner reset ONLY in the failure
   branch (:380), so "'X' added" persists across typing and tab switches.
10. `Audio.tsx:416` + `:1434-1442` — "Unbind" removes only `bound[0]`, unnamed, no undo, result
    discarded (see #2). Row still reads "N cues" after.
11. `Upgrade.tsx:453`/`:462` — during `ent.loading` the CTAs are hard-disabled but keep the
    optimistic label; `planChangesUnavailable` (:204) excludes `loading`, so hero + body + all 3
    buttons + footnote re-label at once when the fetch settles. Only reachable signed-in with the
    account API configured (`cloud/entitlements.ts:245 useState(serverBacked)`).
12. `Audio.tsx:1737` (automation row) + `:1132` (source row) — `display:flex`, no `flexWrap`, unlike
    the now-playing strip (:728). **UNVERIFIED at 375px** — min-content is within a few px of the
    ~283px phone content box. See the gate blind spot below.
13. `Upgrade.tsx:569-585` — group-band label is `role="columnheader" aria-colspan={4}` inside a
    `rowgroup`; should be `rowheader`/`cell`. axe's table rules pass, so the axe gate misses it.

## Gate blind spots found this pass
- `responsive.spec.ts:202-213` iterates ROUTES by setting `location.hash` and only ever sees each
  route's **DEFAULT tab**. `/audio`'s Presets and Automation tabs have NEVER been overflow-checked.
  Same blind spot applies to any tabbed route in ROUTES.
- `a11y-axe-gate.spec.ts:19` uses `['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa',
  'best-practice']` but blocks only on `critical`/`serious` (`:20`). Moderate-impact rules
  (`heading-order`, `region`, most table-semantics rules) are reported and ignored.
- The responsive loop waits on `page.locator('h1').first()`, so the shell owns an `h1` —
  screens starting at `<h2>` (Upgrade :255, every `Panel`) are NOT a heading-order defect.

## SPEC COUPLING (checked)
- `audio-presets.spec.ts:138-141` clicks `Delete ${name}` and immediately expects `/Deleted/` — a
  confirm dialog for #3 BREAKS it; a Toaster-undo-only fix (matching the siblings) keeps it green.
  Same file pins: `tab "Presets"`, heading `Atmosphere library`, `Apply ${name}`,
  `Save current audio`, label `Package name`, `No scene packages yet.`, `Presets are DM-only`.
- `upgrade.spec.ts` pins the exact hero string `Local play stays free. Cloud plans are in preview.`
  (:24), `Your current plan`, `Try Lantern preview`, `Save plan choice`, switch name
  `Show planned annual pricing`, `Compare every feature`, breadcrumb button `Settings`. It runs
  SIGNED-OUT, so #11's loading path is untested.
- `command-palette.spec.ts` only drives `New scene`, `GM Screen`, `Campaign Primer`, `Settings`,
  `Player view` — **"Build encounter" (#8) is referenced by no spec; safe to change.**
- `scene-cards.spec.ts` drives the SceneCardsPanel that `ScenesCreator.tsx:431` renders (`Title`,
  `Flavor text`, `Create scene card`, `Queue ${name}`, `Next card`) — not ScenesCreator's own form.
  Nothing pins ScenesCreator's `Edit details of …` / `Delete …` labels → #6/#7 are safe.
- No spec references ConnectedSources at all → #4/#5 are safe.

## VERIFIED NON-ISSUES (do not re-open)
- DS `Tabs` ARIA is COMPLETE now: `idBase` emits `id`+`aria-controls` and `tabPanelProps`
  (`ds/components/core/Tabs.jsx:18-25`) emits `role=tabpanel`+`aria-labelledby`. Audio uses both
  (:859, :865/:1471/:1682). The old ds-layer "tabpanel wiring gap" is CLOSED for this consumer.
- DS `Switch` (`forms/Switch.jsx:34-35`) clears the 24px floor via a transparent hit box;
  `Slider` steppers use `--density-touch-target` (`Slider.jsx:110`). No sub-24px targets here.
- `Upgrade.tsx:312` `<Switch label="" aria-label=…>` — `label=""` is falsy, so no empty label
  element is emitted and `aria-label` wins. Fine.
- `Upgrade.tsx:509` `tabIndex={0}` on the `overflowX:auto` matrix region is CORRECT (WCAG 2.1.1
  scrollable-region-focusable).
- Audio's `useAssetBytesPresence` tri-state (`:99-127`) and the `'checking'` automation outcome
  (`:566`) are deliberate honesty about async — never report "Checking…" as a missing loading state.
- `Audio.tsx:1009 title="Tracks &amp; sources"` renders correctly (esbuild decodes JSX attribute
  entities — verified by running the transform).

## Onboarding delta (supersedes [[onboarding-viewas-cluster]])
- Item 1 (skip() discarding tier/AI/party) is **FIXED** — `Onboarding.tsx:315-318` now writes
  `TIER_KEY`, `saveAiUsagePreference`, `INVITES_KEY` on the skip path too.
- Item 5 (ready-checklist rows silently wiping the vault) is **FIXED** — warning banner at
  `:1123-1128` plus a consequence-naming `aria-label` at `:1147-1151`.
- Item 4 is **STILL OPEN**: `Onboarding.tsx` contains ZERO `aria-live` / `role="status"` /
  `aria-current` (grep-verified). Step position is announced nowhere.
