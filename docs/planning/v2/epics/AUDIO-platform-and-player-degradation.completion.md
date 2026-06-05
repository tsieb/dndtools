# AUDIO-platform-and-player-degradation — Completion Evidence

Epic: `AUDIO-platform-and-player-degradation` (AUDIO: Platform and player degradation)
Requirements: **AUDIO-006, AUDIO-007, AUDIO-008, AUDIO-012, AUDIO-013**
Workpack status: `complete`
Git branch: `epic/AUDIO-platform-and-player-degradation` (created from the prior epic tip `494d00c`, the v2 epic chain HEAD)

## Summary

This epic delivers the **platform + player degradation** capability branch for AUDIO. The prior AUDIO epics
answered "is this track playable AT ALL?" — the AUDIO-009 source-scope gate, the AUDIO-010 cache/offline
gate (`resolveAudioPlaybackAvailability`), and the AUDIO-004 license-review gate. This epic answers the
NEXT question, per PARTICIPANT: **given the platform a participant is on, the device-local preferences they
set, and any recorded playback failures, SHOULD audio actually sound on their device — and if not, how does
it degrade CLEANLY?**

The model composes the existing gates rather than inventing parallel ones. A new deterministic Processing-
Core policy, `resolveAudioDelivery`, folds three new axes onto the existing availability gate:

- **PLATFORM** (AUDIO-006 / AUDIO-012): browser autoplay policy, background-playback support, output-routing
  support, and the hard "can this platform play audio at all" floor — captured as an
  `AudioPlatformCapability` snapshot that **fails closed** (an unknown/undeclared capability degrades rather
  than optimistically autoplaying).
- **PLAYER** (AUDIO-007): device-local consent / mute / volume / output-route preferences. These change what
  the participant HEARS; they **never mutate** DM-authored session audio state.
- **SAFETY** (AUDIO-013): a bounded consecutive-failure limit + a resource-exceeded flag, so repeated
  failures or excessive resource use **degrade** (stop) the track rather than retrying indefinitely or
  blocking other session commands.

Every non-`playing` outcome is a **clearly-signalled non-playing state** (`consent-blocked`,
`user-action-required`, `muted`, `background-blocked`, `platform-unsupported`, `safety-degraded`,
`track-unavailable`) — never a broken, silently-wrong, or indefinitely-retrying one. The policy is **pure +
deterministic** (no DOM, `navigator`, clock, or network), so identical capability + permission + preference
+ failure inputs always produce the identical decision; the GUI/runtime captures the impure inputs (real
autoplay policy, the consent gesture, element errors) and **renders** the computed decision — it never
decides degradation itself (Contract 1 Processing/Display decoupling).

AUDIO-008 accessibility is resolved by the same pure module: `resolveAudioMotionState` maps the participant's
reduced-motion preference (fail-closed to `reduced`) to whether animated crossfade/visualizer effects run,
and `shouldAnnounceAudioChange` admits low-frequency lifecycle announcements while suppressing high-frequency
progress ticks so the assistive-tech live region is not spammed.

## How it composes the existing AUDIO model

- `resolveAudioDelivery` reuses `resolveAudioPlaybackAvailability` (AUDIO-010) **verbatim** for the
  track-availability axis — offline/missing/cache-evicted decisions are not re-derived. A flagged license is
  resolved by the caller via the existing `assetNeedsLicenseReview` (AUDIO-004) and passed in as
  `licenseCleared`. The DM-authored `AudioSource` (AUDIO-009) is the same source record the rest of the audio
  model uses.
- The actor-filtered read model (`queries/audio-delivery-query.ts`) follows the exact DM-only discipline of
  `queries/audio-library-query.ts`: the DM session-status roster is DM-only (non-DM gets an empty list); a
  participant resolves only their OWN decision; a deleted source/asset or revoked license fails closed.
- No new durable state, no new commands, no persistence-adapter change. Participant consent / mute / volume /
  output-route are **device-local** (Contract 2) — they are the INPUT to a pure read, not DM-authored session
  state — so there is nothing to persist or sync here and nothing to mutate.

## Programmatic / demo path

The degradation surface is pure-core (no new route/widget). A reviewer can exercise it programmatically:

1. Configure a declared local-file source and a cleared (`owned`) local audio asset (AUDIO-009/004).
2. Resolve a participant's delivery decision for the active track:
   `resolveAudioDeliveryForActor(audio, permissions, playerId, { sourceId, assetId }, deviceInput)`.
   - A granted participant on a capable platform with an available track → `disposition: 'playing'` at the
     device-local volume.
   - A participant who declined → `disposition: 'consent-blocked'` (silent), session state untouched.
   - A platform that blocks autoplay or has consent unset → `disposition: 'user-action-required'`.
   - A backgrounded device whose platform blocks background audio → `disposition: 'background-blocked'`
     (degraded, not retried).
   - An unsupported/unknown platform → `disposition: 'platform-unsupported'` (fail closed).
   - A track that is offline/missing/unlicensed/evicted → `disposition: 'track-unavailable'` with the precise
     AUDIO-010 availability surfaced.
   - A track past the failure limit or flagged resource-exceeded → `disposition: 'safety-degraded'` (stopped).
