import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { testWorkers } from './vitest.workers';

// App-layer unit suite for apps/gm-react OUTSIDE the net/cloud transport slice (which
// vitest.cloud.config.ts owns): the platform storage adapters (asset-byte store, backup
// envelope) and pure app-side helpers (import mappers, compendium clients). Runs from the
// repo root with `@dndtools/core` aliased to source, and fake-indexeddb standing in for
// the browser's IndexedDB so the Dexie adapters exercise their real code paths in Node.
//
// Run with:  pnpm test:app   (or: pnpm exec vitest run --config vitest.app.config.ts)
export default defineConfig({
	resolve: {
		alias: {
			'@dndtools/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
		},
	},
	test: {
		name: 'app',
		// `.tsx` too, so the design-system components can be asserted against a real DOM (each such
		// file opts into jsdom with its own `@vitest-environment` pragma).
		include: ['apps/gm-react/src/**/*.test.{ts,tsx}'],
		exclude: ['**/node_modules/**', 'apps/gm-react/src/net/**', 'apps/gm-react/src/cloud/**'],
		environment: 'node',
		globals: false,
		setupFiles: ['fake-indexeddb/auto'],
		maxWorkers: testWorkers(),
	},
});
