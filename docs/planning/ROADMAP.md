# Roadmap

This roadmap starts from the current baseline: a browser-first React GM app (`apps/gm-react`) on a
framework-free processing core (`packages/core`), with an opt-in AWS cloud backend and LAN/serverless
remote play. The detailed backlog is the initiative set — see
[`initiatives/README.md`](initiatives/README.md) and [`../planning/README.md`](README.md).

## Current Baseline (Implemented)

- React 18 GM app with command dispatch through `SceneRuntime`, persisted to Dexie/IndexedDB
  (`apps/gm-react/src/platform/storage/coreStore.ts`).
- Framework-free processing core: commands, deterministic reducers, permissions/visibility,
  actor-scoped queries, and the quality-gate / performance / security / source-of-truth registries.
- Electron desktop shell (`apps/gm-react/electron/`).
- Capacitor 8 Android alpha shell (`apps/gm-react/android/`) sharing the React renderer, Dexie vault,
  and processing core, with centralized platform capabilities and touch-first Quick Map mode.
- LAN / serverless WebRTC remote play (`apps/gm-react/src/net/`) — player-safe view-model replication.
- Opt-in AWS cloud backend (`apps/gm-react/src/cloud/`, `packages/cloud-fns`, `infra/`): Cognito auth,
  WebRTC signaling + TURN, and end-to-end-encrypted sync (off by default, fail-closed behind the
  `SYNC-017` gate).
- Quality automation: `pnpm gates`, boundary lint, a11y gates, and the `pnpm validate` harness.

## Near-Term Themes (P0/P1)

1. **Feature completion.** Close the honest-stub gaps tracked in
   [`../requirements/FEATURE-GAPS.md`](../requirements/FEATURE-GAPS.md); the `pnpm feature-audit`
   drift report keeps this list honest.
2. **Cloud hardening rollout.** Redeploy the hardened SAM stacks and finish the items in
   [`../security/README.md`](../security/README.md) and the
   [cloud security audit](../security/cloud-security-audit-2026-07.md).
3. **UX refactor cluster.** The design-system and IA/navigation initiatives (I13–I20) that shape the
   React shell — see the initiative index.

## Mid-Term (P1/P2)

- Player-facing surfaces and the second-persona player view.
- Maps/board tool UX depth (I9, I19, I20).
- Audio & atmosphere (I11), extensibility/ecosystem (I8), community/content (I12).

## Guardrails (always on)

- Every change flows through commands into the core; nothing else writes authoritative state.
- Docs track code in the same change set (see [`../README.md`](../README.md) quality rules).
- `pnpm check` green before handoff; `pnpm validate` for the deep renderer/core sweep; Android
  changes also pass the Gradle and API 36 gates in the
  [Android alpha runbook](../runbooks/android-alpha.md).

> The initiative files (I1–I20) are the planning backlog and mix shipped and aspirational work; they
> are not a claim that every listed item is implemented. Treat [`../requirements/FEATURE-GAPS.md`](../requirements/FEATURE-GAPS.md)
> and the feature-audit as the source of truth for what is actually built.
