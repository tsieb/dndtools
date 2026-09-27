# RC-PLT-2.4 run journal

- Owned implementation paths: offline spec, serviceWorker.ts, PLATFORMS.md. No AGENTS.md or Headroom tools available. No delegation, publication or dispatcher mutations.
- Existing worker supports cached offline reloads; adding independent durable-surface persistence cases.
- Scope blocker: cloud-only React controls are outside ownership. Sync.tsx's configured Sync now and restore buttons gate only on busy; Account.tsx and community/Discover.tsx also lack live offline guards. Do not claim all-control acceptance from the unconfigured e2e environment. Record a follow-up in PLATFORMS.md.
- Validation pending.

## Results

- Added five independent offline creation/reload cases, asserting exact persisted records and visible surface names on both profiles. Audio preset saves references to session audio prepared online; no claim of offline remote-stream playback.
- Initial browser run: 10 passed, 4 failed at visible-name assertions after reload. Stored-record assertions passed. Waiting for the route's Suspense boot fallback to disappear before disconnecting fixes the cache warm-up race; waiting for the shell heading alone was insufficient.
- Final original browser output `/tmp/rc-plt-2.4-e2e.log`: 14 passed (33.6s), exit 0, desktop-chromium and mobile-chromium. Initial output retained at `/tmp/rc-plt-2.4-e2e-initial.log`.
- App typecheck: exit 0 (`/tmp/rc-plt-2.4-typecheck.log`). Focused service-worker unit suite: 10 passed, exit 0 (`/tmp/rc-plt-2.4-unit.log`). Focused ESLint, Prettier and git diff whitespace checks passed.
- Corrected registration failure diagnostic: missing offline shell does not disable local vault storage.
- Full task acceptance remains incomplete: cloud controls require React component ownership and configured-state coverage. Known defects and follow-up audit scope are documented in PLATFORMS.md. Central gates and independent review remain operator-owned.

## Attempt 2 (after independent review requested changes)

Review verdict: durable-surface half CONFIRMED good; rejected because "every cloud-only control
shows the offline state" was documented as a blocker rather than implemented. Prior attempt
declined to edit React screens because they sit outside `Owns`.

Decision: cross the ownership boundary minimally and deliberately. Repo precedent
(feedback_owned_paths_vs_acceptance) is that respecting `Owns` while leaving an acceptance
criterion unmet is itself a rejection; the correct move is a minimal crossing plus an amended
contract doc and an explicit overlap flag. Recording the crossing here before making it.

Mechanism chosen: DS `Button` already distinguishes hard `disabled` (drops out of the tab order,
so its `title`/`aria-label` explanation is unreachable) from soft `aria-disabled` (keeps focus,
still announces, swallows activation, renders at 0.5 opacity). Soft-disable is therefore the
honest indicator; hard `disabled` would hide the reason from exactly the users who need it.

Plan:

1. `platform/preferences.ts` — add `subscribeOnline`, matching the existing `subscribeMedia`
   shape, so the online/offline listener stops being hand-rolled per screen.
2. New `cloud/offline.tsx` — `useOnlineStatus`, `useCloudActions` (returns props to spread on a
   network-backed control), `<CloudOfflineNotice />` panel banner.
3. i18n keys in `en.ts` + `es.ts`.
4. Apply to every cloud-only control across the cloud screens.
5. Coded gate: a test that fails when a screen imports a cloud network module without the gate,
   so "every" is enforced rather than asserted.
6. e2e cases on both profiles + PLATFORMS.md rewrite.

### What shipped

`src/cloud/offline.tsx` — `useOnlineStatus`, `useCloudActions(reason)` returning `offlineProps`,
`<CloudOfflineNotice />`, plus catalog-free `useCloudActionsFor` / `CloudOfflineNoticeFor`.
`platform/preferences.ts` gained `subscribeOnline` so the listener pair is written once.
14 message keys in `en.ts` + `es.ts`.

Gated (13 surfaces): Sync, Account, AccountDevices, Subscription, Upgrade, PlanDialogs,
PlayerInvites, Players, Discover, Publish, Wiki, WikiReader, Join, Schedule, ConnectedSources
(Google half), AuthModal.

