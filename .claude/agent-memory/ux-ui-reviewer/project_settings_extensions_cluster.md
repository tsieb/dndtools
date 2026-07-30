---
name: settings-extensions-community-cluster
description: UX audit state for gm-react Settings/Extensions/Community/WikiReader — run #11 re-verify @9aeebdde; 6 of run #10's 18 are FIXED, 12 remain, with spec coupling and verified non-issues.
metadata:
  type: project
---

Audit state for `src/screens/{Settings,Extensions,Community,WikiReader}.tsx`.
Run #10 (@`8fa95d31`) was the first genuinely fresh sweep and found 18.
**Run #11 (2026-07-30, @`9aeebdde`) re-verified all 18: 6 FIXED, 12 STILL-OPEN.**

## FIXED since run #10 — do NOT re-report
- `Settings.tsx:1918` `SettingsPermissions.grant()` now `.then(result)/.catch` + Toaster, matching
  `revoke()`.
- `Settings.tsx:2065-2075` `loadFolders()` now has `.catch` + a `foldersFailed` state + an
  `EmptyState` with a "Try again" Button (`:2152`). The forever-skeleton is gone.
- `Settings.tsx:4581-4617` player-safety checks are now tri-state `'ok'|'fail'|'unknown'` with an
  `info` icon for the unrunnable case. The false green tick is gone.
- `Community.tsx:249-254` `confirmInstall` now has its `catch`.
- `Extensions.tsx:444`/`:1725` inline destructive confirms now `autoFocus` the danger button.
- ⚠️ **`platform/modalIsolation.ts:27` now honours `[data-modal-exempt]`, and
  `ds/components/overlay/Toast.jsx:305` sets it.** Toasts fired from inside a Dialog/Sheet/MapEditor
  are NO LONGER inerted. My old "toast-inside-modal is dead" landmine is RETIRED.

## STILL-OPEN (run #11, ranked)
1. **`public/prepaint.js:32-36` vs `Settings.tsx:4597-4612` / `:334-351`: reduce-motion cannot be
   turned OFF when the OS asks for it.** prepaint does `pref === 'reduced' || osReduce`, so writing
   `'full'` is overridden on every reload — the Switch works in-session and silently reverts. Needs a
   tri-state `system|full|reduced` (or an explicit override flag prepaint respects).
2. **`Settings.tsx:2345-2437` `role="status" aria-live="polite" aria-atomic="true"` wraps the backup
   buttons AND the restore `<Dialog>`.** DS `Dialog` is NOT portaled, so opening it re-announces the
   entire atomic region.
3. **`Settings.tsx:4154` `<Badge>Policy saved</Badge>` is unconditional** on every agent-binding row,
   including bindings whose `mcp.policies[agentId]` is null — a badge for state that isn't there.
4. **`Settings.tsx:4030-4039` `registerAgent` clears `newAgentId`/`newLabel` immediately**, before the
   async `run()` resolves → a rejected registration wipes the user's typed input.
5. **`Settings.tsx:3798-3806` AI assistant feed: `maxHeight:320; overflowY:auto` with no focusable
   children, no `tabIndex={0}`, no `role="log"`, no auto-scroll.** Long runs stream new events below
   the fold, unreachable by keyboard (WCAG 2.1.1) and unannounced.
6. **`Extensions.tsx:1271-1272` and `:1342-1343`**: same unfocusable `maxHeight:300; overflowY:auto`
   statblock/spell scrollers.
7. **Empty live regions — 7 sites.** `role="status" aria-label="Loading …"` wrapping only
   `<Skeleton>`, which is `aria-hidden="true"` (`ds/components/system/Skeleton.jsx:19,24,32`). A live
   region announces CONTENT, not its name; the region also mounts WITH its content and UNMOUNTS on
   completion, so both the load and its completion are silent in both directions.
   Sites: `Community.tsx:298,944,1267`, `Settings.tsx:703,1411,2145`, `Extensions.tsx:1081`.
8. **`Settings.tsx:4171-4198` agent-binding remove** still drops focus to `<body>` (the two
   Extensions siblings got `autoFocus`; this one did not).
9. **`Settings.tsx:4771-4779` `GatedTab`'s "Switch to …" button unmounts itself** on click (the tier
   event re-renders `<Sub/>` with the real panel) → focus to body, no announcement of the reveal.
10. **`WikiReader.tsx:380-396` the `invalid` phase has no Retry** — a transient network error strands
    a public reader with only a manual page reload. Every Community/Settings sibling has a Retry.
11. **Detail-panel-below-the-list on phone**: `Community.tsx:271/357` and `Extensions.tsx:883/1187`
    collapse to one column with the detail Panel AFTER the list; `setSelId` (`Community:328`) /
    `setSelKey` (`Extensions:1128`) never scroll or move focus, so tapping a card in a 40-row list
    looks completely inert. `WikiReader.tsx:301-308` is the in-repo fix (focus the heading +
    `window.scrollTo`). Extensions is the worse of the two (`selected` defaults to `null`).
