// dndtools app-api — the application backend for account-scoped features that are NOT
// E2EE vault sync: plan entitlements (simulated checkout — no payment processor, every
// response is explicitly marked simulated), the marketplace (plaintext widget-package
// payloads, published for sharing), player invites (server-minted join links), and
// account/device management against the caller's OWN Cognito identity.
//
// Trust posture mirrors sync-api: the JWT authorizer guarantees a verified token and
// the Cognito `sub` namespaces every account-scoped key (tenant isolation); every
// Cognito Admin* call derives its username from the verified claims, never from input.
// The ONE unauthenticated route (`GET /invites/resolve/{token}`) treats its input as
// hostile: a strictly-shaped, high-entropy token lookup that answers 404 for anything
// absent/expired/malformed and never returns the inviter's sub (or anything else not
// meant for an anonymous invitee).
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
	CognitoIdentityProviderClient,
	AdminDeleteUserCommand,
	AdminForgetDeviceCommand,
	AdminGetUserCommand,
	AdminListDevicesCommand,
	AdminUpdateUserAttributesCommand,
	AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { putItem, getItem, deleteItem, queryPartition } from '../lib/aws.ts';
import { putJson, getJson, deleteObject } from '../lib/s3.ts';

const APP_TABLE = process.env.APP_TABLE!;
const MODULES_BUCKET = process.env.MODULES_BUCKET!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const nowIso = () => new Date().toISOString();
const nowSec = () => Math.floor(Date.now() / 1000);

// --- bounds (cost/DoS caps + honest field limits; mirror the client's form limits) -----
const MAX_MODULE_PACKAGE_BYTES = 256 * 1024; // marketplace payloads are widget-package JSON, small by design
const MAX_NAME_CHARS = 80;
const MAX_SUMMARY_CHARS = 400;
const MAX_DISPLAY_NAME_CHARS = 60;
const MAX_CAMPAIGN_NAME_CHARS = 80;
const MAX_NOTE_CHARS = 400;
const MAX_BROWSE_RESULTS = 100;
const INVITE_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,40})?$/;
// Invite tokens are 32 random bytes base64url (43 chars); accept a bounded shape only.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

// --- key layout (single table; see infra/app-api/template.yaml) ------------------------
const accountPk = (sub: string) => `account#${sub}`;
const SK_ENTITLEMENT = 'entitlement';
const SK_PROFILE = 'profile';
const inviteSk = (inviteId: string) => `invite#${inviteId}`;
const redeemPk = (token: string) => `invite#${token}`;
const SK_REDEEM = 'redeem';
const modulePk = (moduleId: string) => `module#${moduleId}`;
const SK_LISTING = 'listing';
const BROWSE_PK = 'modules'; // browse partition: one query lists every listing, no scan
const browseSk = (moduleId: string) => `listing#${moduleId}`;
const moduleS3Key = (moduleId: string) => `modules/${moduleId}.json`;

