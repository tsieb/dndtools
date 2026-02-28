import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e-desktop',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: 'html',
	timeout: 60_000,
});
