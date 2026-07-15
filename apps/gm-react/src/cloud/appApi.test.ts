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
	vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'clientid123');
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
		const body = { plan: 'lantern', simulated: true, canChangePlan: true, features: [] };
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

		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { plan: 'beacon', simulated: true, canChangePlan: true, features: [] }),
		);
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

	it('createInvite forwards a co-dm role in the POST body', async () => {
		configured();
		const api = await loadApi();
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, {
				inviteId: 'i1',
				token: 't',
				campaignName: 'Camp',
				note: '',
				role: 'co-dm',
				createdAt: 'now',
				expiresAt: 1,
			}),
		);
		const invite = await api.createInvite({ campaignName: 'Camp', role: 'co-dm' });
		expect(invite.role).toBe('co-dm');
		expect(fetchMock.mock.calls[0][1].method).toBe('POST');
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			campaignName: 'Camp',
			role: 'co-dm',
		});
	});

	it('createInvite forwards the optional email and surfaces the email-delivery status', async () => {
		configured();
		const api = await loadApi();

		// email supplied → sent back with emailStatus/emailedTo
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, {
				inviteId: 'i1',
				token: 'tok',
				campaignName: 'Camp',
				note: '',
				createdAt: 't',
				expiresAt: 1,
				emailStatus: 'sent',
				emailedTo: 'player@example.com',
			}),
		);
		const sent = await api.createInvite({ campaignName: 'Camp', email: 'player@example.com' });
		expect(sent.emailStatus).toBe('sent');
		expect(sent.emailedTo).toBe('player@example.com');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.example.com/dev/invites');
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ campaignName: 'Camp', email: 'player@example.com' });

		// unconfigured/failed delivery still resolves with the honest fallback status
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, {
				inviteId: 'i2',
				token: 'tok2',
				campaignName: 'Camp',
				note: '',
				createdAt: 't',
				expiresAt: 1,
				emailStatus: 'not-configured',
			}),
		);
		const fallback = await api.createInvite({ campaignName: 'Camp', email: 'player@example.com' });
		expect(fallback.emailStatus).toBe('not-configured');
		expect(fallback.emailedTo).toBeUndefined();
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

		fetchMock.mockResolvedValueOnce(
			jsonResponse(400, { error: 'module package too large (256 KiB max)' }),
		);
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

	it('accepts an already-complete account deletion without touching sync', async () => {
		configured();
		vi.stubEnv('VITE_SYNC_API_URL', 'https://sync.example.com/dev');
		const api = await loadApi();
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

		await api.deleteAccount();
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			'https://api.example.com/dev/account',
		]);
		expect(fetchMock.mock.calls[0]?.[1].method).toBe('DELETE');
	});

	it('locks the account first, purges every sync page, then retries identity deletion', async () => {
		configured();
		vi.stubEnv('VITE_SYNC_API_URL', 'https://sync.example.com/dev');
		const api = await loadApi();
		fetchMock
			.mockResolvedValueOnce(jsonResponse(202, { ok: false, code: 'cloud-backup-purge-required' }))
			.mockResolvedValueOnce(jsonResponse(200, { deleted: 500, hasMore: true }))
			.mockResolvedValueOnce(jsonResponse(200, { deleted: 2, hasMore: false }))
			.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

		await api.deleteAccount();
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			'https://api.example.com/dev/account',
			'https://sync.example.com/dev/vaults/primary',
			'https://sync.example.com/dev/vaults/primary',
			'https://api.example.com/dev/account',
		]);
		expect(fetchMock.mock.calls.every(([, init]) => init.method === 'DELETE')).toBe(true);
		expect(
			fetchMock.mock.calls.every(([, init]) => init.headers.authorization === 'Bearer JWT-TOKEN'),
		).toBe(true);
	});

	it('fails closed when the app asks for a purge but sync is not configured', async () => {
		configured();
		const api = await loadApi();
		fetchMock.mockResolvedValueOnce(
			jsonResponse(202, { ok: false, code: 'cloud-backup-purge-required' }),
		);

		await expect(api.deleteAccount()).rejects.toMatchObject({ code: 'not-configured' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/dev/account');
	});

	it('rejects malformed handshake and purge responses without claiming deletion', async () => {
		configured();
		vi.stubEnv('VITE_SYNC_API_URL', 'https://sync.example.com/dev');
		let api = await loadApi();
		fetchMock.mockResolvedValueOnce(jsonResponse(202, { code: 'something-else' }));
		await expect(api.deleteAccount()).rejects.toThrow(/invalid account-deletion response/i);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		fetchMock.mockReset();
		api = await loadApi();
		fetchMock
			.mockResolvedValueOnce(jsonResponse(202, { code: 'cloud-backup-purge-required' }))
			.mockResolvedValueOnce(jsonResponse(200, { deleted: 0, hasMore: true }));
		await expect(api.deleteAccount()).rejects.toThrow(/could not be fully removed/i);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not remove sync data when the initial account tombstone request fails', async () => {
		configured();
		vi.stubEnv('VITE_SYNC_API_URL', 'https://sync.example.com/dev');
		const api = await loadApi();
		fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: 'try later' }));

		await expect(api.deleteAccount()).rejects.toMatchObject({ status: 503 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/dev/account');
	});
});

