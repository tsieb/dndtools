import type { PlatformProfile, PlatformServiceCapabilities } from './platform-profile';
import { serviceAvailability } from './platform-profile';

/**
 * PLAT-016: the web/PWA cached read/write SUPPORT MATRIX descriptor.
 *
 * This is the data artifact a release review inspects. For each core domain it declares the
 * cached read/write support level, the queued-write behavior, the offline/auth/eviction
 * policy, and the required fallback. It is rendered by a GUI view (the `/platform` route) and
 * is the single source of truth for the degraded-capability states a feature surface shows.
 *
 * Fail-closed contract (Contract 1 / PLAT-016 AC5): a domain or platform feature that depends
 * on a native-only service (filesystem, OS credential store, protocol handling, MCP sidecar)
 * is marked `unsupported` and MUST report unsupported capability rather than attempting a
 * native path. {@link capabilityForFeature} returns `unsupported` for any unknown feature.
 */

/** The cached read/write support level for one domain on the web/PWA release. */
export type SupportLevel =
	| 'cached-read-write' // read + edit cached content offline; writes queue when remote needed
	| 'cached-read' // read cached content offline; writes require a service this profile lacks
	| 'queued-write' // writes accepted locally and replayed on reconnect
	| 'unavailable' // depends on a service that is present but not wired in this slice
	| 'unsupported'; // structurally impossible on this profile (native-only); fail closed

/** The core domains the matrix must cover (PLAT-016 statement). */
export type SupportDomainId =
	| 'notes'
	| 'maps'
	| 'scenes'
	| 'characters'
	| 'sessions'
	| 'handouts'
	| 'assets'
	| 'search'
	| 'graph'
	| 'sync-status';

/** A platform feature that is native-only and therefore unsupported on web/PWA. */
export type UnsupportedFeatureId =
	| 'filesystem-vault'
	| 'os-credential-store'
	| 'protocol-handler'
	| 'mcp-sidecar';

/** Whether first-time setup for a domain requires network (Contract 2 offline exceptions). */
export type AuthRequirement = 'none' | 'first-time-online' | 'reauth-on-reconnect';

export interface SupportDomainEntry {
	readonly id: SupportDomainId;
	readonly label: string;
	readonly support: SupportLevel;
	/** Offline behavior statement (every Must-have feature must state this — Contract 2). */
	readonly offline: string;
	/** Auth/first-time-online requirement. */
	readonly auth: AuthRequirement;
	/** What happens to a write while offline / before remote ack. */
	readonly queuedWritePolicy: string;
	/** Service-worker cache + update policy note for this domain. */
	readonly cachePolicy: string;
	/** Storage-quota / eviction-recovery behavior. */
	readonly evictionRecovery: string;
	/** The required fallback shown to the user when degraded. */
	readonly fallback: string;
}

export interface UnsupportedFeatureEntry {
	readonly id: UnsupportedFeatureId;
	readonly label: string;
	/** Why it is unsupported on web/PWA, plus the action-oriented fallback. */
	readonly reason: string;
	/** The native service it would require (maps to a PlatformServiceCapabilities key). */
	readonly requiresService: keyof PlatformServiceCapabilities;
}

export interface PlatformSupportMatrix {
	readonly profileId: 'web';
	readonly version: number;
	readonly domains: readonly SupportDomainEntry[];
	readonly unsupportedFeatures: readonly UnsupportedFeatureEntry[];
}

export const SUPPORT_MATRIX_VERSION = 1 as const;

const QUEUE_POLICY =
	'Writes are accepted into the local durable store first and replayed through the same operation validation as desktop when sync resumes (Contract 2).';
const CACHE_POLICY =
	'Service-worker cache; a pending update preserves current local writes and reports any reload requirement before activation.';
const EVICTION_POLICY =
	'If browser storage eviction removes cached content, the affected item reports missing and core cached metadata stays safe; re-sync restores it when online.';

/**
 * The published web/PWA support matrix. Authored once; the GUI renders it and feature surfaces
 * resolve their degraded state from it. Every Must-have domain is declared with an explicit
 * support level and fallback (PLAT-016 AC1) and the auth/cache/quota/eviction policy (AC2).
 */