// --- plans + the feature matrix (server-side single source of truth) --------------------
// The client's Upgrade screen renders THIS matrix when the account backend is reachable;
// its local copy is only the offline fallback. Cells: true → included, false → not
// included, string → the plan's value for that row. `cloud` marks rows that need a paid
// cloud plan. Entitlements are SIMULATED (no payment processor); every entitlement
// response carries `simulated: true` so no surface can mistake this for real billing.
export type PlanId = 'hearth' | 'lantern' | 'beacon';
const PLAN_IDS: readonly PlanId[] = ['hearth', 'lantern', 'beacon'] as const;
const DEFAULT_PLAN: PlanId = 'hearth'; // the free tier — the fail-closed default
export type FeatureCell = boolean | string;
export interface FeatureRow {
	label: string;
	cloud?: boolean;
	hearth: FeatureCell;
	lantern: FeatureCell;
	beacon: FeatureCell;
}
export interface FeatureGroup {
	group: string;
	rows: FeatureRow[];
}
export const FEATURE_MATRIX: FeatureGroup[] = [
	{
		group: 'At the table',
		rows: [
			{ label: 'On-device vault', hearth: true, lantern: true, beacon: true },
			{ label: 'Core widgets, maps & fog', hearth: true, lantern: true, beacon: true },
			{ label: 'Players at the table', hearth: '4', lantern: '6', beacon: '12' },
			{ label: 'Co-DM seats', hearth: false, lantern: '1', beacon: '3' },
			{ label: 'Community modules (read-only)', hearth: true, lantern: true, beacon: true },
		],
	},
	{
		group: 'Cloud',
		rows: [
			{ label: 'Sync across devices', cloud: true, hearth: false, lantern: true, beacon: true },
			{ label: 'Off-device backup', cloud: true, hearth: false, lantern: true, beacon: true },
			{ label: 'Vault storage', cloud: true, hearth: '—', lantern: '20 GB', beacon: '200 GB' },
			{ label: 'Live audio projection', cloud: true, hearth: false, lantern: true, beacon: true },
		],
	},
	{
		group: 'Assist & publish',
		rows: [
			{ label: 'AI assist credits', cloud: true, hearth: false, lantern: '500 / mo', beacon: 'Unlimited' },
			{ label: 'Public campaign wikis', cloud: true, hearth: false, lantern: false, beacon: true },
			{ label: 'Priority sync & support', cloud: true, hearth: false, lantern: false, beacon: true },
		],
	},
];

/**
 * A client-caused validation failure whose message is SAFE to return. Everything NOT
 * wrapped in this (AWS SDK faults, unexpected errors) is logged server-side and answered
 * with a generic 500 — never echoing internal detail back to the caller.
 */
class BadRequest extends Error {}

function json(statusCode: number, body: unknown) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	};
}

/** Parse a JSON request body into a plain object (BadRequest on anything else). */
function parseBody(body: string | undefined): Record<string, unknown> {
	const parsed: unknown = JSON.parse(body ?? '{}');
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		throw new BadRequest('request body must be a JSON object');
	return parsed as Record<string, unknown>;
}

/** Require a non-empty, length-bounded string field. */
function requireString(value: unknown, field: string, maxChars: number): string {
	if (typeof value !== 'string' || !value.trim()) throw new BadRequest(`${field} is required`);
	const trimmed = value.trim();
	if (trimmed.length > maxChars) throw new BadRequest(`${field} must be at most ${maxChars} characters`);
	return trimmed;
}

/** Optional length-bounded string field ('' when absent). */
function optionalString(value: unknown, field: string, maxChars: number): string {
	if (value === undefined || value === null || value === '') return '';
	if (typeof value !== 'string') throw new BadRequest(`${field} must be a string`);
	const trimmed = value.trim();
	if (trimmed.length > maxChars) throw new BadRequest(`${field} must be at most ${maxChars} characters`);
	return trimmed;
}

