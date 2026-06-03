# Agent Prompt: Validate V2 Prototype

Validate a thin v2 prototype against its approved epic packet.

Check:

- the demo path is present
- visible behavior matches the mapped acceptance criteria
- v1 app behavior is not regressed
- no runtime code is imported from v1 into v2 unless an approved ADR allows it
- required tests and workpack validation were run

Return pass/fail with concrete evidence and blocking issues.
