# ADR-005: Unified Markdown Pipeline

- Status: Accepted
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Security, UX
- Supersedes: N/A

## Context

Markdown is core user content and appears across multiple surfaces (viewer, editor preview, board tiles). Divergent render pipelines create inconsistent behavior and increase XSS risk if sanitization differs by surface.

## Decision

Use one unified markdown rendering pipeline:

- Parsing and transformation are centralized in a shared pipeline module.
- The pipeline supports frontmatter, GFM, wikilinks, callouts, object embeds, heading slugs, and sanitization.
- Renderer surfaces consume this shared pipeline rather than implementing custom render stacks.
- Sanitization remains enabled by default and is treated as a security control, not optional formatting.

## Consequences

### Positive

- Consistent rendering semantics across product surfaces.
- Centralized security posture for markdown sanitization.
- Easier extensibility via shared plugin integration points.

### Negative

- Pipeline changes have broad blast radius and require coordinated regression testing.
- Plugin ordering and schema tuning require careful maintenance.
- Feature-specific formatting exceptions are harder to localize.

## Rejected Alternatives

| Alternative                                           | Why Rejected                                                |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Multiple independent markdown renderers per component | Inconsistent behavior and duplicated security logic.        |
| Allowing raw HTML rendering                           | Increases XSS exposure in a user-content-heavy application. |
| Runtime-specific pipeline forks                       | Weakens maintainability and predictable UX.                 |

## Migration Impact

- New markdown capabilities should be introduced through shared plugins and covered by pipeline tests.
- Any sanitization schema changes must be security-reviewed and documented.
- Consumers should continue importing from shared markdown modules, not local ad hoc parsers.

## Rollback Plan

- Trigger: markdown regression or security issue introduced by pipeline/plugin changes.
- Rollback action: revert pipeline changes and disable the specific plugin path while preserving sanitization.
- Data safety: content data remains unchanged; rollback affects rendering behavior only.
- Risk: temporary feature degradation in embeds/callouts while restoring safe rendering baseline.

## Verification and Evidence

- `src/lib/markdown/pipeline.ts`
- `src/lib/markdown/index.ts`
- `src/lib/markdown/plugins/remark-wikilinks.ts`
- `src/lib/markdown/plugins/rehype-callouts.ts`
- `src/lib/markdown/plugins/rehype-object-embeds.ts`
- `src/lib/markdown/pipeline.test.ts`
- `docs/architecture/SECURITY.md`
