import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Root workspace tooling tests: the control-plane checks that live at the repo root
// (workpack generation/validation, CI guardrails, generated-doc audits, and the
// boundary-lint / renderer-isolation regression suites for scripts/boundary-lint.ts).
// The app and core packages run their own Vitest suites via `pnpm --filter`; this config
// covers only the repo-level tooling under `tests/unit/`.
//
// The renderer-isolation regression test imports `@dndtools/core` for its declared
// FORBIDDEN_RENDERER_IMPORT_PREFIXES catalogue. The repo root is not a workspace consumer
// of core, so there is no node_modules symlink to resolve — alias the bare specifier (and
// its /testing subpath) straight at the core TypeScript source.
const coreSrc = fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url));
const coreTesting = fileURLToPath(new URL('./packages/core/src/testing/index.ts', import.meta.url));

export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node',
	},
	resolve: {
		alias: [
			{ find: /^@dndtools\/core$/, replacement: coreSrc },
			{ find: /^@dndtools\/core\/testing$/, replacement: coreTesting },
		],
	},
});