export const WEB_SUPPORT_MATRIX: PlatformSupportMatrix = {
	profileId: 'web',
	version: SUPPORT_MATRIX_VERSION,
	domains: [
		{
			id: 'notes',
			label: 'Notes',
			support: 'cached-read-write',
			offline: 'Read and edit cached notes with zero network.',
			auth: 'none',
			queuedWritePolicy: QUEUE_POLICY,
			cachePolicy: CACHE_POLICY,
			evictionRecovery: EVICTION_POLICY,
			fallback: 'Edits are kept locally; sync resumes automatically when online.',
		},
		{
			id: 'maps',
			label: 'Maps',
			support: 'cached-read-write',
			offline: 'View and annotate cached maps offline.',
			auth: 'none',
			queuedWritePolicy: QUEUE_POLICY,
			cachePolicy: CACHE_POLICY,
			evictionRecovery: EVICTION_POLICY,
			fallback: 'Uncached map tiles report missing until re-synced online.',
		},
		{
			id: 'scenes',
			label: 'Scenes',
			support: 'cached-read-write',
			offline: 'Open and edit cached Scenes; widget layout changes queue.',
			auth: 'none',
			queuedWritePolicy: QUEUE_POLICY,
			cachePolicy: CACHE_POLICY,
			evictionRecovery: EVICTION_POLICY,
			fallback: 'Scene edits are local-first and replay on reconnect.',
		},
		{
			id: 'characters',
			label: 'Characters',
			support: 'cached-read-write',
			offline: 'Read and edit cached character data offline.',
			auth: 'none',
			queuedWritePolicy: QUEUE_POLICY,
			cachePolicy: CACHE_POLICY,
			evictionRecovery: EVICTION_POLICY,
			fallback: 'Field edits queue and replay through normal operation validation.',
		},
		{
			id: 'sessions',
			label: 'Sessions',
			support: 'cached-read-write',
			offline: 'Continue an already-local session offline; live remote presence is unavailable.',
			auth: 'none',
			queuedWritePolicy: QUEUE_POLICY,
			cachePolicy: CACHE_POLICY,
			evictionRecovery: EVICTION_POLICY,
			fallback: 'Live participant presence shows as offline until network returns.',
		},
		{
			id: 'handouts',
			label: 'Handouts',
			support: 'queued-write',
			offline: 'Author and stage handouts offline; delivery to players queues until online.',
			auth: 'none',
			queuedWritePolicy: QUEUE_POLICY,
			cachePolicy: CACHE_POLICY,
			evictionRecovery: EVICTION_POLICY,
			fallback: 'Delivery is queued and confirmed once the player device is reachable.',
		},
		{
			id: 'assets',
			label: 'Assets',
			support: 'cached-read',
			offline: 'Cached asset blobs are readable offline; new large uploads need network.',
			auth: 'none',
			queuedWritePolicy:
				'Asset metadata operations queue; the binary upload itself waits for network (Contract 2 asset rule).',
			cachePolicy: CACHE_POLICY,
			evictionRecovery:
				'An evicted asset blob reports missing on open; its content-addressed metadata is preserved and the blob re-downloads when online.',
			fallback: 'Missing asset shows a placeholder with a re-download action.',
		},
		{
			id: 'search',
			label: 'Search',
			support: 'cached-read',
			offline: 'Search runs over the locally cached/indexed content offline.',
			auth: 'none',
			queuedWritePolicy: 'Search is read-only; no writes to queue.',
			cachePolicy: CACHE_POLICY,
			evictionRecovery: 'A rebuilt local index restores search after cache eviction.',
			fallback: 'Results are limited to content cached on this device.',
		},
		{
			id: 'graph',
			label: 'Graph',
			support: 'cached-read',
			offline: 'The relationship graph renders from locally cached entities offline.',
			auth: 'none',
			queuedWritePolicy: 'Graph is a derived read model; no direct writes to queue.',
			cachePolicy: CACHE_POLICY,
			evictionRecovery: 'The graph index rebuilds from cached entities after eviction.',
			fallback: 'Edges to uncached entities are hidden until those entities sync.',
		},
		{
			id: 'sync-status',
			label: 'Sync status',
			support: 'queued-write',
			offline:
				'Queued-operation count and last-sync state are visible offline; cloud/Google Docs auth that expires offline keeps edits queued and requests reauthorization only when network returns.',
			auth: 'reauth-on-reconnect',
			queuedWritePolicy:
				'Pending operations are counted locally; reauthorization is deferred until the network returns (Contract 2).',
			cachePolicy: CACHE_POLICY,
			evictionRecovery: 'The local operation log is durable and is not evicted with the page cache.',
			fallback: 'Offline shows queued counts; reconnect drains the queue and prompts reauth if needed.',
		},
	],
	unsupportedFeatures: [
		{
			id: 'filesystem-vault',
			label: 'Local filesystem vault',
			reason:
				'A browser cannot open a trusted OS filesystem vault. Use the in-browser vault or the desktop app for filesystem-backed vaults.',
			requiresService: 'trustedFilesystem',
		},
		{
			id: 'os-credential-store',
			label: 'OS credential store',
			reason:
				'Auth tokens are stored in browser-scoped storage, not an OS keychain. The desktop app uses the OS credential store.',
			requiresService: 'osCredentialStore',
		},
		{
			id: 'protocol-handler',
			label: 'Custom protocol handler',
			reason:
				'Deep-link protocol registration is a native-shell capability. Use standard web URLs in the browser.',
			requiresService: 'protocolHandler',
		},
		{
			id: 'mcp-sidecar',
			label: 'MCP sidecar',
			reason:
				'The local MCP sidecar process runs only in the desktop shell. MCP is optional and disabling it never disables core app behavior (cross-contract non-negotiable 6).',
			requiresService: 'mcpSidecar',
		},
	],
};

