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

Mutable planning state is authoritative only in:

- `docs/planning/v2/workpack-state.yaml`

Generated planning files are derived from requirements plus `workpack-state.yaml`:

- `docs/planning/v2/requirements-index.yaml`
- `docs/planning/v2/initiative-map.yaml`
- `docs/planning/v2/status.yaml`
- `docs/planning/v2/parallel-batches.yaml`
- `docs/planning/v2/epics/*.yaml`

Do not hand-edit generated files to change epic status, approval, completion evidence links, or
metrics. Use the workpack commands so all derived locations update together and validation can
detect drift.

## Required Flow

1. Run `pnpm v2:workpack:generate` after requirements or `workpack-state.yaml` change.
2. Run `pnpm v2:workpack:validate`.
3. Review metrics and the next ready epic with `pnpm v2:workpack:status` or
   `pnpm v2:workpack:next`.
4. Generate the next ready agent prompt with `pnpm v2:prompt -- --next`, or target a specific epic
   with `pnpm v2:prompt -- --epic <epic-id>`.
5. When implementation begins, run
   `pnpm v2:workpack:set-status -- --epic <epic-id> --status active`.
6. Assign that prompt to one epic-level coding agent.
7. Require completion evidence before marking the epic complete.
8. Mark completion with `pnpm v2:workpack:complete -- --epic <epic-id>` so
   `workpack-state.yaml`, `status.yaml`, metrics, and the epic packet are recomputed together.

The agent may own an epic end to end, but must execute through the generated story and task
structure inside the epic packet. The agent must not jump from requirement text directly to code.

## Approval Gates

Epic approval is the human control point. An epic is not executable until generated state resolves
to:

```yaml
status: approved
approved: true
```

Prompt generation fails closed for unapproved epics.

The default approval posture and individual overrides live in `workpack-state.yaml`. Use:

```bash
pnpm v2:workpack:set-status -- --epic <epic-id> --status approved
pnpm v2:workpack:set-status -- --epic <epic-id> --status deferred
```

Prompt generation also fails closed when generated files drift from requirements plus
`workpack-state.yaml`.

Implementation work for the clean v2 subproject is additionally blocked by ADR-014. No agent may
create or implement runtime code in `apps/v2` until the ADR is accepted.

## Agent Rules

Every generated prompt includes:

- required read-first files
- assigned requirement IDs
- story and task structure
- expected affected areas
- explicit source-of-truth and generated-file rules
- high-quality implementation bar
- git workflow and clean-slate expectations
- status automation commands
- stop conditions
- test plan
- completion evidence checklist

Universal prompt behavior:

- Read all required sources before editing.
- Run `git status --short` before editing and stop if unrelated changes overlap the epic.
- Stay inside the assigned epic scope.
- Preserve v1 app behavior unless the epic explicitly says otherwise.
- Do not import runtime code from v1 into v2 during the early phase.
- Do not hand-edit generated planning files for status changes.
- Stop when a stack, storage, permission, visibility, sync, or security decision is missing.
- Stop when `pnpm v2:workpack:validate` fails.
- Leave no untracked or unstaged files caused by the epic after completion.

## Quality Bar

Each epic must be completed to a high-quality standard across all relevant facets:

- Correctness against acceptance criteria and edge cases.
- Architecture integrity against ADR-014, package boundaries, and architecture contracts.
- Traceability from requirement IDs to implementation, tests, docs, and demo evidence.
- Automated coverage matched to risk, including unit, integration, e2e, boundary, accessibility,
  performance, security, permissions, sync/offline, and migration tests when applicable.
- UX completeness for visible flows, including loading, empty, error, keyboard, mobile, and
  responsive states.
- Data safety for persistence, actor filtering, privacy, offline behavior, sync assumptions, and
  conflict handling.
- Maintainability through small typed modules, readable code, restrained abstractions, and no
  unrelated refactors.
- Operational quality through diagnostics, metrics, generated-file freshness, docs, and clean
  handoff evidence.

## Git Slate

Each epic should use one branch and leave a clean slate when complete:

- Start with `git status --short`.
- Do not overwrite unrelated user changes.
- Commit all code, docs, tests, completion evidence, and generated workpack updates that belong to
  the epic.
- Do not use `--no-verify`.
- Final completion evidence must include the final `git status --short` output.
- The final handoff must report branch, commit or PR, tests, status command, and known gaps.

## Programmatic Verification

`pnpm v2:workpack:validate` fails closed for:

- generated files that differ from requirements plus `workpack-state.yaml`
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
- complete epics without completion evidence files
- completion evidence files for epics not marked complete
- completion evidence that omits final `git status --short` evidence

`pnpm docs:validate` also runs the v2 workpack validator once generated files exist.

## Metrics And Next Epic

`pnpm v2:workpack:status` recomputes status from source and prints summary metrics, including:

- epic completion percent
- requirement completion percent
- ready promptable epics
- dependency-blocked epics
- completion evidence count
- per-domain completion metrics
- the next ready epic and prompt/status commands

`pnpm v2:workpack:next` prints only the next ready epic block plus the same metrics. The selection
is deterministic: active epics first, then approved epics whose dependencies are complete, sorted by
epic ID. `pnpm v2:prompt -- --next` renders the coder prompt for that same epic.

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
- quality review covers correctness, architecture, tests, accessibility, performance, security,
  permissions, persistence, sync/offline assumptions, UX, maintainability, and docs
- final `git status --short` output is recorded
- the workpack status is updated with
  `pnpm v2:workpack:complete -- --epic <epic-id>`

For visible work, demo notes must describe the exact path a reviewer can use to see the behavior.
