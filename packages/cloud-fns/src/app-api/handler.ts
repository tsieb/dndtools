// dndtools app-api — the application backend for account-scoped features that are NOT
// E2EE vault sync: plan entitlements (an explicit dev-only preview; production never
// accepts self-service simulated upgrades), the marketplace (plaintext widget-package
// payloads, published for sharing), player invites (server-minted join links), the
// public campaign wiki (player-safe published pages, readable without an account), and
// account/device management against the caller's OWN Cognito identity.
//
// Trust posture mirrors sync-api: the JWT authorizer guarantees a verified token and
// the Cognito `sub` namespaces every account-scoped key (tenant isolation); every
// Cognito Admin* call derives its username from the verified claims, never from input.
// The TWO unauthenticated routes (`GET /invites/resolve/{token}` and `GET
// /wikis/{wikiId}`) treat their input as hostile: strictly-shaped, high-entropy id
// lookups that answer 404 for anything absent/malformed and never return the owner's
// sub (or anything else not meant for an anonymous reader).
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import {
	QueryCommand,
	TransactWriteItemsCommand,
	type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import {
	CognitoIdentityProviderClient,
	AdminDeleteUserCommand,
	AdminForgetDeviceCommand,
	AdminGetUserCommand,
	AdminListDevicesCommand,
	AdminUpdateUserAttributesCommand,
	AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
	ddb,
	toItem,
	fromItem,
	putItemConditional,
	getItem,
	deleteItem,
	queryPartition,
	incrementCounterBelow,
	transactWrite,
} from '../lib/aws.ts';
import {
	putJsonVersioned,
	getJsonVersioned,
	deleteObject,
	deleteObjectVersion,
} from '../lib/s3.ts';

const APP_TABLE = process.env.APP_TABLE!;
const SYNC_OPS_TABLE = process.env.SYNC_OPS_TABLE!;
const MODULES_BUCKET = process.env.MODULES_BUCKET!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const ses = new SESv2Client({ region: process.env.AWS_REGION });

const nowIso = () => new Date().toISOString();
const nowSec = () => Math.floor(Date.now() / 1000);

// --- bounds (cost/DoS caps + honest field limits; mirror the client's form limits) -----
const MAX_MODULE_PACKAGE_BYTES = 256 * 1024; // marketplace payloads are widget-package JSON, small by design
const MAX_NAME_CHARS = 80;
const MAX_SUMMARY_CHARS = 400;
const MAX_DISPLAY_NAME_CHARS = 60;
const MAX_CAMPAIGN_NAME_CHARS = 80;
const MAX_NOTE_CHARS = 400;
const MAX_EMAIL_CHARS = 254; // RFC 5321 max address length — a cheap DoS bound before validation
const MAX_BROWSE_RESULTS = 100;
const MAX_ACTIVE_MODULES_PER_ACCOUNT = 50;
const MAX_ACTIVE_INVITES_PER_ACCOUNT = 50;
const MODULE_PUBLISHES_PER_DAY = 25;
const INVITES_CREATED_PER_DAY = 50;
const WIKI_PUBLISHES_PER_DAY = 20;
const INVITE_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const DELETION_MARKER_TTL_SECONDS = 45 * 24 * 60 * 60;
const PUBLISH_BUDGET_WINDOW_SECONDS = 24 * 60 * 60;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,40})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Invite tokens are 32 random bytes base64url (43 chars); accept a bounded shape only.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
// --- campaign wiki bounds (player-safe markdown pages; text by design, small on purpose) -
const MAX_WIKI_TITLE_CHARS = 120;
const MAX_WIKI_PAGES = 400;
const MAX_WIKI_PAGE_TITLE_CHARS = 160;
const MAX_WIKI_BUNDLE_BYTES = 512 * 1024; // the whole sanitized page bundle, as JSON
const WIKI_ACCESS_MODES = ['public', 'unlisted', 'password'] as const;
type WikiAccess = (typeof WIKI_ACCESS_MODES)[number];
const MIN_WIKI_PASSWORD_CHARS = 6;
const MAX_WIKI_PASSWORD_CHARS = 100;
// Wiki ids are 9 random bytes base64url (12 chars) minted once per account; the public
// read route accepts a bounded shape only (unlisted wikis rely on this entropy).
const WIKI_ID_RE = /^[A-Za-z0-9_-]{8,32}$/;
// Page slugs are client-derived from titles but re-validated here: lowercase kebab only.
const WIKI_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
// Deliberately conservative address shape: exactly one @, non-empty local + dotted host,
// no whitespace. Real deliverability is decided by SES, not this regex — this only rejects
// obvious garbage before we ever hand an address to SES.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WIKI_PASSWORD_FAILURE_LIMIT = 5;
const WIKI_PASSWORD_WINDOW_SECONDS = 15 * 60;

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
const ownedModuleSk = (moduleId: string) => `module#${moduleId}`;
const moduleS3Key = (moduleId: string) => `modules/${moduleId}.json`;
const SK_WIKI = 'wiki'; // owner's wiki row under account#<sub> — ONE wiki per account
const SYNC_USAGE_SK = 'usage#quota';
const primaryVaultPk = (sub: string) => `${sub}#primary`;
const wikiPk = (wikiId: string) => `wiki#${wikiId}`;
const SK_SITE = 'site'; // public wikiId → site lookup (mirrors the invite redeem row)
const wikiS3Key = (wikiId: string) => `wikis/${wikiId}.json`;

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
			{ label: 'Co-DM seats', hearth: false, lantern: '1', beacon: '3' },
			{ label: 'Manual & nearby-device play', hearth: true, lantern: true, beacon: true },
			{ label: 'Bring-your-own AI assistant', hearth: true, lantern: true, beacon: true },
		],
	},
	{
		group: 'Cloud',
		rows: [
			{
				label: 'Encrypted off-device backup',
				cloud: true,
				hearth: false,
				lantern: true,
				beacon: true,
			},
			{
				label: 'Manual restore with the same vault key',
				cloud: true,
				hearth: false,
				lantern: true,
				beacon: true,
			},
			{ label: 'Internet remote play', cloud: true, hearth: false, lantern: true, beacon: true },
		],
	},
	{
		group: 'Community & publish',
		rows: [
			{ label: 'Browse community modules', hearth: true, lantern: true, beacon: true },
			{ label: 'Publish community modules', hearth: true, lantern: true, beacon: true },
			{ label: 'Public campaign wikis', cloud: true, hearth: false, lantern: false, beacon: true },
		],
	},
];