describe('campaign wiki', () => {
	const PAGES = [{ slug: 'welcome', title: 'Welcome', markdown: 'hi' }];

	it('publishes with PUT /wiki and the Bearer token, returning the status', async () => {
		configured();
		const status = {
			wikiId: 'w1',
			title: 'My Wiki',
			access: 'unlisted',
			pageCount: 1,
			size: 40,
			publishedAt: 't',
			updatedAt: 't',
		};
		fetchMock.mockResolvedValueOnce(jsonResponse(200, status));
		const api = await loadApi();

		await expect(
			api.publishWiki({ title: 'My Wiki', access: 'unlisted', pages: PAGES }),
		).resolves.toEqual(status);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.example.com/dev/wiki');
		expect(init.method).toBe('PUT');
		expect(init.headers.authorization).toBe('Bearer JWT-TOKEN');
		expect(JSON.parse(init.body)).toEqual({ title: 'My Wiki', access: 'unlisted', pages: PAGES });
	});

	it('getMyWiki maps a 404 to null (nothing published) but rethrows other errors', async () => {
		configured();
		const api = await loadApi();
		fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'no published wiki' }));
		await expect(api.getMyWiki()).resolves.toBeNull();

		fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'needs the Beacon plan' }));
		await expect(api.getMyWiki()).rejects.toMatchObject({ code: 'http', status: 403 });
	});

	it('unpublishWiki issues DELETE /wiki', async () => {
		configured();
		const api = await loadApi();
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
		await api.unpublishWiki();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.example.com/dev/wiki');
		expect(init.method).toBe('DELETE');
	});

	it('getPublicWiki fetches unauthenticated (no Authorization) and works signed out', async () => {
		configured();
		token.value = null; // readers have no account
		const wiki = {
			wikiId: 'w1',
			title: 'Lore',
			access: 'public',
			publishedAt: 't',
			updatedAt: 't',
			pageCount: 1,
			pages: PAGES,
		};
		fetchMock.mockResolvedValueOnce(jsonResponse(200, wiki));
		const api = await loadApi();

		await expect(api.getPublicWiki('w1')).resolves.toEqual(wiki);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.example.com/dev/wikis/w1');
		expect(init?.headers?.authorization ?? undefined).toBeUndefined();
	});

	it('getPublicWiki sends the password header and maps 401/404 to friendly errors', async () => {
		configured();
		const api = await loadApi();

		fetchMock.mockResolvedValueOnce(jsonResponse(200, { wikiId: 'w1', pages: [] }));
		await api.getPublicWiki('w1', 'dragons');
		expect(fetchMock.mock.calls[0][1].headers['x-wiki-password']).toBe('dragons');

		fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'password required' }));
		await expect(api.getPublicWiki('w1')).rejects.toMatchObject({ status: 401 });

		fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'password required' }));
		await expect(api.getPublicWiki('w1', 'wrong')).rejects.toThrow(/password is not right/i);

		fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'wiki not found' }));
		await expect(api.getPublicWiki('gone')).rejects.toThrow(/invalid or the wiki was unpublished/i);
	});

	it('getPublicWiki is fail-closed when the backend URL is absent', async () => {
		// no env stubbed → cloudConfig.appApiUrl is ''
		const api = await loadApi();
		await expect(api.getPublicWiki('w1')).rejects.toMatchObject({ code: 'not-configured' });
		expect(fetchMock).not.toHaveBeenCalled();
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
