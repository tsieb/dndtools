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
		// Force the e2e dev server to be local-first even if a developer has pulled real cloud
		// coordinates into .env.local (scripts/pull-cloud-env.mjs). Process env outranks .env files
		// in Vite, so blanking these guarantees isCloudConfigured === false for every e2e run —
		// no spec can ever reach Cognito/signaling/sync/app-api. tests/e2e/isolation-guard.spec.ts
		// asserts this invariant. NOTE: only effective when Playwright starts the server itself;
		// with reuseExistingServer a manually-started `pnpm dev` keeps its own env (the guard spec
		// still catches that case by failing loudly instead of silently going live).
		env: {
			VITE_CLOUD_REGION: '',
			VITE_COGNITO_USER_POOL_ID: '',
			VITE_COGNITO_CLIENT_ID: '',
			VITE_SIGNALING_WS_URL: '',
			VITE_SYNC_API_URL: '',
			VITE_APP_API_URL: '',
			VITE_GOOGLE_CLIENT_ID: '',
		},
	},
});
