---
name: settings-extensions-community-cluster
description: UX audit state for gm-react Settings/Extensions/Community/WikiReader — run #13 re-verify @21e4f86e; six items closed by the 33651613 fix pass, 14 open, led by the phone settings picker naming the WRONG section for any gated tab and the AI Cancel button that does nothing observable.
metadata:
  type: project
---

Audit state for `apps/gm-react/src/screens/{Settings,Extensions,Community,WikiReader}.tsx`.
Run #10 @`8fa95d31`. Run #11 @`9aeebdde`. Run #12 @`016b696c`. **Run #13 @`21e4f86e` = latest.**
Line numbers from `auto/visual-review-loop`. Re-check by grepping the anchor string, not the line.

⚠️ **The agent definition points at `/home/trinkle/Programming/dndtools-review-loop-ctl/…` — that path
does NOT exist.** Memory lives at `/home/trinkle/Programming/dndtools-review-loop/.claude/agent-memory/ux-ui-reviewer/`.

## FIXED — do NOT re-report
Runs ≤#12: `SettingsPermissions.grant()` catch; `loadFolders()` catch + Retry; player-safety tri-state;
`Community.confirmInstall` catch; Extensions inline destructive confirms `autoFocus`; `modalIsolation`
honours `[data-modal-exempt]`; the whole empty-live-region class (`screen-kit LoadingRegion` + the
source-scan test at `screen-kit-loading-region.test.tsx:64`); `radioGroupKeyDown` Home/End + disabled-skip;
`nextHighContrastTheme` for the **Switch**.
**New as of run #13 (@`21e4f86e`, commit `33651613`):**
- **run#12 §3 CLOSED** — `Settings.tsx:333-341` the Appearance theme `Seg` now writes `PREV_THEME_KEY`
  before entering high contrast. Both doors preserve Parchment.
