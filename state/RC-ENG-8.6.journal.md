# RC-ENG-8.6 run journal

## Scope and findings

Implement on the current task branch; no push, promotion, dispatcher edits or agents.
Headroom tools are unavailable. No repository AGENTS.md found in the task tree or checked ancestors.
Both start paths used commandCenter.homeSceneId as a fallback, including the DM-only home board.
The header reported activeSceneId rather than the table projection.

## Changes

- Shared selection in useSessionScenes: exclude workspace screens and the legacy DM-only home;
  Continue requires a shareable active scene; default to the first shareable scene otherwise.
- Top-bar start uses the same selection. Ordinary private scenes remain explicitly selectable
  in the dialog; their disabled sharing checkbox explains why they cannot be projected.
- Header reports the projected scene separately from the session scene, including nothing yet.
- Added both-profile regression covering Command Center provisioning, both start entry points,
  a joined player via fake LAN with real host filtering, and clearing the projection.

## Validation

In progress: focused Playwright regression, formatting, typecheck and related lifecycle coverage.
Central operator owns subsequent validation gates and independent review.

Initial regression: desktop starts and mobile dialog passed; mobile top-bar test needed to open
Table controls. Added local player-preview coverage; its boot waits on runtime because /play has
no DM shell landmark. Corrected these test drivers before the final run.
The related lifecycle fixture chose a DM workspace for prep and expected Continue. Updated only
that fixture's scene selection (necessary extra test path) to use a shareable scene, retaining
all existing assertions. Initial broad run was stopped after diagnosing these fixture failures.
App typecheck and focused ESLint exited 0. Pinned session visual coverage is running.

## Final evidence

- App `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- Focused ESLint and Prettier checks: exit 0; `git diff --check` clean.
- Final isolated `session-start-default.spec.ts`: 4 passed, both desktop/mobile entry points,
  including local player preview, joined stage and cleared-projection header. Original log:
  `/tmp/rc-eng-8.6-regression.log` (42.1s, exit 0).
- Pinned container `run-in-container.sh --workers=1 -g session`: 30 passed across desktop,
  rail and phone, no baseline changes. Original log `/tmp/rc-eng-8.6-visual.log` (2.7m, exit 0).
- Related lifecycle coverage: all 16 lifecycle cases passed in
  `/tmp/rc-eng-8.6-final-e2e.log`. That run loaded the preview test before its boot-wait correction;
  its older regression failures are superseded by the isolated four-test run above.
- Broader table-view run was interrupted during fixture diagnosis; no full-suite pass claimed.

Commit contains the four implementation files, the new regression, the necessary existing
lifecycle fixture correction, and this journal. Central gates and independent review remain pending.

## App-gate repair

Read the original central app-gate output (attempt 5ea3b243-e6f2-4c55-aaa9-85247755f5f7),
not a compressed summary. It reports five failures: the shared-module parity declaration omits
three tableView state paths, and four baseline tests still expect the unprojected active scene
(or "the scene") where the new header correctly says "nothing yet". The baseline goLive fixture
selects a private demo scene, so it does not establish a table projection.
Headroom tools remain unavailable. Repair necessarily includes the parity declaration and the
Session baseline snapshot alongside this journal; no runtime behavior or gate assertions weakened.

Declaring the raw tableView paths exposed additional parity failures: those private paths are not
available through builder query sources. Repaired the implementation instead of adding parity debt:
SessionConsole now reads getPlayerViewController, the existing actor-scoped public query, and declares
player-view-controller in the session widget's queries. Removed tableView reads from useSessionScenes
so combat consumers do not inherit an unrelated projection dependency. Snapshot update reviewed:
only ten aria/DOM text expectations change from the unprojected scene to "nothing yet".

Repair validation (original logs read before recording):

- Focused parity + baseline suite: 65 tests passed, exit 0, without snapshot-update mode on the
  verification run (`/tmp/rc-eng-8.6-app-repair-focused.log`).
- Full `pnpm test:app`: 198 files / 2391 tests passed, exit 0, 111.60s
  (`/tmp/rc-eng-8.6-app-repair-full.log`).
- Both-profile default-start browser regression: 4 passed, exit 0, 44.0s
  (`/tmp/rc-eng-8.6-app-repair-e2e.log`).
- App typecheck and focused ESLint: exit 0. Prettier check with --ignore-unknown passes (Vitest
  owns .snap serialization; a direct Prettier invocation without that flag has no .snap parser).
  `git diff --check` clean. No screenshot baselines changed; the central pinned visual gate on
  the preceding candidate passed, and this repair preserves the intended header text.