/**
 * A client-caused validation failure whose message is SAFE to return. Everything NOT
 * wrapped in this (AWS SDK faults, unexpected errors) is logged server-side and answered
 * with a generic 500 — never echoing internal detail back to the caller.
 */
class BadRequest extends Error {}
class Forbidden extends Error {}

class TooManyRequests extends Error {
	constructor(
		message: string,
		readonly retryAfterSeconds: number,
	) {
		super(message);
	}
}

class AccountDeleted extends Error {}

function json(statusCode: number, body: unknown, headers: Record<string, string> = {}) {
	return {
		statusCode,
		headers: { 'content-type': 'application/json', ...headers },
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
	if (trimmed.length > maxChars)
		throw new BadRequest(`${field} must be at most ${maxChars} characters`);
	return trimmed;
}

/** Optional length-bounded string field ('' when absent). */
function optionalString(value: unknown, field: string, maxChars: number): string {
	if (value === undefined || value === null || value === '') return '';
	if (typeof value !== 'string') throw new BadRequest(`${field} must be a string`);
	const trimmed = value.trim();
	if (trimmed.length > maxChars)
		throw new BadRequest(`${field} must be at most ${maxChars} characters`);
	return trimmed;
}

function decodePathId(raw: string, field: string, pattern: RegExp): string {
	let decoded: string;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		throw new BadRequest(`${field} has invalid encoding`);
	}
	if (!pattern.test(decoded)) throw new BadRequest(`${field} has an invalid format`);
	return decoded;
}

interface Caller {
	sub: string;
	/** Cognito username for Admin* calls — from the VERIFIED token, never from input. */
	username: string;
	/** Display name from the token's standard `name` claim, if the user set one. */
	displayName: string;
}

type AccountTransactionWrite =
	| { put: Record<string, string | number | undefined> }
	| { delete: Record<string, string> };

/**
 * Atomically gate a public/account-owned write on the account-deletion tombstone.
 * The request-level read is useful for a quick 410, but only this transaction closes
 * the race where DELETE /account starts while a module/wiki/invite publish is in flight.
 */
async function transactWhileAccountActive(
	caller: Caller,
	writes: readonly AccountTransactionWrite[],
): Promise<void> {
	if (writes.length < 1 || writes.length > 99) throw new Error('invalid account transaction size');
	try {
		await ddb.send(
			new TransactWriteItemsCommand({
				ClientRequestToken: randomUUID(),
				TransactItems: [
					{
						ConditionCheck: {
							TableName: APP_TABLE,
							Key: toItem({ pk: accountPk(caller.sub), sk: SK_ENTITLEMENT }),
							ConditionExpression: 'attribute_not_exists(#deletedAt)',
							ExpressionAttributeNames: { '#deletedAt': 'deletedAt' },
						},
					},
					...writes.map((write) =>
						'put' in write
							? { Put: { TableName: APP_TABLE, Item: toItem(write.put) } }
							: { Delete: { TableName: APP_TABLE, Key: toItem(write.delete) } },
					),
				],
			}),
		);
	} catch (error) {
		// A canceled transaction can omit cancellation reasons in local/test-compatible
		// services. A strong read is the authoritative classification and also handles a
		// deletion that won concurrently with an unrelated service/transport failure.
		const accountState = await getItem(
			APP_TABLE,
			{ pk: accountPk(caller.sub), sk: SK_ENTITLEMENT },
			true,
		);
		if (accountState?.deletedAt) throw new AccountDeleted();
		throw error;
	}
}

