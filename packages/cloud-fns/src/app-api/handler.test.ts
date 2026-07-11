import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// The app-api handler backs entitlements (SIMULATED checkout), the plaintext module
// marketplace, invites (incl. the one UNAUTHENTICATED resolve route), and account/device
// management. These tests drive the real handler against in-memory fakes of the AWS
// layers (Dynamo/S3 helpers + the Cognito Admin client), asserting the contract the
// verify script (infra/verify-app-api.mjs) and the client (apps/gm-react/src/cloud/appApi.ts)
// depend on: response shapes, tenant isolation, the simulated flag, and that the anonymous
// resolve route never leaks the inviter's sub. Env must be set before the module evaluates.
vi.hoisted(() => {
	process.env.APP_TABLE = 'app';
	process.env.MODULES_BUCKET = 'modules';
	process.env.USER_POOL_ID = 'ca-central-1_pool';
	process.env.AWS_REGION = 'ca-central-1';
});

const store = vi.hoisted(() => {
	const items = new Map<string, Record<string, string>>(); // `${pk}|${sk}` -> row
	const objects = new Map<string, unknown>(); // s3 key -> value
	const cognitoCalls: { name: string; input: Record<string, unknown> }[] = [];
	return { items, objects, cognitoCalls };
});

vi.mock('../lib/aws.ts', () => ({
	putItem: async (_table: string, obj: Record<string, string | number | undefined>) => {
		const row: Record<string, string> = {};
		for (const [k, v] of Object.entries(obj)) if (v !== undefined) row[k] = String(v);
		store.items.set(`${obj.pk}|${obj.sk}`, row);
	},
	getItem: async (_table: string, key: Record<string, string>) => store.items.get(`${key.pk}|${key.sk}`),
	deleteItem: async (_table: string, key: Record<string, string>) => {
		store.items.delete(`${key.pk}|${key.sk}`);
	},
	queryPartition: async (
		_table: string,
		pk: { value: string },
		skRange?: { lo: string; hi: string },
	) =>
		[...store.items.entries()]
			.filter(([k]) => k.startsWith(`${pk.value}|`))
			.map(([, v]) => v)
			.filter((r) => (skRange ? r.sk >= skRange.lo && r.sk <= skRange.hi : true))
			.sort((a, b) => a.sk.localeCompare(b.sk)),
}));

vi.mock('../lib/s3.ts', () => ({
	putJson: async (_bucket: string, key: string, value: unknown) => {
		store.objects.set(key, value);
	},
	getJson: async (_bucket: string, key: string) => store.objects.get(key) ?? null,
	deleteObject: async (_bucket: string, key: string) => {
		store.objects.delete(key);
	},
}));

// Cognito Admin client fake: records every call; AdminGetUser/AdminListDevices return
// canned identity data so profile/device mapping is exercised.
vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
	const command = (name: string) =>
		class {
			readonly name = name;
			constructor(public input: Record<string, unknown>) {}
		};
	return {
		CognitoIdentityProviderClient: class {
			async send(cmd: { name: string; input: Record<string, unknown> }) {
				store.cognitoCalls.push({ name: cmd.name, input: cmd.input });
				if (cmd.name === 'AdminGetUser') {
					return {
						Username: cmd.input.Username,
						UserCreateDate: new Date('2026-01-01T00:00:00.000Z'),
						UserAttributes: [
							{ Name: 'email', Value: 'dm@example.com' },
							{ Name: 'name', Value: 'Sam Rivers' },
						],
					};
				}
				if (cmd.name === 'AdminListDevices') {
					return {
						Devices: [
							{
								DeviceKey: 'dk-1',
								DeviceAttributes: [{ Name: 'device_name', Value: 'MacBook' }],
								DeviceLastAuthenticatedDate: new Date('2026-07-01T00:00:00.000Z'),
							},
						],
					};
				}
				return {};
			}
		},
		AdminDeleteUserCommand: command('AdminDeleteUser'),
		AdminForgetDeviceCommand: command('AdminForgetDevice'),
		AdminGetUserCommand: command('AdminGetUser'),
		AdminListDevicesCommand: command('AdminListDevices'),
		AdminUpdateUserAttributesCommand: command('AdminUpdateUserAttributes'),
		AdminUserGlobalSignOutCommand: command('AdminUserGlobalSignOut'),
	};
});

