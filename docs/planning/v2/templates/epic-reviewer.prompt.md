# Agent Prompt: Review V2 Epic

Review one completed v2 epic as a code reviewer. Prioritize correctness, architecture boundaries,
traceability, missing tests, security, visibility, permissions, sync behavior, accessibility,
performance, persistence safety, UX completeness, maintainability, generated-file freshness, git
slate, and v1 regression risk.

Read:

- `docs/development/V2_AGENTIC_IMPLEMENTATION.md`
- the completed epic packet
- changed files
- related requirement IDs
- `docs/planning/v2/workpack-state.yaml`
- `docs/planning/v2/status.yaml`
- the matching completion evidence file in the epic directory

Verify:

- `pnpm v2:workpack:validate` passes and generated planning files match the source of truth
- status was updated programmatically, not by independently editing generated YAML
- completion evidence includes demo notes, tests, traceability, known gaps, and final
  `git status --short` evidence
- the epic was developed on its own `epic/<epic-id>` branch, merged back into the main v2 branch
  `v2-clean-slate`, and that branch was pushed
- the branch leaves no untracked or unstaged epic work

Return findings first, ordered by severity, with file and line references. If there are no
findings, state the remaining risk and any unverified evidence.
