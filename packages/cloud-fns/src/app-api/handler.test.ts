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
	// Invite-email delivery is configured by default so the send path is exercised; the
	// "not-configured" test deletes INVITE_SENDER at runtime (the handler reads it lazily).
	process.env.INVITE_SENDER = 'invites@dndtools.example';
	process.env.WEB_ORIGIN = 'https://app.example.test';
});

const store = vi.hoisted(() => {
	const items = new Map<string, Record<string, string>>(); // `${pk}|${sk}` -> row
	const objects = new Map<string, unknown>(); // s3 key -> value
	const cognitoCalls: { name: string; input: Record<string, unknown> }[] = [];
	const sesCalls: Record<string, unknown>[] = []; // SendEmail inputs
	const ses = { shouldThrow: false };
	return { items, objects, cognitoCalls, sesCalls, ses };
});

// SESv2 fake: records every SendEmail input and can be told to reject (unverified/sandbox).
vi.mock('@aws-sdk/client-sesv2', () => ({
	SESv2Client: class {
		async send(cmd: { input: Record<string, unknown> }) {
			store.sesCalls.push(cmd.input);
			if (store.ses.shouldThrow) {
				const err = new Error('rejected');
				err.name = 'MessageRejected';
				throw err;
			}
			return { MessageId: 'msg-1' };
		}
	},
	SendEmailCommand: class {
		constructor(public input: Record<string, unknown>) {}
	},
}));

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
	store.sesCalls.length = 0;
	store.ses.shouldThrow = false;
	// Restore the default email config (a test may delete it to simulate not-configured).
	process.env.INVITE_SENDER = 'invites@dndtools.example';
	process.env.WEB_ORIGIN = 'https://app.example.test';
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

	it('preserves an optional co-DM role field on both rows and echoes it back', async () => {
		const res = await call(
			event('POST /invites', { name: 'Sam the GM', body: { campaignName: 'Co-run', role: 'co-dm' } }),
		);
		expect(res.status).toBe(200);
		expect(res.body.role).toBe('co-dm');
		// round-trips through the owner list and the public resolve response
		const list = await call(event('GET /invites'));
		expect(list.body.invites[0].role).toBe('co-dm');
		const pub = await call(event('GET /invites/resolve/{token}', { sub: null, params: { token: res.body.token } }));
		expect(pub.body.role).toBe('co-dm');
	});
});

describe('invite email delivery (optional, fail-open)', () => {
	const mintWithEmail = (body: Record<string, unknown>) =>
		call(event('POST /invites', { name: 'Sam the GM', body: { campaignName: 'The Sunken Outpost', ...body } }));

	it('emails the invite via SES when a recipient is supplied — link carries the token', async () => {
		const res = await mintWithEmail({ email: 'player@example.com', note: 'Thursdays 7pm' });
		expect(res.status).toBe(200);
		expect(res.body.emailStatus).toBe('sent');
		expect(res.body.emailedTo).toBe('player@example.com');
		expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // invite still minted normally
		// SES was called once, from the configured sender, to the recipient, with the join link.
		expect(store.sesCalls).toHaveLength(1);
		const input = store.sesCalls[0] as {
			FromEmailAddress: string;
			Destination: { ToAddresses: string[] };
			Content: { Simple: { Body: { Text: { Data: string } } } };
		};
		expect(input.FromEmailAddress).toBe('invites@dndtools.example');
		expect(input.Destination.ToAddresses).toEqual(['player@example.com']);
		const bodyText = input.Content.Simple.Body.Text.Data;
		expect(bodyText).toContain(`https://app.example.test/#/join?token=${res.body.token}`);
	});

	it('link-only invite (no email) does not call SES and reports emailStatus none', async () => {
		const res = await mintWithEmail({});
		expect(res.body.emailStatus).toBe('none');
		expect(res.body.emailedTo).toBeUndefined();
		expect(store.sesCalls).toHaveLength(0);
	});

	it('SES failure is non-fatal: the invite is still returned with emailStatus failed', async () => {
		store.ses.shouldThrow = true;
		const res = await mintWithEmail({ email: 'player@example.com' });
		expect(res.status).toBe(200);
		expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // link + QR still work
		expect(res.body.emailStatus).toBe('failed');
		expect(res.body.emailedTo).toBeUndefined();
		// The minted invite is still queryable (mint never rolls back on a send failure).
		expect((await call(event('GET /invites'))).body.invites).toHaveLength(1);
	});

	it('unconfigured sender is non-fatal: mints the invite with emailStatus not-configured', async () => {
		delete process.env.INVITE_SENDER; // no verified sender wired into this deployment
		const res = await mintWithEmail({ email: 'player@example.com' });
		expect(res.status).toBe(200);
		expect(res.body.emailStatus).toBe('not-configured');
		expect(store.sesCalls).toHaveLength(0); // never touches SES without a sender
		expect(res.body.token).toBeTruthy();
	});

	it('rejects a malformed email BEFORE minting (400 — a DM typo, not a send failure)', async () => {
		const res = await mintWithEmail({ email: 'not-an-email' });
		expect(res.status).toBe(400);
		expect(store.sesCalls).toHaveLength(0);
		// nothing was minted — the DM can fix the typo and retry
		expect((await call(event('GET /invites'))).body.invites).toHaveLength(0);
	});

	it('rejects an over-long email (400, length bound)', async () => {
		const res = await mintWithEmail({ email: `${'a'.repeat(250)}@x.co` });
		expect(res.status).toBe(400);
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