const { handler } = await import('./handler.ts');

function event(
	routeKey: string,
	opts: { sub?: string | null; name?: string; body?: unknown; params?: Record<string, string> } = {},
) {
	const [method, rawPath] = routeKey.split(' ');
	const claims: Record<string, unknown> | undefined =
		opts.sub === null
			? undefined
			: { sub: opts.sub ?? 'user-1', 'cognito:username': opts.sub ?? 'user-1', ...(opts.name ? { name: opts.name } : {}) };
	return {
		routeKey,
		rawPath,
		requestContext: { http: { method }, ...(claims ? { authorizer: { jwt: { claims } } } : {}) },
		pathParameters: opts.params,
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
	} as unknown as APIGatewayProxyEventV2;
}

const call = async (e: APIGatewayProxyEventV2) => {
	const res = (await handler(e, {} as never, () => {})) as { statusCode: number; body: string };
	return { status: res.statusCode, body: JSON.parse(res.body) };
};

const GOOD_MODULE = {
	name: 'Table Roller Panel',
	summary: 'A starter widget shell for rolling on your own random tables.',
	version: '1.0.0',
	package: { id: 'starter.table-roller', version: '1.0.0', widgets: [] },
};

beforeEach(() => {
	store.items.clear();
	store.objects.clear();
	store.cognitoCalls.length = 0;
});

describe('app-api handler — auth gate', () => {
	it('rejects a protected route with no verified claims (401)', async () => {
		const res = await call(event('GET /account/entitlements', { sub: null }));
		expect(res.status).toBe(401);
	});
});

describe('entitlements (simulated checkout)', () => {
	it('defaults to the free plan with the feature matrix and simulated:true', async () => {
		const res = await call(event('GET /account/entitlements'));
		expect(res.status).toBe(200);
		expect(res.body.plan).toBe('hearth');
		expect(res.body.simulated).toBe(true);
		expect(Array.isArray(res.body.features)).toBe(true);
		expect(res.body.features[0].rows[0]).toHaveProperty('hearth');
	});

	it('round-trips a simulated plan change and stays marked simulated', async () => {
		const set = await call(event('POST /account/entitlements', { body: { plan: 'lantern' } }));
		expect(set.status).toBe(200);
		expect(set.body).toMatchObject({ plan: 'lantern', simulated: true });
		const back = await call(event('GET /account/entitlements'));
		expect(back.body).toMatchObject({ plan: 'lantern', simulated: true });
	});

	it('rejects a plan outside the allowlist (400)', async () => {
		const res = await call(event('POST /account/entitlements', { body: { plan: 'platinum' } }));
		expect(res.status).toBe(400);
	});
});