/** Strong, fully paginated account-partition read used before irreversible deletion. */
async function queryAccountRowsStrong(sub: string): Promise<Record<string, string>[]> {
	const rows: Record<string, string>[] = [];
	let exclusiveStartKey: Record<string, AttributeValue> | undefined;
	do {
		const response = await ddb.send(
			new QueryCommand({
				TableName: APP_TABLE,
				KeyConditionExpression: '#pk = :pk',
				ExpressionAttributeNames: { '#pk': 'pk' },
				ExpressionAttributeValues: toItem({ ':pk': accountPk(sub) }),
				ConsistentRead: true,
				ExclusiveStartKey: exclusiveStartKey,
			}),
		);
		rows.push(
			...(response.Items ?? [])
				.map(fromItem)
				.filter((row): row is Record<string, string> => Boolean(row)),
		);
		exclusiveStartKey = response.LastEvaluatedKey;
	} while (exclusiveStartKey);
	return rows;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	const routeKey = event.routeKey;
	try {
		// The UNAUTHENTICATED routes — handled before any claims are required.
		if (routeKey === 'GET /invites/resolve/{token}') {
			return await resolveInvite(event.pathParameters?.token);
		}
		if (routeKey === 'GET /wikis/{wikiId}') {
			return await readWiki(
				event.pathParameters?.wikiId,
				event.headers?.['x-wiki-password'],
				event.requestContext.http.sourceIp || 'unknown',
			);
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
		// Account deletion keeps a marker in the entitlement row for 45 days after cleanup. Cognito
		// sign-out revokes refresh tokens but cannot revoke an already-issued ID token, so every
		// protected request checks this marker before it can recreate account-scoped state. Keep
		// DELETE retryable so an interrupted deletion can finish its cleanup.
		const accountState = await getItem(
			APP_TABLE,
			{ pk: accountPk(caller.sub), sk: SK_ENTITLEMENT },
			true,
		);
		if (accountState?.deletedAt && routeKey !== 'DELETE /account') throw new AccountDeleted();

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
			// Campaign wiki ----------------------------------------------------------------
			case 'GET /wiki':
				return await getOwnWiki(caller);
			case 'PUT /wiki':
				return await publishWiki(caller, event.body);
			case 'DELETE /wiki':
				return await unpublishWiki(caller);
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
		if (err instanceof Forbidden) return json(403, { error: err.message });
		if (err instanceof AccountDeleted) return json(410, { error: 'account has been deleted' });
		if (err instanceof TooManyRequests) {
			return json(429, { error: err.message }, { 'retry-after': String(err.retryAfterSeconds) });
		}
		if (err instanceof SyntaxError) return json(400, { error: 'malformed request body' });
		console.error('app-api error', { routeKey, err });
		return json(500, { error: 'internal error' });
	}
};

type PublishBudgetKind = 'module' | 'invite' | 'wiki';

/**
 * Per-account durable-write budget. API Gateway throttling bounds bursts; this
 * fixed-window budget bounds lasting S3/DynamoDB growth and invite-email abuse over
 * time. Atomic counters prevent concurrent requests from bypassing the limit; rows expire automatically.
 */
async function consumePublishBudget(
	caller: Caller,
	kind: PublishBudgetKind,
	limit: number,
): Promise<Record<string, string>> {
	const now = nowSec();
	const windowStart =
		Math.floor(now / PUBLISH_BUDGET_WINDOW_SECONDS) * PUBLISH_BUDGET_WINDOW_SECONDS;
	const windowEnd = windowStart + PUBLISH_BUDGET_WINDOW_SECONDS;
	const key = { pk: accountPk(caller.sub), sk: `budget#${kind}#${windowStart}` };
	const allowed = await incrementCounterBelow(
		APP_TABLE,
		key,
		limit,
		windowEnd + PUBLISH_BUDGET_WINDOW_SECONDS,
	);
	if (!allowed) {
		throw new TooManyRequests(
			`Daily ${kind} publishing limit reached. Try again later.`,
			Math.max(1, windowEnd - now),
		);
	}
	return key;
}

// --- Entitlements: GET returns the stored plan (or free default). Self-service ---------
// --- simulated plan changes are explicitly enabled only in non-production previews. ----
function entitlementPreviewEnabled(): boolean {
	return process.env.ENTITLEMENT_PREVIEW_ENABLED === 'true';
}

function entitlementResponse(plan: PlanId) {
	const canChangePlan = entitlementPreviewEnabled();
	return { plan, simulated: canChangePlan, canChangePlan, features: FEATURE_MATRIX };
}

/** The caller's stored plan, failing CLOSED to the free default. */
async function currentPlan(caller: Caller): Promise<PlanId> {
	try {
		const row = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_ENTITLEMENT });
		return row && !row.deletedAt && (PLAN_IDS as readonly string[]).includes(row.plan)
			? (row.plan as PlanId)
			: DEFAULT_PLAN;
	} catch (err) {
		// Entitlement availability must never grant paid capabilities. The request-level
		// account-state check still fails the whole request on a DynamoDB outage; this fallback
		// protects direct/internal plan reads from ever failing open.
		console.error('entitlement read failed closed', { sub: caller.sub.slice(0, 8), err });
		return DEFAULT_PLAN;
	}
}

async function getEntitlements(caller: Caller) {
	const plan = await currentPlan(caller);
	return json(200, entitlementResponse(plan as PlanId));
}

async function setEntitlements(caller: Caller, body: string | undefined) {
	if (!entitlementPreviewEnabled()) {
		throw new Forbidden(
			'Self-service cloud plan changes are not available in this release. No plan was changed.',
		);
	}
	const { plan } = parseBody(body);
	if (typeof plan !== 'string' || !(PLAN_IDS as readonly string[]).includes(plan))
		throw new BadRequest(`plan must be one of: ${PLAN_IDS.join(', ')}`);
	const written = await putItemConditional(
		APP_TABLE,
		{
			pk: accountPk(caller.sub),
			sk: SK_ENTITLEMENT,
			plan,
			updatedAt: nowIso(),
		},
		{
			expression: 'attribute_not_exists(#deletedAt)',
			names: { '#deletedAt': 'deletedAt' },
		},
	);
	if (!written) throw new AccountDeleted();
	return json(200, entitlementResponse(plan as PlanId));
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
	if (parsed.package === undefined || parsed.package === null)
		throw new BadRequest('package is required');
	const payloadJson = JSON.stringify(parsed.package);
	const size = Buffer.byteLength(payloadJson, 'utf8');
	if (size > MAX_MODULE_PACKAGE_BYTES)
		throw new BadRequest('module package too large (256 KiB max)');
	const activeRows = await queryPartition(
		APP_TABLE,
		{ name: 'pk', value: accountPk(caller.sub) },
		{ name: 'sk', lo: 'module#', hi: 'module#\uffff' },
		MAX_ACTIVE_MODULES_PER_ACCOUNT + 1,
		MAX_ACTIVE_MODULES_PER_ACCOUNT + 1,
	);
	if (activeRows.length >= MAX_ACTIVE_MODULES_PER_ACCOUNT) {
		throw new TooManyRequests(
			`An account can publish at most ${MAX_ACTIVE_MODULES_PER_ACCOUNT} active modules. Remove one before publishing another.`,
			3600,
		);
	}
	const publishBudgetKey = await consumePublishBudget(caller, 'module', MODULE_PUBLISHES_PER_DAY);

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
	const s3VersionId = await putJsonVersioned(MODULES_BUCKET, moduleS3Key(moduleId), parsed.package);
	try {
		await transactWhileAccountActive(caller, [
			{ put: { pk: modulePk(moduleId), sk: SK_LISTING, ...listing, s3VersionId } },
			{ put: { pk: BROWSE_PK, sk: browseSk(moduleId), ...listing, s3VersionId } },
			{
				put: { pk: accountPk(caller.sub), sk: ownedModuleSk(moduleId), ...listing, s3VersionId },
			},
		]);
	} catch (error) {
		// A transport error may arrive after DynamoDB committed. Strongly verify all three
		// transaction rows before deciding the new S3 version is unreferenced and safe to delete.
		const rows = await Promise.all([
			getItem(APP_TABLE, { pk: modulePk(moduleId), sk: SK_LISTING }, true),
			getItem(APP_TABLE, { pk: BROWSE_PK, sk: browseSk(moduleId) }, true),
			getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: ownedModuleSk(moduleId) }, true),
		]);
		const references = rows.filter((row) => row?.s3VersionId === s3VersionId).length;
		if (references === rows.length) return json(200, { moduleId });
		if (references === 0) {
			await deleteObjectVersion(MODULES_BUCKET, moduleS3Key(moduleId), s3VersionId);
		}
		if (error instanceof AccountDeleted) await deleteItem(APP_TABLE, publishBudgetKey);
		throw error;
	}
	return json(200, { moduleId });
}

