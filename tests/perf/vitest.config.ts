import { defineConfig } from 'vitest/config';
import toolingConfig from '../../vitest.config';

export default defineConfig({
	...toolingConfig,
	test: {
		...toolingConfig.test,
		include: ['tests/perf/**/*.test.ts', 'tests/unit/perf-baseline.test.ts'],
	},
});