3. Inspect session status as the DM: `listAudioDeliveryForDm(audio, permissions, dmId, track, devices)` returns
   a NON-LEAKING per-participant roster (disposition / routing / sounding / message) in stable actor-id order;
   a non-DM actor gets an empty roster.
4. Routing (AUDIO-012): `resolveAudioOutputRouting(capability, preferences)` → `default` / `routed` /
   `unavailable` — an unsupported route reports `unavailable` and falls back to default, never failing
   playback. Accessibility (AUDIO-008): `resolveAudioMotionState` / `shouldAnnounceAudioChange`.

The full behavior is demonstrated by `apps/v2/packages/core/tests/audio-degradation.test.ts` and
`apps/v2/packages/core/tests/audio-delivery-query.test.ts`.

## Requirement coverage / traceability

### AUDIO-006 — graceful platform degradation

| Acceptance criterion | Code | Tests |
| --- | --- | --- |
| Mobile blocks background playback → degraded status, not indefinite retry | `resolveAudioDelivery` step (7), `background-blocked` disposition (`state/audio-degradation.ts`) | `audio-degradation.test.ts` "AC1: a backgrounded device on a platform that blocks background playback degrades (no retry)" |
| Participant cannot play → DM sees delivery state without device secrets | `listAudioDeliveryForDm` non-leaking `AudioParticipantDeliveryView` (`queries/audio-delivery-query.ts`) | `audio-delivery-query.test.ts` "AC2 — the DM sees every participant delivery state without device secrets" (incl. key-set / no `capability`/`preferences` leak) |

### AUDIO-007 — device-local consent / mute / output / volume (no DM-state change)

| Acceptance criterion | Code | Tests |
| --- | --- | --- |
| Participant declines → device silent + consent-blocked status | `resolveAudioDelivery` step (4), `consent-blocked` | `audio-degradation.test.ts` "AC1: a participant who declined audio stays silent and reports consent-blocked" |
| Participant changes local volume → authoritative session volume unchanged | `effectiveVolume` is device-local; the read mutates no source record | `audio-degradation.test.ts` "AC2: the device-local volume only scales the device output"; `audio-delivery-query.test.ts` "AC2: a participant changing local volume does not change the authoritative library/source record" |

### AUDIO-008 — accessibility (reduced motion + announcements)

| Acceptance criterion | Code | Tests |
| --- | --- | --- |
| Reduced motion → crossfade/visualizer effects reduced/disabled | `resolveAudioMotionState` | `audio-degradation.test.ts` "AC1: reduced motion disables animated effects; otherwise effects run" |
| Announcements concise, not repeated for high-frequency progress | `shouldAnnounceAudioChange` | `audio-degradation.test.ts` "AC2: lifecycle changes are announced but high-frequency progress updates are not" |

### AUDIO-012 — output routing (platform-declared, default fallback)

| Acceptance criterion | Code | Tests |
| --- | --- | --- |
| Unsupported routing → default output / `unavailable` status, no session-audio failure | `resolveAudioOutputRouting`; routing reported on every `AudioDeliveryDecision` even while silent | `audio-degradation.test.ts` "AC1: a chosen route on a platform without routing reports unavailable and falls back to default" + "routing is reported even when the device is silent" |
| Device-local route change → device-local, does not mutate DM-authored playback state | route is an INPUT to the pure read; resolves to `routed` only when supported | `audio-degradation.test.ts` "AC2: a supported chosen route is honored as a device-local route"; `audio-delivery-query.test.ts` AC2 (source record unchanged) |

### AUDIO-013 — performance-safe failure modes

| Acceptance criterion | Code | Tests |
| --- | --- | --- |
| Repeated failures / excessive resource → track stopped/degraded, DM diagnostics, no blocking other commands | `resolveAudioDelivery` step (2), `safety-degraded` (bounded `failureLimit`, `resourceExceeded`); `message` is the DM diagnostic; the decision is a pure value that issues no command, so it cannot block combat/dice/handout dispatch | `audio-degradation.test.ts` "AUDIO-013 — performance-safe failure modes" (limit, resource, custom limit, precedence over retry) |
| Degraded audio → DM combat/dice/handout commands stay within responsiveness budgets | the degradation decision is a non-blocking pure value computed independently of any other command path (no retry loop, no shared mutable state) | covered structurally: `resolveAudioDelivery` performs no I/O and returns synchronously; the safety-degrade path stops the track instead of retrying |

