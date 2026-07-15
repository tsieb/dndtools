// Typed client for the app-api backend (marketplace / invites / account / entitlements).
// One authedFetch seam: Cognito ID token via getIdToken(), base URL from cloudConfig.
// LOCAL-FIRST + FAIL-CLOSED: every function throws a typed 'not-configured' AppApiError
// when the backend isn't in this build — callers render their labeled local state instead.
// Server 400s carry safe messages (the handler never leaks internals); anything else is
// normalized to a generic, user-presentable message.
import { cloudConfig, isAccountApiConfigured, isSyncConfigured } from './config';
import { getIdToken } from './auth';

// --- plans + feature matrix (shapes mirror the server's single source of truth) ---------
export type PlanId = 'hearth' | 'lantern' | 'beacon';
export const PLAN_IDS: readonly PlanId[] = ['hearth', 'lantern', 'beacon'] as const;
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
export type FeatureMatrix = FeatureGroup[];

export interface Entitlements {
	plan: PlanId;
	/** True only in deployments that explicitly enable the no-payment preview. */
	simulated: boolean;
	/** False in production until a real billing/provisioning flow exists. */
	canChangePlan: boolean;
	features: FeatureMatrix;
}

export interface ModuleListing {
	moduleId: string;
	name: string;
	summary: string;
	version: string;
	publishedAt: string;
	contentHash: string;
	size: number;
	/** True when the caller published this module (the server never echoes owner ids). */
	owned: boolean;
}
export interface ModuleWithPackage extends ModuleListing {
	package: unknown;
}

/** The seat an invite grants. Absent/`player` is an ordinary seat; `co-dm` is the elevated seat. */
export type InviteRole = 'player' | 'co-dm';

// --- campaign wiki ------------------------------------------------------------------------
export type WikiAccess = 'public' | 'unlisted' | 'password';
export const WIKI_ACCESS_VALUES: readonly WikiAccess[] = [
	'public',
	'unlisted',
	'password',
] as const;

/** One player-safe wiki page: text only — the reader renders markdown as React nodes. */
export interface WikiPage {
	slug: string;
	title: string;
	markdown: string;
	updatedAt?: string;
}

/** The owner's published-wiki status (never contains page content). */
export interface WikiStatus {
	/** Stable high-entropy id minted at first publish — survives re-publishes. */
	wikiId: string;
	title: string;
	access: WikiAccess;
	pageCount: number;
	size: number;
	publishedAt: string;
	updatedAt: string;
}

/** A published wiki as served to anonymous readers (never carries the owner's identity). */
export interface PublicWiki {
	wikiId: string;
	title: string;
	access: WikiAccess;
	publishedAt: string;
	updatedAt: string;
	pageCount: number;
	pages: WikiPage[];
}

export interface Invite {
	inviteId: string;
	token: string;
	campaignName: string;
	note: string;
	/** The seat this invite grants (defaults to `player` when the server omits it). */
	role: InviteRole;
	createdAt: string;
	/** Epoch seconds (14-day TTL). */
	expiresAt: number;
}

/**
 * Outcome of the OPTIONAL invite-email delivery. The link + QR always work regardless:
 *  • `none`           — no recipient was supplied (link-only invite).
 *  • `sent`           — SES accepted the message (`emailedTo` echoes the address).
 *  • `not-configured` — this deployment has no verified sender wired in — share the link.
 *  • `failed`         — SES rejected the send (unverified/sandbox) — share the link.
 */
export type InviteEmailStatus = 'none' | 'sent' | 'not-configured' | 'failed';

/** createInvite result — the minted Invite plus the (best-effort) email-delivery status. */
export interface CreateInviteResult extends Invite {
	emailStatus: InviteEmailStatus;
	/** Present only when emailStatus === 'sent' — the address the invite went to. */
	emailedTo?: string;
}
export interface ResolvedInvite {
	campaignName: string;
	note: string;
	role: InviteRole;
	invitedBy: string;
	expiresAt: number;
}

