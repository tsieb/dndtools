// Cloud configuration, read from Vite env at build time (same mechanism as
// VITE_DEMO_MODE). Values are injected per environment from SSM
// (/dndtools/<stage>/...) via scripts/pull-cloud-env.mjs, which writes .env.local.
//
// The app is LOCAL-FIRST: when these are absent (a plain `vite build` with no
// cloud env), `isCloudConfigured` is false and every cloud entry point stays
// hidden/disabled. Nothing here throws at import time.

export interface CloudConfig {
	stage: 'dev' | 'prod' | '';
	region: string;
	userPoolId: string;
	userPoolClientId: string;
	/** wss:// URL of the signaling API (append ?token=<cognito-id-token>). */
	signalingWsUrl: string;
	/** https:// base URL of the sync-api (E2EE cloud sync/backup); Authorization: <cognito-id-token>. */
	syncApiUrl: string;
	/** https:// base URL of the app-api (marketplace/invites/account/entitlements); Authorization: <cognito-id-token>. */
	appApiUrl: string;
	/** Public HTTPS SPA entry used for share links from packaged desktop builds. */
	publicAppUrl: string;
}

export interface FeatureFlagSnapshot {
	version: 1;
	flags: Record<string, boolean>;
}

function read(key: keyof ImportMetaEnv): string {
	const v = import.meta.env[key];
	return typeof v === 'string' ? v.trim() : '';
}

function validRegion(value: string): boolean {
	return /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(value);
}

function validUserPoolId(value: string, region: string): boolean {
	return (
		validRegion(region) &&
		new RegExp(`^${region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_[A-Za-z0-9]+$`).test(value)
	);
}

function validClientId(value: string): boolean {
	return /^[a-z0-9]{1,128}$/.test(value);
}

function validApiUrl(value: string, protocol: 'https:' | 'wss:'): boolean {
	if (!value || value.length > 2048) return false;
	try {
		const url = new URL(value);
		return (
			url.protocol === protocol &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash &&
			url.pathname !== '/' &&
			!url.pathname.endsWith('/')
		);
	} catch {
		return false;
	}
}

function validPublicAppUrl(value: string): boolean {
	if (!value || value.length > 2048) return false;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
	} catch {
		return false;
	}
}

function readFeatureFlags(value: string): FeatureFlagSnapshot {
	if (!value) return { version: 1, flags: {} };
	try {
		const candidate: unknown = JSON.parse(value);
		if (
			typeof candidate !== 'object' ||
			candidate === null ||
			(candidate as { version?: unknown }).version !== 1 ||
			typeof (candidate as { flags?: unknown }).flags !== 'object' ||
			(candidate as { flags: unknown }).flags === null ||
			!Object.entries((candidate as { flags: Record<string, unknown> }).flags).every(
				([key, enabled]) => /^[a-z][a-z0-9-]{2,63}$/.test(key) && typeof enabled === 'boolean',
			)
		)
			return { version: 1, flags: {} };
		return candidate as FeatureFlagSnapshot;
	} catch {
		return { version: 1, flags: {} };
	}
}

const stageValue = read('VITE_CLOUD_STAGE');

export const cloudConfig: CloudConfig = {
	stage: stageValue === 'dev' || stageValue === 'prod' ? stageValue : '',
	region: read('VITE_CLOUD_REGION'),
	userPoolId: read('VITE_COGNITO_USER_POOL_ID'),
	userPoolClientId: read('VITE_COGNITO_CLIENT_ID'),
	signalingWsUrl: read('VITE_SIGNALING_WS_URL'),
	syncApiUrl: read('VITE_SYNC_API_URL'),
	appApiUrl: read('VITE_APP_API_URL'),
	publicAppUrl: read('VITE_PUBLIC_APP_URL'),
};

/** Server-controlled capability snapshot. Malformed or absent values fail closed. */
export const featureFlags = readFeatureFlags(read('VITE_FEATURE_FLAGS'));
export const isFeatureEnabled = (key: string): boolean => featureFlags.flags[key] === true;

const identityConfigIsValid =
	validRegion(cloudConfig.region) &&
	validUserPoolId(cloudConfig.userPoolId, cloudConfig.region) &&
	validClientId(cloudConfig.userPoolClientId);

/** True only when every value needed to reach the cloud is present. */
export const isCloudConfigured: boolean = Boolean(
	identityConfigIsValid && validApiUrl(cloudConfig.signalingWsUrl, 'wss:'),
);

/** True when identity is configured (sign-in possible even if signaling isn't). */
export const isAuthConfigured: boolean = identityConfigIsValid;

/** True when the E2EE cloud-sync backend is reachable (identity + sync API present). */
export const isSyncConfigured: boolean = Boolean(
	isAuthConfigured && validApiUrl(cloudConfig.syncApiUrl, 'https:'),
);

/**
 * True when the application backend (marketplace/invites/account/entitlements) is reachable.
 * Fail-closed: every account-backed surface stays in its labeled local state when absent.
 */
export const isAccountApiConfigured: boolean = Boolean(
	isAuthConfigured && validApiUrl(cloudConfig.appApiUrl, 'https:'),
);

/** True when packaged builds can create links another device can open. */
export const isPublicAppConfigured: boolean = validPublicAppUrl(cloudConfig.publicAppUrl);
