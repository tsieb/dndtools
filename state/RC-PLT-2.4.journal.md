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