interface Caller {
	sub: string;
	/** Cognito username for Admin* calls — from the VERIFIED token, never from input. */
	username: string;
	/** Display name from the token's standard `name` claim, if the user set one. */
	displayName: string;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	const routeKey = event.routeKey;
	try {
		// The single UNAUTHENTICATED route — handled before any claims are required.
		if (routeKey === 'GET /invites/resolve/{token}') {
			return await resolveInvite(event.pathParameters?.token);
		}

		// Everything else: the JWT authorizer guarantees verified claims; `sub` namespaces
		// every account-scoped key (tenant isolation).
		const claims = (
			event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
		).authorizer?.jwt?.claims;
		const sub = claims?.sub ? String(claims.sub) : '';
		if (!sub) return json(401, { error: 'unauthenticated' });
		const caller: Caller = {
			sub,
			username: claims?.['cognito:username'] ? String(claims['cognito:username']) : sub,
			displayName: typeof claims?.name === 'string' && claims.name.trim() ? claims.name.trim() : '',
		};

		switch (routeKey) {
			// Entitlements (simulated checkout) ------------------------------------------
			case 'GET /account/entitlements':
				return await getEntitlements(caller);
			case 'POST /account/entitlements':
				return await setEntitlements(caller, event.body);
			// Marketplace -----------------------------------------------------------------
			case 'GET /marketplace/modules':
				return await listModules(caller);
			case 'POST /marketplace/modules':
				return await publishModule(caller, event.body);
			case 'GET /marketplace/modules/{moduleId}':
				return await getModule(caller, event.pathParameters?.moduleId);
			case 'DELETE /marketplace/modules/{moduleId}':
				return await deleteModule(caller, event.pathParameters?.moduleId);
			// Invites ----------------------------------------------------------------------
			case 'POST /invites':
				return await createInvite(caller, event.body);
			case 'GET /invites':
				return await listInvites(caller);
			case 'DELETE /invites/{inviteId}':
				return await revokeInvite(caller, event.pathParameters?.inviteId);
			// Account ----------------------------------------------------------------------
			case 'GET /account/profile':
				return await getProfile(caller);
			case 'PUT /account/profile':
				return await updateProfile(caller, event.body);
			case 'GET /account/devices':
				return await listDevices(caller);
			case 'POST /account/devices/revoke':
				return await revokeDevices(caller, event.body);
			case 'POST /account/export':
				return await exportAccount(caller);
			case 'DELETE /account':
				return await deleteAccount(caller);
			default:
				return json(404, { error: `unknown route ${routeKey}` });
		}
	} catch (err) {
		// Client-caused validation failures carry a safe message; anything else is an
		// internal fault — log it (with context) and return a generic 500 so AWS SDK error
		// text (table/bucket/pool/request-id detail) never reaches the caller.
		if (err instanceof BadRequest) return json(400, { error: err.message });
		if (err instanceof SyntaxError) return json(400, { error: 'malformed request body' });
		console.error('app-api error', { routeKey, err });
		return json(500, { error: 'internal error' });
	}
};

// --- Entitlements: GET returns the stored plan (or the free default); POST is the -------
// --- SIMULATED plan change. Both always answer simulated:true + the feature matrix. -----
async function getEntitlements(caller: Caller) {
	const row = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_ENTITLEMENT });
	const plan = row && (PLAN_IDS as readonly string[]).includes(row.plan) ? (row.plan as PlanId) : DEFAULT_PLAN;
	return json(200, { plan, simulated: true, features: FEATURE_MATRIX });
}

async function setEntitlements(caller: Caller, body: string | undefined) {
	const { plan } = parseBody(body);
	if (typeof plan !== 'string' || !(PLAN_IDS as readonly string[]).includes(plan))
		throw new BadRequest(`plan must be one of: ${PLAN_IDS.join(', ')}`);
	await putItem(APP_TABLE, {
		pk: accountPk(caller.sub),
		sk: SK_ENTITLEMENT,
		plan,
		updatedAt: nowIso(),
	});
	return json(200, { plan, simulated: true, features: FEATURE_MATRIX });
}

// --- Marketplace: plaintext widget-package payloads in S3, listing rows in Dynamo. ------
// --- A listing lives in TWO rows: module#<id>|listing (direct get) and the shared -------
// --- modules|listing#<id> browse partition (scan-free list). ----------------------------
type ListingRow = Record<string, string>;

function listingResponse(row: ListingRow, callerSub: string) {
	return {
		moduleId: row.moduleId,
		name: row.name,
		summary: row.summary,
		version: row.version,
		publishedAt: row.publishedAt,
		contentHash: row.contentHash,
		size: Number(row.size),
		// Ownership as a per-caller boolean — the raw owner sub is never echoed to browsers.
		owned: row.ownerSub === callerSub,
	};
}

