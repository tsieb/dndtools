# Completion Evidence: MCP-semantic-bundles-and-ai-boundaries

- Epic: `MCP-semantic-bundles-and-ai-boundaries` — MCP: Semantic bundles and AI boundaries
- Requirements: MCP-006, MCP-007, MCP-008, MCP-013
- Git branch: `epic/MCP-semantic-bundles-and-ai-boundaries` (chained off the prior tip `885f1fd`)
- Workpack status: `complete`

## Summary

This branch adds two pure Processing-Core surfaces that COMPOSE the existing deterministic, actor-filtered
reads — no duplication, no v1 runtime import, no new mutation/visibility path:

1. **Semantic bundles** (`apps/v2/packages/core/src/mcp/semantic-bundles.ts`, MCP-006 / MCP-013) —
   bounded, source-cited, calendar-aware context packages for session prep, recap, continuity, open
   threads, coverage gaps, and campaign health. Each bundle is assembled from `getPrepRecapDigest`
   (SES-009), `getGraphHealthForDm` / `getPlayerScopedHealthSummary` (GRAPH-007), `getCalendarContextForActor`
   (SES-012), and `getDateGraphIndexForActor` (GRAPH-009). Because every input is an actor-filtered read,
   the data layer decides visibility before assembly (Cross-Contract Non-Negotiable 2). The full bundle is
   DM-scoped; a non-DM actor receives a generalized, finding-free, exact-date-free bundle. Semantic
   compression bounds each section to an explicit item budget and reports the omitted count as a coarse
   band (MCP-006 AC2).

2. **AI-boundary contract** (`apps/v2/packages/core/src/mcp/ai-boundary.ts`, MCP-007 / MCP-008) —
   formalizes the established `SemanticAssist` (SRCH-011) / `HealthAiExplainer` (GRAPH-007 AC2) pattern into
   one reusable contract: capability detection (`AiCapability`), the closed annotative-role allowlist
   (`AI_ANNOTATIVE_ROLES`) vs. forbidden load-bearing concerns (`AI_FORBIDDEN_ROLES`), and a labelled,
   non-authoritative, separated annotation envelope (`AiAnnotation`) produced by `applyAiAnnotation`. AI is
   optional, annotative, read-only, never authoritative, never a mutation path, and is dropped fail-closed
   when off/absent/unavailable. The bundle composes this contract for its optional `aiAnnotation` field; the
   deterministic content is always complete and correct with AI off (the default).

The bundles are also reachable through the MCP tool surface: six new `bundle.<kind>` read tools were added
to the baseline registry (`tool-registry.ts`) and routed in `tool-dispatch.ts`, so an MCP agent inherits the
same actor filtering (a player-scoped agent receives the generalized bundle). MCP agents request only the
deterministic bundle — AI is the GUI/sidecar's optional seam, never an agent-toggled argument.

## How the AI boundary is enforced

- `applyAiAnnotation` runs an optional annotator over already-actor-filtered deterministic facts and returns
  the deterministic-only result (no annotation) unless the capability is `available` AND the annotator
  declares a permitted annotative role.
- A forbidden/unknown role (e.g. `relationship-scoring`) is refused fail-closed even when a model is
  available — AI can never own a load-bearing concern.
- An `unavailable` model degrades (drops the annotation, labels the status `ai-unavailable`) — never fails.
- The annotation envelope is structurally `aiGenerated: true`, `authoritative: false`, and held in a
  separate `aiAnnotation` field — never merged into `content`. The annotator receives only text-producing
  facts, returns only text, dispatches no command, and mutates nothing.

## Requirement traceability

### MCP-006 — semantic bundle tools (bounded, source-cited context packages)

- AC1 (bounded source references; excludes hidden player-inaccessible content unless DM-scoped):
  `buildSemanticBundle` / `buildDmContent` in `semantic-bundles.ts`; DM bundle carries the digest + a
  `BundleCitation[]` (id/kind only); a non-DM gets the generalized `playerSummary` with no findings/citations.
  Tests: `apps/v2/packages/core/tests/mcp-semantic-bundles.test.ts` ("MCP-006 AC1 …"), `apps/v2/packages/core/tests/mcp-semantic-bundles-adversarial.test.ts`.
