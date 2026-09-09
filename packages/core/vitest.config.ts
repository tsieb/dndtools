import { defineConfig } from 'vitest/config';
import { testWorkers } from '../../vitest.workers';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		globals: false,
		maxWorkers: testWorkers(),
		// RC-ENG-2.2. Vitest's default forks one worker PROCESS PER TEST FILE and tears it down
		// afterwards, so all 267 files re-import the whole core module graph from scratch: 124s of
		// import time against 32s of actual test time. The core is framework-free, node-environment,
		// pure TypeScript with no global mutable state and no DOM to reset, so a worker can safely
		// serve many files in sequence. Turning isolation off takes the suite from 62.6s to 16.1s
		// with identical results (4,693 tests), including under `--sequence.shuffle`, which is what
		// proves no file depends on another's fresh module registry. A test that needs a clean
		// module graph must ask for it locally (`vi.resetModules()` in its own `beforeEach`).
		isolate: false,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary', 'html'],
			reportsDirectory: '../../coverage/core',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/testing/**'],
			thresholds: {
				statements: 85,
				branches: 75,
				functions: 90,
				lines: 90,
				'src/security/**': {
					statements: 90,
					branches: 85,
					functions: 100,
					lines: 95,
				},
				// RC-ENG-4.2 — coverage floors for the domains the roadmap named explicitly: system packages
				// (the pluggable rules the whole app defers to), the custom-widget sandbox host (ADR-031's
				// "widget runtime"), and the combat-tracker/RC-MAP-1.1 "combat tokens" surface. `branches: 90`
				// is the acceptance bar; the other stats are set from the measured baseline so a regression
				// still fails loudly instead of silently riding the lower repo-wide floor above.
				'src/systems/**': {
					statements: 95,
					branches: 90,
					functions: 100,
					lines: 100,
				},
				'src/security/custom-widget-runtime.ts': {
					statements: 95,
					branches: 90,
					functions: 100,
					lines: 95,
				},
				'src/security/widget-host-api.ts': {
					statements: 95,
					branches: 90,
					functions: 100,
					lines: 95,
				},
				'src/state/combat-tracker.ts': {
					statements: 90,
					branches: 90,
					functions: 90,
					lines: 90,
				},
				'src/queries/combat-tracker-view.ts': {
					statements: 90,
					branches: 90,
					functions: 90,
					lines: 90,
				},
			},
		},
	},
});
