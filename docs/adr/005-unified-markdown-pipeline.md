# ADR-005: Unified Markdown Pipeline

- Status: Accepted (amended 2026-09-06)
- Date: 2026-03-01
- Deciders: Engineering
- Consulted: Security, UX
- Supersedes: N/A
- Amended: 2026-09-06 (RC-KNW-1.1) — the pipeline was re-implemented for the React app after the
  Svelte GM app was archived (ADR-018). The decision is unchanged; only the module paths and the
  parser strategy moved. See "Amendment" below.

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

## Amendment — 2026-09-06 (RC-KNW-1.1)

The original `src/lib/markdown/*` modules belonged to the Svelte GM app, which is now archived
(ADR-018). Two divergent hand-written renderers had grown in its place, one inside Knowledge and one
inside the public wiki reader; neither could render a table, a callout or an image, and they had
already drifted apart. RC-KNW-1.1 restores the single pipeline in the React app.

Two things changed from the original decision, both narrowing:

- **No remark/rehype, no HTML intermediate.** The pipeline is a hand-written tokenizer that emits a
  token tree consumed directly as React nodes. There is no HTML string anywhere in it, so there is
  nothing a sanitizer could fail to strip and no `dangerouslySetInnerHTML` to misuse. Sanitization is
  therefore structural rather than a configurable schema: author text can only become a React text
  child (which React escapes) and URLs pass a scheme allow-list (`http`, `https`, `mailto`, plus the
  app's own `asset:` references).
- **`[!Secret]` callouts are a CORE concern, not a rendering one.** The core removes them from every
  non-DM projection (`stripSecretCallouts`), so a player never receives the bytes. The renderer's
  blur is a second layer for the DM's own (often screen-shared) display, not the security boundary.

## Amendment — 2026-09-07 (RC-SES-2.2, inline rolls)

The pipeline now recognizes one construct that is not prose: `[[roll:1d20+5|Stealth check]]`. It
shares the `[[...]]` bracket syntax with a wikilink, so the CORE decides which of the two a run is
(`parseInlineRoll` in `state/markdown.ts`) rather than each renderer guessing — otherwise a player
would see a broken note link where the DM sees a die. Rolls are also excluded from
`extractWikilinks`, so an inline roll never becomes a backlink to a note named `roll:…`.

The renderer does not own the randomness either. `RollButton` draws a 32-bit seed, evaluates the
expression with the core's own `rollExpression`, and hands the SAME seed to the host's logger, which
dispatches `dice.roll` with `inline: true`. The Processing Core re-evaluates from that seed and, by
the determinism contract, lands on the same total — so the chip the presser sees and the session log
everyone else sees can never disagree. With no live session the core refuses the command and the
chip says the result was not recorded, rather than the control going dead or claiming a log entry
that does not exist.

## Verification and Evidence

- `apps/gm-react/src/app/markdown/plugins.ts` — the tokenizer and the URL allow-list
- `apps/gm-react/src/app/markdown/render.tsx` — the single React render surface
- `apps/gm-react/src/app/markdown/plugins.test.ts` — allow-list XSS corpus, block/inline grammar
- `apps/gm-react/src/app/markdown/render.test.tsx` — DOM XSS corpus, structure snapshot, `[!Secret]`
- `packages/core/src/state/markdown.ts` — the shared callout grammar + `stripSecretCallouts`
- `packages/core/tests/markdown-callouts.test.ts` — "a player projection never contains a secret"
- `packages/core/src/state/markdown.ts` — `parseInlineRoll` / `extractInlineRolls` (RC-SES-2.2)
- `packages/core/tests/markdown-inline-roll.test.ts` — the inline-roll grammar, rolls ≠ wikilinks
- `apps/gm-react/src/app/markdown/RollButton.tsx` — the control, the seed hand-off, the honest chip
- `apps/gm-react/tests/e2e/inline-roll.spec.ts` — a pressed roll lands in the durable history
- `docs/security/README.md`