Deliberately NOT gated, each verified by reading the implementation rather than assumed:
local vault backup/restore; recovery-key export/import (`cloud/vaultKey.ts` — local crypto against
the OS credential store, no network); copying an already-minted invite link; local folder sources
(File System Access); actor rename; `navigate('/upgrade')`; a device-local preview plan change when
no account backs it (`entitlements.setPlan` only calls the server when `accountId` is set);
`beginRecovery` (switches view only — the 'forgot' view's own submit is the round trip).

### Boundary crossing, declared

Crossed outside `Owns` into 16 React screens + `platform/preferences.ts` + `i18n/messages/*`.
Justification: the acceptance criterion is unimplementable inside the owned paths, and repo
precedent rejects a candidate that respects `Owns` while leaving a criterion unmet. Each edit is
additive and minimal: an import, one hook call, and a props spread per control. No behaviour
changes while online — `offlineProps` is empty, so an online render is what it was before.
PLATFORMS.md (owned) now documents the mechanism and the verification layers.

### Why three verification layers

`playwright.config.ts` deliberately blanks every `VITE_*` cloud coordinate and
`isolation-guard.spec.ts` asserts it, so no e2e run may reach Cognito/app-api. A configured,
signed-in screen is therefore unreachable from a browser test BY DESIGN. Configuring the e2e server
would have broken that invariant — the previous attempt was right to refuse that, wrong to stop
there. The repo already has the answer: `Discover.test.tsx` / `WikiReader.test.tsx` cover
cloud-gated screens as component tests. So:

- `offline.gate.test.ts` — static rule; no module may import a network client without the gate.
- `offline.configured.test.tsx` — configured + signed-in Sync/Account offline: EXACT set of gated
  controls (not a spot check), `aria-disabled` not `disabled`, recovery on reconnect.
- `pwa-offline.spec.ts` — real browser, real offline, both profiles, on `/join` and `/wiki`, which
  render a genuine cloud-only retry in the local-only e2e environment.

### Design note

Used soft-disable (`aria-disabled`), not `disabled`. A natively disabled button leaves the tab
order and takes its `title` with it, so the explanation becomes unreachable by the users who most
need it. Both DS `Button` and `IconButton` already implement exactly this distinction. Controls
that are not DS buttons (Switch, Select, `<form onSubmit>`, Enter handlers, plain `<button>`) do
not swallow their own activation, so those call sites also guard on `cloudActions.blocked`.

### Gate results this attempt

- typecheck exit 0; lint 0 errors / 15 pre-existing warnings; boundary lint passed;
  a11y contrast passed; `format:check:changed` clean (25 files).
- `pnpm gates` passed. NOTE: it first FAILED — ConnectedSources.tsx hit its grandfathered
  885-line cap. Fixed by compressing my own comments, not by raising the baseline.
- test:critical 4779 passed; test:cloud 488 passed (includes the 6 new); test:app 1327 passed;
  test:tooling 162 passed. Build exit 0, prod-bundle check OK.
- `pwa-offline.spec.ts` 18/18 on desktop-chromium + mobile-chromium.
- Full Playwright suite: first run was started, then abandoned deliberately — I edited three
  files mid-run (the over-gating fixes below), so Vite HMR meant it was no longer testing the
  tree I intended to ship. Killed my own process only (exit 143; a sibling worktree's run on
  port 5642 was left alone) and re-ran against the committed tree instead. Result below.

### Corrections made during the run

- First gate-test draft allowlisted Players.tsx with a hollow reason while the file genuinely
  imported the gate — removed, since that is precisely the rot the reason field exists to prevent.
- `useCloudActions` in AuthModal broke 6 existing AuthModal tests: that component is written in
  literal English and never depended on `I18nProvider`, and the hook added that coupling. Split
  out `useCloudActionsFor`/`CloudOfflineNoticeFor` rather than forcing the provider on it.
- Playwright's `toBeEnabled()` is ARIA-aware and reports `aria-disabled` as disabled, so the
  "not natively disabled" assertion reads the DOM property and then focuses the control to prove
  its reason is still reachable.

### Late correction: three notices that over-claimed

Reviewing my own diff, `<CloudOfflineNotice />` said "the actions below need a connection" on
surfaces where, in some configurations, nothing below it does:

- `Upgrade.tsx` — signed out, the pricing page is a device-local plan preview that works offline.
  Now shown only when `liveBilling || ent.serverBacked`.
- `ConnectedSources.tsx` — the Google panel renders its own "unavailable" copy when Google is
  unconfigured. Now shown only when `isGoogleDocsConfigured`.
- `Players.tsx` — in a local-only build the Invite button only raises an explanatory toast, which
  works fine offline. Gated only when `isAccountApiConfigured`.

Checked the rest for the same fault and found them already correct: Discover, Publish and Schedule
all `return` a fail-closed panel before reaching the notice; Sync's panel is behind
`cloud.available`; Account's panels behind `cloudReady`; Subscription's behind `live`. Recording
this because a gate that lies in the optimistic direction and a gate that lies in the pessimistic
direction are the same class of bug, and only the first one is obvious.

## Attempt 3 — reconcile with the integration branch

Feedback: rebase onto `b8dc080e` conflicted in `screens/community/Wiki.tsx`.

Rebased both commits onto `b8dc080e` (55 commits ahead of my old base `884483b0`). Commit 1
(durable surfaces) applied clean. Commit 2 conflicted in exactly one hunk.

**The conflict.** `fd6c9058` (RC-CLD-4.4, wiki discovery + reader controls) changed the publish
button's guard from `disabled={busy || eligible === 0}` to `disabled={busy || pages.length === 0}`
— it added opt-in shared session recaps, so eligibility is no longer just the note count. My side
added `{...cloudActions.offlineProps}` to the same element. Both belong: took their condition and
kept my spread. No other hunk conflicted; `en.ts`, `es.ts`, `preferences.ts` and `WikiReader.tsx`
auto-merged.

**Re-audited the moved tree rather than assuming the rebase was enough**, because RC-CLD-4.4 adds
cloud controls and a coarse static rule would not notice a new ungated button inside an
already-gated file:

- Static rule (`offline.gate.test.ts`) passes: no module imports a network client without the gate.
- Of the 16 files I gated, only `Wiki.tsx` and `WikiReader.tsx` were touched by the 55 commits.
  Read both in full: every cloud path is gated. Wiki's ungated controls are `navigate('/upgrade')`,
  the clipboard copy and `setAccess` — all local. WikiReader's new folder navigation and search
  filter an already-fetched page bundle; `getPublicWiki` is reachable only from `fetchWiki`, whose
  three call sites (mount effect, gated retry, password submit guarded on `blocked`) are covered.
- No new modules under `src/cloud` or `src/net`, so no new client could bypass `NETWORK_MODULES`.
- One screen calls `fetch(` directly: `AiProvider.tsx`. Checked rather than gated — it probes
  LOOPBACK Ollama (`LOCAL_OLLAMA.healthUrl`), which works offline, and its key save/forget go
  through `cloud/secureStore.ts`, which has zero network I/O. Gating it would have been the
  pessimistic lie. Correctly ungated and correctly outside the rule.

Re-running every gate against the reconciled tree; the previous attempt's results do not transfer.

### Considered and rejected: rewriting the click assertion

The offline click check in `pwa-offline.spec.ts` uses `page.route` to observe whether any
non-localhost request leaves after pressing a gated control. I briefly thought this reads stronger
than it is — an offline context fails requests anyway, so a pass might be trivially satisfied.
Checked the semantics instead of guessing: Playwright intercepts via the Fetch domain, which pauses
a request BEFORE the network stack, so a request the app actually initiated would still reach the
handler while offline. The assertion is sound as written.

Rejected swapping it for a `window.fetch` call-counter: that is a legibility improvement at best,
and it would have meant killing a 1190-test run to re-run it. Recording the reasoning because
"I could not immediately tell whether my own assertion was load-bearing" is worth leaving behind
for the next reader of this spec.

### Verification against the reconciled tree (post-rebase onto b8dc080e)

- typecheck exit 0; lint 0 errors / 15 pre-existing warnings; boundary lint passed; a11y
  non-text contrast passed (191 pair checks, 3 themes).
- `pnpm gates` passed (6 gates); Prettier clean across all 26 files in the two commits.
- test:critical 4811 passed; test:cloud 497 passed; test:app 1464 passed; test:tooling 191 passed.
  (Counts rose from the pre-rebase run because the integration branch added tests, not because
  mine moved: my 6 live in the cloud slice, which `vitest.app.config.ts` excludes by design.)
- Build exit 0; prod-bundle check OK (85 assets, no `__rt`).
- `pwa-offline.spec.ts`: 18/18, desktop-chromium + mobile-chromium, exit 0
  (`/tmp/rc-plt-2.4-pwa.log`).
- Full Playwright suite: re-run detached against the reconciled tree
  (`/tmp/rc-plt-2.4-full-e2e.log`); two earlier attempts died on session teardown, not on a test
  failure. Completed result recorded below.

## Attempt 4 — commit the remaining journal and verify task acceptance

- Starting HEAD: `07fe255e`, on `dispatch/dndtools/768437ccff1bd9f4ac83`.
  The source implementation is already committed in `c24176dd` and `07fe255e`.
  The only outstanding tracked change was this task journal; no untracked artifacts remained.
- Read the original `/tmp/rc-plt-2.4-full-e2e.log`: the full run completed with
  1178 passed, 11 skipped, and 1 failed (exit 1). The failure was desktop
  `knowledge-filters.spec.ts:101`, timing out on the second saved-search Save button at line 112.
  This is not a successful full-suite gate.
- Fresh targeted Vitest run with `vitest.cloud.config.ts`: both offline test files passed,
  6 tests total, exit 0 (configured controls and the static import rule).
- Fresh browser run of `pwa-offline.spec.ts` and `knowledge-filters.spec.ts`, one worker,
  both profiles: 28 passed, 2 failed, exit 1. All 18 offline assurance cases passed.
  The same saved-search case failed on both profiles. Original output:
  `/tmp/rc-plt-2.4-final-browser.log`.
- `SavedSearches.tsx` and `knowledge-filters.spec.ts` have no task diff against `b8dc080e`.
  Preserved these unrelated files and recorded the reproducible failure for central review;
  no claim that the full browser suite is green.
- No additional source changes were needed for the task acceptance checks. Committing the
  remaining reconciliation journal addresses the uncommitted-work feedback. No push, promotion,
  additional loop, delegation, or dispatcher control-state mutation.

## Attempt 5 — reconcile discovery changes on 2d9f566d

- Rebased the three task commits onto `2d9f566d194d10e597c8001015b7e8be31811d59`.
  Resolved Discover by preserving integration's server search, facets, featured listings,
  ratings, install tracking and removal API, then applying the offline guards.
- Integration added cloud controls in `community/shared.tsx`: rating submission and review
  reporting now use the gate. Removed its obsolete static-rule exemption. This minimal ownership
  crossing is necessary to preserve all-control acceptance on the new integration tree.
- Search/filter changes and background discovery loads stop offline and resume on reconnect.
  Cached-card selection, cancellation and editing an unsent rating draft remain local.
- Added configured Discover regression coverage for filters, install, rating and report;
  checks the indicators, blocked requests, local draft editing, and reconnect. Initial test
  failed on an incorrect report-button label; corrected to the actual accessible label.
- Fresh offline component/static suite: 6 passed, exit 0. App typecheck: exit 0.
  `pnpm gates`: exit 0. Original logs `/tmp/rc-plt-reconcile-unit.log`,
  `/tmp/rc-plt-reconcile-type.log`, `/tmp/rc-plt-reconcile-gates.log`.
- Offline browser spec: 18 passed on both profiles, exit 0;
  original log `/tmp/rc-plt-reconcile-pwa.log`. Full browser suite not rerun;
  prior saved-search failure remains recorded above, not claimed fixed.
- Final configured Discover suite: 9 passed, exit 0 (`/tmp/rc-plt-discover-tests.log`).
  Final app typecheck passed (`/tmp/rc-plt-reconcile-type-final.log`); focused ESLint,
  Prettier and whitespace checks passed. Verified the requested integration SHA is an ancestor
  of this branch. No publication or dispatcher mutations.

## Attempt 6 — reconcile onto f7b289b6

- The previous session hit the provider allowance limit before committing anything; the four task
  commits were intact. `loop/rc` had moved 107 commits (to `f7b289b6`); `git merge-tree` showed
  no textual conflict.
- Checked the synthetic merge in a scratch worktree before rebasing: typecheck passed, but
  `offline.configured.test.tsx` failed at import. Integration's `syncEngine.ts` now calls
  `documentCloudVaultId()` from `cloudSync` at module load, and this test's `vi.mock` of
  `cloudSync` only returned `forgetCloudSyncAccount`. Rebased the four commits onto `f7b289b6`
  (clean) and added `documentCloudVaultId: () => null` to the mock. Test-only; no source change.
- Integration's new `settings/Notifications.tsx` push-consent switch is local (fake transport,
  consent in `deviceStorage`), not a cloud call, so it stays outside the offline rule.