async function listModules(caller: Caller) {
	const rows = await queryPartition(
		APP_TABLE,
		{ name: 'pk', value: BROWSE_PK },
		undefined,
		MAX_BROWSE_RESULTS,
		MAX_BROWSE_RESULTS,
	);
	const modules = rows.map((row) => listingResponse(row, caller.sub));
	return json(200, { modules });
}

async function getModule(caller: Caller, rawModuleId: string | undefined) {
	if (!rawModuleId) throw new BadRequest('missing moduleId');
	const moduleId = decodePathId(rawModuleId, 'moduleId', UUID_RE);
	const row = await getItem(APP_TABLE, { pk: modulePk(moduleId), sk: SK_LISTING });
	if (!row) return json(404, { error: 'module not found' });
	const pkg = await getJsonVersioned(
		MODULES_BUCKET,
		moduleS3Key(moduleId),
		row.s3VersionId || undefined,
	);
	if (pkg === null) return json(404, { error: 'module payload missing' });
	return json(200, { ...listingResponse(row, caller.sub), package: pkg });
}

async function deleteModule(caller: Caller, rawModuleId: string | undefined) {
	if (!rawModuleId) throw new BadRequest('missing moduleId');
	const moduleId = decodePathId(rawModuleId, 'moduleId', UUID_RE);
	const row = await getItem(APP_TABLE, { pk: modulePk(moduleId), sk: SK_LISTING });
	if (!row) return json(404, { error: 'module not found' });
	if (row.ownerSub !== caller.sub) return json(403, { error: 'not your module' });
	await transactWrite(APP_TABLE, [
		{ delete: { pk: modulePk(moduleId), sk: SK_LISTING } },
		{ delete: { pk: BROWSE_PK, sk: browseSk(moduleId) } },
		{ delete: { pk: accountPk(caller.sub), sk: ownedModuleSk(moduleId) } },
	]);
	if (row.s3VersionId) {
		await deleteObjectVersion(MODULES_BUCKET, moduleS3Key(moduleId), row.s3VersionId);
	} else {
		await deleteObject(MODULES_BUCKET, moduleS3Key(moduleId));
	}
	return json(200, { ok: true });
}

// --- Campaign wiki: ONE wiki per account. Owner row (account#<sub>|wiki) carries the ----
// --- stable wikiId; site row (wiki#<id>|site) is the public lookup (mirrors the invite --
// --- redeem-row pattern); the sanitized page bundle lives in S3 under wikis/<id>.json. --
// --- Publishing is gated on the Beacon plan (the feature matrix's "Public campaign ------
// --- wikis" row — SIMULATED entitlements, but the gate is honest either way). Content ---
// --- is validated to STRICT text-only shapes here; the reader renders markdown as -------
// --- React text nodes (never innerHTML), so hosted content cannot script readers. -------
interface WikiPage {
	slug: string;
	title: string;
	markdown: string;
	updatedAt: string;
}

function wikiStatusResponse(row: Record<string, string>) {
	return {
		wikiId: row.wikiId,
		title: row.title,
		access: row.access,
		pageCount: Number(row.pageCount),
		size: Number(row.size),
		publishedAt: row.publishedAt,
		updatedAt: row.updatedAt,
	};
}

/** Salted scrypt hash for password-protected wikis (hex `salt:hash`). */
function hashWikiPassword(password: string, saltHex?: string): string {
	const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
	const hash = scryptSync(password, salt, 32);
	return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Constant-time check of a presented password against a stored `salt:hash`. */
function wikiPasswordMatches(presented: string, stored: string): boolean {
	const [saltHex, hashHex] = stored.split(':');
	if (!saltHex || !hashHex) return false;
	const recomputed = hashWikiPassword(presented, saltHex).split(':')[1];
	const a = Buffer.from(recomputed, 'hex');
	const b = Buffer.from(hashHex, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}

/** Validate + rebuild the page list so ONLY the known text fields ever persist. */
function sanitizeWikiPages(value: unknown): WikiPage[] {
	if (!Array.isArray(value) || value.length === 0)
		throw new BadRequest('pages must be a non-empty array');
	if (value.length > MAX_WIKI_PAGES)
		throw new BadRequest(`a wiki can hold at most ${MAX_WIKI_PAGES} pages`);
	const seen = new Set<string>();
	return value.map((raw, i) => {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw))
			throw new BadRequest(`pages[${i}] must be an object`);
		const page = raw as Record<string, unknown>;
		const slug = requireString(page.slug, `pages[${i}].slug`, 120);
		if (!WIKI_SLUG_RE.test(slug))
			throw new BadRequest(`pages[${i}].slug must be lowercase kebab-case`);
		if (seen.has(slug)) throw new BadRequest(`pages[${i}].slug is duplicated (${slug})`);
		seen.add(slug);
		const title = requireString(page.title, `pages[${i}].title`, MAX_WIKI_PAGE_TITLE_CHARS);
		if (typeof page.markdown !== 'string')
			throw new BadRequest(`pages[${i}].markdown must be a string`);
		const updatedAt = optionalString(page.updatedAt, `pages[${i}].updatedAt`, 40);
		return { slug, title, markdown: page.markdown, updatedAt };
	});
}

