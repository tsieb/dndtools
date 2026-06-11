# Completion — UX-ARCH-product-architecture-and-ia-reconciliation

UX workpack status: `complete`

Epic: Product Architecture and IA Reconciliation (phase "00 Architecture Decisions", P0).
Requirement coverage: `UX-NAV-002` (story `UX-NAV-002-S01`) + source-doc story `UX-ARCH-S01`.

## Summary

This is a phase-00 architecture-decision epic. It resolves the cross-document IA, route, and renderer
questions that gate broad UI work, and records them as durable contracts the later UX remake epics
consume. No new GUI surface ships here; the runtime shell is delivered by phase-02
`UX-SHELL-route-layout-and-platform-profiles`, which consumes the contracts produced here.

Key decision: the global navigation model is reconciled from nine (UX-NAV-002) / ten (the functional
v2 registry) sections down to **seven** global destinations — Command Center, Session, Characters,
Atlas, Campaign, Knowledge, Settings — with **Audio, MCP, and Scenes reclassified as non-global
capabilities/authoring surfaces**. This matches the ideal GUI architecture recommendation
(`docs/remake-review/ux-requirements/16-ideal-gui-architecture.md` section 4.1) and the functional
architecture contract's 5-7 global-destination cap (`docs/remake-review/03-architecture.md`).

## Demo path / surfaces

This epic is contract-and-decision work; its "surfaces" are the IA contracts, not new screens. The
seven-section model is encoded once and applies identically across **Desktop / Tablet / Mobile**
(the order is profile-invariant per UX-NAV-002; only the presentation surface changes —
sidebar ↔ rail ↔ bottom tab bar + "More" sheet). Runtime rendering, the `Alt+2` keyboard handler,
and the route-change live region are implemented by the phase-02 shell epic that consumes
`docs/planning/v2/ux/navigation-registry.yaml`. Demonstrable artifacts:

- Run `pnpm lint:nav-registry` — proves the seven-section registry is well-formed and agrees with the
  functional v2 canonical registry (`apps/v2/packages/core/src/queries/navigation-sections.ts`).
- Inspect `docs/planning/v2/ux/navigation-registry.yaml` — the canonical order, route roots, per-actor
  availability, keyboard shortcuts, icons, announcement strings, and capability homes.
- Read `docs/planning/v2/ux/architecture-decisions.md` — the six accepted/deferred decisions, the
  route map, and the page/panel/modal/popover/toast overlay contract.

## Requirement coverage / traceability

| Requirement / AC | How satisfied |
|---|---|
| `UX-NAV-002` (registry + canonical order) | Seven-section registry in `docs/planning/v2/ux/navigation-registry.yaml`; UX-NAV-002 updated in `docs/remake-review/ux-requirements/02-navigation-and-platform-profiles.md`. |
| `UX-NAV-002-S01` AC1 (canonical order, no gaps, all profiles) | Fixed order encoded in the registry; lint asserts contiguous order 1..7, Command Center first, Settings last. |
| `UX-NAV-002-S01` AC2 (no DM-only global section leaks) | All seven global sections are player-reachable (`player:true`); DM-only items (Scenes/Audio/MCP) are non-global capabilities, absent from player/observer nav. Recorded in the registry + decision record section 2. |
| `UX-NAV-002-S01` AC3 (`Alt+2` → Session, announce "Session") | Registry `session` entry: order 2, `keyboardShortcut: Alt+2`, `announce: Session`; lint enforces it. Runtime wiring deferred to phase-02 shell (documented). |
| `UX-ARCH-S01` AC1 (accepted nav model; docs/contracts/lint agree) | Decision record + registry + nav-registry lint; doc 02, doc 16, README updated to seven. |
| `UX-ARCH-S01` AC2 (each open decision accepted/deferred w/ owner, risk, constraint) | `docs/planning/v2/ux/architecture-decisions.md` sections 3-7 (Scene name, renderer, player-view preview, layout-preset storage, interim sync/collab). |
| `UX-ARCH-S01` AC3 (route map + page/overlay contract documented) | Decision record section 9 (+ doc 16 sections 4.2 and 5). |

## Decisions recorded (architecture-decisions.md)

1. Global nav model — **ACCEPTED** seven sections; Audio/MCP/Scenes are non-global capabilities.
2. Scene name — **ACCEPTED** "Scene".
3. Canvas renderer — **DEFERRED**, interim DOM/CSS baseline per ADR-014; renderer-abstraction boundary.
4. Player-view preview — **DEFERRED**, interim actor-filtered re-render constraint (no DM-DOM cloning).
5. Layout-preset storage — **ACCEPTED** proportional (normalized) coordinates.
6. Interim sync/collaboration states — **DEFERRED** per ADR-014; explicit "not enabled in this build".

## Actor-safety / no-leak evidence

- All seven global sections carry `player:true`, so there is no DM-only **global** section to leak.
- The DM-only capabilities (Scenes, Audio, MCP) are `player:false`/`observer:false` and classified as
  non-global; they must be absent from player/observer navigation (UX-NAV-002 AC2 / UX-NAV-013).
