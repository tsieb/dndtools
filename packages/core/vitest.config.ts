import { defineConfig } from 'vitest/config';
import { testWorkers } from '../../vitest.workers';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		globals: false,
		maxWorkers: testWorkers(),
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
