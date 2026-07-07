import { describe, it, expect, afterEach, vi } from 'vitest';

// config.ts turns Vite env vars into the local-first gates isCloudConfigured /
// isAuthConfigured. If these mis-fire, cloud UI either never appears or appears
// half-wired. Values are read at import time, so each test stubs env then re-imports.

const ENV = {
	region: 'VITE_CLOUD_REGION',
	pool: 'VITE_COGNITO_USER_POOL_ID',
	client: 'VITE_COGNITO_CLIENT_ID',
	ws: 'VITE_SIGNALING_WS_URL',
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

		const { cloudConfig, isCloudConfigured, isAuthConfigured } = await importFresh();

		expect(isCloudConfigured).toBe(true);
		expect(isAuthConfigured).toBe(true);
		expect(cloudConfig).toEqual({
			region: 'ca-central-1',
			userPoolId: 'ca-central-1_abc',
			userPoolClientId: 'client123',
			signalingWsUrl: 'wss://sig.example.com/dev',
		});
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
});
