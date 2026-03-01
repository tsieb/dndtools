import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: [
			'src/**/*.test.ts',
			'tests/unit/**/*.test.ts',
			'mcp/**/*.test.ts',
			'electron/**/*.test.ts',
		],
		environment: 'jsdom',
		globals: true,
		testTimeout: 30_000,
		setupFiles: ['./tests/setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			include: ['src/lib/**'],
			exclude: ['src/lib/types/**', '**/*.test.ts'],
			thresholds: {
				statements: 80,
				branches: 75,
				functions: 80,
				lines: 80,
			},
		},
	},
});
