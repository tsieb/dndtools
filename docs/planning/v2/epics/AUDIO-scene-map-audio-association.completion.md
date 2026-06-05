# AUDIO-scene-map-audio-association — Completion Evidence

Workpack status: `complete`

Epic: **AUDIO-scene-map-audio-association** — AUDIO: Scene/map audio association
Requirement: **AUDIO-001** (Should-have; Offline: yes | Multi-user: yes | Mobile: slim | Player-safe: dm-only)
Branch: `epic/AUDIO-scene-map-audio-association` (chained off the prior tip `b1a558e`)

## Summary

AUDIO-001 associates an ambient track / playlist / atmosphere preset with a **Scene, map, or map layer**.
This epic adds a **durable association model** to the existing `AudioState` vault slice and a **deterministic
activation resolver** that, when a Scene is activated (or a map / map layer is revealed), computes which
associated cues are AVAILABLE to the audio widget — **composing the existing AUDIO gates** rather than
duplicating any policy or adding a second playback path:

- AUDIO-009 source-scope/playback-enabled gate (`classifyAudioSource`),
- AUDIO-004 license-review gate (`assetNeedsLicenseReview` / `licenseReviewReason`),
- AUDIO-010 offline/cache availability (`resolveAudioPlaybackAvailability`).

A cleared preset is `available`/`playable`; the DM plays it through the EXISTING `session.audio.play`
command (AUDIO-002/003). A missing-on-device asset surfaces the **MISSING-ASSET** state (no network retry, no
track substitution). Associations are DM-only config: the actor-filtered read model returns empty for a
non-DM, so a hidden cue/target never leaks to a player.

The model is composed onto the existing slices, not duplicated:
- Durable state lives on `AudioState.associations` (the same vault slice that already owns assets/sources/
  automation rules), so persistence, runtime initial state, fixtures, and the schema-version registry reuse
  the existing `ensureAudioState` fail-closed hydrator.
- The resolver reuses the AUDIO-005 trigger-resolution shape (an `Activation` carrying device-availability
  inputs) and the same gate functions, so identical activations produce identical audio resolution.

## Demo path

Programmatic + user-visible:
1. Start the app, open the Command Center (`/`), click **Start active session** (sets the active Scene).
2. Open **Session** (`/session/`) → the **Audio** widget. Click **Configure a demo source** (seeds a
   bundled-preset source + a cleared local asset and selects it).
3. Under **Scene presets**, enter a label and click **Associate selected source with this Scene** (AUDIO-001
   AC1: the Scene now "has an audio preset"). The preset appears in the list with a **Play** affordance.
4. Click **Play** on the preset → the existing session-audio playback starts (`audio-track-status: playing`).
5. Uncheck **Asset available on this device** → the preset re-resolves to the **Missing asset on this
   device** state and the Play affordance disappears (AUDIO-001 AC2).
6. Use **View as → a player**: the DM-only Scene-presets section is not rendered (dm-only, fail closed).

## Requirement coverage / traceability (AUDIO-001)

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1 — a Scene has an audio preset; on activation the preset is available to the audio widget | `apps/v2/packages/core/src/state/audio-association.ts` (`AudioAssociation`, `resolveAudioAssociations`, `ResolvedAudioPreset.available/playable`); `apps/v2/packages/core/src/queries/audio-association-query.ts` (`resolveActivatedSceneAudioForActor`); `apps/v2/packages/core/src/commands/audio-association.ts` (`handleAssociateSceneAudio`); GUI `apps/v2/app/src/lib/gui/AudioPlayback.svelte` (Scene-presets section + `playPreset` via `session.audio.play`) | `apps/v2/packages/core/tests/audio-association.test.ts` ("a Scene with a cleared preset resolves it AVAILABLE/playable", "map-layer fires only for its exact layer", command "the DM associates a Scene cue"); e2e `apps/v2/app/tests/e2e/session-audio-playback.spec.ts` AUDIO-001 AC1 |
| AC2 — a missing audio asset on a device shows a missing-asset state on playback request | `apps/v2/packages/core/src/state/audio-association.ts` (`presetForPlaybackAvailability` → `missing-asset`, reuses `resolveAudioPlaybackAvailability` — no retry/substitution); GUI missing-asset render | `apps/v2/packages/core/tests/audio-association.test.ts` ("a missing local asset resolves the MISSING-ASSET state", "an evicted cache resolves MISSING-ASSET", "an asset deleted after association resolves MISSING-ASSET"); e2e AUDIO-001 AC2 |

Fail-closed gate composition (no silent bypass): unlicensed asset → `license-blocked`; unsupported/disabled
source → `source-unsupported`; offline-uncached web stream → `unavailable`. Covered by
`apps/v2/packages/core/tests/audio-association.test.ts` (AUDIO-004 / AUDIO-009 / AUDIO-010 cases). Per-actor filtering (DM-only,
no leak) and DM-only commands covered by the "actor-filtered read model" and "commands (DM-only)" describe
blocks. Determinism covered by "identical activations produce identical resolution (stable id order)".
Hydration fail-closed (older vaults, corrupt records) covered by the "hydration" describe block.

## Quality gates (all run; results)