export interface Profile {
	email: string;
	displayName: string;
	createdAt: string;
}
export interface Device {
	deviceKey: string;
	name: string;
	lastSeen: string;
}

export type AppApiErrorCode = 'not-configured' | 'unauthenticated' | 'http' | 'network';

/** A typed failure with a SAFE, user-presentable message. */
export class AppApiError extends Error {
	constructor(
		message: string,
		readonly code: AppApiErrorCode = 'http',
		readonly status?: number,
	) {
		super(message);
		this.name = 'AppApiError';
	}
}

const base = () => cloudConfig.appApiUrl.replace(/\/$/, '');

async function errorFrom(res: Response): Promise<AppApiError> {
	let message = `Cloud request failed (${res.status}).`;
	try {
		const body = (await res.json()) as { error?: unknown };
		// Only 4xx messages are client-caused and safe/useful; a 500 is deliberately generic.
		if (res.status < 500 && typeof body.error === 'string' && body.error) message = body.error;
	} catch {
		/* non-JSON body: keep the generic message */
	}
	return new AppApiError(message, 'http', res.status);
}

async function parse<T>(res: Response): Promise<T> {
	if (!res.ok) throw await errorFrom(res);
	return (await res.json()) as T;
}

/** Authenticated fetch against the app-api. Throws AppApiError, never raw fetch errors. */
async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
	if (!isAccountApiConfigured)
		throw new AppApiError(
			'Online account services are not available in this edition.',
			'not-configured',
		);
	const token = await getIdToken();
	if (!token)
		throw new AppApiError('Sign in to use cloud account features.', 'unauthenticated', 401);
	let res: Response;
	try {
		res = await fetch(`${base()}${path}`, {
			...init,
			headers: {
				'content-type': 'application/json',
				...(init.headers ?? {}),
				authorization: `Bearer ${token}`,
			},
		});
	} catch {
		throw new AppApiError('Could not reach the cloud service — check your connection.', 'network');
	}
	return parse<T>(res);
}

/** Same authenticated transport as authedFetch, but preserves non-error status codes for
 * multi-phase protocols such as account deletion's 202 purge handshake. */
