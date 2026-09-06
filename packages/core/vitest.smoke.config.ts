import { defineConfig } from 'vitest/config';

// RC-ENG-2.1 — the SMOKE tier of `test:smoke` (GIT_WORKFLOW.md §3.2): a small, curated slice of the
// core suite run on every epic-branch push, before a full `pnpm check`/CI pass. It is not "the fastest
// tests" — it is deliberately chosen to catch a regression in the load-bearing seams an epic branch is
// most likely to break: durable-mutation schemas + migration (guardrail #3), actor-scoped permission
// grants (guardrail #2), the cloud/renderer/privacy security boundaries (guardrail #8's fail-closed
// contracts), and the command dispatch path itself (guardrail #1). Kept well under the 60s target
// (~3s locally) so there is no excuse to skip it before a push.
export default defineConfig({
	test: {
		include: [
			'tests/schemas.test.ts',
			'tests/migration.test.ts',
			'tests/permission-diagnostics.test.ts',
			'tests/character-ownership-and-permission-grants.test.ts',
			'tests/security-cloud-boundary.test.ts',
			'tests/security-renderer-isolation.test.ts',
			'tests/security-vault-privacy-modes.test.ts',
			'tests/command-actions.test.ts',
			'tests/command-availability.test.ts',
		],
		environment: 'node',
		globals: false,
	},
});
