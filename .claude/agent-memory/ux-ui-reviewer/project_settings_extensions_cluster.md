---
name: settings-extensions-community-cluster
description: UX audit state for gm-react Settings/Extensions/Community/WikiReader — run #15 re-verify @7f84aeb7; the screen-kit Seg tab-stop BLOCKER is CLOSED; 15 open, led by the AI assistant's observably-inert Cancel and Extensions' confirm-less package UPGRADE.
metadata:
  type: project
---

Audit state for `apps/gm-react/src/screens/{Settings,Extensions,Community,WikiReader}.tsx`
(+ `src/app/screen-kit.tsx`, which this cluster and the Audio cluster share).
Run #10 @`8fa95d31`. #11 @`9aeebdde`. #12 @`016b696c`. #13 @`21e4f86e`. **Run #14 @`98e0211f` = latest.**
Line numbers from `auto/visual-review-loop`. Re-check by grepping the anchor string, not the line.

⚠️ **The agent definition points at `/home/trinkle/Programming/dndtools-review-loop-ctl/…` — that path
does NOT exist.** Memory lives at `/home/trinkle/Programming/dndtools-review-loop/.claude/agent-memory/ux-ui-reviewer/`.

## FIXED — do NOT re-report
Runs ≤#12: `SettingsPermissions.grant()` catch; `loadFolders()` catch + Retry; player-safety tri-state;
`Community.confirmInstall` catch; Extensions inline destructive confirms `autoFocus`; `modalIsolation`
honours `[data-modal-exempt]`; the whole empty-live-region class (`screen-kit LoadingRegion` + the
source-scan test at `screen-kit-loading-region.test.tsx:64`); `radioGroupKeyDown` Home/End + disabled-skip;
`nextHighContrastTheme` for the **Switch**.
Run #13 (`33651613`): theme `Seg` writes `PREV_THEME_KEY`; AI transcript `tabIndex=0 role="log"`;
srOnly "You said:/Assistant said:"; Extensions statblock/spell scrollers `tabIndex=0 role=group`;
settings rail rows `minHeight: var(--touch-target-min)`; Permissions `Badge status` policy default.
**New as of run #14 (@`98e0211f`):**
- **run#13 §1 CLOSED** — `Settings.tsx:4885-4887` `navItems` appends the ACTIVE gated entry to
  `visibleNav`, so the phone `<Select>` and the desktop rail both name the real sub-page.
  (Residual LOW: the appended entry lands at the END of the list and carries no lock marker.)
- **run#13 §6 CLOSED** — `Extensions.tsx:2001` visible `<label>` now reads "Object title" and the
  competing `aria-label` was deleted. `custom-types.spec.ts:120/133` still green.
- **run#13 §7 CLOSED** — `public/prepaint.js:38-39` is now
  `pref==='reduced' ? … : pref==='full' ? … : osReduce ? …`. Stored `'full'` survives reload.
- `Settings.tsx:2749-2760` recovery **export** soft-disable is NOT a defect — `passIssue` IS rendered
  visibly at `:2802-2807`. Do not re-file it as tooltip-only.
- `Settings.tsx:3275` AI provider CARDS and `:2753` both guard their onClick correctly.

## CLOSED at `7f84aeb7` (run #15) — do NOT re-report
- **run#14 §1 (the Seg tab-stop BLOCKER) is FIXED** — `screen-kit.tsx:245-246` is now
  `checkedIndex = options.findIndex(o => o.value === value)`, falling back to the first non-disabled
  only when nothing is checked. `moveSelection` (`:252`) also lands on a checked-but-disabled option.
- `BackBar` (`screen-kit.tsx:355-382`) has real `padding: '4px 8px'` (NOT an inline minHeight — see
  the in-file comment) plus a `useState` hover. WCAG 2.5.8 item CLOSED.
- `Join.tsx:196-206` "Try again" now stays mounted across the retry and soft-disables
  (`aria-disabled` + `title`). The self-unmount focus loss is CLOSED.
- `Audio.tsx:525-538 unbindScene` now loops the WHOLE `bound` array and stops at the first refusal.
- `Settings.tsx:4884-4886` phone `<Select>` gated-tab naming — CLOSED (confirmed again).

## STILL-OPEN (run #15, ranked)

1. ⭐ **`Settings.tsx:3966-3972` the AI assistant's Cancel is observably inert.**
   `sendAiChat(config, req)` at `:3745` is called WITHOUT `controller.signal` — the signal only
   reaches `runAssistantExchange`, which checks it BETWEEN passes. During the 10–60s model call the
   button does nothing, stays enabled, and the Badge keeps counting "Working — step N of 16".
   Fix: a `cancelling` state → label "Cancelling…" + `aria-disabled`, and forward the signal.
2. **`Extensions.tsx:299-316` "Install / upgrade package" REPLACES an installed package with no
   confirm** and then toasts `Upgraded ${id} and updated its placed widgets.` Sibling `removePackage`
   confirms; `Community.confirmInstall` shows a review dialog.
