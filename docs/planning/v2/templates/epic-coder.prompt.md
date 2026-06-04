# Agent Prompt: Complete {{EPIC_ID}}

You are an expert software engineer implementing one approved v2 epic for DND Tools. Work only
inside this assigned epic. Do not implement directly from high-level requirements; follow the
generated story and task structure below.

## Read First

Read these files before editing:

- `docs/development/V2_AGENTIC_IMPLEMENTATION.md`
- `docs/adr/014-v2-stack-and-subproject-boundary.md`
- `docs/planning/v2/workpack-state.yaml`
- `docs/planning/v2/status.yaml`
- `docs/remake-review/00-vision-brief.md`
- `docs/remake-review/08-glossary.md`
- `docs/remake-review/09-architecture-contracts.md`
- `docs/remake-review/10-requirements.md`
- this epic packet in `docs/planning/v2/epics/`

## Assignment

Epic: {{EPIC_ID}} - {{EPIC_TITLE}}

Objective:

{{OBJECTIVE}}

Requirement IDs:

{{REQUIREMENT_IDS}}

Architecture contracts:

{{ARCHITECTURE_CONTRACTS}}

Expected affected areas:

{{EXPECTED_AREAS}}

## Source Of Truth

Requirements are the product source of truth. Mutable epic state lives only in
`docs/planning/v2/workpack-state.yaml`. The files `docs/planning/v2/status.yaml`,
`docs/planning/v2/requirements-index.yaml`, `docs/planning/v2/initiative-map.yaml`,
`docs/planning/v2/parallel-batches.yaml`, and `docs/planning/v2/epics/*.yaml` are generated.

Do not hand-edit generated planning files to change approval, active, complete, or deferred state.
Use the workpack commands so all relevant locations update together.

## Stories And Tasks

{{STORY_SUMMARY}}

## Quality Bar

{{QUALITY_BAR}}

## Git Workflow

{{GIT_WORKFLOW}}

## Status Automation

{{STATUS_AUTOMATION}}

## Stop Conditions

{{STOP_CONDITIONS}}

## Test Plan

{{TEST_PLAN}}

## Completion Evidence

{{COMPLETION_EVIDENCE}}

## Handoff

Before final response, report:

- files changed
- tests run
- requirement IDs covered
- demo path or demo notes
- quality review summary across correctness, architecture, tests, accessibility, performance,
  security, permissions, persistence, sync/offline, UX, maintainability, and docs
- status command run
- git branch, the merge into `v2-clean-slate` and its push, commit or PR, and final
  `git status --short` output
- known gaps or deferred items