- Fresh results on the rebased tree: cloud Vitest (offline + syncEngine + CloudSyncContext) 34
  passed; app Vitest (Discover + Upgrade) 25 passed; app typecheck exit 0; `pnpm gates` exit 0;
  `format:check:changed --base loop/rc` clean (28 files); `pwa-offline.spec.ts` 18 passed on
  desktop-chromium + mobile-chromium, exit 0 (`/tmp/rcplt24-pwa.log`). Full browser suite not
  rerun; the saved-search result from attempt 4 still stands as recorded.

## Attempt 7 — confirm after provider-limit interruption

- Resumed at `b03f742b`; worktree clean and still based on `loop/rc` tip `f7b289b6`, so no
  reconcile was needed and no source changed.
- Fresh offline Vitest (configured controls + static import rule): 6 passed, exit 0
  (`/tmp/rcplt24-a7-unit.log`).
- Fresh `pwa-offline.spec.ts`, desktop-chromium + mobile-chromium, one worker: 18 passed, exit 0
  (`/tmp/rcplt24-a7-pwa.log`). Full browser suite not rerun; the attempt-4 saved-search result
  still stands as recorded.

## Attempt 8 — reconcile onto 5b2fe580

- Resumed at `3a6c726c` after a provider-limit interruption; worktree clean. `loop/rc` had moved
  three commits (RC-POL-1.12 graph polish + its CI repair, tip `5b2fe580`). None adds a cloud-only
  control (`Graph.tsx` and `screens/graph/*` are local); `git merge-tree` was clean. Rebased the six
  task commits onto `5b2fe580` without conflict. No source change.