3. **`Settings.tsx:4869/:4877/:4975` — `gatedOff` is never consulted in the DESKTOP rail loop**
   (`:4923-4970`) even though the comment at `:4880-4883` claims "mark it on the desktop rail too".
   The appended gated entry renders identically to the reachable ones and also lands LAST.
4. **`screen-kit.tsx:225-230` + `:285` — the `title` option prop is STILL DEAD API.** Zero call
   sites pass `title:` (grepped all of `src/`). Its own JSDoc names the victims ("the session phase
   rail, Graph's viewpoint picker and seven Settings groups"), so the 0.4-opacity-with-no-reason
   problem is still 100% live. And `title` on a natively `disabled` button is pointer-only anyway —
   the house idiom is soft-disable (`aria-disabled` + guarded onClick + Toaster), which
   `Settings.tsx:3272-3283` already does correctly for the provider CARDS.
5. **`screen-kit.tsx:293-302` Seg hover leaks when an option's state changes under the pointer.**
   `onMouseEnter` writes `style.background` imperatively; `onMouseLeave` early-returns on `on || off`.
   If an option becomes `disabled` while hovered, React does not rewrite `background` (its prop value
   is `'transparent'` before and after) and mouseLeave refuses to clear it ⇒ a stuck hover tint on a
   dead option. Use a `useState` hover index (the `BackBar` pattern at `screen-kit.tsx:345`) instead
   of `currentTarget.style`.

### Carried, still open
6. **`Settings.tsx:3696-3700` transcript auto-scroll hijacks the reader.** Unconditional
   `el.scrollTop = el.scrollHeight` on every `feed.length` change, now that run #13 made the region
   focusable. Fix: only scroll when already pinned (`scrollHeight-scrollTop-clientHeight < 40`).
7. **`Extensions.tsx:2119-2127` `SystemSwitchDialog`'s "Apply switch" is hard-`disabled={!canApply}`
   and the dialog never says why.** `canApply` folds in `canWrite`, so a previewing / non-DM user gets
   a full migration preview and a dead primary button — the explanation lives on a DIFFERENT panel
   (`:2303-2307`), outside the dialog. The `destructive && !ack` case is also hard-disabled while the
   ack Checkbox (`:2238`) gets no `aria-invalid`.
8. **`Extensions.tsx:1937-1955` + `:2014-2060` custom-object create: required fields are toast-only.**
   `create()` guards only `title`; empty `f.required` fields dispatch, get rejected, and surface as a
   `path: message` Toaster string. No `aria-invalid`, no focus move, no per-field error. The labels
   at `:2032` visibly say "required". Fix: DS `Field error=`.
9. **`Community.tsx:1044-1071` marketplace publish dialog is placeholder-as-label.** Three controls
   with `aria-label` + `placeholder` only; "(required)" lives INSIDE the placeholder so it vanishes on
   first keystroke; `publish()` (`:824-827`) rejects Toaster-only.
10. **`Settings.tsx:2405-2496` `role="status" aria-live="polite" aria-atomic="true"` wraps the backup
    buttons AND the restore `<Dialog>`** (DS Dialog is NOT portaled) ⇒ opening the destructive confirm
    re-announces the whole atomic region. Move role/aria onto the inner text block (`:2421`).
11. **Detail-panel-below-the-list on phone**: `Extensions.tsx:884` / `Community.tsx:281` collapse to
    one column with the detail Panel AFTER the list; `setSelKey`/`setSelId` never scroll or move focus.
    Model: `WikiReader.tsx:301-308`. ⚠️ `Panel` takes no `ref`/`id` — wrap in `<div tabIndex={-1} ref>`.
12. **`Settings.tsx:4061-4062` `registerAgent` clears `newAgentId`/`newLabel` synchronously**, before
    the dispatch resolves ⇒ a rejected registration wipes typed input.
13. **`Settings.tsx:4798-4806 GatedTab`'s "Switch to …" button unmounts itself** — focus lands on
    `<body>`. Milder twin: `:4917`/`:4929` `setTab` swaps the whole right-hand panel with no focus
    move and no announcement.
14. **`Settings.tsx:4230-4260` agent-binding remove** drops focus to `<body>`.
15. Nit: **`Settings.tsx:3309-3319` `<ol>` inside `<button>`** (AI provider preset cards) — invalid
    content model, and the numbered setup list joins the button's accessible name.
16. **`WikiReader.tsx:380-396` the `invalid` phase has no Retry.**
17. **Run status is invisible to AT**: `Settings.tsx:3820`/`:3964` the `statusText` badge
    ("Working — step 3 of 16 · table.create") is a plain `<Badge>` in no live region.
18. LOW: **`Community.tsx:208`** `sel = find(selId) ?? modules[0]` ⇒ on load the FIRST card renders
    `aria-pressed="true"` (`:332`) and looks selected though nobody pressed it; a refresh that drops
    the selected module silently swaps the detail panel.

Lower-value, verified: `qrDataUrl(...)` has no `.catch`; `InvitesPanel`'s post-mint dialog swap drops
focus; `Extensions.tsx` "Export JSON" toasts "into the JSON box below" without scrolling to it;
hard-`disabled` status buttons ("Current plan", "Current system", "Back up now").

## VERIFIED NON-ISSUES (do not re-open)
- **DS `Field` auto-associates its label** (`ds/components/forms/Field.jsx:12-21`, `React.useId` +
  `cloneElement`); `error` → `role="alert"` + `aria-invalid` + `aria-describedby` (`:75-85`).
  **This is the fix mechanism for every Toaster-only form.**
- **`icon="trash"` IS registered** (`Icon.jsx:335 → 'Trash2'`).
- **The AI `feed` is append-only**, so `role="log"` does not chatter token-by-token.
- **`runAssistantExchange` NEVER rejects** (`ai/mcpBridge.ts:297-298`); the missing `.catch` is fine.
- `notifyRunComplete` (`Settings.tsx:3641-3664`) toasts every terminal state incl. `cancelled`.
- **Nested `data-theme="parchment"`** (`Community.tsx`, `WikiReader.tsx`): correct.
- `<label>` wrapping a DS `Switch`: `<button>` IS labelable.
- `Panel title="… &amp; …"` JSX entities: esbuild DECODES them.
- `repeat(auto-fill,minmax(N,1fr))` without a `min(100%,…)` guard: Pixel 5 = 393px ⇒ ~365px content box
  outside a Panel, ~327px inside one; 260/300px tracks fit.
- DS `Dialog` traps + restores focus and supports `initialFocus="#id"` + `role="alertdialog"` +
  `dismissible` — see `LocalBackupPanel`'s restore confirm (`Settings.tsx:2958-2999`).
- DS `Button` soft-disables via `aria-disabled` and DROPS onClick (`Button.jsx:87`). ⚠️ Playwright does
  NOT treat `aria-disabled` as disabled, so soft-disabling a control a spec CLICKS changes that spec.
- **`screen-kit Seg`'s Home/End maths is CORRECT** (`moveSelection(-1,+1)` / `(0,-1)`). The BROKEN part
  is `tabStopIndex` — see item 1.
- **`screen-kit eb` is now `T.sub`, not `T.ter`** (`:90-95`) — the eyebrow contrast item is CLOSED.
  `SetRow`'s `help` (`:404`) is still `T.ter`, but `SetRow` renders inside `Panel` whose background is
  `T.raised`, where parchment `T.ter` measures 4.75 = PASS. Do not file it.
- `Settings.tsx` sticky settings nav `top: 0` is safe: `<main>` (`AppShell.tsx:1146`) is the scroll
  container, not the document.

## Established patterns this cluster should copy
- Destructive confirm done right: `Settings.tsx:2958` (`role="alertdialog"`, `initialFocus`,
  `dismissible={!busy}`, `aria-busy`, danger button carries the busy label).
- Soft-disable done right: `Settings.tsx:3272-3283` (aria-disabled + title + guarded onClick + Toaster).
- Radiogroup done right: `Settings.tsx:4397+`; `Seg` (`screen-kit.tsx:215+`) is the compact variant.
- Load-failure with Retry: `Settings.tsx:525`, `:683`, `:2152`, `Community.tsx:287-300`.
- Inline WCAG 3.3.1 validation: `RecoveryKeyPanel` (`Settings.tsx:2802`), `WikiReader.tsx:417-430`,
  DS `Field error=`.
- Selection that moves the reader: `WikiReader.tsx:301-308`.
- Announced loading: `screen-kit.tsx:123 LoadingRegion`.

## e2e coverage notes
`responsive.spec.ts:4-19` overflow-checks `/extensions`, `/community`, `/settings`; the loop only ever
sees each route's DEFAULT tab. `responsive.spec.ts:428-446` pins the rail nav's 44px min-height by
iterating `navigation[name="Settings navigation"] button` — **adding the gated entry to `navItems`
keeps that green only because the token is 44px; do not add a nav row with a different height.**
`settings.spec.ts:22-59` drives ONLY the Experience-complexity radiogroup.
`ai-assistant.spec.ts:72-76` reads the phone `Settings section` select but only counts
`option[value="ai"]`; `:154` clicks a `Cancel` inside the FORGET-KEY dialog, not the run panel;
`:99/:217` pin `Ask the assistant` + `Ask`. `custom-types.spec.ts:120/133` pins `getByLabel('Object title')`.
`wiki.spec.ts` pins `Campaign wiki`, `Publish wiki`, `Eligible pages`, `Reading preview`,
`Player-visible pages`. NO spec references `Install / upgrade package`, `Module name`,
`Widget package definition JSON`, or `Apply switch`.
Still unguarded: the Open5e picker, the recovery-key dialog, Community → Export's banner,
Settings → Permissions grant/revoke, the AI provider preset cards + provider `Seg`, and the
motion / high-contrast toggles.

See also [[audio-upgrade-scenes-creator-cluster]], [[onboarding-viewas-cluster]], [[ds-layer-audit]].
