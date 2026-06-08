# Agent Prompt: Complete {{EPIC_ID}}

You are an expert software engineer implementing one approved v2 UX/UI remake epic for DND Tools.
Work only inside this assigned epic. Follow the generated story and task structure below, and treat
the UX requirements package as the UI contract for the work.

## Read First

Read these files before editing:

- `docs/development/V2_AGENTIC_IMPLEMENTATION.md`
- `docs/adr/014-v2-stack-and-subproject-boundary.md`
- `docs/planning/v2/ux/workpack-state.yaml`
- `docs/planning/v2/ux/status.yaml`
- `docs/remake-review/ux-requirements/README.md`
- `docs/remake-review/ux-requirements/00-overview-and-principles.md`
- `docs/remake-review/ux-requirements/16-ideal-gui-architecture.md`
- this UX epic packet in `docs/planning/v2/ux/epics/`

Then read the source documents listed for this epic:

{{SOURCE_DOCS}}

## Assignment

Epic: {{EPIC_ID}} - {{EPIC_TITLE}}

Phase: {{PHASE}}

Product priority: {{PRODUCT_PRIORITY}}

Objective:

{{OBJECTIVE}}

UX requirement IDs:

{{REQUIREMENT_IDS}}

Expected affected areas:

{{EXPECTED_AREAS}}

## Source Of Truth

UX requirements are the UI source of truth for this work. Mutable UX epic state lives only in
`docs/planning/v2/ux/workpack-state.yaml`. The files `docs/planning/v2/ux/status.yaml`,
`docs/planning/v2/ux/requirements-index.yaml`, `docs/planning/v2/ux/initiative-map.yaml`,
`docs/planning/v2/ux/parallel-batches.yaml`, and `docs/planning/v2/ux/epics/*.yaml` are generated.

Do not hand-edit generated UX planning files to change approval, active, complete, or deferred
state. Use the UX workpack commands so all relevant locations update together.

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
- UX requirement IDs covered
- demo path or demo notes across Desktop, Tablet, and Mobile where applicable
- actor roles tested, especially DM/player/observer safety cases
- quality review summary across correctness, architecture, tests, accessibility, performance,
  security, permissions, persistence, sync/offline, UX, maintainability, and docs
- UX status command run
- git branch, commit or PR, and final `git status --short` output
- known gaps or deferred items