- Fresh results on the rebased tree: cloud Vitest (configured controls + static import rule) 6
  passed (`/tmp/rcplt24-a8-unit.log`); app Vitest (Discover + i18n) 44 passed
  (`/tmp/rcplt24-a8-app.log`); app typecheck exit 0; `pnpm gates` exit 0;
  `format:check:changed --base loop/rc` clean (28 files); `pwa-offline.spec.ts` 18 passed on
  desktop-chromium + mobile-chromium, one worker, exit 0 (`/tmp/rcplt24-a8-pwa.log`).
  Full browser suite not rerun; the attempt-4 saved-search result still stands as recorded.

## Attempt 9 — reconcile onto 6992b502, gate online play (operator brief 2026-09-26)

- Resumed at `a9bd208b` after a provider-limit interruption; worktree clean. `loop/rc` had moved
  126 commits to `6992b502`. `git merge-tree` reported 8 conflicted files, all from RC-POL polish
  passes that split screens into new children: Join, Upgrade (→ `upgrade/PlanCards.tsx`),
  WikiReader, Discover (→ `DiscoverShelf.tsx`), Publish (→ `usePublishModel.ts`), Wiki
  (→ `useWikiModel.ts`), shared (→ `Ratings.tsx`), PlanDialogs (→ `usePlanCards`). Rebased the seven
  task commits; resolved each by keeping integration's structure and re-applying only the gate.