- AC2 (semantic compression chooses summaries over raw full-vault content): `boundToBudget` +
  `BundleCompression` in `semantic-bundles.ts`. Tests: `apps/v2/packages/core/tests/mcp-semantic-bundles.test.ts` ("MCP-006 AC2 …").

### MCP-007 — AI boundaries (annotative only; never owns graph/scoring/conflict/permission)

- AC1 (deterministic relationship scoring runs with AI disabled): `getGraphHealthForDm` is pure; proven in
  `apps/v2/packages/core/tests/mcp-ai-boundary.test.ts` ("MCP-007 AC1 …").
- AC2 (an AI suggestion needs human/Core validation before any state change): `AiAnnotation` is
  `authoritative: false` and `applyAiAnnotation` dispatches no command / mutates nothing.
  Tests: `apps/v2/packages/core/tests/mcp-ai-boundary.test.ts` ("MCP-007 AC2 …"), `apps/v2/packages/core/tests/mcp-semantic-bundles-adversarial.test.ts`.
- Allowlist / forbidden-role enforcement: `AI_ANNOTATIVE_ROLES`, `AI_FORBIDDEN_ROLES`, `isAiAnnotativeRole`,
  `isAiForbiddenRole` in `ai-boundary.ts`. Tests: `apps/v2/packages/core/tests/mcp-ai-boundary.test.ts`.

### MCP-008 — optional, capability-detected AI with deterministic non-AI fallbacks

- AC1 (no model runtime → deterministic content still works): `AiCapability` state `absent` →
  `applyAiAnnotation` yields no annotation, `deterministic` status; the bundle is complete.
  Tests: `apps/v2/packages/core/tests/mcp-ai-boundary.test.ts` ("MCP-008 AC1 …").
- AC2 (available model reports capability; failure state without blocking): `AiCapabilityState` +
  `isAiCapabilityRunnable`; `unavailable` degrades to `ai-unavailable` with a generic reason.
  Tests: `apps/v2/packages/core/tests/mcp-ai-boundary.test.ts` ("MCP-008 AC2 …").

### MCP-013 — calendar / custom-time context in bundles

- AC1 (DM recap bundle includes visible custom dates + source citations when calendar-linked events exist):
  `buildCalendarContext` + `getDateGraphIndexForActor` composition in `semantic-bundles.ts`.
  Tests: `apps/v2/packages/core/tests/mcp-semantic-bundles.test.ts` ("MCP-013 AC1 …").
- AC2 (player-scoped bundle omits hidden dated events + revealing aggregate counts): the non-DM branch
  returns no calendar/date-graph findings and only generalized bands.
  Tests: `apps/v2/packages/core/tests/mcp-semantic-bundles.test.ts` ("MCP-013 AC2 …"), `apps/v2/packages/core/tests/mcp-semantic-bundles-adversarial.test.ts`.

## AI-boundary / determinism / adversarial tests added

- `apps/v2/packages/core/tests/mcp-semantic-bundles.test.ts` — bundle assembly per kind, source citations (id/kind only), DM-only
  fail-closed (player/observer/unknown actor get no findings), semantic compression, calendar-awareness,
  reachability through the MCP tool surface, and full determinism (`toEqual` across repeated runs).
- `apps/v2/packages/core/tests/mcp-ai-boundary.test.ts` — allowlist exactness, forbidden-role disjointness + refusal,
  capability-state gating, deterministic findings with AI off, labelled/non-authoritative annotation,
  degrade-never-fail on unavailable, and proof a deterministic read is unchanged by AI.
- `apps/v2/packages/core/tests/mcp-semantic-bundles-adversarial.test.ts` — AI off → full deterministic bundle (content/citations/
  compression byte-identical with and without a hallucinating annotator); a fabricated "authoritative" line
  with forged numbers can never enter the deterministic content/citations and is held only in the labelled
  envelope; a player/observer bundle never leaks the DM-only note title or hidden dated event even under an
  adversarial annotator.

