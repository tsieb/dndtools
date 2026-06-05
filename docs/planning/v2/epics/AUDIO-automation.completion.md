# AUDIO-automation — Completion Evidence

Epic: `AUDIO-automation` (AUDIO: Automation)
Requirement: **AUDIO-005**
Workpack status: `complete`
Git branch: `epic/AUDIO-automation` (created from the prior epic tip `02fd034`, the v2 epic chain HEAD)

## Summary

AUDIO-005 delivers **atmosphere automation**: the DM configures durable rules that map a session event
(combat start, map reveal, Scene activation, handout delivery) to a declared audio command. When such an
event fires, a deterministic Processing-Core resolver computes which rules match and, for each, whether the
declared audio command may be **requested** — composing the EXISTING audio gates rather than duplicating
any policy:

- AUDIO-009 source-scope gate (only declared, supported sources can play),
- AUDIO-010 cache/offline gate (playback-enabled prerequisite + offline availability, no network retry, no
  track substitution),
- AUDIO-004 license-review gate (an unlicensed/flagged local asset never auto-plays).

A blocked rule resolves to a **flagged no-op with a non-leaking diagnostic** (AUDIO-005 AC2) — the declared
command is never silently issued, so an automation rule can never bypass a license/scope/offline block into
silent unlicensed playback. The model is pure + deterministic (no DOM, clock, or network), so identical
event sequences produce identical automation outcomes. Automation rules are DM-only config and live in the
durable `AudioState` slice (persisted by the existing scene-store wiring), so the read model omits them for
non-DM actors — no hidden trigger or cue leaks to players.

## How it composes the existing AUDIO model

- Rules reference an existing **declared `AudioSource`** (AUDIO-009) and an optional existing **content-
  addressed `AudioAsset`** (AUDIO-004) BY ID — never a copy of asset bytes (Contract 4 embed/projection).
- The resolver reuses `resolveAudioPlaybackAvailability` (AUDIO-010), `classifyAudioSource` (AUDIO-009),
  and `assetNeedsLicenseReview`/`licenseReviewReason` (AUDIO-004) verbatim — no parallel policy.
- The new `automationRules` map is added to the existing `AudioState` VaultState slice with fail-closed
  hydration in `ensureAudioState`; the existing scene-store persists/loads the whole `AudioState` document,
  so the new field round-trips on reload with **no persistence-adapter change**.
- Trigger kinds map to the EXISTING core events (`combat.started`, `map.layer-changed`/`map.fog-changed`,
  `session.workflow-changed`, `session.handout-delivered`).

## Programmatic / demo path

The automation surface is pure-core (no new route/widget). A reviewer can exercise it programmatically:

1. Configure a declared local-file source and import a cleared (`owned`) local audio asset (AUDIO-009/004).
2. Dispatch `audio.configure-automation` with `{ trigger: 'combat-start', action: 'play', sourceId, assetId }`
   as the DM — the rule lands in the registry (`listAudioAutomationRulesForActor`).
3. Build a fired trigger and call `resolveAudioAutomationForActor(audio, permissions, dmId,
   { kind: 'combat-start', ... online/availability inputs })`:
   - With a cleared asset + available track → `requests: [{ action: 'play', sourceId, assetId }]` (AC1).
   - With an unlicensed asset, an unsupported/disabled source, or an offline/missing/evicted track →
     `outcomes: [{ status: 'blocked', reason, ... }]`, `requests: []`, `blockedCount: 1` (AC2 — no bypass).
4. As a player, `listAudioAutomationRulesForActor` returns `[]` and `resolveAudioAutomationForActor` returns
   `null` (DM-only; no trigger/cue leak).

The full behavior is demonstrated by `apps/v2/packages/core/tests/audio-automation.test.ts`.

## Requirement coverage / traceability (AUDIO-005)

| Acceptance criterion | Code | Tests |
| --- | --- | --- |
| AC1: a combat-start trigger requests the declared audio command when combat starts | `state/audio-automation.ts` (`evaluateAudioAutomationRule`, `resolveAudioAutomation`), `queries/audio-library-query.ts` (`resolveAudioAutomationForActor`), `commands/audio-automation.ts` (`handleConfigureAudioAutomation`) | `audio-automation.test.ts` → "AUDIO-005 AC1 …" + "DM-only command + visibility … AC1" |
| AC2: a command that fails permission or asset/license/source/offline validation produces no hidden bypass and records a diagnostic | `state/audio-automation.ts` (license/source/offline gate composition → `blocked` outcome with diagnostic), DM-only command + query filters | `audio-automation.test.ts` → "AUDIO-005 AC2 — no hidden bypass …" (license-blocked / playback-disabled / asset-missing / unavailable / evicted / deleted-asset), "rejects a non-DM …", "a player sees an EMPTY automation rule list …" |
| Determinism (identical event sequences → identical outcomes) | `resolveAudioAutomation` (stable rule-id order, pure) | `audio-automation.test.ts` → "AUDIO-005 — determinism" |
| Offline/sync behavior (durable rule definitions, fail-closed hydration) | `state/audio-state.ts` (`automationRules` + `ensureAudioState` drop-corrupt) | `audio-automation.test.ts` → "AUDIO-005 — durable hydration" |