- **No path outside Owns was edited.** The five split-out files are new since the Owns list was
  written and are not in it or in `companion_paths`, so each is gated from its owning screen:
  - `Upgrade.tsx` drives `PlanCards`' existing `busy` prop from the gate (live-billing CTAs and a
    signed-in plan change are disabled offline, notice above the cards). Native `disabled`, not
    soft, because `PlanCards` does not accept extra props — recorded as the one place the
    soft-disable rule could not be kept without crossing Owns.
  - `Discover.tsx`: search/filters stay editable (local state; `load` is gated and re-runs on
    `online`), and a Discover-specific notice says so. The load-failed retry is withheld offline
    (`failed && !offline`) because it could only fail. The ratings section (`Ratings.tsx`, every
    control a round trip) is `hidden` — not unmounted — behind one line, so an unsent draft
    survives. Previous behaviour (aria-disabled on the search input/selects/rating buttons) needed
    edits inside the split-out files.
  - Publish/Wiki: the gate stayed in the owned component files; the handlers moved to the hooks,
    but `Button` swallows its own soft-disabled click, and neither screen has an Enter path.
  - `offline.gate.test.ts`: the three hooks/PlanCards join `NO_CLOUD_CONTROLS` with reasons.
- `shared.tsx`: `MarketplaceGate`'s sign-in opener now wears `cloud.offline.signIn`, matching the
  Join/Upgrade sign-in openers (it was the one ungated one).