describe('marketplace', () => {
	it('publishes, browses, fetches, and own-deletes a module', async () => {
		const pub = await call(event('POST /marketplace/modules', { body: GOOD_MODULE }));
		expect(pub.status).toBe(200);
		const moduleId = pub.body.moduleId as string;
		expect(moduleId).toBeTruthy();

		const list = await call(event('GET /marketplace/modules'));
		const found = list.body.modules.find((m: { moduleId: string }) => m.moduleId === moduleId);
		expect(found).toMatchObject({ name: GOOD_MODULE.name, version: '1.0.0', owned: true });
		expect(found.ownerSub).toBeUndefined(); // owner identity is a boolean, never a sub

		const one = await call(event('GET /marketplace/modules/{moduleId}', { params: { moduleId } }));
		expect(one.status).toBe(200);
		expect(one.body.package).toEqual(GOOD_MODULE.package);

		const del = await call(event('DELETE /marketplace/modules/{moduleId}', { params: { moduleId } }));
		expect(del.status).toBe(200);
		expect(store.objects.size).toBe(0); // S3 payload removed too
		const gone = await call(event('GET /marketplace/modules/{moduleId}', { params: { moduleId } }));
		expect(gone.status).toBe(404);
	});

	it("refuses deleting another owner's module (403) and an absent one (404)", async () => {
		const pub = await call(event('POST /marketplace/modules', { sub: 'owner-1', body: GOOD_MODULE }));
		const moduleId = pub.body.moduleId as string;
		const foreign = await call(
			event('DELETE /marketplace/modules/{moduleId}', { sub: 'intruder-2', params: { moduleId } }),
		);
		expect(foreign.status).toBe(403);
		const absent = await call(
			event('DELETE /marketplace/modules/{moduleId}', { params: { moduleId: 'nope' } }),
		);
		expect(absent.status).toBe(404);
	});

	it('rejects an oversized module package (400, size cap)', async () => {
		const res = await call(
			event('POST /marketplace/modules', {
				body: { ...GOOD_MODULE, package: { blob: 'x'.repeat(256 * 1024) } },
			}),
		);
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/too large/i);
	});

	it('rejects a non-semver version and missing fields (400)', async () => {
		expect((await call(event('POST /marketplace/modules', { body: { ...GOOD_MODULE, version: 'latest' } }))).status).toBe(400);
		expect((await call(event('POST /marketplace/modules', { body: { name: 'x' } }))).status).toBe(400);
	});
});

describe('invites', () => {
	const mint = (sub = 'user-1') =>
		call(
			event('POST /invites', {
				sub,
				name: 'Sam the GM',
				body: { campaignName: 'The Sunken Outpost', note: 'Thursdays 7pm' },
			}),
		);

	it('mints an invite with a high-entropy token and lists it as pending', async () => {
		const res = await mint();
		expect(res.status).toBe(200);
		expect(res.body.inviteId).toBeTruthy();
		expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
		expect(res.body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 13 * 24 * 60 * 60);

		const list = await call(event('GET /invites'));
		expect(list.body.invites).toHaveLength(1);
		expect(list.body.invites[0]).toMatchObject({ inviteId: res.body.inviteId, campaignName: 'The Sunken Outpost' });
	});

	it('resolves publicly (no auth) with join metadata only — never the owner sub', async () => {
		const { body } = await mint();
		const pub = await call(event('GET /invites/resolve/{token}', { sub: null, params: { token: body.token } }));
		expect(pub.status).toBe(200);
		expect(pub.body).toEqual({
			campaignName: 'The Sunken Outpost',
			note: 'Thursdays 7pm',
			invitedBy: 'Sam the GM',
			expiresAt: body.expiresAt,
		});
		expect(JSON.stringify(pub.body)).not.toContain('user-1');
	});

	it('answers 404 for an absent, malformed, or expired token', async () => {
		const absent = await call(event('GET /invites/resolve/{token}', { sub: null, params: { token: 'A'.repeat(43) } }));
		expect(absent.status).toBe(404);
		const malformed = await call(event('GET /invites/resolve/{token}', { sub: null, params: { token: '../../etc' } }));
		expect(malformed.status).toBe(404);

		const { body } = await mint();
		const redeem = store.items.get(`invite#${body.token}|redeem`)!;
		redeem.expiresAt = String(Math.floor(Date.now() / 1000) - 10);
		const expired = await call(event('GET /invites/resolve/{token}', { sub: null, params: { token: body.token } }));
		expect(expired.status).toBe(404);
	});

	it('revoke removes both rows so the join link dies immediately', async () => {
		const { body } = await mint();
		const rev = await call(event('DELETE /invites/{inviteId}', { params: { inviteId: body.inviteId } }));
		expect(rev.status).toBe(200);
		const gone = await call(event('GET /invites/resolve/{token}', { sub: null, params: { token: body.token } }));
		expect(gone.status).toBe(404);
		expect((await call(event('GET /invites'))).body.invites).toHaveLength(0);
	});

	it("cannot revoke another user's invite (404 — invites are sub-namespaced)", async () => {
		const { body } = await mint('owner-1');
		const res = await call(event('DELETE /invites/{inviteId}', { sub: 'intruder-2', params: { inviteId: body.inviteId } }));
		expect(res.status).toBe(404);
	});
});