## Quality gates (all run; results)

| Gate | Command | Result |
| --- | --- | --- |
| Core tests | `pnpm --filter @dndtools/v2-core test` | PASS — 137 files, **1953 tests passed** (26 new in `audio-automation.test.ts`) |
| Typecheck | `pnpm v2:typecheck` | PASS — core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings (835 files) |
| Boundary lint | `pnpm v2:lint` | PASS — "v2 boundary lint passed" |
| Full ESLint | `pnpm lint` | PASS — eslint + nav lint + token lint + repo-boundary audit all green |
| Docs validate | `pnpm docs:validate` | PASS — "docs validation passed" |
| Workpack validate | `pnpm v2:workpack:validate` | PASS — "v2 workpack validation passed" |
| E2E (both projects) | `pnpm e2e` (from `apps/v2/app`) | PASS — **509 passed, 21 skipped, 0 failed** on desktop-chromium + mobile-chromium (baseline held) |

E2E was run because the epic touches `runtime.svelte.ts` (the runtime initial-state literal gains an empty
`automationRules` field). The reload flow round-trips the new durable field through the existing
`ensureAudioState`/scene-store path with no scene-store change; the full suite confirms the baseline is held.

## Licensing / scope / visibility / determinism concerns (and resolution)

- **License bypass (fail closed):** a `play`/`crossfade` rule against a local asset whose license is not
  cleared resolves to `blocked` (`reason: 'license-blocked'`) — the AUDIO-004 review gate is reused, never
  bypassed. The license is resolved at TRIGGER time against the live library, so a rule authored while an
  asset was licensed still fails closed if the license is later revoked.
- **Source scope (fail closed):** a source that no longer resolves to a declared supported type, or whose
  playback is disabled (AUDIO-010 prerequisite), blocks the request.
- **Offline (fail closed):** the AUDIO-010 availability gate (`missing-asset` / `unavailable-offline` /
  `cache-evicted`) blocks the play with a specific diagnostic — no network retry, no track substitution.
- **Visibility (no leak):** automation rules are DM-only config; `listAudioAutomationRulesForActor` and
  `resolveAudioAutomationForActor` return empty/null for non-DM actors, and the configure/delete commands
  are DM-only. The op-log audit value carries only the rule definition (trigger/action/refs), never player
  content or asset bytes.
- **Determinism:** the resolver is pure and iterates rules in stable id order; tested for identical-output
  on repeated calls.

## Known / deferred gaps

- The resolver produces audio **command requests**; it does not execute durable playback because the AUDIO
  playback epic (AUDIO-002/003 session-owned currently-playing audio) is not yet implemented. This matches
  Contract 4 (automation output is a command request the Processing Core validates) and the existing audio
  state module's note that playback state is owned by a separate playback epic. When that epic lands, the
  GUI/runtime dispatches each resolved `request` as a real audio command — no change to this slice is
  required.
- No GUI surface was added (the epic is pure-core automation policy + DM config commands), consistent with
  the deferred audio playback surface. The DM read model (`listAudioAutomationRulesForActor`) is ready for a
  future automation-authoring panel.

## Changed files (full repo-relative paths)

New:
- `apps/v2/packages/core/src/state/audio-automation.ts`
- `apps/v2/packages/core/src/commands/audio-automation.ts`
- `apps/v2/packages/core/tests/audio-automation.test.ts`
- `docs/planning/v2/epics/AUDIO-automation.completion.md`

Modified:
- `apps/v2/packages/core/src/state/audio-state.ts`
- `apps/v2/packages/core/src/queries/audio-library-query.ts`
- `apps/v2/packages/core/src/schemas/commands.ts`
- `apps/v2/packages/core/src/commands/dispatch.ts`
- `apps/v2/packages/core/src/commands/types.ts`
- `apps/v2/packages/core/src/index.ts`
- `apps/v2/packages/core/src/testing/fixtures.ts`
- `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts`
- `docs/planning/v2/epics/AUDIO-automation.yaml` (generated)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (mutable state)

## Git evidence

Commit SHA: `__FEAT_SHA__` (recorded in the follow-up `docs(v2): record commit SHA …` commit).

Final `git status --short` (after the completion commits; clean slate):

```
__FINAL_GIT_STATUS__
```
