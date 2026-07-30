---
name: settings-extensions-community-cluster
description: UX audit state for gm-react Settings/Extensions/Community/WikiReader — run #10 fresh sweep found 18 NEW open defects after the old backlog closed; lists them plus the verified non-issues.
metadata:
  type: project
---

Audit state for `src/screens/{Settings,Extensions,Community,WikiReader}.tsx`.
**Run #10 (2026-07-30, @8fa95d31): the old 10-item backlog is still CLOSED, but a genuinely fresh
sweep (first one to cover WikiReader + all 13 Settings subpages + all 5 Extensions tabs) surfaced
18 new defects.** The "low-yield, skip it" verdict from run #8 was WRONG — it was based on
re-walking the old list, not on reading the files.

## STILL-OPEN (run #10, ranked)
1. **`Settings.tsx:1918-1931` `SettingsPermissions.grant()` is `void runtime.dispatch(...)` with no
   `.then`/`.catch`/toast.** A rejected grant is 100% silent. Its sibling `revoke()` (`:1882`) is the
   model — full result handling + Undo. Highest-value single fix in the cluster.
2. **`Settings.tsx:2054-2057` `void listFolderSources().then(setFolders)` has no `.catch`** →
   `folders` stays `null` → Vault connections shows its Skeleton **forever** on any rejection.
3. **`public/prepaint.js:22-40` vs `Settings.tsx:4590-4604` / `:334-351`: motion preference cannot be
   turned OFF when the OS asks for reduce-motion.** prepaint does `pref === 'reduced' || osReduce`,
   so writing `'full'` is overridden on every reload. The toggle silently reverts. Verified by reading
   both files.
4. **`Settings.tsx:2345-2437` `role="status" aria-live="polite" aria-atomic="true"` wraps the backup
   buttons AND the restore `<Dialog>`.** DS `Dialog` is NOT portaled (no `createPortal` in
   `ds/components/overlay/Dialog.jsx`), so opening it re-announces the entire atomic region.
5. **`Settings.tsx:4560-4581` player-safety checks render `ok:true` (green tick) for the "add a player
   to run this check" case** — a green pass on a check that never ran.
6. **`Settings.tsx:4118` `<Badge>Policy saved</Badge>` is unconditional** on every agent-binding row,
   including bindings whose `mcp.policies[agentId]` is null.
7. **`Settings.tsx:3986-4004` `registerAgent` clears `newAgentId`/`newLabel` immediately**, before the
   async `run()` resolves → a rejected registration wipes the user's typed input.
8. **`Settings.tsx:3762-3771` AI assistant feed: `maxHeight:320; overflowY:auto` with no focusable
   children, no `tabIndex={0}`, no `role="log"`, and NO auto-scroll.** Long runs stream new events
   below the fold, unreachable by keyboard and unannounced.
9. **`Extensions.tsx:1263-1304` and `:1335-1350`**: same unfocusable `maxHeight:300; overflowY:auto`
   statblock/spell scrollers (WCAG 2.1.1).
10. **Empty live regions — 6 sites.** `role="status" aria-label="Loading …"` wrapping only
    `<Skeleton>`, which is `aria-hidden="true"` (`ds/components/system/Skeleton.jsx:19,24,32`). A live
    region announces CONTENT, not its name → both the load and its completion are silent.
    Sites: `Community.tsx:292,938,1261`, `Settings.tsx:702,1410,2119`, `Extensions.tsx:1070`.
11. **Inline two-step confirms drop focus to `<body>`** when the trigger unmounts:
    `Extensions.tsx:439-456` (package remove), `:1715-1740` (custom-type delete),
    `Settings.tsx:4171-4198` (agent binding remove). `ImportControl` (`Extensions.tsx:653-671`)
    already has the `autoFocus` fix — copy it.
12. **`Settings.tsx:4728-4736` `GatedTab`'s "Switch to …" button unmounts itself** on click (tier
    event re-renders `<Sub/>`) → focus to body, no announcement.
13. **`Community.tsx:230-252` `confirmInstall` is `try/finally` with NO `catch`** → `runtime.dispatch`
    rethrow on persist failure = unhandled rejection, dialog stays open, zero feedback.
14. **`WikiReader.tsx:380-396` the `invalid` phase has no Retry** — a transient network error strands
    a public reader with only a manual page reload. Every Community/Settings sibling has a Retry.
15. **Detail-panel-below-the-list on phone**: `Community.tsx:266-274/352` and
    `Extensions.tsx:876-883/1182` stack to 1 column; `setSelId`/`setSelKey` never scrolls, so tapping
    a card looks inert below a 40-row list.
16. **Form validation is Toaster-only** (no `invalid`, no inline error, no focus move):
    `Community.tsx:1126-1146` (wiki publish), `Settings.tsx:1331-1354` (invite mint).
    `RecoveryKeyPanel` (`Settings.tsx:2717-2735`) is the in-house model to copy.