async function publishWiki(caller: Caller, body: string | undefined) {
	// Plan gate FIRST (the feature matrix's "Public campaign wikis" row is Beacon-only).
	if ((await currentPlan(caller)) !== 'beacon') {
		return json(403, {
			error: entitlementPreviewEnabled()
				? 'Publishing a campaign wiki needs the Beacon plan. You can enable the Beacon preview from Plans & cloud.'
				: 'Publishing a campaign wiki needs the Beacon plan. Self-service cloud plan changes are not available in this release.',
		});
	}
	const publishBudgetKey = await consumePublishBudget(caller, 'wiki', WIKI_PUBLISHES_PER_DAY);
	const parsed = parseBody(body);
	const title = requireString(parsed.title, 'title', MAX_WIKI_TITLE_CHARS);
	const access = typeof parsed.access === 'string' ? parsed.access : '';
	if (!(WIKI_ACCESS_MODES as readonly string[]).includes(access))
		throw new BadRequest(`access must be one of: ${WIKI_ACCESS_MODES.join(', ')}`);
	let passwordHash = '';
	if (access === 'password') {
		const password = requireString(parsed.password, 'password', MAX_WIKI_PASSWORD_CHARS);
		if (password.length < MIN_WIKI_PASSWORD_CHARS)
			throw new BadRequest(`password must be at least ${MIN_WIKI_PASSWORD_CHARS} characters`);
		passwordHash = hashWikiPassword(password);
	}
	const pages = sanitizeWikiPages(parsed.pages);
	const bundle = { title, pages };
	const bundleJson = JSON.stringify(bundle);
	const size = Buffer.byteLength(bundleJson, 'utf8');
	if (size > MAX_WIKI_BUNDLE_BYTES) throw new BadRequest('wiki bundle too large (512 KiB max)');

	// Re-publish keeps the stable wikiId (readers' bookmarks survive) and the first publishedAt.
	const existing = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI }, true);
	if (existing?.retiredS3VersionId && existing.wikiId) {
		await deleteObjectVersion(
			MODULES_BUCKET,
			wikiS3Key(existing.wikiId),
			existing.retiredS3VersionId,
		);
	}
	const wikiId = existing?.wikiId ?? randomBytes(9).toString('base64url');
	const publishedAt = existing?.publishedAt ?? nowIso();
	const updatedAt = nowIso();
	const status = {
		wikiId,
		title,
		access: access as WikiAccess,
		pageCount: pages.length,
		size,
		publishedAt,
		updatedAt,
	};
	const s3VersionId = await putJsonVersioned(MODULES_BUCKET, wikiS3Key(wikiId), bundle);
	// The site row is the PUBLIC lookup. PutItem REPLACES the row, so switching away from
	// password mode drops the old hash. `ownerSub` stays server-side (never echoed to readers).
	const retiredS3VersionId = existing?.s3VersionId;
	try {
		await transactWhileAccountActive(caller, [
			{
				put: {
					pk: accountPk(caller.sub),
					sk: SK_WIKI,
					...status,
					s3VersionId,
					retiredS3VersionId,
				},
			},
			{
				put: {
					pk: wikiPk(wikiId),
					sk: SK_SITE,
					ownerSub: caller.sub,
					...status,
					s3VersionId,
					retiredS3VersionId,
					...(passwordHash ? { passwordHash } : {}),
				},
			},
		]);
	} catch (error) {
		const rows = await Promise.all([
			getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI }, true),
			getItem(APP_TABLE, { pk: wikiPk(wikiId), sk: SK_SITE }, true),
		]);
		const references = rows.filter((row) => row?.s3VersionId === s3VersionId).length;
		if (references === 0) {
			await deleteObjectVersion(MODULES_BUCKET, wikiS3Key(wikiId), s3VersionId);
			if (error instanceof AccountDeleted) await deleteItem(APP_TABLE, publishBudgetKey);
			throw error;
		}
		if (references !== rows.length) throw error;
		// All transaction rows reference the new version: the response was ambiguous,
		// but the publish committed. Continue with superseded-version cleanup.
	}
	if (retiredS3VersionId) {
		await deleteObjectVersion(MODULES_BUCKET, wikiS3Key(wikiId), retiredS3VersionId);
	}
	return json(200, status);
}

async function getOwnWiki(caller: Caller) {
	const row = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI });
	if (!row) return json(404, { error: 'no published wiki' });
	return json(200, wikiStatusResponse(row));
}

async function unpublishWiki(caller: Caller) {
	const row = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI });
	if (!row) return json(404, { error: 'no published wiki' });
	// Remove the public surface FIRST — readers must lose access even if later deletes fail.
	if (row.wikiId) {
		await deleteItem(APP_TABLE, { pk: wikiPk(row.wikiId), sk: SK_SITE });
		if (row.s3VersionId) {
			await deleteObjectVersion(MODULES_BUCKET, wikiS3Key(row.wikiId), row.s3VersionId);
		} else {
			await deleteObject(MODULES_BUCKET, wikiS3Key(row.wikiId));
		}
	}
	await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI });
	return json(200, { ok: true });
}

