# Agent Prompt: Validate V2 Prototype

Validate a thin v2 prototype against its approved epic packet.

Check:

- the demo path is present
- visible behavior matches the mapped acceptance criteria
- v1 app behavior is not regressed
- no runtime code is imported from v1 into v2 unless an approved ADR allows it
- required tests and workpack validation were run
- accessibility, keyboard, responsive, security, permission, persistence, offline/sync, and
  performance risks were considered for the touched surface
- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`, and the completed epic
  packet agree
- completion evidence includes final `git status --short` output and no generated planning drift

Return pass/fail with concrete evidence and blocking issues.