describe('campaign wiki', () => {
	const PAGES = [
		{ slug: 'welcome', title: 'Welcome', markdown: '# Hi\nplayer-safe **lore**' },
		{ slug: 'factions', title: 'Factions', markdown: '- The Ashen Circle' },
	];
	// Publishing is Beacon-gated; put the caller on Beacon first.
	const asBeacon = async (sub = 'user-1') => {
		await call(event('POST /account/entitlements', { sub, body: { plan: 'beacon' } }));
	};
	const publish = (body: unknown, sub = 'user-1') => call(event('PUT /wiki', { sub, body }));

	it('refuses to publish on a non-Beacon plan (403) — gate is honest even though plans are simulated', async () => {
		const res = await publish({ title: 'My Wiki', access: 'unlisted', pages: PAGES });
		expect(res.status).toBe(403);
		expect(res.body.error).toMatch(/beacon/i);
		// Nothing was written — no public site row exists.
		expect([...store.items.keys()].some((k) => k.startsWith('wiki#'))).toBe(false);
	});

	it('publishes on Beacon, returns a stable wikiId + status, and stores the bundle in S3', async () => {
		await asBeacon();
		const res = await publish({ title: 'My Wiki', access: 'unlisted', pages: PAGES });
		expect(res.status).toBe(200);
		expect(res.body.wikiId).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
		expect(res.body).toMatchObject({ title: 'My Wiki', access: 'unlisted', pageCount: 2 });
		expect(res.body.size).toBeGreaterThan(0);
		// The status is readable back by the owner; the S3 bundle exists.
		const own = await call(event('GET /wiki'));
		expect(own.body).toMatchObject({ wikiId: res.body.wikiId, pageCount: 2 });
		expect(store.objects.has(`wikis/${res.body.wikiId}.json`)).toBe(true);
	});

	it('re-publish keeps the SAME wikiId + first publishedAt (readers’ links survive)', async () => {
		await asBeacon();
		const first = await publish({ title: 'V1', access: 'public', pages: PAGES });
		const again = await publish({ title: 'V2', access: 'unlisted', pages: [PAGES[0]] });
		expect(again.body.wikiId).toBe(first.body.wikiId);
		expect(again.body.publishedAt).toBe(first.body.publishedAt);
		expect(again.body.pageCount).toBe(1);
		expect(again.body.title).toBe('V2');
	});

	it('reads a public wiki with NO auth and never leaks the owner sub', async () => {
		await asBeacon('owner-9');
		const pub = await publish({ title: 'Public Lore', access: 'public', pages: PAGES }, 'owner-9');
		const read = await call(event('GET /wikis/{wikiId}', { sub: null, params: { wikiId: pub.body.wikiId } }));
		expect(read.status).toBe(200);
		expect(read.body).toMatchObject({ wikiId: pub.body.wikiId, title: 'Public Lore', pageCount: 2 });
		expect(read.body.pages).toHaveLength(2);
		expect(read.body.pages[0]).toMatchObject({ slug: 'welcome', title: 'Welcome' });
		expect(JSON.stringify(read.body)).not.toContain('owner-9');
		expect(read.body.ownerSub).toBeUndefined();
		expect(read.body.passwordHash).toBeUndefined();
	});

	it('answers 404 for an absent or malformed wiki id (hostile input is bounded)', async () => {
		expect((await call(event('GET /wikis/{wikiId}', { sub: null, params: { wikiId: 'ABCDEFGH' } }))).status).toBe(404);
		expect((await call(event('GET /wikis/{wikiId}', { sub: null, params: { wikiId: '../../etc' } }))).status).toBe(404);
	});

	it('password wikis: 401 without/with a wrong password, 200 with the right one — pages hidden until then', async () => {
		await asBeacon();
		const pub = await publish({ title: 'Secret', access: 'password', password: 'dragons', pages: PAGES });
		expect(pub.status).toBe(200);

		const noPw = await call(event('GET /wikis/{wikiId}', { sub: null, params: { wikiId: pub.body.wikiId } }));
		expect(noPw.status).toBe(401);
		expect(noPw.body.pages).toBeUndefined(); // content withheld

		const wrong = { ...event('GET /wikis/{wikiId}', { sub: null, params: { wikiId: pub.body.wikiId } }), headers: { 'x-wiki-password': 'nope' } };
		expect((await call(wrong as never)).status).toBe(401);

		const right = { ...event('GET /wikis/{wikiId}', { sub: null, params: { wikiId: pub.body.wikiId } }), headers: { 'x-wiki-password': 'dragons' } };
		const ok = await call(right as never);
		expect(ok.status).toBe(200);
		expect(ok.body.pages).toHaveLength(2);
	});

	it('rejects a password wiki with a too-short/absent password (400)', async () => {
		await asBeacon();
		expect((await publish({ title: 'S', access: 'password', password: '123', pages: PAGES })).status).toBe(400);
		expect((await publish({ title: 'S', access: 'password', pages: PAGES })).status).toBe(400);
	});

	it('validates page shape: bad slug, duplicate slug, empty pages, bad access (400)', async () => {
		await asBeacon();
		expect((await publish({ title: 'T', access: 'public', pages: [] })).status).toBe(400);
		expect((await publish({ title: 'T', access: 'public', pages: [{ slug: 'Not Kebab', title: 'x', markdown: '' }] })).status).toBe(400);
		expect((await publish({ title: 'T', access: 'public', pages: [{ slug: 'a', title: 'x', markdown: '' }, { slug: 'a', title: 'y', markdown: '' }] })).status).toBe(400);
		expect((await publish({ title: 'T', access: 'sometimes', pages: PAGES })).status).toBe(400);
	});

	it('drops unknown/hostile page fields — only text fields are persisted (no script survives)', async () => {
		await asBeacon();
		const pub = await publish({
			title: 'Clean',
			access: 'public',
			pages: [{ slug: 'p', title: 'P', markdown: 'ok', onclick: 'alert(1)', __proto__: { polluted: true } }],
		});
		const bundle = store.objects.get(`wikis/${pub.body.wikiId}.json`) as { pages: Record<string, unknown>[] };
		expect(Object.keys(bundle.pages[0]).sort()).toEqual(['markdown', 'slug', 'title', 'updatedAt']);
	});

	it('rejects an oversized bundle (400, size cap)', async () => {
		await asBeacon();
		const huge = [{ slug: 'big', title: 'Big', markdown: 'x'.repeat(600 * 1024) }];
		const res = await publish({ title: 'T', access: 'public', pages: huge });
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/too large/i);
	});

	it('unpublish kills the public link immediately and leaves no S3 bundle', async () => {
		await asBeacon();
		const pub = await publish({ title: 'Bye', access: 'public', pages: PAGES });
		const del = await call(event('DELETE /wiki'));
		expect(del.status).toBe(200);
		const gone = await call(event('GET /wikis/{wikiId}', { sub: null, params: { wikiId: pub.body.wikiId } }));
		expect(gone.status).toBe(404);
		expect((await call(event('GET /wiki'))).status).toBe(404);
		expect(store.objects.has(`wikis/${pub.body.wikiId}.json`)).toBe(false);
	});

	it('is tenant-isolated: another account has no wiki even after this one publishes', async () => {
		await asBeacon('owner-1');
		await publish({ title: 'Mine', access: 'public', pages: PAGES }, 'owner-1');
		const other = await call(event('GET /wiki', { sub: 'intruder-2' }));
		expect(other.status).toBe(404);
	});

	it('export + delete-account include and purge the published wiki', async () => {
		await asBeacon();
		const pub = await publish({ title: 'Exported', access: 'unlisted', pages: PAGES });
		const exp = await call(event('POST /account/export'));
		expect(exp.body.publishedWiki).toMatchObject({ wikiId: pub.body.wikiId, title: 'Exported' });

		await call(event('DELETE /account'));
		expect(store.objects.has(`wikis/${pub.body.wikiId}.json`)).toBe(false);
		expect([...store.items.keys()].some((k) => k.startsWith('wiki#'))).toBe(false);
	});
});