/** UNAUTHENTICATED. Hostile input: strict id shape, 404 for absent/malformed, a 401 with
 *  no content for password-protected wikis, and the response never carries the owner's sub. */
async function readWiki(
	rawWikiId: string | undefined,
	presentedPassword: string | undefined,
	sourceIp: string,
) {
	if (!rawWikiId) return json(404, { error: 'wiki not found' });
	let wikiId: string;
	try {
		wikiId = decodeURIComponent(rawWikiId);
	} catch {
		return json(404, { error: 'wiki not found' });
	}
	if (!WIKI_ID_RE.test(wikiId)) return json(404, { error: 'wiki not found' });
	const row = await getItem(APP_TABLE, { pk: wikiPk(wikiId), sk: SK_SITE });
	if (!row) return json(404, { error: 'wiki not found' });
	if (row.passwordHash) {
		// Key attempts by a one-way hash of wiki + API-Gateway source IP. The raw address is neither
		// persisted nor logged. The atomic fixed-window counter is consumed BEFORE synchronous scrypt,
		// so concurrent requests cannot race around the CPU-abuse/password-guessing limit.
		const sourceKey = createHash('sha256').update(`${wikiId}\0${sourceIp}`).digest('hex');
		const now = nowSec();
		const windowStart =
			Math.floor(now / WIKI_PASSWORD_WINDOW_SECONDS) * WIKI_PASSWORD_WINDOW_SECONDS;
		const windowEnd = windowStart + WIKI_PASSWORD_WINDOW_SECONDS;
		const attemptKey = {
			pk: `wiki-password-attempt#${sourceKey}`,
			sk: `window#${windowStart}`,
		};
		const allowed = await incrementCounterBelow(
			APP_TABLE,
			attemptKey,
			WIKI_PASSWORD_FAILURE_LIMIT,
			windowEnd + WIKI_PASSWORD_WINDOW_SECONDS,
		);
		if (!allowed)
			throw new TooManyRequests(
				'Too many password attempts. Try again later.',
				Math.max(1, windowEnd - now),
			);
		const presented = typeof presentedPassword === 'string' ? presentedPassword : '';
		if (
			!presented ||
			presented.length > MAX_WIKI_PASSWORD_CHARS ||
			!wikiPasswordMatches(presented, row.passwordHash)
		) {
			return json(401, { error: 'password required', passwordProtected: true });
		}
		// A correct password clears this caller's current-window failures.
		await deleteItem(APP_TABLE, attemptKey);
	}
	const bundle = await getJsonVersioned<{ title?: unknown; pages?: unknown }>(
		MODULES_BUCKET,
		wikiS3Key(wikiId),
		row.s3VersionId || undefined,
	);
	if (bundle === null) return json(404, { error: 'wiki not found' });
	return json(200, {
		wikiId,
		title: row.title,
		access: row.access,
		publishedAt: row.publishedAt,
		updatedAt: row.updatedAt,
		pageCount: Number(row.pageCount),
		pages: Array.isArray(bundle.pages) ? bundle.pages : [],
	});
}

// --- Invite email delivery (optional, fail-open) ---------------------------------------
// `none` — the DM did not ask to email it. `sent` — SES accepted the message. `not-configured`
// — no verified sender is wired into this stack (INVITE_SENDER/WEB_ORIGIN unset), so nothing
// was sent. `failed` — SES rejected (unverified/sandbox/throttled). Every non-`sent` status is
// non-fatal: the invite (link + QR) is minted regardless, and the client shows the honest
// fallback. The join link in the email is built from the stack's OWN WEB_ORIGIN, never from
// caller input, so a verified sender can never be coerced into mailing an attacker's URL.
type InviteEmailStatus = 'none' | 'sent' | 'not-configured' | 'failed';

/** The web join link an invite token redeems at — must mirror the client's inviteJoinUrl(). */
const inviteJoinUrl = (webOrigin: string, token: string) =>
	`${webOrigin.replace(/\/$/, '')}/#/join?token=${encodeURIComponent(token)}`;

async function sendInviteEmail(input: {
	to: string;
	campaignName: string;
	invitedBy: string;
	note: string;
	token: string;
}): Promise<InviteEmailStatus> {
	// Read config lazily so the stack ships email-disabled by default (fail-closed): with no
	// verified sender the invite still mints and the API answers `not-configured` honestly.
	const sender = process.env.INVITE_SENDER?.trim();
	const webOrigin = process.env.WEB_ORIGIN?.trim();
	if (!sender || !webOrigin) return 'not-configured';
	const joinUrl = inviteJoinUrl(webOrigin, input.token);
	const noteLine = input.note ? `\n\nA note from ${input.invitedBy}:\n${input.note}` : '';
	const text =
		`${input.invitedBy} invited you to join the campaign “${input.campaignName}”.` +
		`${noteLine}\n\nOpen this link to join (it works for 14 days):\n${joinUrl}\n\n` +
		`If you weren’t expecting this, you can ignore this email.`;
	const esc = (s: string) =>
		s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
	const html =
		`<p>${esc(input.invitedBy)} invited you to join the campaign <strong>${esc(input.campaignName)}</strong>.</p>` +
		(input.note ? `<p><em>${esc(input.note)}</em></p>` : '') +
		`<p><a href="${esc(joinUrl)}">Open this link to join</a> — it works for 14 days.</p>` +
		`<p style="color:#888;font-size:12px">If you weren’t expecting this, you can ignore this email.</p>`;
	try {
		await ses.send(
			new SendEmailCommand({
				FromEmailAddress: sender,
				Destination: { ToAddresses: [input.to] },
				Content: {
					Simple: {
						Subject: { Data: `Join “${input.campaignName}” on Lamplight` },
						Body: { Text: { Data: text }, Html: { Data: html } },
					},
				},
			}),
		);
		return 'sent';
	} catch (err) {
		// Never log the recipient address; the SES fault name is enough to diagnose.
		console.error('invite email send failed', {
			campaignName: input.campaignName,
			err: (err as { name?: string })?.name,
		});
		return 'failed';
	}
}

