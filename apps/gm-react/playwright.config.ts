import { defineConfig, devices } from '@playwright/test';

// The whole-app validation harness owns the Vite process so every browser check shares the
// same local-only server. GitHub Actions sets CI=1, where standalone Playwright runs must still
// reject an already-listening port; this explicit signal distinguishes the managed harness.
const reuseValidationServer = process.env.DNDTOOLS_PLAYWRIGHT_REUSE_MANAGED_SERVER === '1';

// The dev server port is fixed at 5273 by default so the managed harness and CI agree on it.
// `DNDTOOLS_E2E_PORT` overrides it for the one case that needs isolation: running this suite while
// another checkout of the repo already holds 5273 (e.g. the autonomous review loop's worktree).
// Without it, `reuseExistingServer` is true outside CI and a local run silently attaches to that
// other checkout's server — testing someone else's working tree and reporting it as your own.
const port = Number(process.env.DNDTOOLS_E2E_PORT ?? 5273);

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
		baseURL: `http://localhost:${port}`,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	projects: [
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
	],
	webServer: {
		// `pnpm dev` hardcodes `--port 5273`; invoking vite directly avoids passing a duplicate flag.
		command: `pnpm exec vite --port ${port}`,
		port,
		reuseExistingServer: reuseValidationServer || !process.env.CI,
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
			VITE_PUBLIC_APP_URL: '',
			VITE_GOOGLE_CLIENT_ID: '',
		},
	},
});