const DOMAINS_BY_ID: ReadonlyMap<string, SupportDomainEntry> = new Map(
	WEB_SUPPORT_MATRIX.domains.map((entry) => [entry.id, entry]),
);

const UNSUPPORTED_BY_ID: ReadonlyMap<string, UnsupportedFeatureEntry> = new Map(
	WEB_SUPPORT_MATRIX.unsupportedFeatures.map((entry) => [entry.id, entry]),
);

/**
 * Resolve the support level for a domain. Fail-closed: an unknown domain key returns
 * `unsupported`, never a permissive default (PLAT-016 AC5 / data-safety fail-closed).
 */
export function domainSupportLevel(domainId: string): SupportLevel {
	return DOMAINS_BY_ID.get(domainId)?.support ?? 'unsupported';
}

/** Look up a domain entry, or `null` if the domain is not declared in the matrix. */
export function supportDomain(domainId: string): SupportDomainEntry | null {
	return DOMAINS_BY_ID.get(domainId) ?? null;
}

/**
 * Resolve the capability/support level a feature surface should render. A feature keyed to a
 * declared unsupported platform feature reports `unsupported`; an unknown key also fails closed
 * to `unsupported`. This is the single helper a feature surface calls instead of attempting a
 * native path (PLAT-016 AC5).
 */
export function capabilityForFeature(featureId: string): {
	readonly level: SupportLevel;
	readonly reason: string;
} {
	const unsupported = UNSUPPORTED_BY_ID.get(featureId);
	if (unsupported) {
		return { level: 'unsupported', reason: unsupported.reason };
	}
	const domain = DOMAINS_BY_ID.get(featureId);
	if (domain) {
		return { level: domain.support, reason: domain.fallback };
	}
	return {
		level: 'unsupported',
		reason: 'Unknown platform feature; treated as unsupported (fail closed).',
	};
}

/**
 * Cross-check the matrix against a profile's live service capabilities: an unsupported feature
 * must not claim a service the profile actually has. Returns the ids of any inconsistencies so
 * a test/release gate can fail closed. An empty array means the matrix is consistent.
 */
export function matrixServiceInconsistencies(
	profile: PlatformProfile,
	matrix: PlatformSupportMatrix = WEB_SUPPORT_MATRIX,
): UnsupportedFeatureId[] {
	const problems: UnsupportedFeatureId[] = [];
	for (const feature of matrix.unsupportedFeatures) {
		// If the profile genuinely has the service available, the feature should not be listed
		// as unsupported. (`unavailable`/`unsupported` service states are both fine here.)
		if (serviceAvailability(profile, feature.requiresService) === 'available') {
			problems.push(feature.id);
		}
	}
	return problems;
}
