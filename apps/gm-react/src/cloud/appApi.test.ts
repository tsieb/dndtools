import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// appApi.ts is the typed client for the app-api backend. We mock fetch + the auth token
// and drive config from real (stubbed) env, exercising OUR logic: the fail-closed
// not-configured guard, Bearer-token attachment, safe error mapping (4xx message
// surfaced, 5xx kept generic), the unauthenticated resolve path, and response unwrapping.

const token = vi.hoisted(() => ({ value: 'JWT-TOKEN' as string | null }));
vi.mock('./auth', () => ({ getIdToken: async () => token.value }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function configured() {
	vi.stubEnv('VITE_CLOUD_REGION', 'ca-central-1');
	vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'ca-central-1_pool');
	vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-id');
	vi.stubEnv('VITE_APP_API_URL', 'https://api.example.com/dev');
}

async function loadApi() {
	vi.resetModules();
	return import('./appApi');
}

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
	vi.unstubAllEnvs();
	fetchMock.mockReset();
	token.value = 'JWT-TOKEN';
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('fail-closed guards', () => {
	it('throws a typed not-configured error without touching the network', async () => {
		// no env stubbed → isAccountApiConfigured is false
		const api = await loadApi();
		await expect(api.getEntitlements()).rejects.toMatchObject({
			name: 'AppApiError',
			code: 'not-configured',
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('throws unauthenticated (no network call) when signed out', async () => {
		configured();
		token.value = null;
		const api = await loadApi();
		await expect(api.listInvites()).rejects.toMatchObject({ code: 'unauthenticated' });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('authed requests', () => {
	it('attaches the Bearer token and unwraps the entitlements response', async () => {
		configured();
		const body = { plan: 'lantern', simulated: true, features: [] };
		fetchMock.mockResolvedValue(jsonResponse(200, body));
		const api = await loadApi();

		await expect(api.getEntitlements()).resolves.toEqual(body);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.example.com/dev/account/entitlements');
		expect(init.headers.authorization).toBe('Bearer JWT-TOKEN');
	});

	it('POSTs a plan change and unwraps list envelopes ({modules}/{invites}/{devices})', async () => {
		configured();
		const api = await loadApi();

		fetchMock.mockResolvedValueOnce(jsonResponse(200, { plan: 'beacon', simulated: true, features: [] }));
		await api.setPlan('beacon');
		expect(fetchMock.mock.calls[0][1].method).toBe('POST');
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ plan: 'beacon' });

		fetchMock.mockResolvedValueOnce(jsonResponse(200, { modules: [{ moduleId: 'm1' }] }));
		await expect(api.listModules()).resolves.toEqual([{ moduleId: 'm1' }]);

		fetchMock.mockResolvedValueOnce(jsonResponse(200, { invites: [{ inviteId: 'i1' }] }));
		await expect(api.listInvites()).resolves.toEqual([{ inviteId: 'i1' }]);

		fetchMock.mockResolvedValueOnce(jsonResponse(200, { devices: [{ deviceKey: 'd1' }] }));
		await expect(api.listDevices()).resolves.toEqual([{ deviceKey: 'd1' }]);
	});

	it('publishes a module (returns moduleId) and deletes with the DELETE method', async () => {
		configured();
		const api = await loadApi();
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { moduleId: 'mod-1' }));
		await expect(
			api.publishModule({ name: 'n', summary: 's', version: '1.0.0', package: { id: 'p' } }),
		).resolves.toBe('mod-1');

		fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
		await api.deleteModule('mod 1');
		const [url, init] = fetchMock.mock.calls[1];
		expect(url).toBe('https://api.example.com/dev/marketplace/modules/mod%201');
		expect(init.method).toBe('DELETE');
	});

	it('surfaces the safe 4xx server message but keeps 5xx generic', async () => {
		configured();
		const api = await loadApi();

		fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'module package too large (256 KiB max)' }));
		await expect(api.listModules()).rejects.toMatchObject({
			code: 'http',
			status: 400,
			message: 'module package too large (256 KiB max)',
		});

		fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'internal error' }));
		await expect(api.listModules()).rejects.toMatchObject({
			status: 500,
			message: 'Cloud request failed (500).',
		});
	});

	it('maps a network failure to a typed, user-presentable error', async () => {
		configured();
		const api = await loadApi();
		fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await expect(api.getProfile()).rejects.toMatchObject({ code: 'network' });
	});
});

describe('resolveInvite (unauthenticated)', () => {
	it('fetches without any Authorization header and works signed out', async () => {
		configured();
		token.value = null; // signed out — resolve must still work
		fetchMock.mockResolvedValue(
			jsonResponse(200, { campaignName: 'Camp', note: '', invitedBy: 'a GM', expiresAt: 1 }),
		);
		const api = await loadApi();

		const res = await api.resolveInvite('tok_abc');
		expect(res.campaignName).toBe('Camp');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.example.com/dev/invites/resolve/tok_abc');
		expect(init?.headers?.authorization ?? undefined).toBeUndefined();
	});

	it('maps 404/410 to a friendly invalid-or-expired error', async () => {
		configured();
		const api = await loadApi();
		fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'invite not found' }));
		await expect(api.resolveInvite('gone')).rejects.toThrow(/invalid or has expired/i);
	});
});