17. **`Settings.tsx:4605-4619` High-contrast OFF hard-resets to `tavern`**, destroying a Parchment
    preference instead of restoring the prior non-HC theme.
18. **`Settings.tsx:3235-3246` `<ol>` inside `<button>`** (AI provider preset cards) — invalid content
    model; the whole numbered setup list is concatenated into the button's accessible name.

Lower-value, verified but not worth a line each: `Settings.tsx:1316` `qrDataUrl(...)` has no `.catch`;
`InvitesPanel`'s post-mint dialog swap drops focus; `Extensions.tsx:1151` `<span onClick=stopPropagation>`
is dead code since the row stopped being a `role="button"`; `Extensions.tsx:256-271` "Export JSON"
toasts "into the JSON box below" without scrolling/focusing it; `Settings.tsx:3103-3154` `saveKey`/
`forgetKey`/`forgetLegacyKey` have no try/catch around their awaits AND their dialogs' `onClose` is
`!keyBusy &&`-gated, so a throw would be an unescapable dialog (providerConfig.ts catches internally,
so it's defensive only); hard-`disabled` status buttons ("Current plan" `:1200`, "Current system"
`Extensions.tsx:2331`, "Back up now" `:2285`).

## VERIFIED NON-ISSUES (do not re-open)
- **Nested `data-theme="parchment"`** (`Community.tsx:1490`, `WikiReader.tsx:354+`): correct — both use
  raw `var(--color-*)` semantic tokens, all redefined under `[data-theme='parchment']`. The legacy
  alias bridge on plain `:root` is untouched here.
- **`T.*` screen-kit map** (`src/app/screen-kit.tsx:34-61`) → semantic tokens; theme-nesting safe.
- **`--color-status-error-border` EXISTS** (`styles/tokens/colors.css:353`); `Panel`'s `...style`
  spread lands `borderColor` after `border`, so `Settings.tsx:893` works.
- **`<label>` wrapping a DS `Switch`** (`Community.tsx:617,642`): `<button>` IS a labelable element,
  so the click forwards. Not a defect.
- **`void runAssistantExchange(...)` with no `.catch`** (`Settings.tsx:3663`): `src/ai/mcpBridge.ts`
  catches and `finish('failed')`.
- **`setAiProviderKey`/`clearAiProviderKey`/`clearLegacyAiProviderKey`** (`ai/providerConfig.ts:346,
  392,431`) never reject — every await is internally try/caught.
- **`Panel title="… &amp; …"` JSX entities**: esbuild DECODES them. Never report as literal-`&amp;`.
- **`repeat(auto-fill,minmax(220px,1fr))`-style grids without a `min(100%,…)` guard**
  (`Settings.tsx:3178`, `Extensions.tsx:495,2283`): phone content box is ~329-365px, so no overflow.
- **DS `Dialog`** traps + restores focus (`Dialog.jsx:86,143`); it is NOT portaled (matters for #4).
- Hard-coded colors: clean. Only literal is `Settings.tsx:1580` `#fff`, a deliberate QR quiet zone.

## Established patterns this cluster should copy
- Radiogroup done right: `Settings.tsx:4397-4408` + `:362-374` (`role="radiogroup"` + shared
  `radioGroupKeyDown` + roving `tabIndex`). `Seg` (screen-kit `:147+`) is the compact variant.
- Load-failure with Retry: `Settings.tsx:525-540`, `:683-700`, `Community.tsx:276-289`.
- Inline WCAG 3.3.1 validation: `RecoveryKeyPanel` `Settings.tsx:2717-2735` (`invalid` prop +
  keyed `role="alert"`), and `WikiReader.tsx:417-430` (alert keyed on attempt count so a repeat
  failure re-announces).
- Separate a `failed` flag from `null`-means-loading — comment at `Community.tsx:770-772`.

## e2e coverage notes
`responsive.spec.ts:14-18` overflow-checks `/extensions`, `/community`, `/settings` (`#/wiki` is in
the axe gate but NOT in ROUTES — known).
`settings.spec.ts:22-54` drives the **Experience complexity** radiogroup by role+name — don't rename.
`wiki.spec.ts:27,36-44,64` uses `getByRole('tab',{name:'Campaign wiki'})`, `Publish wiki`,
`Eligible pages`, `Reading preview`, `Player-visible pages`, and `getByRole('main')` on the
WikiReader notice phases (so `Notice`'s `role="main"` must stay a main).
`custom-types.spec.ts` drives Extensions → Object types. `ai-assistant.spec.ts` touches Settings AI.
Still unguarded: the Open5e source picker, the recovery-key dialog, Community → Export's banner,
Settings → Permissions grant/revoke, the AI provider preset cards.

See also [[audio-upgrade-scenes-creator-cluster]], [[onboarding-viewas-cluster]], [[ds-layer-audit]].