describe('account', () => {
	it('returns the profile mapped from Cognito and updates the display name', async () => {
		const prof = await call(event('GET /account/profile'));
		expect(prof.body).toEqual({ email: 'dm@example.com', displayName: 'Sam Rivers', createdAt: '2026-01-01T00:00:00.000Z' });

		const upd = await call(event('PUT /account/profile', { body: { displayName: 'Sam R.' } }));
		expect(upd.status).toBe(200);
		const cognitoCall = store.cognitoCalls.find((c) => c.name === 'AdminUpdateUserAttributes')!;
		expect(cognitoCall.input.UserAttributes).toEqual([{ Name: 'name', Value: 'Sam R.' }]);
		expect(cognitoCall.input.Username).toBe('user-1'); // from verified claims, not input
	});

	it('rejects an over-long display name (400)', async () => {
		const res = await call(event('PUT /account/profile', { body: { displayName: 'x'.repeat(61) } }));
		expect(res.status).toBe(400);
	});

	it('lists devices and revokes one device vs all sessions', async () => {
		const list = await call(event('GET /account/devices'));
		expect(list.body.devices).toEqual([{ deviceKey: 'dk-1', name: 'MacBook', lastSeen: '2026-07-01T00:00:00.000Z' }]);

		const one = await call(event('POST /account/devices/revoke', { body: { deviceKey: 'dk-1' } }));
		expect(one.body.revoked).toBe('device');
		expect(store.cognitoCalls.some((c) => c.name === 'AdminForgetDevice' && c.input.DeviceKey === 'dk-1')).toBe(true);

		const all = await call(event('POST /account/devices/revoke', { body: {} }));
		expect(all.body.revoked).toBe('all-sessions');
		expect(store.cognitoCalls.some((c) => c.name === 'AdminUserGlobalSignOut')).toBe(true);
	});

	it('exports the account data (profile + entitlement + invites + own listings, E2EE note)', async () => {
		await call(event('POST /account/entitlements', { body: { plan: 'beacon' } }));
		await call(event('POST /invites', { body: { campaignName: 'Camp' } }));
		await call(event('POST /marketplace/modules', { body: GOOD_MODULE }));
		await call(event('POST /marketplace/modules', { sub: 'someone-else', body: GOOD_MODULE }));

		const res = await call(event('POST /account/export'));
		expect(res.status).toBe(200);
		expect(res.body.profile.email).toBe('dm@example.com');
		expect(res.body.entitlement).toEqual({ plan: 'beacon', simulated: true });
		expect(res.body.invites).toHaveLength(1);
		expect(res.body.publishedModules).toHaveLength(1); // only the caller's own
		expect(res.body.note).toMatch(/end-to-end encrypted/i);
	});

	it('delete account signs out everywhere, purges rows + payloads, then deletes the user', async () => {
		await call(event('POST /account/entitlements', { body: { plan: 'lantern' } }));
		const inv = await call(event('POST /invites', { body: { campaignName: 'Camp' } }));
		await call(event('POST /marketplace/modules', { body: GOOD_MODULE }));

		const res = await call(event('DELETE /account'));
		expect(res.status).toBe(200);
		// every row owned by user-1 is gone (incl. the redeem row for their invite token)
		expect([...store.items.keys()].filter((k) => k.startsWith('account#user-1|'))).toHaveLength(0);
		expect(store.items.has(`invite#${inv.body.token}|redeem`)).toBe(false);
		expect(store.objects.size).toBe(0);
		const names = store.cognitoCalls.map((c) => c.name);
		expect(names.indexOf('AdminUserGlobalSignOut')).toBeLessThan(names.indexOf('AdminDeleteUser'));
	});
});