12. **Form validation is Toaster-only** (no `invalid`, no inline error, no focus move):
    `Community.tsx:1126-1146` (wiki publish), `Settings.tsx:1331-1354` (invite mint).
    `RecoveryKeyPanel` (`Settings.tsx:2717-2735`) is the in-house model to copy.
13. Nit: **`Settings.tsx:3271` `<ol>` inside `<button>`** (AI provider preset cards) — invalid content
    model; the numbered setup list is concatenated into the button's accessible name.
14. Nit: **`Settings.tsx:4644-4658` High-contrast OFF hard-resets to `tavern`**. Downgraded from run
    #10 — the `help` copy now says "turning it off restores the Tavern theme", so it is documented,
    not silent. Still destroys a Parchment preference.

Lower-value, verified but not worth a line each: `Settings.tsx:1316` `qrDataUrl(...)` has no `.catch`;
`InvitesPanel`'s post-mint dialog swap drops focus; `Extensions.tsx:1151` `<span onClick=stopPropagation>`
is dead code; `Extensions.tsx:256-271` "Export JSON" toasts "into the JSON box below" without
scrolling/focusing it; `Settings.tsx:3103-3154` `saveKey`/`forgetKey`/`forgetLegacyKey` have no
try/catch AND their dialogs' `onClose` is `!keyBusy &&`-gated (providerConfig catches internally, so
defensive only); hard-`disabled` status buttons ("Current plan" `:1200`, "Current system"
`Extensions.tsx:2331`, "Back up now" `:2285`).

## VERIFIED NON-ISSUES (do not re-open)
- **Nested `data-theme="parchment"`** (`Community.tsx:1490`, `WikiReader.tsx:354+`): correct — both use
  raw `var(--color-*)` semantic tokens, all redefined under `[data-theme='parchment']`.
- **`T.*` screen-kit map** (`src/app/screen-kit.tsx:34-61`) → semantic tokens; theme-nesting safe.
- **`--color-status-error-border` EXISTS** (`styles/tokens/colors.css:353`).
- **`<label>` wrapping a DS `Switch`** (`Community.tsx:617,642`): `<button>` IS labelable.
- **`void runAssistantExchange(...)` with no `.catch`** (`Settings.tsx:3663`): `src/ai/mcpBridge.ts`
  catches and `finish('failed')`.
- **`setAiProviderKey`/`clearAiProviderKey`/`clearLegacyAiProviderKey`** (`ai/providerConfig.ts`)
  never reject.
- **`Panel title="… &amp; …"` JSX entities**: esbuild DECODES them.
- **`repeat(auto-fill,minmax(N,1fr))` without a `min(100%,…)` guard** (`Settings.tsx:3178`,
  `Extensions.tsx:500,2291`): Pixel 5 is 393px ⇒ ~365px content box outside a Panel, so 260/300px
  tracks fit. Not overflow.
- **DS `Dialog`** traps + restores focus (`Dialog.jsx:86,143`); it is NOT portaled (matters for #2).
- Hard-coded colors: clean. Only literal is `Settings.tsx:1580` `#fff`, a deliberate QR quiet zone.
- DS `Select`/`Input` now keep their focus ring when a caller passes its own onFocus/onBlur
  (`Select.jsx:17-18`) — the "commit-on-blur kills the ring" bug is fixed.

## Established patterns this cluster should copy
- Radiogroup done right: `Settings.tsx:4397-4408` + `:362-374`. `Seg` (screen-kit `:147+`) is the
  compact variant and is the more complete implementation (Home/End + disabled-skip).
- Load-failure with Retry: `Settings.tsx:525-540`, `:683-700`, `:2152` (new), `Community.tsx:276-289`.
- Inline WCAG 3.3.1 validation: `RecoveryKeyPanel` `Settings.tsx:2717-2735`, `WikiReader.tsx:417-430`.
- Selection that moves the reader: `WikiReader.tsx:301-308`.
- Separate a `failed` flag from `null`-means-loading — `Settings.tsx:2065-2075` is now the model.

## e2e coverage notes
`responsive.spec.ts:4-19` overflow-checks `/extensions`, `/community`, `/settings` (`#/wiki` is in
the axe gate but NOT in ROUTES). Mobile profile = `devices['Pixel 5']` = 393×851.
`settings.spec.ts:22-54` drives the **Experience complexity** radiogroup by role+name — don't rename.
`wiki.spec.ts:27,36-44,64` uses `getByRole('tab',{name:'Campaign wiki'})`, `Publish wiki`,
`Eligible pages`, `Reading preview`, `Player-visible pages`, and `getByRole('main')` on the
WikiReader notice phases.
`custom-types.spec.ts` drives Extensions → Object types. `ai-assistant.spec.ts` touches Settings AI.
Still unguarded: the Open5e source picker, the recovery-key dialog, Community → Export's banner,
Settings → Permissions grant/revoke, the AI provider preset cards, the motion/HC toggles.

See also [[audio-upgrade-scenes-creator-cluster]], [[onboarding-viewas-cluster]], [[ds-layer-audit]].
