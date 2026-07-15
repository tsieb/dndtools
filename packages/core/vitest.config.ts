import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		globals: false,
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
			},
		},
	},
});