- The nav-registry lint cross-checks per-actor availability against the functional registry, so the
  UX contract cannot silently disagree with the enforced data-layer availability.
- The player-view preview interim constraint mandates actor-filtered re-render (never cloning/masking
  DM DOM), preserving the no-leak boundary (decision record section 5).

## Tests / gates run

- `pnpm lint:nav-registry` — PASS (registry well-formed and agrees with the functional registry; also
  verified non-vacuous via a negative drift probe).
- `pnpm v2:ux-workpack:validate` — PASS (after `pnpm v2:ux-workpack:generate` refreshed line-number
  drift from the doc edits).
- `pnpm docs:validate` — PASS.
- `pnpm --filter @dndtools/v2-core exec vitest run tests/navigation-sections.test.ts tests/navigation-ia-validation.test.ts tests/route-aliases.test.ts` — PASS (50 tests; functional registry I reconcile against is unchanged and valid).
- `pnpm --filter @dndtools/v2-app exec vitest run tests/unit/route-audit.test.ts` — PASS (3 tests).
- `eslint` on the two new TS files — PASS (0 problems).
- `pnpm lint` (full) — NOT GREEN, but only due to **2 pre-existing, unrelated errors** present on the
  base branch before this epic (`apps/v2/packages/core/tests/content-wikilink-lifecycle.test.ts:70`
  unused `LOCAL`; `scripts/v2-ux-workpack.ts:137` unused `uxEpicsDir`). This epic introduces no new
  lint errors and does not modify those files. The new nav-registry lint is wired as a standalone
  `pnpm lint:nav-registry` script, not into the already-red aggregate `lint` chain.

## Files changed

Docs (reconciled to the seven-section model):
- `docs/remake-review/ux-requirements/02-navigation-and-platform-profiles.md` (UX-NAV-002 + scope, §2, UX-NAV-005/006 More-sheet lists, UX-NAV-019 shortcut table, Desktop ASCII diagram, AP-6/AP-7, OQ-1/OQ-4).
- `docs/remake-review/ux-requirements/16-ideal-gui-architecture.md` (decision-accepted banners in §4.1 and §10.1).
- `docs/remake-review/ux-requirements/README.md` (consolidated decisions + status updated).

Docs (new decision records / contracts):
- `docs/planning/v2/ux/architecture-decisions.md` (decision record).
- `docs/planning/v2/ux/navigation-registry.yaml` (machine-readable nav/route registry contract).

Code (navigation lint fixture, scripts/ ownership):
- `scripts/lib/ux-navigation-registry.ts` (loader + cross-check validator).
- `scripts/ux-navigation-registry-lint.ts` (CLI gate).
- `package.json` (added `lint:nav-registry` script; not wired into the aggregate `lint`).

Generated (regenerated by the UX workpack commands — do not hand-edit):
- `docs/planning/v2/ux/workpack-state.yaml`, `docs/planning/v2/ux/status.yaml`,
  `docs/planning/v2/ux/requirements-index.yaml`,
  `docs/planning/v2/ux/epics/UX-ARCH-product-architecture-and-ia-reconciliation.yaml`.

## Known gaps / deferred

- Runtime shell rendering of the seven-section nav, the `Alt+2` keyboard handler, and the route live
  region are delivered by phase-02 `UX-SHELL-route-layout-and-platform-profiles`, which consumes this
  registry. Scoped out of this phase-00 decision epic by design.
- The functional registry still tags `scenes`/`audio`/`mcp` with `category: 'navigation'`. Treating
  them as non-global in the rendered primary nav is a phase-02 GUI presentation follow-up; it does not
  require deleting them from the functional core (and `apps/v2` is outside this epic's file ownership).
- Section-label card-sort/tree-test (README B.5) still recommended before broad implementation.
- AI/authorship provenance survival across CRDT merges (README C.9) still open; deferred to sync/MCP.

## Git evidence

- Branch: `ux/UX-ARCH-product-architecture-and-ia-reconciliation` (off chain base `ux/workpack-base`).
- Commit: recorded in the orchestrator handoff (committed after this evidence file and the regenerated
  UX state).

Final `git status --short` (pre-commit snapshot):

```
 M docs/planning/v2/ux/epics/UX-ARCH-product-architecture-and-ia-reconciliation.yaml
 M docs/planning/v2/ux/requirements-index.yaml
 M docs/planning/v2/ux/status.yaml
 M docs/planning/v2/ux/workpack-state.yaml
 M docs/remake-review/ux-requirements/02-navigation-and-platform-profiles.md
 M docs/remake-review/ux-requirements/16-ideal-gui-architecture.md
 M docs/remake-review/ux-requirements/README.md
 M package.json
?? docs/planning/v2/ux/architecture-decisions.md
?? docs/planning/v2/ux/epics/UX-ARCH-product-architecture-and-ia-reconciliation.completion.md
?? docs/planning/v2/ux/navigation-registry.yaml
?? scripts/lib/ux-navigation-registry.ts
?? scripts/ux-navigation-registry-lint.ts
```