async function publishModule(caller: Caller, body: string | undefined) {
	const parsed = parseBody(body);
	const name = requireString(parsed.name, 'name', MAX_NAME_CHARS);
	const summary = requireString(parsed.summary, 'summary', MAX_SUMMARY_CHARS);
	const version = requireString(parsed.version, 'version', 40);
	if (!VERSION_RE.test(version)) throw new BadRequest('version must be semver (e.g. 1.2.0)');
	if (parsed.package === undefined || parsed.package === null) throw new BadRequest('package is required');
	const payloadJson = JSON.stringify(parsed.package);
	const size = Buffer.byteLength(payloadJson, 'utf8');
	if (size > MAX_MODULE_PACKAGE_BYTES) throw new BadRequest('module package too large (256 KiB max)');

	const moduleId = randomUUID();
	const contentHash = createHash('sha256').update(payloadJson).digest('hex');
	const listing = {
		moduleId,
		ownerSub: caller.sub,
		name,
		summary,
		version,
		publishedAt: nowIso(),
		contentHash,
		size,
	};
	await putJson(MODULES_BUCKET, moduleS3Key(moduleId), parsed.package);
	await putItem(APP_TABLE, { pk: modulePk(moduleId), sk: SK_LISTING, ...listing });
	await putItem(APP_TABLE, { pk: BROWSE_PK, sk: browseSk(moduleId), ...listing });
	return json(200, { moduleId });
}

async function listModules(caller: Caller) {
	const rows = await queryPartition(APP_TABLE, { name: 'pk', value: BROWSE_PK });
	const modules = rows.slice(0, MAX_BROWSE_RESULTS).map((row) => listingResponse(row, caller.sub));
	return json(200, { modules });
}

async function getModule(caller: Caller, rawModuleId: string | undefined) {
	if (!rawModuleId) throw new BadRequest('missing moduleId');
	const moduleId = decodeURIComponent(rawModuleId);
	const row = await getItem(APP_TABLE, { pk: modulePk(moduleId), sk: SK_LISTING });
	if (!row) return json(404, { error: 'module not found' });
	const pkg = await getJson(MODULES_BUCKET, moduleS3Key(moduleId));
	if (pkg === null) return json(404, { error: 'module payload missing' });
	return json(200, { ...listingResponse(row, caller.sub), package: pkg });
}

async function deleteModule(caller: Caller, rawModuleId: string | undefined) {
	if (!rawModuleId) throw new BadRequest('missing moduleId');
	const moduleId = decodeURIComponent(rawModuleId);
	const row = await getItem(APP_TABLE, { pk: modulePk(moduleId), sk: SK_LISTING });
	if (!row) return json(404, { error: 'module not found' });
	if (row.ownerSub !== caller.sub) return json(403, { error: 'not your module' });
	await deleteItem(APP_TABLE, { pk: modulePk(moduleId), sk: SK_LISTING });
	await deleteItem(APP_TABLE, { pk: BROWSE_PK, sk: browseSk(moduleId) });
	await deleteObject(MODULES_BUCKET, moduleS3Key(moduleId));
	return json(200, { ok: true });
}

// --- Invites: owner row (account#<sub>|invite#<id>) + redeem row (invite#<token>|redeem).
// --- Both carry the TTL `expiresAt` so DynamoDB reclaims them; reads still filter on it
// --- (TTL deletion is lazy). The redeem row holds ONLY what an anonymous invitee may see.
async function createInvite(caller: Caller, body: string | undefined) {
	const parsed = parseBody(body);
	const campaignName = requireString(parsed.campaignName, 'campaignName', MAX_CAMPAIGN_NAME_CHARS);
	const note = optionalString(parsed.note, 'note', MAX_NOTE_CHARS);
	// The seat the invite grants. Strict allowlist, fail closed to an ordinary `player` seat.
	const role = parsed.role === 'co-dm' ? 'co-dm' : 'player';
	const inviteId = randomUUID();
	const token = randomBytes(32).toString('base64url');
	const createdAt = nowIso();
	const expiresAt = nowSec() + INVITE_TTL_SECONDS;
	const invitedBy = caller.displayName || 'a GM';
	await putItem(APP_TABLE, {
		pk: accountPk(caller.sub),
		sk: inviteSk(inviteId),
		inviteId,
		token,
		campaignName,
		note,
		role,
		createdAt,
		expiresAt,
	});
	// The redeem row NEVER stores the owner's sub/email — resolve is unauthenticated.
	await putItem(APP_TABLE, {
		pk: redeemPk(token),
		sk: SK_REDEEM,
		inviteId,
		campaignName,
		note,
		role,
		invitedBy,
		createdAt,
		expiresAt,
	});
	return json(200, { inviteId, token, campaignName, note, role, createdAt, expiresAt });
}

