# Completion Evidence: AUDIO-playback-and-session-state

Workpack status: `complete`

Epic: AUDIO-playback-and-session-state — "AUDIO: Playback and session state"
Requirements: AUDIO-002, AUDIO-003
Git branch: `epic/AUDIO-playback-and-session-state` (created from the prior epic-chain tip
`4ddd569`, the tip of `epic/AUDIO-platform-and-player-degradation`).
Implementation commit (feature + tests + completion evidence): `57582f4`.
Workpack-complete commit (regenerated derived planning files): `83b9867`.

## Summary

This is the AUDIO playback + session-state integration the prior three AUDIO epics explicitly
deferred to. It introduces a SESSION-OWNED currently-playing audio slice (`SessionAudioState`) on the
session document (Architecture Contract 4: "Audio track currently playing — Session state"), the DM
playback commands, the actor-filtered read model, and the visible playback surface. It COMPOSES every
prior AUDIO model rather than duplicating any:

- AUDIO-009 source-scope gate (`classifyAudioSource`) and AUDIO-010 offline/cache gate
  (`resolveAudioPlaybackAvailability`) — the play command re-uses both verbatim; an out-of-scope or
  offline/missing track is rejected and no playback state is created.
- AUDIO-004 license gate (`assetNeedsLicenseReview`) — a flagged/unlicensed asset is blocked from play.
- AUDIO-006/007/008/012/013 per-participant delivery + degradation decision (`resolveAudioDelivery`,
  via `audio-delivery-query`'s `listAudioDeliveryForDm` / `resolveAudioDeliveryForActor`) — wired into
  the session-audio read model so the DM sees a non-leaking per-participant roster and each participant
  sees only their own resolved decision.
- The `AudioActiveTrack` + per-device snapshot inputs the prior epics "shaped to attach to future
  session-owned state" are now fed from `SessionAudioState`.

## User-visible demo path

1. Open the app; go to `/` (Command Center) and click `session-workflow-active` to start an active
   session (poll the durable `session-state` doc shows `workflow: active`).
2. Go to `/session/`; scroll to the **Audio** section (`audio-playback`).
3. As DM: click **Configure a demo source** (seeds a playback-enabled bundled-preset + a license-cleared
   asset), then **Play**. The active-track display shows `playing` + source + session volume.
4. **Pause / Resume / Stop** and drag the **Session volume** slider — each dispatches a session-audio
   command and the active-track display updates (stop clears the track).
5. **Project to players**: check a player, set Connection to **Offline (queue)**, click **Project
   audio** — the player's delivery is shown `queued` (AUDIO-003 AC3); local playback keeps `playing`.
6. Switch the header **view as** to `actor-player`: the DM playback form + delivery roster disappear;
   the **participant** view shows `user-action-required` + a consent prompt (AUDIO-002 AC2 / AUDIO-007),
   and the real `<audio>` element is `data-sounding="false"`. Click **Enable audio on this device**:
   the disposition flips to `playing` and `data-sounding="true"` — without changing the DM's session
   track (switch back to `local-dm` to confirm `playing`).
7. Hard-navigate away and back: the active track is restored from session state (AUDIO-003 AC1 —
   session-owned, survives navigation/widget removal).

## Requirement coverage / traceability

### AUDIO-002 — DM playback control (play, pause, stop, volume, crossfade, active-track display)

- AC1 (play records the active track in session audio state):
  - Code: `apps/v2/packages/core/src/commands/audio-playback.ts` (`handlePlaySessionAudio`),
    `apps/v2/packages/core/src/state/session-audio.ts` (`SessionAudioTrack`/`SessionAudioState`).
  - Tests: `apps/v2/packages/core/tests/session-audio-playback.test.ts`
    ("AC1: the DM presses play and session audio state records the active track").
  - e2e: `apps/v2/app/tests/e2e/session-audio-playback.spec.ts` ("the DM plays, pauses, resumes, sets
    volume, and stops session audio").
- AC2 (autoplay-blocked player device shows a user-action-required degraded state):
  - Code: `apps/v2/packages/core/src/queries/session-audio-query.ts` (composes
    `resolveAudioDeliveryForActor` → `resolveAudioDelivery` autoplay/consent gate),
    `apps/v2/app/src/lib/gui/AudioPlayback.svelte` (consent prompt + core-driven `<audio>`).
  - Tests: core test "AC2: a player whose platform blocks autoplay sees a user-action-required degraded
    state"; e2e "a player sees the participant view + consent path".
- AC3 (player local mute/volume stays device-local; does not mutate authoritative session audio):
  - Code: device-local prefs live in `audio-degradation.ts` (unchanged) and the GUI; the read model is
    pure (`session-audio-query.ts`); the set-volume command writes only the authoritative session volume.
  - Tests: core test "AC3: a player lowering local volume / muting does NOT mutate authoritative session
    audio"; e2e consent path asserts the DM track is unchanged after a player consents.
- Pause/resume/stop/volume/crossfade commands + active-track display: handlers in
  `audio-playback.ts`; surface in `AudioPlayback.svelte`; covered by the core "pause retains the track…"
  test and the e2e play/pause/resume/volume/stop test.

### AUDIO-003 — persist currently-playing audio in Session State; sync as session state, not widget-private

- AC1 (a reconnecting second DM device receives active audio state):
  - Code: durable slice on `SessionState.audioPlayback`; hydration `ensureSessionAudioState`; persistence
    in `apps/v2/app/src/lib/platform/storage/scene-store.ts`; runtime init in `runtime.svelte.ts`.
  - Tests: core "AC1: a reconnecting (second DM) device receives the active audio state via the durable
    slice"; e2e "the active track persists across a hard navigation".
- AC2 (removing a widget does not delete session audio without a stop command):
  - Code: state is session-owned (Contract 4); only `handleStopSessionAudio` clears the track.
  - Tests: core "AC2: removing a widget does not delete session audio (only stop clears it)".
- AC3 (offline remote participants queued/marked undelivered without blocking local playback):
  - Code: `SessionAudioDelivery` + `handleProjectSessionAudio` (queued/delivered).
  - Tests: core "AC3: projecting to an offline participant QUEUES the delivery…"; e2e "projecting to an
    offline participant queues the delivery without blocking playback".

### Cross-cutting (fail closed / determinism / privacy)

- Gate respect: core tests "an unlicensed asset cannot be played", "an offline/missing local asset cannot
  be played", "an unconfigured source cannot be played" (all reject; no playback state created).
- Per-actor filtering / no-leak: core "the DM sees the authoritative track + per-participant delivery
  roster; a player sees only the player-safe track" + "an unknown actor sees the silent participant view";
  e2e "a player … never the DM playback form or roster".
- Determinism: core "identical command sequences produce identical session-audio state".
- Fail-closed hydration (older vaults): core "a vault persisted before this slice restores to the
  stopped/silent state" + "a persisted track with an invalid status hydrates to stopped".

## Offline / sync behavior (Contract 2)

- Local-first: the DM may play/pause/stop/volume/crossfade entirely offline; commands are accepted into
  the local durable store and append a `session.audio.*` operation each (actor + entity audit).
- The active track and per-player delivery records sync to collaborators as SESSION state (operations
  carry the track reference — source/asset id — never asset bytes; Contract 2 large-asset rule).
- Offline participants: a projection to an unavailable participant is recorded `queued` (undelivered)
  rather than blocking local playback; a reconnecting device re-evaluates and is re-projected `delivered`.

## Quality gates (all run; all green)

- `pnpm --filter @dndtools/v2-core test` — 140 files, 2014 tests passed.
- `pnpm --filter @dndtools/v2-app test` — 12 files, 55 tests passed (includes the boundary-lint test).
- `pnpm v2:typecheck` — core `tsc --noEmit` + app `svelte-check`: 0 errors, 0 warnings (842 files).
- `pnpm v2:lint` — v2 boundary lint passed.
- `pnpm lint` — full eslint + nav-layer + token-compliance + repo-boundary audit: passed.
- `pnpm docs:validate` — docs validation passed.
- `pnpm v2:workpack:validate` — v2 workpack validation passed.
- `pnpm e2e` (from `apps/v2/app`, full suite, both projects) — desktop-chromium + mobile-chromium:
  **517 passed, 21 skipped, 0 failed** (baseline was 509 passed / 21 skipped; +8 = 4 new specs × 2
  projects). New audio spec passes on both projects; the new surface does not overflow the narrow mobile
  viewport (full-width controls; no unrelated spec regressed).

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/state/session-audio.ts`
- `apps/v2/packages/core/src/commands/audio-playback.ts`
- `apps/v2/packages/core/src/queries/session-audio-query.ts`
- `apps/v2/packages/core/tests/session-audio-playback.test.ts`
- `apps/v2/app/src/lib/gui/AudioPlayback.svelte`
- `apps/v2/app/tests/e2e/session-audio-playback.spec.ts`
- `docs/planning/v2/epics/AUDIO-playback-and-session-state.completion.md`

Modified:
- `apps/v2/packages/core/src/state/session-state.ts` (add `audioPlayback` slice + re-exports)
- `apps/v2/packages/core/src/commands/session-control.ts` (archive/reset/restore audioPlayback)
- `apps/v2/packages/core/src/commands/helpers.ts` (`ensureSessionState` hydrates audioPlayback)
- `apps/v2/packages/core/src/commands/dispatch.ts` (wire `session.audio.*` handlers)
- `apps/v2/packages/core/src/commands/types.ts` (command types, events, rejection codes)
- `apps/v2/packages/core/src/schemas/commands.ts` (play/set-volume/project schemas)
- `apps/v2/packages/core/src/index.ts` (public exports)
- `apps/v2/packages/core/src/testing/fixtures.ts` (audioPlayback in initial state)
- `apps/v2/packages/core/tests/map-query.test.ts` (inline session fixture gains audioPlayback)
- `apps/v2/app/src/lib/platform/storage/scene-store.ts` (persist + hydrate audioPlayback)
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` (runtime initial + ensure audioPlayback)
- `apps/v2/app/src/lib/platform/capabilities.ts` (owned `prefersReducedMotion` probe — AUDIO-008)
- `apps/v2/app/src/routes/session/+page.svelte` (mount `AudioPlayback`)
- `docs/planning/v2/epics/AUDIO-playback-and-session-state.yaml` (generated — status active→complete)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (source-of-truth state)

## Known / deferred gaps

- The prior AUDIO epics shipped no audio LIBRARY-management GUI (source/asset/automation config surfaces
  were deferred to this playback epic and remain out of scope here). To keep the playback surface
  end-to-end demonstrable, `AudioPlayback.svelte` includes a minimal "Configure a demo source" affordance
  (a bundled-preset + a cleared asset). A full audio library-management surface is a future AUDIO epic.
- The real `<audio>` element has no bundled media `src` in the prototype (assets are not bundled); the
  load-bearing behavior — that the element only sounds when the core-computed disposition is `playing`
  (respecting consent/autoplay/degradation gates) — is wired and asserted. Real asset byte playback at the
  display layer is a platform concern for a later asset-storage epic.
- Output-route SELECTION UI (AUDIO-012) is not surfaced here; the routing decision is computed and
  reported by the read model, and the device-local route input is plumbed, but the prototype does not
  enumerate device sinks (a platform capability deferred per ADR-014).

## Final `git status --short`

After the feature commit (`57582f4`) and the workpack-complete commit (`83b9867`), the only remaining
change is this SHA-record edit to the completion evidence; it is committed by the `docs(v2): record
commit SHA …` follow-up, leaving the working tree clean (empty `git status --short`) at handoff.

The implementation commit `57582f4` captured the full feature tree:

```
 M apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts
 M apps/v2/app/src/lib/platform/capabilities.ts
 M apps/v2/app/src/lib/platform/storage/scene-store.ts
 M apps/v2/app/src/routes/session/+page.svelte
 M apps/v2/packages/core/src/commands/dispatch.ts
 M apps/v2/packages/core/src/commands/helpers.ts
 M apps/v2/packages/core/src/commands/session-control.ts
 M apps/v2/packages/core/src/commands/types.ts
 M apps/v2/packages/core/src/index.ts
 M apps/v2/packages/core/src/schemas/commands.ts
 M apps/v2/packages/core/src/state/session-state.ts
 M apps/v2/packages/core/src/testing/fixtures.ts
 M apps/v2/packages/core/tests/map-query.test.ts
 M docs/planning/v2/epics/AUDIO-playback-and-session-state.yaml
 M docs/planning/v2/status.yaml
 M docs/planning/v2/workpack-state.yaml
?? apps/v2/app/src/lib/gui/AudioPlayback.svelte
?? apps/v2/app/tests/e2e/session-audio-playback.spec.ts
?? apps/v2/packages/core/src/commands/audio-playback.ts
?? apps/v2/packages/core/src/queries/session-audio-query.ts
?? apps/v2/packages/core/src/state/session-audio.ts
?? apps/v2/packages/core/tests/session-audio-playback.test.ts
?? docs/planning/v2/epics/AUDIO-playback-and-session-state.completion.md
```

Final handoff state: `git status --short` is empty (clean working tree).
