---
name: settings-extensions-community-cluster
description: UX audit state for gm-react Settings/Extensions/Community/WikiReader — run #12 re-verify @016b696c; empty-live-region class CLOSED, 13 open, led by the prepaint reduce-motion trap and two theme-preference destroyers.
metadata:
  type: project
---

Audit state for `apps/gm-react/src/screens/{Settings,Extensions,Community,WikiReader}.tsx`.
Run #10 @`8fa95d31` (18 found). Run #11 @`9aeebdde` (6 fixed). **Run #12 @`016b696c` = latest.**

## FIXED — do NOT re-report
Runs ≤#11: `SettingsPermissions.grant()` catch; `loadFolders()` catch + `foldersFailed` + Retry;
player-safety tri-state `ok|fail|unknown`; `Community.confirmInstall` catch; Extensions inline
destructive confirms `autoFocus`; `modalIsolation.ts` honours `[data-modal-exempt]` (toasts inside a
Dialog are live again).
**New as of run #12 (@`016b696c`):**
- **The empty-live-region class is CLOSED.** `screen-kit.tsx:114 LoadingRegion` (with `srOnly` at
  `:91`) puts the label INSIDE the region; all 7 sites migrated (`Community.tsx:303/948/1270`,
  `Settings.tsx` ×3, `Extensions.tsx:1079`). `screen-kit-loading-region.test.tsx:64` source-scans
  those files and FAILS if the old `role="status" aria-label="Loading…"`-around-a-Skeleton returns.
- `screen-kit radioGroupKeyDown` has Home/End + disabled-skip (7 consumers).
- `nextHighContrastTheme` (`settings-validation.ts:40`, tested at `settings-validation.test.ts:63-83`)
  remembers the pre-HC theme. The **Switch** no longer destroys Parchment. ⚠️ The **Seg** still does —
  see STILL-OPEN #3.

## STILL-OPEN (run #12, ranked)
1. **`apps/gm-react/public/prepaint.js:34-36` vs `Settings.tsx:361-373` + `:4656-4663`: reduce-motion
   CANNOT be turned OFF when the OS asks for it.** prepaint writes
   `pref === 'reduced' || osReduce ? 'reduced' : 'full'`, so a stored `'full'` is discarded on every
   reload. Both controls (the Appearance `Seg` AND the Accessibility `Switch`) work in-session and
   silently revert. Minimal 1-line fix: honour an explicit stored value first —
   `pref === 'reduced' ? 'reduced' : pref === 'full' ? 'full' : (osReduce ? 'reduced' : 'full')`;
   `null` still follows the OS. A `system` option in the Seg is the nicer-but-larger version.
   ⚠️ `responsive.spec.ts:680` runs the whole sweep under `emulateMedia({reducedMotion:'reduce'})` —
   it writes no localStorage, so the minimal fix does not touch it.
2. **`Settings.tsx:2405-2496` `role="status" aria-live="polite" aria-atomic="true"` wraps the backup
   buttons AND the restore `<Dialog>`** (DS Dialog is NOT portaled) ⇒ opening the destructive confirm
   re-announces the whole atomic region including the dialog body. Fix: move role/aria onto the inner
   text block (`:2421`) and hoist the Dialog out of the region.
3. **`Settings.tsx:326-329` the Appearance theme `Seg` never writes `PREV_THEME_KEY`.** Picking
   "High contrast" from Appearance, then turning the Accessibility Switch OFF, falls back to `tavern`
   — the exact Parchment-destroying bug the Switch was fixed for, still reachable via the other
   control. Fix: `if (v === 'high-contrast' && theme !== 'high-contrast') writeLocal(PREV_THEME_KEY, theme)`.
4. **`Settings.tsx:3821-3913` AI transcript**: `maxHeight:320; overflowY:auto` with ZERO focusable
   descendants, no `tabIndex={0}`, no `role="log"`, no scroll-to-bottom. Keyboard users cannot reach
   streamed events (WCAG 2.1.1) and nothing announces them.
5. **`Settings.tsx:3832-3870` user vs assistant transcript bubbles differ ONLY by
   `alignSelf` + background colour** — no text prefix, no `aria-label`. A screen reader hears one
   undifferentiated stream with no speaker attribution (WCAG 1.3.1 / 1.4.1). Fix: an `srOnly`
   "You:" / "Assistant:" prefix (`srOnly` is already exported from screen-kit).
6. **`Extensions.tsx:1268-1279` and `:1339-1350`**: same unfocusable `maxHeight:300; overflowY:auto`
   statblock / spell-description scrollers.
7. **Detail-panel-below-the-list on phone**: `Extensions.tsx:884` and `Community.tsx:281` collapse to
   one column with the detail Panel AFTER the list; `setSelKey` (`Extensions:1127`) / `setSelId`
   (`Community:333`) never scroll or move focus ⇒ tapping a card in a 40-row list looks completely
   inert. Extensions is worse (`selected` defaults to `null`; Community defaults to `modules[0]`).
   In-repo fix: `WikiReader.tsx:301-308` (focus the heading + `window.scrollTo`). ⚠️ `Panel` accepts
   no `ref`/`id`, so wrap the detail Panel in a `<div tabIndex={-1} ref>`.
8. **`Settings.tsx:4888 minHeight: 44` (inline) on the settings nav rail rows.** An inline value BEATS
   `html[data-android] :is(button,…) { min-height: 48px }` (`styles/index.css:41-57`), so the rail
   SHRINKS to 44px on the one platform that mandates 48. Fix: `minHeight: 'var(--touch-target-min)'`
   (44px base / 48px under `html[data-android]`, `spacing.css:101` + `index.css:33`).