async function authedResponse(path: string, token: string, init: RequestInit): Promise<Response> {
	if (!isAccountApiConfigured)
		throw new AppApiError(
			'Online account services are not available in this edition.',
			'not-configured',
		);
	try {
		return await fetch(`${base()}${path}`, {
			...init,
			headers: {
				'content-type': 'application/json',
				...(init.headers ?? {}),
				authorization: `Bearer ${token}`,
			},
		});
	} catch {
		throw new AppApiError('Could not reach the cloud service — check your connection.', 'network');
	}
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

// --- Entitlements (dev preview only; production can disable self-service changes) --------
export function getEntitlements(): Promise<Entitlements> {
	return authedFetch<Entitlements>('/account/entitlements');
}

export function setPlan(plan: PlanId): Promise<Entitlements> {
	return authedFetch<Entitlements>('/account/entitlements', post({ plan }));
}

// --- Marketplace --------------------------------------------------------------------------
export async function listModules(): Promise<ModuleListing[]> {
	const res = await authedFetch<{ modules: ModuleListing[] }>('/marketplace/modules');
	return res.modules;
}

export async function publishModule(input: {
	name: string;
	summary: string;
	version: string;
	package: unknown;
}): Promise<string> {
	const res = await authedFetch<{ moduleId: string }>('/marketplace/modules', post(input));
	return res.moduleId;
}

export function getModule(moduleId: string): Promise<ModuleWithPackage> {
	return authedFetch<ModuleWithPackage>(`/marketplace/modules/${encodeURIComponent(moduleId)}`);
}

export async function deleteModule(moduleId: string): Promise<void> {
	await authedFetch<{ ok: true }>(`/marketplace/modules/${encodeURIComponent(moduleId)}`, {
		method: 'DELETE',
	});
}

// --- Campaign wiki ---------------------------------------------------------------------------
/** Publish (or re-publish — same stable wikiId) the player-safe page bundle. Beacon-plan gated
 *  server-side; `password` is required exactly when `access === 'password'`. */
export function publishWiki(input: {
	title: string;
	access: WikiAccess;
	pages: WikiPage[];
	password?: string;
}): Promise<WikiStatus> {
	return authedFetch<WikiStatus>('/wiki', { method: 'PUT', body: JSON.stringify(input) });
}

/** The caller's own published-wiki status, or null when nothing is published. */
export async function getMyWiki(): Promise<WikiStatus | null> {
	try {
		return await authedFetch<WikiStatus>('/wiki');
	} catch (e) {
		if (e instanceof AppApiError && e.status === 404) return null;
		throw e;
	}
}

/** Unpublish: the public wiki page dies immediately; local content is untouched. */
export async function unpublishWiki(): Promise<void> {
	await authedFetch<{ ok: true }>('/wiki', { method: 'DELETE' });
}

/** UNAUTHENTICATED — readers need no account. Needs only the API URL. A password-protected
 *  wiki answers 401 until the right password rides the x-wiki-password header. */
export async function getPublicWiki(wikiId: string, password?: string): Promise<PublicWiki> {
	if (!cloudConfig.appApiUrl)
		throw new AppApiError(
			'Online account services are not available in this edition.',
			'not-configured',
		);
	let res: Response;
	try {
		res = await fetch(`${base()}/wikis/${encodeURIComponent(wikiId)}`, {
			headers: password ? { 'x-wiki-password': password } : {},
		});
	} catch {
		throw new AppApiError('Could not reach the cloud service — check your connection.', 'network');
	}
	if (res.status === 401)
		throw new AppApiError(
			password ? 'That password is not right — try again.' : 'This wiki is password-protected.',
			'http',
			401,
		);
	if (res.status === 404 || res.status === 410)
		throw new AppApiError(
			'This wiki link is invalid or the wiki was unpublished.',
			'http',
			res.status,
		);
	return parse<PublicWiki>(res);
}

// --- Invites --------------------------------------------------------------------------------
/**
 * Mint a server-side join link (+ token the UI renders as a QR). `email` is OPTIONAL: when
 * supplied the backend also tries to send the invite via SES — but delivery is best-effort,
 * so the link/QR are returned no matter what and `emailStatus` reports whether the mail went.
 * `role` selects the seat the invite grants (defaults to a plain player seat server-side).
 */
export function createInvite(input: {
	campaignName: string;
	note?: string;
	email?: string;
	role?: InviteRole;
}): Promise<CreateInviteResult> {
	return authedFetch<CreateInviteResult>('/invites', post(input));
}

export async function listInvites(): Promise<Invite[]> {
	const res = await authedFetch<{ invites: Invite[] }>('/invites');
	return res.invites;
}

export async function revokeInvite(inviteId: string): Promise<void> {
	await authedFetch<{ ok: true }>(`/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' });
}

/** The one UNAUTHENTICATED call — invitees have no account yet. Needs only the API URL. */
export async function resolveInvite(token: string): Promise<ResolvedInvite> {
	if (!cloudConfig.appApiUrl)
		throw new AppApiError(
			'Online account services are not available in this edition.',
			'not-configured',
		);
	let res: Response;
	try {
		res = await fetch(`${base()}/invites/resolve/${encodeURIComponent(token)}`);
	} catch {
		throw new AppApiError('Could not reach the cloud service — check your connection.', 'network');
	}
	if (res.status === 404 || res.status === 410)
		throw new AppApiError('This invite link is invalid or has expired.', 'http', res.status);
	return parse<ResolvedInvite>(res);
}

// --- Account ----------------------------------------------------------------------------------
export function getProfile(): Promise<Profile> {
	return authedFetch<Profile>('/account/profile');
}

export async function updateProfile(displayName: string): Promise<string> {
	const res = await authedFetch<{ ok: true; displayName: string }>('/account/profile', {
		method: 'PUT',
		body: JSON.stringify({ displayName }),
	});
	return res.displayName;
}

export async function listDevices(): Promise<Device[]> {
	const res = await authedFetch<{ devices: Device[] }>('/account/devices');
	return res.devices;
}

export async function revokeDevice(deviceKey: string): Promise<void> {
	await authedFetch<{ ok: true }>('/account/devices/revoke', post({ deviceKey }));
}

/** Global sign-out: revokes every session's tokens on every device. */
export async function revokeAllSessions(): Promise<void> {
	await authedFetch<{ ok: true }>('/account/devices/revoke', post({}));
}

/** Everything the app backend holds about the account (vault content is E2EE, not here). */
export function exportAccountData(): Promise<Record<string, unknown>> {
	return authedFetch<Record<string, unknown>>('/account/export', { method: 'POST' });
}

async function purgeCloudBackup(token: string): Promise<void> {
	const syncBase = cloudConfig.syncApiUrl.replace(/\/$/, '');
	if (!isSyncConfigured || !syncBase)
		throw new AppApiError(
			'Encrypted cloud-backup removal is not configured in this edition. The account is locked; use a fully configured build to finish deletion.',
			'not-configured',
		);
	// The API deletes at most 500 index rows per request. The server-side revision cap means 600 pages
	// is a hard safety ceiling above the largest valid vault, while normal campaigns finish in one call.
	for (let page = 0; page < 600; page += 1) {
		let response: Response;
		try {
			response = await fetch(`${syncBase}/vaults/primary`, {
				method: 'DELETE',
				headers: { authorization: `Bearer ${token}` },
			});
		} catch {
			throw new AppApiError(
				'Could not remove the encrypted cloud backup. Check your connection and try again before deleting the account.',
				'network',
			);
		}
		if (!response.ok) throw await errorFrom(response);
		let result: { deleted?: unknown; hasMore?: unknown };
		try {
			result = (await response.json()) as { deleted?: unknown; hasMore?: unknown };
		} catch {
			throw new AppApiError('The cloud service returned an invalid backup-removal response.');
		}
		if (
			(result.hasMore !== true && result.hasMore !== false) ||
			!Number.isSafeInteger(result.deleted) ||
			Number(result.deleted) < 0
		) {
			throw new AppApiError('The cloud service returned an invalid backup-removal response.');
		}
		if (result.hasMore === false) return;
		if (Number(result.deleted) < 1) break;
	}
	throw new AppApiError('The encrypted cloud backup could not be fully removed. Try again.');
}

async function requestAccountDeletion(token: string): Promise<'deleted' | 'purge-required'> {
	const response = await authedResponse('/account', token, { method: 'DELETE' });
	if (response.status === 202) {
		let body: { code?: unknown };
		try {
			body = (await response.json()) as { code?: unknown };
		} catch {
			throw new AppApiError('The cloud service returned an invalid account-deletion response.');
		}
		if (body.code !== 'cloud-backup-purge-required')
			throw new AppApiError('The cloud service returned an invalid account-deletion response.');
		return 'purge-required';
	}
	if (!response.ok) throw await errorFrom(response);
	let body: { ok?: unknown };
	try {
		body = (await response.json()) as { ok?: unknown };
	} catch {
		throw new AppApiError('The cloud service returned an invalid account-deletion response.');
	}
	if (body.ok !== true)
		throw new AppApiError('The cloud service returned an invalid account-deletion response.');
	return 'deleted';
}

/**
 * Permanent server-side deletion. The app backend first tombstones the account, then asks this
 * client to page the sync service's physical purge. Only the sync service's terminal durable marker
 * lets the app backend remove application rows and the Cognito identity on the retry.
 */
export async function deleteAccount(): Promise<void> {
	const token = await getIdToken();
	if (!token)
		throw new AppApiError('Sign in again before deleting the account.', 'unauthenticated', 401);
	if ((await requestAccountDeletion(token)) === 'deleted') return;
	await purgeCloudBackup(token);
	if ((await requestAccountDeletion(token)) !== 'deleted')
		throw new AppApiError(
			'The encrypted cloud backup was removed, but the account service has not confirmed it yet. Try deleting the account again.',
		);
}
