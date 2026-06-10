import { defineConfig } from 'vitest/config';

// Root workspace tooling tests: the control-plane checks that live at the repo root
// (workpack generation/validation, CI guardrails, generated-doc audits). The app and core
// packages run their own Vitest suites via `pnpm --filter`; this config covers only the
// repo-level tooling under `tests/unit/`.
export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node',
	},
});
