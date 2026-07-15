import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Cloud / online-play test suite. Covers the code added for internet remote play and
// Cognito accounts, which live OUTSIDE the packages that already run Vitest:
//   - packages/cloud-fns/**  (server-side signaling Lambda + TURN cred minting)
//   - apps/gm-react/src/{net,cloud}/**  (client transport + auth token custody)
// Neither package has its own Vitest wiring yet, so this config runs them from the
// repo root (where vitest is installed) with `@dndtools/core` aliased to its source so
// the signaling Lambda exercises the REAL core security policy it reuses in production.
//
// Run with:  pnpm test:cloud   (or: pnpm exec vitest run --config vitest.cloud.config.ts)
export default defineConfig({
	resolve: {
		alias: {
			// More specific subpath first so it wins over the bare-package alias.
			'@dndtools/core/testing': fileURLToPath(
				new URL('./packages/core/src/testing/index.ts', import.meta.url),
			),
			'@dndtools/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
		},
	},
	test: {
		name: 'cloud',
		include: [
			'packages/cloud-fns/**/*.test.ts',
			'apps/gm-react/src/net/**/*.test.ts',
			'apps/gm-react/src/cloud/**/*.test.{ts,tsx}',
		],
		environment: 'node',
		globals: false,
	},
});