async function listInvites(caller: Caller) {
	const rows = await queryPartition(
		APP_TABLE,
		{ name: 'pk', value: accountPk(caller.sub) },
		{ name: 'sk', lo: 'invite#', hi: 'invite#\uffff' },
	);
	const now = nowSec();
	const invites = rows
		.filter((row) => Number(row.expiresAt) > now)
		.map((row) => ({
			inviteId: row.inviteId,
			token: row.token, // the owner's own token — needed to re-show the join link
			campaignName: row.campaignName,
			note: row.note ?? '',
			role: row.role === 'co-dm' ? 'co-dm' : 'player', // default legacy rows to an ordinary seat
			createdAt: row.createdAt,
			expiresAt: Number(row.expiresAt),
		}));
	return json(200, { invites });
}

async function revokeInvite(caller: Caller, rawInviteId: string | undefined) {
	if (!rawInviteId) throw new BadRequest('missing inviteId');
	const inviteId = decodeURIComponent(rawInviteId);
	const row = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: inviteSk(inviteId) });
	if (!row) return json(404, { error: 'invite not found' });
	// Remove the redeem row FIRST — the join link must die even if the owner-row delete fails.
	if (row.token) await deleteItem(APP_TABLE, { pk: redeemPk(row.token), sk: SK_REDEEM });
	await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: inviteSk(inviteId) });
	return json(200, { ok: true });
}

/** UNAUTHENTICATED. Hostile input: strict token shape, 404 for absent/expired/malformed,
 *  and the response contains ONLY invitee-safe join metadata (never the owner's sub). */
async function resolveInvite(rawToken: string | undefined) {
	if (!rawToken) return json(404, { error: 'invite not found' });
	const token = decodeURIComponent(rawToken);
	if (!TOKEN_RE.test(token)) return json(404, { error: 'invite not found' });
	const row = await getItem(APP_TABLE, { pk: redeemPk(token), sk: SK_REDEEM });
	if (!row || Number(row.expiresAt) <= nowSec()) return json(404, { error: 'invite not found' });
	return json(200, {
		campaignName: row.campaignName,
		note: row.note ?? '',
		role: row.role === 'co-dm' ? 'co-dm' : 'player',
		invitedBy: row.invitedBy || 'a GM',
		expiresAt: Number(row.expiresAt),
	});
}

// --- Account: every Cognito Admin* call targets the CALLER's identity (username from ----
// --- verified claims). Nothing here accepts a username/sub from request input. ----------
function attrMap(attrs: { Name?: string; Value?: string }[] | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const a of attrs ?? []) if (a.Name && a.Value !== undefined) out[a.Name] = a.Value;
	return out;
}

async function fetchProfile(caller: Caller) {
	const res = await cognito.send(
		new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: caller.username }),
	);
	const attrs = attrMap(res.UserAttributes);
	return {
		email: attrs.email ?? '',
		displayName: attrs.name ?? '',
		createdAt: res.UserCreateDate ? res.UserCreateDate.toISOString() : '',
	};
}

async function getProfile(caller: Caller) {
	return json(200, await fetchProfile(caller));
}

async function updateProfile(caller: Caller, body: string | undefined) {
	const parsed = parseBody(body);
	// Only the standard `name` attribute is writable here — email/identity attributes have
	// their own verification flows and are NOT updatable through this surface.
	const displayName = requireString(parsed.displayName, 'displayName', MAX_DISPLAY_NAME_CHARS);
	await cognito.send(
		new AdminUpdateUserAttributesCommand({
			UserPoolId: USER_POOL_ID,
			Username: caller.username,
			UserAttributes: [{ Name: 'name', Value: displayName }],
		}),
	);
	return json(200, { ok: true, displayName });
}

async function listDevices(caller: Caller) {
	const res = await cognito.send(
		new AdminListDevicesCommand({ UserPoolId: USER_POOL_ID, Username: caller.username, Limit: 60 }),
	);
	const devices = (res.Devices ?? []).map((d) => {
		const attrs = attrMap(d.DeviceAttributes);
		return {
			deviceKey: d.DeviceKey ?? '',
			name: attrs.device_name ?? 'Unknown device',
			lastSeen: d.DeviceLastAuthenticatedDate ? d.DeviceLastAuthenticatedDate.toISOString() : '',
		};
	});
	return json(200, { devices });
}

