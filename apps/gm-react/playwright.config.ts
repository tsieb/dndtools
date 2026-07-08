import { defineConfig, devices } from '@playwright/test';

// Playwright config for the React GM app (@dndtools/gm-react).
//
// The specs MUST run against the Vite DEV server (`pnpm dev`, port 5273), not `vite preview`:
// the DEV-only `window.__rt` SceneRuntime seam (RuntimeContext.tsx) — which the specs drive the
// app through — is exposed only under `import.meta.env.DEV` and is absent from a preview build.
export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:5273',
		trace: 'on-first-retry',
	},
	projects: [
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
	],
	webServer: {
		command: 'pnpm dev',
		port: 5273,
		reuseExistingServer: !process.env.CI,
		timeout: 300_000,
	},
});