// --- Invites: owner row (account#<sub>|invite#<id>) + redeem row (invite#<token>|redeem).
// --- Both carry the TTL `expiresAt` so DynamoDB reclaims them; reads still filter on it
// --- (TTL deletion is lazy). The redeem row holds ONLY what an anonymous invitee may see.
async function createInvite(caller: Caller, body: string | undefined) {
	const parsed = parseBody(body);
	const campaignName = requireString(parsed.campaignName, 'campaignName', MAX_CAMPAIGN_NAME_CHARS);
	const note = optionalString(parsed.note, 'note', MAX_NOTE_CHARS);
	// Optional recipient. A malformed address is a client typo → 400 BEFORE minting (so the DM
	// fixes it) — distinct from a configured-but-undeliverable send, which is fail-open below.
	const email = optionalString(parsed.email, 'email', MAX_EMAIL_CHARS);
	if (email && !EMAIL_RE.test(email)) throw new BadRequest('email must be a valid address');
	const activeInvites = await queryPartition(
		APP_TABLE,
		{ name: 'pk', value: accountPk(caller.sub) },
		{ name: 'sk', lo: 'invite#', hi: 'invite#\uffff' },
		MAX_ACTIVE_INVITES_PER_ACCOUNT + 1,
		MAX_ACTIVE_INVITES_PER_ACCOUNT + 1,
	);
	const activeCount = activeInvites.filter((row) => Number(row.expiresAt) > nowSec()).length;
	if (activeCount >= MAX_ACTIVE_INVITES_PER_ACCOUNT) {
		throw new TooManyRequests(
			`An account can have at most ${MAX_ACTIVE_INVITES_PER_ACCOUNT} active invites. Revoke one before creating another.`,
			3600,
		);
	}
	const publishBudgetKey = await consumePublishBudget(caller, 'invite', INVITES_CREATED_PER_DAY);
	// The seat the invite grants. Strict allowlist, fail closed to an ordinary `player` seat.
	const role = parsed.role === 'co-dm' ? 'co-dm' : 'player';
	const inviteId = randomUUID();
	const token = randomBytes(32).toString('base64url');
	const createdAt = nowIso();
	const expiresAt = nowSec() + INVITE_TTL_SECONDS;
	const invitedBy = caller.displayName || 'a GM';
	try {
		await transactWhileAccountActive(caller, [
			{
				put: {
					pk: accountPk(caller.sub),
					sk: inviteSk(inviteId),
					inviteId,
					token,
					campaignName,
					note,
					role,
					createdAt,
					expiresAt,
				},
			},
			// The redeem row NEVER stores the owner's sub/email — resolve is unauthenticated.
			{
				put: {
					pk: redeemPk(token),
					sk: SK_REDEEM,
					inviteId,
					campaignName,
					note,
					role,
					invitedBy,
					createdAt,
					expiresAt,
				},
			},
		]);
	} catch (error) {
		if (error instanceof AccountDeleted) await deleteItem(APP_TABLE, publishBudgetKey);
		throw error;
	}
	// Delivery is best-effort and MUST NOT fail the invite: a bad/absent sender config or an
	// SES rejection still returns the minted invite with an honest email status. The recipient
	// address is never persisted (privacy) — it is only echoed back to the owner who typed it.
	const emailStatus: InviteEmailStatus = email
		? await sendInviteEmail({ to: email, campaignName, invitedBy, note, token })
		: 'none';
	return json(200, {
		inviteId,
		token,
		campaignName,
		note,
		role,
		createdAt,
		expiresAt,
		emailStatus,
		...(emailStatus === 'sent' ? { emailedTo: email } : {}),
	});
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
	const inviteId = decodePathId(rawInviteId, 'inviteId', UUID_RE);
	const row = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: inviteSk(inviteId) });
	if (!row) return json(404, { error: 'invite not found' });
	await transactWrite(APP_TABLE, [
		...(row.token ? [{ delete: { pk: redeemPk(row.token), sk: SK_REDEEM } } as const] : []),
		{ delete: { pk: accountPk(caller.sub), sk: inviteSk(inviteId) } },
	]);
	return json(200, { ok: true });
}

/** UNAUTHENTICATED. Hostile input: strict token shape, 404 for absent/expired/malformed,
 *  and the response contains ONLY invitee-safe join metadata (never the owner's sub). */
async function resolveInvite(rawToken: string | undefined) {
	if (!rawToken) return json(404, { error: 'invite not found' });
	let token: string;
	try {
		token = decodeURIComponent(rawToken);
	} catch {
		return json(404, { error: 'invite not found' });
	}
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
	const [entitlementRow, accountRows, wikiRow] = await Promise.all([
		getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_ENTITLEMENT }, true),
		queryAccountRowsStrong(caller.sub),
		getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI }, true),
	]);
	return {
		entitlementRow,
		accountRows,
		inviteRows: accountRows.filter((row) => row.sk.startsWith('invite#')),
		// Per-owner rows are written transactionally with every module from this release onward. Account
		// export/deletion therefore stays partition-scoped instead of reading the global marketplace.
		ownModules: accountRows.filter((row) => row.sk.startsWith('module#')),
		wikiRow,
	};
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
			simulated: entitlementPreviewEnabled(),
			canChangePlan: entitlementPreviewEnabled(),
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
		publishedWiki: data.wikiRow ? wikiStatusResponse(data.wikiRow) : null,
		note: 'Vault content is not included: it is stored end-to-end encrypted in the sync service, which cannot read or export your plaintext. Use the in-app vault export for your campaign data.',
	});
}