## Quality review

- **Correctness:** every AUDIO-006/007/008/012/013 acceptance criterion is implemented and tested; the
  decision order is fixed and proven by a dedicated determinism/precedence test.
- **Architecture:** all logic lives in the Processing Core (`@dndtools/v2-core`); no Svelte/DOM/`navigator`,
  no v1 runtime imports (v2 boundary lint passes). The GUI would render the computed decision only (Contract
  1). Consent/autoplay handling at the display layer is driven by core-computed state.
- **Permissions / visibility (Contract 3):** the DM session-status roster is DM-only (non-DM → empty); a
  participant resolves only their own decision; an unknown actor fails closed to null/empty. The DM-facing
  snapshot carries only disposition / routing / sounding / message — no device secret (no platform
  fingerprint, no echoed route device id, no consent token).
- **Fail closed:** unknown platform capability → `platform-unsupported`; consent unset → silent
  (`user-action-required`); declined → `consent-blocked`; offline/missing/unlicensed/evicted →
  `track-unavailable`; failure-limit/resource → `safety-degraded`. No autoplay where the platform/policy
  forbids it; no indefinite retry; no track substitution; no DM-only cue leaked to a player.
- **Determinism:** pure functions, stable iteration order, repeated-call equality test.
- **Persistence / sync / offline:** participant preferences are device-local (Contract 2) — nothing durable
  is added, no adapter change, no sync op. Track availability reuses the AUDIO-010 offline gate (offline:
  yes/degrade behavior preserved).
- **Accessibility:** AUDIO-008 reduced-motion + announcement resolvers, fail-closed to the safer default.
- **Maintainability:** two small cohesive modules + focused exports; no speculative abstraction, no unrelated
  refactor; matches the existing audio modules' naming, structure, comment density, and test idioms.

## Known / deferred gaps

- The policy produces a **delivery decision** (a pure value the GUI/runtime renders and acts on); it does not
  execute durable playback because the AUDIO playback epic (AUDIO-002/003 session-owned currently-playing
  audio) is not yet implemented. The active-track inputs (`AudioActiveTrack`, the per-device snapshot) are
  shaped to attach to that session-owned playback state with no change to this slice when it lands.
- No GUI surface was added (the epic is pure-core platform/degradation policy), consistent with the deferred
  audio playback surface. The DM read model (`listAudioDeliveryForDm`) and the participant read
  (`resolveAudioDeliveryForActor`) are ready for a future session-status panel and player audio control.
- AUDIO-013 AC2 (other session commands stay within budget) is satisfied structurally — the decision is a
  non-blocking synchronous pure value with no retry loop or shared mutable state — rather than by a live
  performance benchmark, which requires the (deferred) real playback runtime.

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/state/audio-degradation.ts`
- `apps/v2/packages/core/src/queries/audio-delivery-query.ts`
- `apps/v2/packages/core/tests/audio-degradation.test.ts`
- `apps/v2/packages/core/tests/audio-delivery-query.test.ts`
- `docs/planning/v2/epics/AUDIO-platform-and-player-degradation.completion.md`

Modified:
- `apps/v2/packages/core/src/index.ts` (public exports for the degradation policy + delivery read model)
- `docs/planning/v2/epics/AUDIO-platform-and-player-degradation.yaml` (generated)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (mutable state)

## Gates run

- `pnpm --filter @dndtools/v2-core test` — **PASS** (139 files, 1993 tests; +40 new across the two new test
  files).
- `pnpm v2:typecheck` — **PASS** (core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings).
- `pnpm v2:lint` — **PASS** (v2 boundary lint).
- `pnpm lint` — **PASS** (full eslint + navigation + token + repo-boundary audit).
- `pnpm docs:validate` — **PASS**.
- `pnpm v2:workpack:validate` — **PASS**.
- Playwright e2e — **SKIPPED (justified).** This epic is pure-core: the only changed runtime files are
  `@dndtools/v2-core` modules (`state/audio-degradation.ts`, `queries/audio-delivery-query.ts`, their tests,
  and `index.ts` exports). No route, layout, Svelte component, visible flow, platform adapter, runtime
  (`canvas-runtime`), or persistence/storage file was touched, so no browser flow changed. The e2e suite
  (509 passed / 21 skipped / 0 failed) is unaffected.

## Git evidence

Commits:
- `e56a4ee` — feat(v2): complete AUDIO-platform-and-player-degradation epic (code + tests + completion evidence)
- `d27d7dc` — chore(v2): mark AUDIO-platform-and-player-degradation workpack complete (regenerated derived files)
- recorded by this follow-up `docs(v2): record commit SHA in AUDIO-platform-and-player-degradation completion evidence` commit

Final `git status --short` (after the completion commits; clean slate):

```
(empty — clean working tree)
```
