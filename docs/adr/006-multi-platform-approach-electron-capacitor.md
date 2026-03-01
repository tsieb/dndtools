# ADR-006: Multi-Platform Approach (Electron + Capacitor)

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Product, UX
- Supersedes: N/A

## Context

The current implementation is desktop-first and Electron-only. Product direction requires Android support while preserving local-first behavior, shared domain logic, and predictable UI behavior. We need a platform strategy that keeps code reuse high and operational complexity manageable.

Current implementation status:

- Desktop runtime is implemented with Electron shell + SvelteKit renderer + filesystem storage.
- Android runtime is not yet implemented.

## Decision

Adopt a shared renderer/domain strategy with runtime-specific shells:

- Keep Electron as the desktop shell.
- Use Capacitor as the Android shell for the existing SvelteKit-based renderer.
- Maintain platform-specific storage implementations behind the existing adapter boundary.
- Keep the local-first contract as default behavior across platforms.

## Consequences

### Positive

- High code reuse for UI, domain logic, and product workflows.
- Mature Android packaging and plugin ecosystem for web-based app shells.
- Lower rewrite risk versus building a separate native Android application.

### Negative

- Additional runtime abstraction and testing matrix complexity.
- Platform-specific storage and permission edge cases on Android.
- Requires strict boundary discipline so platform conditionals do not leak into feature code.

## Rejected Alternatives

| Alternative                     | Why Rejected                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| Tauri mobile for Android target | Smaller ecosystem and added Rust toolchain/operational complexity for this team and codebase. |
| Cordova for Android target      | Older plugin/runtime ecosystem and weaker long-term fit for modern SvelteKit workflows.       |
| Separate native Android app     | Lowest code reuse and highest long-term maintenance cost.                                     |

## Migration Impact

- Android shell integration, build pipeline, and platform permissions must be introduced incrementally.
- Storage and platform service boundaries must remain adapter-driven so feature modules stay runtime-agnostic.
- UX and accessibility parity must be validated across desktop and Android interaction models.

## Rollback Plan

- Trigger: Android rollout risks desktop stability or introduces unacceptable operational cost.
- Rollback action: pause Android distribution and continue desktop-only releases while preserving shared code improvements that do not increase desktop risk.
- Data safety: local vault format remains unchanged; platform rollout can be paused without data migration rollback.
- Risk: delayed multi-platform roadmap milestones.

## Verification and Evidence

- `docs/MASTER_PLAN.md`
- `docs/TECH_STACK.md`
- `docs/ROADMAP.md`
- `src/lib/platform/storage/index.ts`
- `src/lib/platform/storage/electron-adapter.ts`
- `src/lib/types/storage.ts`