function isCognitoUserNotFound(error: unknown): boolean {
	return (error as { name?: string })?.name === 'UserNotFoundException';
}

/** The sync API writes this 45-day proof marker only after every index row and S3 version is gone. */
async function cloudBackupPurgeVerified(caller: Caller): Promise<boolean> {
	if (!SYNC_OPS_TABLE) {
		console.error('account deletion cannot verify sync purge: SYNC_OPS_TABLE is not configured');
		return false;
	}
	const marker = await getItem(
		SYNC_OPS_TABLE,
		{ vaultId: primaryVaultPk(caller.sub), sk: SYNC_USAGE_SK },
		true,
	);
	return (
		marker?.state === 'deleted' &&
		Number(marker.storedBytes) === 0 &&
		Number(marker.operationCount) === 0
	);
}

async function deleteAccount(caller: Caller) {
	// Phase 1: permanently lock the account BEFORE asking the client to purge sync. The
	// conditional put retains the original deletion timestamp on every retry. A stale ID
	// token cannot recreate app data, and sync writes fail their entitlement check; sync
	// DELETE remains deliberately available so the caller can finish the purge.
	await putItemConditional(
		APP_TABLE,
		{
			pk: accountPk(caller.sub),
			sk: SK_ENTITLEMENT,
			deletedAt: nowIso(),
		},
		{
			expression: 'attribute_not_exists(#deletedAt)',
			names: { '#deletedAt': 'deletedAt' },
		},
	);

	// Never delete the identity on a client assertion alone. This strongly consistent
	// marker is the sync service's durable proof that its bounded DynamoDB/S3 purge ended.
	if (!(await cloudBackupPurgeVerified(caller))) {
		return json(
			202,
			{
				ok: false,
				code: 'cloud-backup-purge-required',
				message:
					'Your account is locked. Finish removing the encrypted cloud backup, then retry account deletion.',
			},
			{ 'retry-after': '1' },
		);
	}

	// Phase 2: proof exists, so remove every app-api row the account owns
	// (+ marketplace/wiki payloads in S3).
	const data = await gatherAccountData(caller);
	await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_PROFILE });
	for (const row of data.inviteRows) {
		if (row.token) await deleteItem(APP_TABLE, { pk: redeemPk(row.token), sk: SK_REDEEM });
		await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: inviteSk(row.inviteId) });
	}
	for (const row of data.ownModules) {
		await deleteItem(APP_TABLE, { pk: modulePk(row.moduleId), sk: SK_LISTING });
		await deleteItem(APP_TABLE, { pk: BROWSE_PK, sk: browseSk(row.moduleId) });
		if (row.s3VersionId) {
			await deleteObjectVersion(MODULES_BUCKET, moduleS3Key(row.moduleId), row.s3VersionId);
		} else {
			await deleteObject(MODULES_BUCKET, moduleS3Key(row.moduleId));
		}
	}
	if (data.wikiRow?.wikiId) {
		await deleteItem(APP_TABLE, { pk: wikiPk(data.wikiRow.wikiId), sk: SK_SITE });
		if (data.wikiRow.s3VersionId) {
			await deleteObjectVersion(
				MODULES_BUCKET,
				wikiS3Key(data.wikiRow.wikiId),
				data.wikiRow.s3VersionId,
			);
		} else {
			await deleteObject(MODULES_BUCKET, wikiS3Key(data.wikiRow.wikiId));
		}
	}
	// Remove every account-scoped row, including rate/budget/index rows introduced
	// after the original account model. Public lookup rows and S3 objects were
	// removed first above, so partial failure always closes public access first.
	for (const row of data.accountRows) {
		if (row.sk === SK_ENTITLEMENT) continue; // stale-token tombstone; retirement is scheduled below
		await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: row.sk });
	}
	// The tombstone stays permanent while deletion is incomplete. Once content cleanup and sync proof
	// succeeded, it only needs to outlive every stale ID token/retry. Schedule retirement before Cognito
	// revocation so a lost final response never leaves a permanent account identifier.
	const tombstoneRetirementScheduled = await putItemConditional(
		APP_TABLE,
		{
			pk: accountPk(caller.sub),
			sk: SK_ENTITLEMENT,
			deletedAt: data.entitlementRow?.deletedAt ?? nowIso(),
			expiresAt: nowSec() + DELETION_MARKER_TTL_SECONDS,
		},
		{
			expression: 'attribute_exists(#deletedAt)',
			names: { '#deletedAt': 'deletedAt' },
		},
	);
	if (!tombstoneRetirementScheduled) {
		throw new Error('account deletion tombstone could not be scheduled for retirement');
	}
	// Revoke sessions only after every fallible content cleanup, so a transient DynamoDB/S3
	// fault cannot strand the user without a refresh token for retry. The tombstone already
	// blocks every non-deletion action. UserNotFound is success when an earlier request
	// committed despite a lost response.
	try {
		await cognito.send(
			new AdminUserGlobalSignOutCommand({ UserPoolId: USER_POOL_ID, Username: caller.username }),
		);
	} catch (error) {
		if (!isCognitoUserNotFound(error)) throw error;
	}
	// Delete the Cognito identity last. The app tombstone and sync purge marker deliberately
	// outlive Cognito, making stale-token and lost-response retries fail closed.
	try {
		await cognito.send(
			new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: caller.username }),
		);
	} catch (error) {
		if (!isCognitoUserNotFound(error)) throw error;
	}
	return json(200, { ok: true });
}