9. **`Settings.tsx:4177` `<Badge>Policy saved</Badge>` is unconditional** on every agent-binding row,
   including bindings whose `mcp.policies[agentId]` is null (`policy` is computed right above at
   `:4154`). Fix: `policy ? <Badge>Policy saved</Badge> : <Badge status="warning">Using campaign default</Badge>`.
10. **`Settings.tsx:4061-4062` `registerAgent` clears `newAgentId`/`newLabel` synchronously**, before
    `run()`'s dispatch resolves ⇒ a rejected registration wipes the user's typed input. Fix: give
    `run` an `onAccepted` callback and clear there.
11. **`Settings.tsx:4798-4806 GatedTab`'s "Switch to …" button unmounts itself** — the tier event
    re-renders `<Sub/>` with the real panel, so focus lands on `<body>` and nothing announces the
    reveal. Same shape, milder: **`Settings.tsx:4880 setTab`** swaps the whole right-hand panel with no
    focus move and no announcement (`aria-current="page"` is the only cue).
12. **`Settings.tsx:4230-4260` agent-binding remove** still drops focus to `<body>` (the two
    Extensions siblings got `autoFocus`; this one did not).
13. Nit: **`Settings.tsx:3294-3305` `<ol>` inside `<button>`** (AI provider preset cards) — invalid
    content model, and the whole numbered setup list joins the button's accessible name. Fix: numbered
    `<div>`s + an explicit `aria-label={preset.label}` (+ `aria-pressed={selected}`).
14. **`WikiReader.tsx:380-396` the `invalid` phase has no Retry** — a transient network error strands a
    public reader with only a manual page reload.
15. **Form validation is Toaster-only** (no `invalid`, no inline error, no focus move):
    `Community.tsx` wiki publish, `Settings.tsx` invite mint. `RecoveryKeyPanel` is the in-house model.

Lower-value, verified: `qrDataUrl(...)` has no `.catch`; `InvitesPanel`'s post-mint dialog swap drops
focus; `Extensions.tsx` "Export JSON" toasts "into the JSON box below" without scrolling to it;
`saveKey`/`forgetKey` have no try/catch (providerConfig catches internally — defensive only);
hard-`disabled` status buttons ("Current plan", "Current system", "Back up now").

## VERIFIED NON-ISSUES (do not re-open)
- **Nested `data-theme="parchment"`** (`Community.tsx`, `WikiReader.tsx`): correct — both use raw
  `var(--color-*)` semantic tokens, all redefined under `[data-theme='parchment']`.
- **`T.*` screen-kit map** (`screen-kit.tsx:34-61`) → semantic tokens; theme-nesting safe.
- `--color-status-error-border` EXISTS (`styles/tokens/colors.css:353`).
- `<label>` wrapping a DS `Switch`: `<button>` IS labelable.
- `void runAssistantExchange(...)` with no `.catch`: `ai/mcpBridge.ts` catches and `finish('failed')`.
- `setAiProviderKey`/`clearAiProviderKey`/`clearLegacyAiProviderKey` never reject.
- `Panel title="… &amp; …"` JSX entities: esbuild DECODES them.
- `repeat(auto-fill,minmax(N,1fr))` without a `min(100%,…)` guard: Pixel 5 is 393px ⇒ ~365px content
  box outside a Panel, so 260/300px tracks fit. Not overflow.
- DS `Dialog` traps + restores focus; it is NOT portaled (matters for #2).
- Hard-coded colors: clean. Only literal is the deliberate `#fff` QR quiet zone.
- DS `Select`/`Input` keep their focus ring when a caller passes its own onFocus/onBlur.
- DS `Button` implements soft-disable via `aria-disabled` (`Button.jsx:20-26`) — reuse it, don't
  reinvent. ⚠️ Playwright's actionability check does NOT treat `aria-disabled` as disabled, so
  soft-disabling a control a spec CLICKS silently changes that spec's meaning.

## Established patterns this cluster should copy
- Radiogroup done right: `Settings.tsx:4397+` and `:362-374`; `Seg` (`screen-kit.tsx:147+`) is the
  more complete compact variant (Home/End + disabled-skip).
- Load-failure with Retry: `Settings.tsx:525`, `:683`, `:2152`, `Community.tsx:276-289`.
- Inline WCAG 3.3.1 validation: `RecoveryKeyPanel`, `WikiReader.tsx:417-430`.
- Selection that moves the reader: `WikiReader.tsx:301-308`.
- Announced loading: `screen-kit.tsx:114 LoadingRegion`.
- Pure helpers in `settings-validation.ts` + `.test.ts` — the way to unit-test logic without stubbing
  `window.matchMedia` (absent in this repo's jsdom; stubbing it also trips `lint:boundary` PLAT-006).

## e2e coverage notes
`responsive.spec.ts:4-19` overflow-checks `/extensions`, `/community`, `/settings` (`#/wiki` is in the
axe gate but NOT in ROUTES); the loop only ever sees each route's DEFAULT tab.
`settings.spec.ts:22-59` drives ONLY the **Experience complexity** radiogroup by role+name.
`wiki.spec.ts` pins `Campaign wiki`, `Publish wiki`, `Eligible pages`, `Reading preview`,
`Player-visible pages`. `custom-types.spec.ts` drives Extensions → Object types.
`ai-assistant.spec.ts` touches Settings AI.
Still unguarded: the Open5e picker, the recovery-key dialog, Community → Export's banner,
Settings → Permissions grant/revoke, the AI provider preset cards, and **the motion / high-contrast
toggles** (so #1 and #3 have no regression net — a pure helper + `.ts` test is the cheap one to add).

See also [[audio-upgrade-scenes-creator-cluster]], [[onboarding-viewas-cluster]], [[ds-layer-audit]].