- **run#12 §4 CLOSED** — `Settings.tsx:3847-3851` AI transcript is `tabIndex={0} role="log"
  aria-label="Assistant transcript"` + a scroll-to-bottom ref. (But see new §3 — the scroll is naive.)
- **run#12 §5 CLOSED** — `Settings.tsx:3878`/`:3901` `<span style={srOnly}>You said: / Assistant said: </span>`.
- **run#12 §6 CLOSED** — `Extensions.tsx:1268-1274` + `:1345-1348` statblock / spell scrollers got
  `tabIndex={0} role="group" aria-label`.
- **run#12 §8 CLOSED** — `Settings.tsx:4932` rail rows are `minHeight: 'var(--touch-target-min)'`.
  ⚠️ `responsive.spec.ts:441` asserts `toHaveCSS('min-height','44px')` on every rail button — the token
  resolves to 44px at base, so it still passes. Do not "improve" this to a literal.
- **run#12 §9 CLOSED** — `Settings.tsx:4211-4216` `Badge status={policy?'neutral':'warning'}` with
  "Using campaign default".

## STILL-OPEN (run #13, ranked)

### NEW this run
1. ⭐ **`Settings.tsx:4869-4878` + `:4904-4911` — the phone settings picker NAMES THE WRONG SECTION
   for any gated-off tab.** `visibleNav` filters out tabs failing `gatedOff()`, but `tab` still holds
   the requested id. DS `Select` is a native `<select>` (`ds/components/forms/Select.jsx:35`), and a
   native select whose `value` matches no `<option>` displays the FIRST option. Default tier is
   `core` (`packages/core/src/state/onboarding.ts:86`) while `permissions` needs `advanced` and
   `plugins`/`systems` need `intermediate` (`onboarding.ts:48,58`) ⇒ 3 of 13 sub-pages. **Live in-app
   path:** Command Center → Manage → "Permissions" (`CommandCenter.tsx:303` + `:527`) navigates to
   `/settings?tab=permissions`. Phone result: picker reads "Appearance", panel reads "Hidden at your
   experience level". Desktop/rail result: NO button carries `aria-current="page"` — location unmarked.
   Fix: append the active `SETTINGS_NAV` entry to the rendered list when it is not in `visibleNav`
   (`GatedTab` already offers the unlock, so the entry is not a dead end).
2. ⭐ **`Settings.tsx:3966-3973` the assistant's Cancel is observably inert.** `abortRef.current?.abort()`
   only flips a flag read BETWEEN passes (`ai/mcpBridge.ts:333/338/363/409`), and the transport call
   `sendAiChat(config, req)` (`Settings.tsx:3745`) is invoked WITHOUT the signal. During a model call
   the badge still reads "Working — step N of 16", the button stays enabled and unchanged, and the only
   acknowledgement is the eventual `Toaster.info('Assistant run cancelled.')`. UI-only fix: a
   `cancelling` state → `disabled` + "Cancelling…" + badge "Cancelling — finishing the current step…".
   (Real abort = thread `controller.signal` into `sendAiChat`, an `ai/` change.)
3. **`Settings.tsx:3697-3700` transcript auto-scroll hijacks the reader.** Unconditional
   `el.scrollTop = el.scrollHeight` on every `feed.length` change — and run #13 made the region
   focusable, so keyboard users are now yanked too (up to 16× in a 16-pass run). Also keyed on
   `feed.length`, so a growing final message is not kept in view. Fix: only scroll when already
   pinned to the bottom (`scrollHeight - scrollTop - clientHeight < 40`), tracked in a ref via `onScroll`.
4. **`Extensions.tsx:299-317` "Install / upgrade package" replaces an installed package with NO
   confirm.** A pasted `id` matching an installed non-removed package dispatches `widget.package.upgrade`
   at once — new definition + `migrations` run over every placed widget on every board, no diff, no undo.
   The sibling `removePackage` (`:229`) DOES confirm; `Community.confirmInstall` shows a review dialog.
   Fix: a `pendingUpgrade` Dialog naming `existing.package.version → definition.version`, reusing the
   `confirmRemoveId` shape already in the file.
5. **`Community.tsx:1044-1071` marketplace publish dialog is placeholder-as-label.** `Module name` /
   `Module summary` / `Module version` carry `aria-label` + `placeholder` and no visible label; the
   "(required)" marker is INSIDE the placeholder so it vanishes on first keystroke, and `publish`
   (`:824-827`) rejects Toaster-only. Fix: DS `Field` with `label` + `error` (the file already uses the
   `eb` mini-label idiom at `:1406`/`:1414`).
6. Nit: **`Extensions.tsx:1997-2009` the title `<Input>` carries BOTH `<label htmlFor>` ("Title") and
   `aria-label="Object title"`.** The `aria-label` wins, so the wired label is announced to nobody and
   visible text ≠ accessible name (WCAG 2.5.3 risk). ⚠️ `custom-types.spec.ts:120/133` uses
   `getByLabel('Object title')` — so the SPEC-SAFE fix is to change the visible `<label>` text to
   "Object title", NOT to delete the `aria-label`.

### Carried from run #12
7. **`apps/gm-react/public/prepaint.js:34-36` vs `Settings.tsx:361-373` + `:4692-4706`: reduce-motion
   CANNOT be turned OFF when the OS asks for it.** prepaint writes `pref === 'reduced' || osReduce ?
   'reduced' : 'full'`, discarding a stored `'full'` on every reload. Both controls work in-session and
   silently revert — and `Settings.tsx:4688-4690` explicitly promises they "stay selected next time".
   1-line fix: `pref === 'reduced' ? 'reduced' : pref === 'full' ? 'full' : (osReduce ? 'reduced' : 'full')`.
   ⚠️ `responsive.spec.ts:680` emulates `reducedMotion:'reduce'` but writes no localStorage — unaffected.
8. **`Settings.tsx:2405-2496` `role="status" aria-live="polite" aria-atomic="true"` wraps the backup
   buttons AND the restore `<Dialog>`** (DS Dialog is NOT portaled) ⇒ opening the destructive confirm
   re-announces the whole atomic region. Move role/aria onto the inner text block (`:2421`).
9. **Detail-panel-below-the-list on phone**: `Extensions.tsx:884` / `Community.tsx:281` collapse to one
   column with the detail Panel AFTER the list; `setSelKey`/`setSelId` never scroll or move focus ⇒
   tapping a card in a 40-row list looks inert. Model: `WikiReader.tsx:301-308`. ⚠️ `Panel` takes no
   `ref`/`id` — wrap in `<div tabIndex={-1} ref>`.
10. **`Settings.tsx:4061-4062` `registerAgent` clears `newAgentId`/`newLabel` synchronously**, before
    the dispatch resolves ⇒ a rejected registration wipes typed input. Fix: clear in an `onAccepted`.
11. **`Settings.tsx:4798-4806 GatedTab`'s "Switch to …" button unmounts itself** — focus lands on
    `<body>`, nothing announces the reveal. Same shape, milder: **`:4874 setTab`** swaps the whole
    right-hand panel with no focus move and no announcement.
12. **`Settings.tsx:4230-4260` agent-binding remove** drops focus to `<body>` (the two Extensions
    siblings got `autoFocus`; this one did not).
13. Nit: **`Settings.tsx:3294-3305` `<ol>` inside `<button>`** (AI provider preset cards) — invalid
    content model, and the numbered setup list joins the button's accessible name.
14. **`WikiReader.tsx:380-396` the `invalid` phase has no Retry.**
15. **Form validation is Toaster-only** (no `invalid`, no inline error, no focus move):
    `Community.tsx` wiki publish + module publish, `Settings.tsx` invite mint. `RecoveryKeyPanel` is
    the in-house model; DS `Field`'s `error` prop is the cheap mechanism (see the DS note below).
16. **Run status is invisible to AT**: `Settings.tsx:3820`/`:3964` the `statusText` badge
    ("Working — step 3 of 16 · table.create") is a plain `<Badge>` in no live region.

Lower-value, verified: `qrDataUrl(...)` has no `.catch`; `InvitesPanel`'s post-mint dialog swap drops
focus; `Extensions.tsx` "Export JSON" toasts "into the JSON box below" without scrolling to it;
hard-`disabled` status buttons ("Current plan", "Current system", "Back up now").

## VERIFIED NON-ISSUES (do not re-open)
- **DS `Field` auto-associates its label** (`ds/components/forms/Field.jsx:12-21`, `React.useId` +
  `cloneElement`) — a `<Field>` with an id-less single child is NOT an unlabelled-control defect.
  It also renders `error` as `role="alert"` + `aria-invalid` + `aria-describedby` (`:75-85`) and
  describes `help` and `error` SEPARATELY. **This is the fix mechanism for every Toaster-only form.**
- **`icon="trash"` IS registered** (`Icon.jsx:335 → 'Trash2'`). 10 call sites; not a fallback-Square bug.
- **The AI `feed` is append-only** (`setFeed(prev => [...prev, …])`, no in-place streaming mutation),
  so `role="log"` does NOT chatter token-by-token. Only the scroll behaviour (§3) is wrong.
- **`runAssistantExchange` NEVER rejects** (`ai/mcpBridge.ts:297-298` documents it; transport throws are
  caught at `:344`). The missing `.catch` on `ask()`'s chain is therefore not a defect.
- `notifyRunComplete` (`Settings.tsx:3641-3664`) toasts every terminal state incl. `cancelled`.
- **Nested `data-theme="parchment"`** (`Community.tsx`, `WikiReader.tsx`): correct.
- `T.*` screen-kit map → semantic tokens; theme-nesting safe. `--color-status-error-border` EXISTS.
- `<label>` wrapping a DS `Switch`: `<button>` IS labelable.
- `void runAssistantExchange(...)` with no `.catch`: see above.
- `Panel title="… &amp; …"` JSX entities: esbuild DECODES them.
- `repeat(auto-fill,minmax(N,1fr))` without a `min(100%,…)` guard: Pixel 5 = 393px ⇒ ~365px content box
  outside a Panel, ~327px inside one; 260/300px tracks fit.
- DS `Dialog` traps + restores focus and supports `initialFocus="#id"` + `role="alertdialog"` +
  `dismissible` — see the exemplary `LocalBackupPanel` restore confirm (`Settings.tsx:2958-2999`).
- DS `Button` implements soft-disable via `aria-disabled` (`Button.jsx:20-26`). ⚠️ Playwright does NOT
  treat `aria-disabled` as disabled, so soft-disabling a control a spec CLICKS changes that spec.
- `screen-kit Seg`'s Home/End maths (`moveSelection(-1,+1)` / `(0,-1)`) is CORRECT — verified run #13.

## Established patterns this cluster should copy
- Destructive confirm done right: `Settings.tsx:2958` (`role="alertdialog"`, `initialFocus`,
  `dismissible={!busy}`, `aria-busy`, danger button carries the busy label).
- Radiogroup done right: `Settings.tsx:4397+`; `Seg` (`screen-kit.tsx:203+`) is the compact variant.
- Load-failure with Retry: `Settings.tsx:525`, `:683`, `:2152`, `Community.tsx:276-289`.
- Inline WCAG 3.3.1 validation: `RecoveryKeyPanel`, `WikiReader.tsx:417-430`, and DS `Field error=`.
- Selection that moves the reader: `WikiReader.tsx:301-308`.
- Announced loading: `screen-kit.tsx:114 LoadingRegion`.
- Pure helpers in `settings-validation.ts` + `.test.ts` — how to unit-test logic without stubbing
  `window.matchMedia` (absent in this repo's jsdom; stubbing also trips `lint:boundary` PLAT-006).

## e2e coverage notes
`responsive.spec.ts:4-19` overflow-checks `/extensions`, `/community`, `/settings`; the loop only ever
sees each route's DEFAULT tab. `responsive.spec.ts:428-446` pins the rail nav's 44px min-height by
iterating `navigation[name="Settings navigation"] button` — adding a nav entry is safe, changing the
token is not. `settings.spec.ts:22-59` drives ONLY the Experience-complexity radiogroup.
`ai-assistant.spec.ts:72-76` reads the phone `Settings section` select but only counts
`option[value="ai"]`; `:154` clicks a `Cancel` inside the FORGET-KEY dialog, not the run panel;
`:99/:217` pin `Ask the assistant` + `Ask`. `custom-types.spec.ts:120/133` pins `getByLabel('Object title')`.
`wiki.spec.ts` pins `Campaign wiki`, `Publish wiki`, `Eligible pages`, `Reading preview`,
`Player-visible pages`. NO spec references `Install / upgrade package`, `Module name`, or
`Widget package definition JSON`.
Still unguarded: the Open5e picker, the recovery-key dialog, Community → Export's banner,
Settings → Permissions grant/revoke, the AI provider preset cards, and **the motion / high-contrast
toggles** (so §7 has no regression net — a pure helper + `.ts` test is the cheap one to add).

See also [[audio-upgrade-scenes-creator-cluster]], [[onboarding-viewas-cluster]], [[ds-layer-audit]].
