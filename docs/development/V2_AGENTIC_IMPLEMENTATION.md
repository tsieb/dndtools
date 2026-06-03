# V2 Agentic Implementation System

This document defines how autonomous agents turn the v2 requirements package into implementation
work without skipping abstraction layers or guessing what comes next.

## Source of Truth

Product intent is authoritative in:

- `docs/remake-review/00-vision-brief.md`
- `docs/remake-review/08-glossary.md`
- `docs/remake-review/09-architecture-contracts.md`
- `docs/remake-review/10-requirements.md`
- `docs/remake-review/requirements/`

Operational work is generated into `docs/planning/v2/`. Agents consume generated epic packets and
prompts from that directory. They do not implement directly from high-level requirements.

## Required Flow

1. Run `pnpm v2:workpack:generate` after requirements change.
2. Run `pnpm v2:workpack:validate`.
3. Review an epic packet under `docs/planning/v2/epics/`.
4. Mark exactly the selected epic `status: approved` and `approved: true`.
5. Generate the agent prompt with `pnpm v2:prompt -- --epic <epic-id>`.
6. Assign that prompt to one epic-level coding agent.
7. Require evidence before marking the epic complete.

The agent may own an epic end to end, but must execute through the generated story and task
structure inside the epic packet. The agent must not jump from requirement text directly to code.

## Approval Gates

Epic approval is the human control point. An epic is not executable until its packet states:

```yaml
status: approved
approved: true
```

Prompt generation fails closed for unapproved epics.

Implementation work for the clean v2 subproject is additionally blocked by ADR-014. No agent may
create or implement runtime code in `apps/v2` until the ADR is accepted.

## Agent Rules

Every generated prompt includes:

- required read-first files
- assigned requirement IDs
- story and task structure
- expected affected areas
- stop conditions
- test plan
- completion evidence checklist

Universal prompt behavior:

- Read all required sources before editing.
- Stay inside the assigned epic scope.
- Preserve v1 app behavior unless the epic explicitly says otherwise.
- Do not import runtime code from v1 into v2 during the early phase.
- Stop when a stack, storage, permission, visibility, sync, or security decision is missing.
- Stop when `pnpm v2:workpack:validate` fails.

## Programmatic Verification

`pnpm v2:workpack:validate` fails closed for:

- duplicate IDs
- missing parent links
- unknown requirement IDs
- unmapped requirements
- invalid priorities or compatibility rows
- requirements missing acceptance criteria
- stories mapped outside their parent epic
- duplicate story or task IDs
- unknown dependencies
- dependency cycles

`pnpm docs:validate` also runs the v2 workpack validator once generated files exist.

## Parallelism

Parallel implementation is allowed only when `docs/planning/v2/parallel-batches.yaml` declares a
ready batch. A batch is valid only if dependencies, interface contracts, and file ownership do not
conflict.

The initial generated batch is intentionally blocked until ADR-014 is accepted.

## Completion Evidence

An epic can be marked complete only when its evidence checklist is satisfied:

- targeted tests pass
- traceability from requirement IDs to implementation and tests is documented
- demo notes are recorded for visible behavior
- any deferred requirement or acceptance criterion is listed explicitly
- the workpack status is updated

For visible work, demo notes must describe the exact path a reviewer can use to see the behavior.
