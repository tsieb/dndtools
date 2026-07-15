import { describe, it, expect, afterEach, vi } from 'vitest';

// config.ts turns Vite env vars into the local-first gates isCloudConfigured /
// isAuthConfigured. If these mis-fire, cloud UI either never appears or appears
// half-wired. Values are read at import time, so each test stubs env then re-imports.

const ENV = {
	region: 'VITE_CLOUD_REGION',
	pool: 'VITE_COGNITO_USER_POOL_ID',
	client: 'VITE_COGNITO_CLIENT_ID',
	ws: 'VITE_SIGNALING_WS_URL',
	sync: 'VITE_SYNC_API_URL',
	appApi: 'VITE_APP_API_URL',
	publicApp: 'VITE_PUBLIC_APP_URL',
} as const;

async function importFresh() {
	vi.resetModules();
	return import('./config');
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('cloud config gates', () => {
	it('is fully configured when region, pool, client, and signaling URL are all present', async () => {
		vi.stubEnv(ENV.region, 'ca-central-1');
		vi.stubEnv(ENV.pool, 'ca-central-1_abc');
		vi.stubEnv(ENV.client, 'client123');
		vi.stubEnv(ENV.ws, 'wss://sig.example.com/dev');
		vi.stubEnv(ENV.sync, 'https://sync.example.com/dev');

		const { cloudConfig, isCloudConfigured, isAuthConfigured, isSyncConfigured } =
			await importFresh();

		expect(isCloudConfigured).toBe(true);
		expect(isAuthConfigured).toBe(true);
		expect(isSyncConfigured).toBe(true);
		expect(cloudConfig).toEqual({
			region: 'ca-central-1',
			userPoolId: 'ca-central-1_abc',
			userPoolClientId: 'client123',
			signalingWsUrl: 'wss://sig.example.com/dev',
			syncApiUrl: 'https://sync.example.com/dev',
			appApiUrl: '',
			publicAppUrl: '',
		});
	});

	it('is account-api-configured only when identity AND the app-api URL are present (fail closed)', async () => {
		vi.stubEnv(ENV.region, 'ca-central-1');
		vi.stubEnv(ENV.pool, 'ca-central-1_abc');
		vi.stubEnv(ENV.client, 'client123');
		vi.stubEnv(ENV.appApi, '');
		expect((await importFresh()).isAccountApiConfigured).toBe(false);

		vi.stubEnv(ENV.appApi, 'https://app.example.com/dev');
		expect((await importFresh()).isAccountApiConfigured).toBe(true);

		// app-api URL without identity must stay closed — no anonymous account surface.
		vi.stubEnv(ENV.pool, '');
		expect((await importFresh()).isAccountApiConfigured).toBe(false);
	});

	it('accepts only a credential-free HTTPS public app URL', async () => {
		vi.stubEnv(ENV.publicApp, 'https://play.example.com/app/');
		expect((await importFresh()).isPublicAppConfigured).toBe(true);

		vi.stubEnv(ENV.publicApp, 'http://play.example.com/');
		expect((await importFresh()).isPublicAppConfigured).toBe(false);

		vi.stubEnv(ENV.publicApp, 'https://play.example.com/#token');
		expect((await importFresh()).isPublicAppConfigured).toBe(false);
	});

	it('is auth-configured but NOT sync-configured when the sync URL is absent', async () => {
		vi.stubEnv(ENV.region, 'ca-central-1');
		vi.stubEnv(ENV.pool, 'ca-central-1_abc');
		vi.stubEnv(ENV.client, 'client123');
		vi.stubEnv(ENV.sync, '');

		const { isAuthConfigured, isSyncConfigured } = await importFresh();

		expect(isAuthConfigured).toBe(true);
		expect(isSyncConfigured).toBe(false);
	});

	it('is auth-configured but NOT cloud-configured when the signaling URL is absent (sign-in without online play)', async () => {
		vi.stubEnv(ENV.region, 'ca-central-1');
		vi.stubEnv(ENV.pool, 'ca-central-1_abc');
		vi.stubEnv(ENV.client, 'client123');
		vi.stubEnv(ENV.ws, '');

		const { isCloudConfigured, isAuthConfigured } = await importFresh();

		expect(isAuthConfigured).toBe(true);
		expect(isCloudConfigured).toBe(false);
	});

	it('is local-first (both gates false, no throw) when nothing is configured', async () => {
		vi.stubEnv(ENV.region, '');
		vi.stubEnv(ENV.pool, '');
		vi.stubEnv(ENV.client, '');
		vi.stubEnv(ENV.ws, '');

		const { cloudConfig, isCloudConfigured, isAuthConfigured } = await importFresh();

		expect(isCloudConfigured).toBe(false);
		expect(isAuthConfigured).toBe(false);
		expect(cloudConfig.region).toBe('');
	});

	it('trims surrounding whitespace from env values', async () => {
		vi.stubEnv(ENV.region, '  ca-central-1  ');
		vi.stubEnv(ENV.pool, ' pool ');
		vi.stubEnv(ENV.client, ' client ');
		vi.stubEnv(ENV.ws, ' wss://sig/dev ');

		const { cloudConfig } = await importFresh();

		expect(cloudConfig.region).toBe('ca-central-1');
		expect(cloudConfig.signalingWsUrl).toBe('wss://sig/dev');
	});

	it('fails closed for malformed identity values and protocol-confused API URLs', async () => {
		vi.stubEnv(ENV.region, 'ca-central-1');
		vi.stubEnv(ENV.pool, 'us-east-1_wrongregion');
		vi.stubEnv(ENV.client, 'client-with-punctuation');
		vi.stubEnv(ENV.ws, 'https://sig.example.com/dev');
		vi.stubEnv(ENV.sync, 'wss://sync.example.com/dev');
		vi.stubEnv(ENV.appApi, 'https://app.example.com/dev?redirect=elsewhere');

		const { isAuthConfigured, isCloudConfigured, isSyncConfigured, isAccountApiConfigured } =
			await importFresh();

		expect(isAuthConfigured).toBe(false);
		expect(isCloudConfigured).toBe(false);
		expect(isSyncConfigured).toBe(false);
		expect(isAccountApiConfigured).toBe(false);
	});
});
