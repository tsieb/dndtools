// dndtools app-api — the application backend for account-scoped features that are NOT
// E2EE vault sync: plan entitlements (simulated checkout — no payment processor, every
// response is explicitly marked simulated), the marketplace (plaintext widget-package
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
	CognitoIdentityProviderClient,
	AdminDeleteUserCommand,
	AdminForgetDeviceCommand,
	AdminGetUserCommand,
	AdminListDevicesCommand,
	AdminUpdateUserAttributesCommand,
	AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { putItem, getItem, deleteItem, queryPartition } from '../lib/aws.ts';
import { putJson, getJson, deleteObject } from '../lib/s3.ts';

const APP_TABLE = process.env.APP_TABLE!;
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
const INVITE_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]{1,40})?$/;
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
const SK_WIKI = 'wiki'; // owner's wiki row under account#<sub> — ONE wiki per account
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
		// The UNAUTHENTICATED routes — handled before any claims are required.
		if (routeKey === 'GET /invites/resolve/{token}') {
			return await resolveInvite(event.pathParameters?.token);
		}
		if (routeKey === 'GET /wikis/{wikiId}') {
			return await readWiki(event.pathParameters?.wikiId, event.headers?.['x-wiki-password']);
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
		if (err instanceof SyntaxError) return json(400, { error: 'malformed request body' });
		console.error('app-api error', { routeKey, err });
		return json(500, { error: 'internal error' });
	}
};

// --- Entitlements: GET returns the stored plan (or the free default); POST is the -------
// --- SIMULATED plan change. Both always answer simulated:true + the feature matrix. -----
/** The caller's stored plan, failing CLOSED to the free default. */
async function currentPlan(caller: Caller): Promise<PlanId> {
	const row = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_ENTITLEMENT });
	return row && (PLAN_IDS as readonly string[]).includes(row.plan) ? (row.plan as PlanId) : DEFAULT_PLAN;
}

async function getEntitlements(caller: Caller) {
	const plan = await currentPlan(caller);
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
	if (!Array.isArray(value) || value.length === 0) throw new BadRequest('pages must be a non-empty array');
	if (value.length > MAX_WIKI_PAGES) throw new BadRequest(`a wiki can hold at most ${MAX_WIKI_PAGES} pages`);
	const seen = new Set<string>();
	return value.map((raw, i) => {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequest(`pages[${i}] must be an object`);
		const page = raw as Record<string, unknown>;
		const slug = requireString(page.slug, `pages[${i}].slug`, 120);
		if (!WIKI_SLUG_RE.test(slug)) throw new BadRequest(`pages[${i}].slug must be lowercase kebab-case`);
		if (seen.has(slug)) throw new BadRequest(`pages[${i}].slug is duplicated (${slug})`);
		seen.add(slug);
		const title = requireString(page.title, `pages[${i}].title`, MAX_WIKI_PAGE_TITLE_CHARS);
		if (typeof page.markdown !== 'string') throw new BadRequest(`pages[${i}].markdown must be a string`);
		const updatedAt = optionalString(page.updatedAt, `pages[${i}].updatedAt`, 40);
		return { slug, title, markdown: page.markdown, updatedAt };
	});
}

async function publishWiki(caller: Caller, body: string | undefined) {
	// Plan gate FIRST (the feature matrix's "Public campaign wikis" row is Beacon-only).
	if ((await currentPlan(caller)) !== 'beacon') {
		return json(403, { error: 'publishing a campaign wiki needs the Beacon plan (change plans on the Plans & cloud screen — plans are simulated, nothing is charged)' });
	}
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
	const existing = await getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI });
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
	await putJson(MODULES_BUCKET, wikiS3Key(wikiId), bundle);
	await putItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI, ...status });
	// The site row is the PUBLIC lookup. PutItem REPLACES the row, so switching away from
	// password mode drops the old hash. `ownerSub` stays server-side (never echoed to readers).
	await putItem(APP_TABLE, {
		pk: wikiPk(wikiId),
		sk: SK_SITE,
		ownerSub: caller.sub,
		...status,
		...(passwordHash ? { passwordHash } : {}),
	});
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
		await deleteObject(MODULES_BUCKET, wikiS3Key(row.wikiId));
	}
	await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI });
	return json(200, { ok: true });
}

/** UNAUTHENTICATED. Hostile input: strict id shape, 404 for absent/malformed, a 401 with
 *  no content for password-protected wikis, and the response never carries the owner's sub. */
async function readWiki(rawWikiId: string | undefined, presentedPassword: string | undefined) {
	if (!rawWikiId) return json(404, { error: 'wiki not found' });
	const wikiId = decodeURIComponent(rawWikiId);
	if (!WIKI_ID_RE.test(wikiId)) return json(404, { error: 'wiki not found' });
	const row = await getItem(APP_TABLE, { pk: wikiPk(wikiId), sk: SK_SITE });
	if (!row) return json(404, { error: 'wiki not found' });
	if (row.passwordHash) {
		const presented = typeof presentedPassword === 'string' ? presentedPassword : '';
		if (!presented || presented.length > MAX_WIKI_PASSWORD_CHARS || !wikiPasswordMatches(presented, row.passwordHash)) {
			return json(401, { error: 'password required', passwordProtected: true });
		}
	}
	const bundle = await getJson<{ title?: unknown; pages?: unknown }>(MODULES_BUCKET, wikiS3Key(wikiId));
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
	const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
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
						Subject: { Data: `Join “${input.campaignName}” on DND Tools` },
						Body: { Text: { Data: text }, Html: { Data: html } },
					},
				},
			}),
		);
		return 'sent';
	} catch (err) {
		// Never log the recipient address; the SES fault name is enough to diagnose.
		console.error('invite email send failed', { campaignName: input.campaignName, err: (err as { name?: string })?.name });
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
	const [entitlementRow, inviteRows, browseRows, wikiRow] = await Promise.all([
		getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_ENTITLEMENT }),
		queryPartition(
			APP_TABLE,
			{ name: 'pk', value: accountPk(caller.sub) },
			{ name: 'sk', lo: 'invite#', hi: 'invite#\uffff' },
		),
		queryPartition(APP_TABLE, { name: 'pk', value: BROWSE_PK }),
		getItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI }),
	]);
	return {
		entitlementRow,
		inviteRows,
		ownModules: browseRows.filter((r) => r.ownerSub === caller.sub),
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
		publishedWiki: data.wikiRow ? wikiStatusResponse(data.wikiRow) : null,
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
	if (data.wikiRow?.wikiId) {
		await deleteItem(APP_TABLE, { pk: wikiPk(data.wikiRow.wikiId), sk: SK_SITE });
		await deleteObject(MODULES_BUCKET, wikiS3Key(data.wikiRow.wikiId));
		await deleteItem(APP_TABLE, { pk: accountPk(caller.sub), sk: SK_WIKI });
	}
	// 3. Delete the Cognito identity itself.
	await cognito.send(
		new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: caller.username }),
	);
	return json(200, { ok: true });
}