- **Online play (the newly owned `net/` files).** Justification per file:
  - `net/HostModal.tsx` — "Host online" and "Also make joinable online" call the relay; gated with
    a notice. LAN hosting is untouched.
  - `net/SessionPanel.tsx` — "Join online" and "Join with room and PIN" gated with a notice; the
    pasted-connection-code and nearby routes untouched. `AccountButton` gates only signing in
    (sign-out forgets this device's session either way).
  - `cloud/offline.tsx` — added `offlineStyle` because these are native `<button>`s, which get
    neither the dimmed look nor swallowed activation from `aria-disabled`; each handler also
    refuses on `blocked`.
  - `net/cloudBridge.ts`, `net/SessionContext.tsx` — **not edited**. The UI gate is sufficient;
    `cloudBridge` joins the static rule's `NETWORK_MODULES`, and `SessionContext.tsx` is
    allowlisted (context, renders no control).
  - `en.ts`/`es.ts` — 4 keys: `cloud.offline.onlinePlay`, `.ratings`, `.discoverNotice`,
    `.playNotice`. The play notice deliberately does NOT claim LAN still works: `onLine === false`
    means no interface at all.
  - `Discover.test.tsx` — the offline case rewritten for the new split (install gated, notice copy,
    ratings hidden-not-unmounted, filter edit kept, deferred search runs with it on reconnect,
    draft intact). `offline.configured.test.tsx` — two new cases for the host and join dialogs
    (exact gated set, soft-disabled, handler refuses, LAN route stays live).
- Mutation checks: removing the ratings `hidden`, the `load` gate, the `hostOnline` guard or the
  `connectOnline` guard each turns its test red; restored.
- Fresh results on the final tree (original logs under `/tmp/rcplt24-a9-*`): app typecheck exit 0;
  `pnpm lint` exit 0 (17 pre-existing warnings, none in task files); `pnpm gates` exit 0
  (`SessionPanel.tsx` 570 lines — warn-only file-size target); Prettier clean on all changed files;
  `test:app` 1700 passed; `test:cloud` 559 passed; `pwa-offline.spec.ts` 18 passed on
  desktop-chromium + mobile-chromium, exit 0; related specs (collab, community-_, wiki_, join,
  demo-vault, upgrade\*, module-file) 90 passed / 2 skipped on both profiles, exit 0.
  Not run: full Playwright suite, `a11y-axe-gate`, `responsive`, visual. Online renders are
  unchanged by the gate (empty props/style), and the only online DOM change is two wrapper
  `<div>`s in Discover with the same single child each.
- No push, promotion, loop, delegation, or dispatcher control-state mutation.

## Attempt 10 — visual regression gate (pinned container)

- Gate feedback on `d2773ebb`: quality gates and changed-file format passed; the visual suite
  failed. Read the original log: community marketplace (15, all tiers/themes) could not find the
  shelf cards; golden-routes `/wiki` (9) and `join missing` (15) differed by an added block;
  `plans account check — high-contrast` on phone differed by a skeleton-row border.
- Cause, confirmed from the captured `join-missing--tavern-actual.png`: the offline notice is in
  the capture. `tests/visual/run-in-container.sh` runs the container with `--network=none`, so
  Chromium reports `navigator.onLine === false` there. Every request a visual spec makes is
  answered by the dev server or a route mock, but the RC-PLT-2.4 gate trusts that flag, so
  Join/community wiki rendered their notice and Discover deferred its search (empty shelf).
  The product behaviour is correct; the harness was presenting a network-less browser as a live
  server.
- Fix (test harness only, all in `companion_paths`): `presentOnline(page)` in
  `tests/e2e/_helpers.ts` overrides `Navigator.prototype.onLine` before navigation; the four visual
  specs that capture gated surfaces call it (`community`, `golden-routes` via their `stage`,
  `join`, `plans-legal`). No baseline was rewritten, so the shared baseline budget is untouched.
  `pwa-offline.spec.ts` does not call it. `PLATFORMS.md` records the rule.
- Visual results in the pinned container (original logs under `/tmp/rcplt24-a10-*`):
  affected specs (community, golden-routes, join, plans-legal, wiki-reader) on all three tiers:
  291 passed, exit 0 — including the phone high-contrast plans capture, so that diff did not
  reproduce. A full-suite run then reached 372/408 with no failure before the session ended and
  it was stopped; the phone tail it did not reach is re-run below.
- Committed as `test(visual): present the network as online…`; branch still merges cleanly with
  `loop/rc` `cc47d694` (`git merge-tree`, no conflicts). No source file changed in this attempt.