async function revokeDevices(caller: Caller, body: string | undefined) {
	const parsed = parseBody(body);
	const deviceKey = optionalString(parsed.deviceKey, 'deviceKey', 200);
	if (deviceKey) {
		await cognito.send(
			new AdminForgetDeviceCommand({
				UserPoolId: USER_POOL_ID,
				Username: caller.username,
				DeviceKey: deviceKey,
			}),
		);
		return json(200, { ok: true, revoked: 'device' });
	}
	// No deviceKey → sign out everywhere (revokes every session's refresh tokens).
	await cognito.send(
		new AdminUserGlobalSignOutCommand({ UserPoolId: USER_POOL_ID, Username: caller.username }),
	);
	return json(200, { ok: true, revoked: 'all-sessions' });
}

/** Everything the app-api holds about the caller: profile, entitlement, invites, and
 *  published module LISTINGS. Vault content is NOT here by design — it lives in sync-api
 *  as end-to-end-encrypted ciphertext this service cannot read. */
async function gatherAccountData(caller: Caller) {
	const [entitlementRow, inviteRows, browseRows] = await Promise.all([
		getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_ENTITLEMENT }),
		queryPartition(
			APP_TABLE,
			{ name: 'pk', value: accountPk(caller.sub) },
			{ name: 'sk', lo: 'invite#', hi: 'invite#\uffff' },
		),
		queryPartition(APP_TABLE, { name: 'pk', value: BROWSE_PK }),
	]);
	return { entitlementRow, inviteRows, ownModules: browseRows.filter((r) => r.ownerSub === caller.sub) };
}

async function exportAccount(caller: Caller) {
	const [profile, data] = await Promise.all([fetchProfile(caller), gatherAccountData(caller)]);
	return json(200, {
		exportedAt: nowIso(),
		profile,
		entitlement: {
			plan:
				data.entitlementRow && (PLAN_IDS as readonly string[]).includes(data.entitlementRow.plan)
					? data.entitlementRow.plan
					: DEFAULT_PLAN,
			simulated: true,
		},
		invites: data.inviteRows.map((row) => ({
			inviteId: row.inviteId,
			campaignName: row.campaignName,
			note: row.note ?? '',
			createdAt: row.createdAt,
			expiresAt: Number(row.expiresAt),
		})),
		publishedModules: data.ownModules.map((row) => ({
			moduleId: row.moduleId,
			name: row.name,
			summary: row.summary,
			version: row.version,
			publishedAt: row.publishedAt,
		})),
		note: 'Vault content is not included: it is stored end-to-end encrypted in the sync service, which cannot read or export your plaintext. Use the in-app vault export for your campaign data.',
	});
}

async function deleteAccount(caller: Caller) {
	// 1. Kill every session first so nothing can race the deletion with a valid token.
	await cognito.send(
		new AdminUserGlobalSignOutCommand({ UserPoolId: USER_POOL_ID, Username: caller.username }),
	);
	// 2. Remove every app-api row the account owns (+ marketplace payloads in S3).
	const data = await gatherAccountData(caller);
	await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_ENTITLEMENT });
	await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_PROFILE });
	for (const row of data.inviteRows) {
		if (row.token) await deleteItem(APP_TABLE, { pk: redeemPk(row.token), sk: SK_REDEEM });
		await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: inviteSk(row.inviteId) });
	}
	for (const row of data.ownModules) {
		await deleteItem(APP_TABLE, { pk: modulePk(row.moduleId), sk: SK_LISTING });
		await deleteItem(APP_TABLE, { pk: BROWSE_PK, sk: browseSk(row.moduleId) });
		await deleteObject(MODULES_BUCKET, moduleS3Key(row.moduleId));
	}
	// 3. Delete the Cognito identity itself.
	await cognito.send(
		new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: caller.username }),
	);
	return json(200, { ok: true });
}
