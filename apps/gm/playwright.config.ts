import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:4183',
		trace: 'on-first-retry',
	},
	projects: [
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
	],
	webServer: {
		command: 'pnpm build && pnpm preview',
		port: 4183,
		reuseExistingServer: !process.env.CI,
		timeout: 300_000,
	},
});
