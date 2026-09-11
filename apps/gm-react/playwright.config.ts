import { defineConfig, devices } from '@playwright/test';
import { statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

// The whole-app validation harness owns the Vite process so every browser check shares the
// same local-only server. GitHub Actions sets CI=1, where standalone Playwright runs must still
// reject an already-listening port; this explicit signal distinguishes the managed harness.
const reuseValidationServer = process.env.DNDTOOLS_PLAYWRIGHT_REUSE_MANAGED_SERVER === '1';

// The dev server port is fixed at 5273 by default so the managed harness and CI agree on it.
// `DNDTOOLS_E2E_PORT` overrides it for the one case that needs isolation: running this suite while
// another checkout of the repo already holds 5273 (e.g. the autonomous review loop's worktree).
// Without it, `reuseExistingServer` is true outside CI and a local run silently attaches to that
// other checkout's server — testing someone else's working tree and reporting it as your own.
//
// A linked git worktree (`.git` is a file there, not a directory) is a dispatcher candidate or a
// scratch tree, never the checkout a developer runs `pnpm dev` from, and several of them run this
// suite at once. Each one gets its own stable port derived from its path, so two overlapping gates
// cannot attach to each other's server (and die with ERR_CONNECTION_REFUSED when the other run
// stops it). The primary checkout, CI and the managed validation harness keep 5273.
function linkedWorktreePort(): number | undefined {
	if (reuseValidationServer) return undefined;
	const root = fileURLToPath(new URL('../../', import.meta.url));
	try {
		if (!statSync(`${root}.git`).isFile()) return undefined;
	} catch {
		return undefined;
	}
	let hash = 2166136261;
	for (const ch of root) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
	return 5300 + (hash % 600);
}
const port = Number(process.env.DNDTOOLS_E2E_PORT ?? linkedWorktreePort() ?? 5273);

// Worker cap. Playwright's default is half the logical CPUs — 8 Chromium instances on a 16-core
// box — and several concurrent runs (the RC loop's slots, the promotion gate, an interactive run)
// multiply that until the machine saturates and every test crawls. A quarter of the CPUs is the
// default here; `DNDTOOLS_PW_WORKERS` sets an explicit budget (the loop gives each slot one) and
// the CLI's `--workers` still overrides both.
//
// RC-ENG-2.2: CI used to run strictly serially, which left three of a GitHub runner's four vCPUs
// idle while one Chromium waited on the Vite dev server. Two workers is the CI default now — the
// dev server plus two browsers still fits four cores — and `DNDTOOLS_PW_WORKERS` overrides it
// there too, so a flaky-looking run can be pinned back to one worker without editing this file.
const workersFromEnv = Number(process.env.DNDTOOLS_PW_WORKERS);
const workers =
	Number.isFinite(workersFromEnv) && workersFromEnv >= 1
		? Math.floor(workersFromEnv)
		: process.env.CI
			? 2
			: Math.max(1, Math.min(4, Math.floor(availableParallelism() / 4)));

// Video is the single most expensive artifact: `retain-on-failure` still screencasts EVERY test
// through an ffmpeg process per browser and only discards the file afterwards. Failures already
// get a screenshot; opt back into video with DNDTOOLS_E2E_VIDEO=1 when a failure needs it.
const video = process.env.DNDTOOLS_E2E_VIDEO === '1' ? 'retain-on-failure' : 'off';

// V8 flags for the browser, for reproducing garbage-collection races on demand (RC-ENG-2.6).
// `DNDTOOLS_E2E_JS_FLAGS='--gc-global --max-semi-space-size=1'` makes every young-generation GC a
// full one, which turns the load-dependent "Execution context was destroyed" flake into a
// deterministic failure. See docs/development/TESTING.md §6.
const jsFlags = process.env.DNDTOOLS_E2E_JS_FLAGS?.trim();

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
	workers,
	reporter: [['list']],
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video,
		...(jsFlags ? { launchOptions: { args: [`--js-flags=${jsFlags}`] } } : {}),
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
