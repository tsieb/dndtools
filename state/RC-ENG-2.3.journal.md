# RC-ENG-2.3 implement journal

- Scope: automatic full browser CI on loop/rc pushes, expanded story coverage, regression tests.
- Headroom dispatch tools discovered; subsequent substantial reads and checks use them.
- Initial evidence: ci.yml only triggered on main pushes; claim specs were a union of named specs.
- Implementation: full browser job independent of build, unconditional on loop/rc, unique concurrency
  group per integration run; claim selection includes ownership peers, shared routes and map surfaces.
- Wrapper now fails missing claimed specs; nonexistent future peer specs are excluded from expansion.
- Validation: Python loop tests 16/16; Vitest integration/CI guardrails 15/15; targeted ESLint,
  Prettier and bash syntax checks passed. Full suite fixture was green before injection; after
  injection the named fixture stayed green and the other fixture failed on both profiles.
- Exact dispatch test output retrieved: 69c958b36afa429a8f939bca99bad3ef (Vitest).
- Fixture uses Playwright assertions without launching browsers; no claim of full application E2E
  or hosted CI execution. Hosted workflow activates on landing. Central operator runs final gates.
- No push, promotion, loop launch or dispatcher state edits. Intended changes ready for commit.