| Gate | Command | Result |
| --- | --- | --- |
| Core unit/integration tests | `pnpm --filter @dndtools/v2-core test` | PASS — 141 files, 2047 tests (incl. 30 new AUDIO-001 tests) |
| App unit tests | `pnpm --filter @dndtools/v2-app test` | PASS — 12 files, 55 tests |
| Type checks | `pnpm v2:typecheck` (core `tsc --noEmit` + app `svelte-check`) | PASS — 0 errors |
| Boundary lint | `pnpm v2:lint` | PASS |
| Full ESLint (CI gate) | `pnpm lint` | PASS |
| Docs validate (CI gate) | `pnpm docs:validate` | PASS |
| Workpack validate | `pnpm v2:workpack:validate` | PASS |
| E2E (full suite, both projects) | `pnpm e2e` (desktop-chromium + mobile-chromium) | 520 passed, 21 skipped, 1 pre-existing flake in `sync-conflict-lifecycle.spec.ts` (unrelated to AUDIO; passes green on isolated re-run). The new AUDIO-001 e2e tests pass on BOTH projects (verified via a targeted re-run of `session-audio-playback.spec.ts`: 12 passed). |

The single full-suite e2e failure was `sync-conflict-lifecycle.spec.ts:71` (a SYNC conflict-UI test) under
parallel-worker contention; re-running that spec in isolation passed 5/5. No AUDIO/Scene file touched changes
sync behavior. The new Scene-presets section renders without overflow on the mobile (Pixel 5) viewport.

## Changed files

New:
- `apps/v2/packages/core/src/state/audio-association.ts`
- `apps/v2/packages/core/src/commands/audio-association.ts`
- `apps/v2/packages/core/src/queries/audio-association-query.ts`
- `apps/v2/packages/core/tests/audio-association.test.ts`
- `docs/planning/v2/epics/AUDIO-scene-map-audio-association.completion.md`

Modified:
- `apps/v2/packages/core/src/state/audio-state.ts` (added `associations` field + fail-closed hydration + lookup)
- `apps/v2/packages/core/src/schemas/commands.ts` (associate/disassociate input schemas)
- `apps/v2/packages/core/src/commands/types.ts` (command types, events, rejection codes)
- `apps/v2/packages/core/src/commands/dispatch.ts` (wired the two handlers)
- `apps/v2/packages/core/src/index.ts` (public exports for the new state + query modules)
- `apps/v2/packages/core/src/testing/fixtures.ts` (`associations: {}` in the initial state)
- `apps/v2/packages/core/tests/audio-delivery-query.test.ts` (added `associations: {}` to a literal `AudioState`)
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` (`associations: {}` in the runtime initial state)
- `apps/v2/app/src/lib/gui/AudioPlayback.svelte` (Scene-presets section: associate/remove/play + missing-asset)
- `apps/v2/app/tests/e2e/session-audio-playback.spec.ts` (two AUDIO-001 e2e tests)
- `docs/planning/v2/epics/AUDIO-scene-map-audio-association.yaml` / `docs/planning/v2/status.yaml` /
  `docs/planning/v2/workpack-state.yaml` (generated by the workpack status commands)

## Offline / sync behavior

- Offline: yes. The association config and the resolver are pure local-first state — authoring and resolving
  presets need zero network. The AUDIO-010 offline gate is reused verbatim: a local-file cue uses local
  availability (no retry), a web-stream cue is unavailable offline unless explicitly cached, an evicted cache
  reports missing without substitution.
- Sync/multi-user: yes. Each associate/disassociate appends an `audio.association.*` operation
  (`AUDIO_ASSOCIATION_ENTITY_TYPE`) carrying only the cue REFERENCES (source/asset/target ids), never asset
  bytes (Contract 2) and never player content. Associations are DM-only authoritative config (last accepted
  DM command by revision); a non-DM write is rejected fail-closed.
- Hydration: a vault persisted before this slice existed restores `associations: {}` via `ensureAudioState`;
  a corrupt record (undeclared target, a map-layer record missing its layer id) is dropped fail-closed, and a
  stray layer id / invalid preset kind is corrected to the safe shape.

## Visibility / permission / determinism

- DM-only authority: associate/disassociate require the DM (`requireDm`); the read model returns empty/null
  for a non-DM, so the cue, its target binding, and the source/asset refs never leak to a player.
- Fail closed: an unlicensed (AUDIO-004), unsupported/playback-disabled (AUDIO-009), or offline-missing
  (AUDIO-010) cue never resolves as `playable` — it surfaces a non-leaking diagnostic state instead.
- No second playback path: a cleared preset is played through the EXISTING `session.audio.play` command,
  which re-validates the full gate before mutating session audio.
- Determinism: `resolveAudioAssociations` is pure (no DOM/clock/network) and sorts by association id, so
  identical (activation, associations, library) inputs always yield identical resolution — tested.

## Known gaps / deferred

- The GUI surface focuses on **Scene** associations (the AC1 surface). `map` and `map-layer` associations are
  fully supported in the Processing Core (model, commands, resolver, query, tests) and are resolvable by the
  same `resolveActivatedSceneAudioForActor` API; a dedicated map/layer authoring UI is left for the MAP/audio
  GUI surface, since AUDIO-001's acceptance criteria are Scene-activation-centric.
- Automatic auto-play on activation is intentionally NOT done: AUDIO-001 makes the preset "available to the
  audio widget", and AUDIO-005 owns event→command automation. The DM dispatches play explicitly (or wires an
  AUDIO-005 `scene-activation` rule), keeping a single authoritative playback path.

## Git

- Branch: `epic/AUDIO-scene-map-audio-association`
- Feature commit SHA: `ac5af84f521e6bf7fec9bd29c0e87ada55b660f0`
  (`feat(v2): complete AUDIO-scene-map-audio-association epic`)
- This SHA is recorded by the follow-up `docs(v2): record commit SHA …` commit.

### Final `git status --short`

```
(empty — clean working tree after the feature commit and the SHA-recording follow-up commit)
```