## Quality gates (all run; all green)

- `pnpm --filter @dndtools/v2-core test` → 157 files, **2289 passed** (was 2258; +31 new). 
- `pnpm v2:typecheck` → core `tsc --noEmit` clean; app `svelte-check` 856 files, 0 errors / 0 warnings.
- `pnpm v2:lint` (boundary) → passed.
- `pnpm lint` (full eslint + nav + tokens + repo audit) → passed.
- `pnpm docs:validate` → passed.
- `pnpm v2:workpack:validate` → passed.
- Playwright e2e: **skipped, justified.** This epic is pure-core — every changed source file is under
  `apps/v2/packages/core/` (the Processing Core) plus generated planning files. No route, layout, Svelte
  component, or other visible-flow file was touched, so the e2e suite is not affected.

## Demo / verification path (programmatic)

```ts
import {
  buildSemanticBundle, createBaselineMcpToolRegistry, invokeMcpTool,
} from '@dndtools/v2-core';

// DM bundle: bounded, source-cited, calendar-aware deterministic context (AI off — complete on its own).
const dm = buildSemanticBundle(inputs /* DM actor */, 'session-prep', { referenceInstant });
//  dm.content.digest, dm.content.calendar, dm.citations, dm.compression — all populated; dm.aiAnnotation === null.

// Player bundle: generalized, finding-free, exact-date-free (no DM-only leak).
const player = buildSemanticBundle(inputs /* player actor */, 'campaign-health', { referenceInstant });
//  player.content.* === null, player.citations === [], player.playerSummary populated with coarse bands.

// Through the MCP tool surface (agent inherits the same actor filtering):
const registry = createBaselineMcpToolRegistry();
invokeMcpTool(state, env, registry, { toolId: 'bundle.session-prep', actorId, agentId, input: { referenceInstant } });
```

## Changed files (full repo-relative paths)

Modified:
- `apps/v2/packages/core/src/index.ts`
- `apps/v2/packages/core/src/mcp/tool-dispatch.ts`
- `apps/v2/packages/core/src/mcp/tool-registry.ts`
- `apps/v2/packages/core/tests/mcp-baseline-tools.test.ts`
- `apps/v2/packages/core/tests/mcp-response-contract-coverage.test.ts`
- `apps/v2/packages/core/tests/mcp-tool-coverage.test.ts`
- `docs/planning/v2/epics/MCP-semantic-bundles-and-ai-boundaries.yaml` (generated; via set-status/complete)
- `docs/planning/v2/status.yaml` (generated)
- `docs/planning/v2/workpack-state.yaml` (source of truth; via set-status/complete)

Added:
- `apps/v2/packages/core/src/mcp/ai-boundary.ts`
- `apps/v2/packages/core/src/mcp/semantic-bundles.ts`
- `apps/v2/packages/core/tests/mcp-ai-boundary.test.ts`
- `apps/v2/packages/core/tests/mcp-semantic-bundles.test.ts`
- `apps/v2/packages/core/tests/mcp-semantic-bundles-adversarial.test.ts`
- `docs/planning/v2/epics/MCP-semantic-bundles-and-ai-boundaries.completion.md` (this file)

## Known gaps / deferred

- The optional AI model itself is deferred per ADR-014: this branch ships the provider-agnostic boundary +
  the deterministic bundles. No model is embedded; the future MCP sidecar plugs an optional annotator in.
- No GUI surface was added in this epic (pure core). A bundle/AI-annotation viewer is GUI work for a later
  epic; the boundary and read surfaces are in place for it to render (Processing/Display decoupling).

## Git evidence

- Branch: `epic/MCP-semantic-bundles-and-ai-boundaries`
- Base/prior tip: `885f1fd`
- Final commit SHA: recorded in the follow-up `docs(v2): record commit SHA` commit.

Final `git status --short` (clean slate after the completion commits):

```
```
