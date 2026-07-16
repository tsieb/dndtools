/**
 * providerConfig — the DEVICE-LOCAL AI provider configuration + API-KEY CUSTODY for the assistant
 * transport (the ADR-014 "AI/model architecture" deferral, closed by ADR-021). The user supplies
 * their OWN provider key (BYO-key — this app ships no key and proxies through no server), and the
 * whole AI surface stays fail-closed OFF until one is configured.
 *
 * KEY CUSTODY (mirrors the two sanctioned patterns side by side):
 *   - cloud/googleDocs.ts — secrets live in module memory + sessionStorage ONLY (never localStorage,
 *     never IndexedDB, never the vault/op-log). A web tab close forgets the key; re-paste to resume.
 *   - cloud/tokenStore.ts — when an OS-encrypted Electron or Android secure store is available, the
 *     key is ALSO mirrored there so a returning native-app user is configured without re-pasting. On the web
 *     that store reports unavailable and persists nothing (SEC-004: no plaintext at rest).
 *
 * Non-secret SETTINGS (provider kind, model id, custom base URL) persist in localStorage so the
 * choice survives reloads — the same metadata/secret split googleDocs draws (doc ids vs tokens).
 * Nothing in this module ever enters CoreStateSlice, a command payload, or the op-log, so the key
 * can never sync to another device or into a cloud backup.
 */

import { durableSecretStore, hasDurableSecretStoreBridge } from '../cloud/secureStore';
import { getElectronNetworkPolicyBridge, getPlatformCapabilities } from '../platform/capabilities';

/** The two supported transports: Anthropic's Messages API, or any OpenAI-compatible endpoint. */
export type AiProviderKind = 'anthropic' | 'openai-compatible';

export const AI_PROVIDER_KINDS: readonly AiProviderKind[] = ['anthropic', 'openai-compatible'];

/** The default Anthropic model the assistant uses until the user picks another. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

// Non-secret settings key (localStorage — survives reload; carries NO credential).
const SETTINGS_KEY = 'dndtools.ai.provider-settings';
// V1 used one global secret slot. It is intentionally detection/cleanup-only now: there is no safe
// way to infer which provider received that key, so migration must never bind it automatically.
const LEGACY_KEY_SESSION_KEY = 'dndtools.ai.provider-key';
const LEGACY_KEY_DURABLE_KEY = 'ai:provider-key';
// V2 scopes every secret slot to both transport and normalized receiving origin. The active-scope
// marker contains no secret and prevents switching away and back from silently reactivating a key.
const KEY_SESSION_PREFIX = 'dndtools.ai.provider-key:v2:';
const KEY_DURABLE_PREFIX = 'ai:provider-key:v2:';
const ACTIVE_SCOPE_KEY = 'dndtools.ai.active-credential-scope';
export const MAX_MODEL_CHARS = 200;
export const MAX_BASE_URL_CHARS = 2048;
export const MAX_API_KEY_CHARS = 4096;
export const MAX_AI_ORIGIN_CHARS = 180;

interface ElectronNetworkPolicyBridge {
	allowAiOrigin(origin: string): Promise<boolean>;
}

export interface AiProviderSettings {
	provider: AiProviderKind;
	/** The model id sent on every request. Defaults per provider; user-overridable. */
	model: string;
	/** OpenAI-compatible endpoints only: the API base URL (e.g. https://api.example.com/v1). */
	baseUrl: string;
}

/** The exact receiver a credential is scoped to. Model and URL path do not affect custody. */
export interface AiProviderDestination {
	provider: AiProviderKind;
	origin: string;
	/** Stable, non-secret identity used by the active binding and scoped storage keys. */
	scope: string;
	/** Full normalized API base shown when the user confirms where their key will be sent. */
	baseUrl: string;
}

/** A fully-resolved provider config the transport can call with. Only exists when a key is set. */
export interface ResolvedAiProviderConfig extends AiProviderSettings {
	apiKey: string;
}

const DEFAULT_SETTINGS: AiProviderSettings = {
	provider: 'anthropic',
	model: DEFAULT_ANTHROPIC_MODEL,
	baseUrl: '',
};

function isProviderKind(value: unknown): value is AiProviderKind {
	return (AI_PROVIDER_KINDS as readonly string[]).includes(value as string);
}

export interface AiBaseUrlValidation {
	valid: boolean;
	normalized: string;
	origin: string;
	message: string | null;
}

/**
 * Validate the destination that will receive the user's API key. Hosted providers
 * must use TLS. Plain HTTP is allowed only for an explicitly local runner on this
 * device; credentials, query strings, and fragments are never valid API bases.
 */
export function validateAiBaseUrl(
	input: string,
	options: { allowHttpLoopback?: boolean } = {},
): AiBaseUrlValidation {
	const trimmed = input.trim();
	const invalid = (message: string): AiBaseUrlValidation => ({
		valid: false,
		normalized: trimmed,
		origin: '',
		message,
	});
	if (!trimmed) return invalid('Enter the provider API base URL.');
	if (trimmed.length > MAX_BASE_URL_CHARS) return invalid('The provider URL is too long.');
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return invalid('Enter a complete provider URL.');
	}
	if (url.username || url.password) return invalid('Provider URLs cannot include credentials.');
	if (url.search || url.hash)
		return invalid('Provider URLs cannot include a query string or fragment.');
	const loopback =
		url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
	const allowHttpLoopback =
		options.allowHttpLoopback ?? getPlatformCapabilities().allowHttpLoopbackAi;
	if (url.protocol === 'http:' && loopback && !allowHttpLoopback) {
		return invalid(
			'Android requires HTTPS provider endpoints. Local Ollama connections are available in the desktop app.',
		);
	}
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && allowHttpLoopback)) {
		return invalid('Use HTTPS for hosted providers; HTTP is allowed only for a local runner.');
	}
	if (url.origin.length > MAX_AI_ORIGIN_CHARS) {
		return invalid('The provider host name is too long.');
	}
	const normalized = url.toString().replace(/\/+$/, '');
	return { valid: true, normalized, origin: url.origin, message: null };
}

/** Resolve and normalize the destination that would receive a provider credential. */
export function resolveAiProviderDestination(
	settings: AiProviderSettings = getAiProviderSettings(),
): AiProviderDestination | null {
	const base =
		settings.provider === 'anthropic'
			? validateAiBaseUrl('https://api.anthropic.com')
			: validateAiBaseUrl(settings.baseUrl);
	if (!base.valid) return null;
	return {
		provider: settings.provider,
		origin: base.origin,
		scope: `${settings.provider}:${base.origin}`,
		baseUrl: base.normalized,
	};
}

function networkPolicyBridge(): ElectronNetworkPolicyBridge | null {
	return getElectronNetworkPolicyBridge<ElectronNetworkPolicyBridge>();
}

function configuredWebAiOrigins(): Set<string> {
	const raw = import.meta.env.VITE_AI_ALLOWED_ORIGINS;
	if (typeof raw !== 'string' || raw.trim() === '') return new Set();
	return new Set(
		raw
			.split(/\s+/)
			.map((entry) => {
				try {
					return new URL(entry).origin;
				} catch {
					return '';
				}
			})
			.filter(Boolean),
	);
}

/**
 * Admit a resolved provider origin through the platform network policy. Electron
 * performs the final main-process allowlist update. Hosted web builds mirror their
 * non-empty build-time list in CloudFront CSP; local Vite builds have no CSP list.
 */
export async function authorizeAiProviderNetworkAccess(
	config: ResolvedAiProviderConfig,
): Promise<boolean> {
	const destination = resolveAiProviderDestination(config);
	if (!destination) return false;
	// Android's network-security policy blocks cleartext globally. Any user-selected HTTPS
	// provider remains available without relying on a desktop CSP/origin bridge.
	if (getPlatformCapabilities().runtimeKind === 'android') {
		return destination.origin.startsWith('https://');
	}
	const bridge = networkPolicyBridge();
	if (bridge) {
		try {
			return await bridge.allowAiOrigin(destination.origin);
		} catch {
			return false;
		}
	}
	const webOrigins = configuredWebAiOrigins();
	if (webOrigins.has(destination.origin)) return true;
	// A local runner is an explicit destination chosen by the developer and cannot receive traffic
	// from a production build without being compiled into its policy. Everything else, including an
	// empty production allowlist, fails closed.
	return (
		import.meta.env.DEV &&
		/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(destination.origin)
	);
}

/** The persisted non-secret settings, hydrated fail-safe (corrupt/absent ⇒ the defaults). */
export function getAiProviderSettings(): AiProviderSettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return { ...DEFAULT_SETTINGS };
		const parsed = JSON.parse(raw) as Partial<AiProviderSettings>;
		return {
			provider: isProviderKind(parsed.provider) ? parsed.provider : DEFAULT_SETTINGS.provider,
			model:
				typeof parsed.model === 'string' &&
				parsed.model.trim() !== '' &&
				parsed.model.trim().length <= MAX_MODEL_CHARS
					? parsed.model.trim()
					: DEFAULT_SETTINGS.model,
			baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl.trim() : '',
		};
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

/** Persist a settings patch (non-secret metadata only — the key NEVER goes through here). */
export function saveAiProviderSettings(patch: Partial<AiProviderSettings>): AiProviderSettings {
	const previous = getAiProviderSettings();
	const next = { ...previous, ...patch };
	if (next.model.trim() === '') next.model = DEFAULT_ANTHROPIC_MODEL;
	if (next.model.length > MAX_MODEL_CHARS) next.model = next.model.slice(0, MAX_MODEL_CHARS);
	const previousScope = resolveAiProviderDestination(previous)?.scope ?? null;
	const nextScope = resolveAiProviderDestination(next)?.scope ?? null;
	if (previousScope !== nextScope) deactivateCredentialScope();
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
	} catch {
		/* settings persistence is best-effort; the in-session value still applies via the caller */
	}
	return next;
}

// --- key custody (memory + sessionStorage + optional OS-encrypted mirror — never localStorage) ----

let memoryKeys = new Map<string, string>();
let activeScopeMemory: string | null = null;
let legacyKeyDetected = false;
let durableLegacyKeyDetected = false;
let keyMutationRevision = 0;
let durableMutationQueue: Promise<void> = Promise.resolve();

function queueDurableMutation<T>(operation: () => Promise<T>): Promise<T> {
	const result = durableMutationQueue.then(operation, operation);
	durableMutationQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

export interface AiProviderKeySaveResult {
	saved: boolean;
	storage: 'none' | 'session' | 'os-encrypted';
	/** A native encrypted-store bridge exists, but it could not confirm the write. */
	durableError: boolean;
}

export interface AiProviderKeyClearResult {
	cleared: boolean;
	/** The in-session key was retained because its durable copy could not be removed. */
	durableError: boolean;
}

function sessionKeyForScope(scope: string): string {
	return `${KEY_SESSION_PREFIX}${scope}`;
}

function durableKeyForScope(scope: string): string {
	return `${KEY_DURABLE_PREFIX}${scope}`;
}

function readActiveCredentialScope(): string | null {
	if (activeScopeMemory !== null) return activeScopeMemory;
	try {
		const stored = localStorage.getItem(ACTIVE_SCOPE_KEY);
		if (typeof stored === 'string' && stored !== '') {
			activeScopeMemory = stored;
			return stored;
		}
	} catch {
		/* the in-memory marker still supports this page lifetime */
	}
	return null;
}

function activateCredentialScope(scope: string): void {
	activeScopeMemory = scope;
	try {
		localStorage.setItem(ACTIVE_SCOPE_KEY, scope);
	} catch {
		/* the in-memory marker still supports this page lifetime */
	}
}

function deactivateCredentialScope(): void {
	activeScopeMemory = null;
	try {
		localStorage.removeItem(ACTIVE_SCOPE_KEY);
	} catch {
		/* absence is represented in memory for this page lifetime */
	}
}

function readSessionKey(scope: string): string | null {
	try {
		const raw = sessionStorage.getItem(sessionKeyForScope(scope));
		return typeof raw === 'string' && raw !== '' ? raw : null;
	} catch {
		return null;
	}
}

function getAiProviderKeyForSettings(settings: AiProviderSettings): string | null {
	const destination = resolveAiProviderDestination(settings);
	if (!destination || readActiveCredentialScope() !== destination.scope) return null;
	const key = memoryKeys.get(destination.scope) ?? readSessionKey(destination.scope);
	if (key !== null) memoryKeys.set(destination.scope, key);
	return key;
}

/** The configured provider API key, or null (absent ⇒ every AI surface stays off). */
export function getAiProviderKey(): string | null {
	return getAiProviderKeyForSettings(getAiProviderSettings());
}

/**
 * Store the user's provider key in memory + sessionStorage immediately, then wait for the optional
 * OS-encrypted durable store. The result lets the UI distinguish native persistence from a
 * session-only fallback instead of claiming a durable save before it has happened.
 */
export async function setAiProviderKey(key: string): Promise<AiProviderKeySaveResult> {
	const trimmed = key.trim();
	if (trimmed === '') {
		const result = await clearAiProviderKey();
		return {
			saved: result.cleared,
			storage: 'none',
			durableError: result.durableError,
		};
	}
	if (trimmed.length > MAX_API_KEY_CHARS) {
		return { saved: false, storage: 'none', durableError: false };
	}
	const destination = resolveAiProviderDestination();
	if (!destination) return { saved: false, storage: 'none', durableError: false };
	keyMutationRevision += 1;
	memoryKeys.set(destination.scope, trimmed);
	activateCredentialScope(destination.scope);
	try {
		sessionStorage.setItem(sessionKeyForScope(destination.scope), trimmed);
	} catch {
		/* sessionStorage unavailable — the in-memory copy still covers this page lifetime */
	}
	if (!hasDurableSecretStoreBridge) {
		return { saved: true, storage: 'session', durableError: false };
	}
	try {
		const stored = await queueDurableMutation(async () => {
			if (!(await durableSecretStore.available())) return false;
			return durableSecretStore.set(durableKeyForScope(destination.scope), trimmed);
		});
		return {
			saved: true,
			storage: stored ? 'os-encrypted' : 'session',
			durableError: !stored,
		};
	} catch {
		return { saved: true, storage: 'session', durableError: true };
	}
}

/**
 * Forget the key everywhere. In a native app, clear the durable copy first; if that cannot be
 * confirmed, retain the session copy so the UI never claims a key was forgotten when it can
 * return after restart.
 */
export async function clearAiProviderKey(): Promise<AiProviderKeyClearResult> {
	const scope = readActiveCredentialScope();
	if (scope === null) return { cleared: true, durableError: false };
	const revision = ++keyMutationRevision;
	if (hasDurableSecretStoreBridge) {
		try {
			const removed = await queueDurableMutation(async () => {
				if (!(await durableSecretStore.available())) return false;
				return durableSecretStore.remove(durableKeyForScope(scope));
			});
			if (!removed) return { cleared: false, durableError: true };
		} catch {
			return { cleared: false, durableError: true };
		}
	}
	// A newer save owns the local key; the queued durable operations already preserve their order.
	if (revision !== keyMutationRevision) return { cleared: false, durableError: false };
	memoryKeys.delete(scope);
	try {
		sessionStorage.removeItem(sessionKeyForScope(scope));
	} catch {
		/* nothing to clear */
	}
	if (readActiveCredentialScope() === scope) deactivateCredentialScope();
	return { cleared: true, durableError: false };
}

/** Whether an unscoped pre-v2 key exists. It is never returned to the transport. */
export function hasLegacyAiProviderKey(): boolean {
	if (legacyKeyDetected) return true;
	try {
		legacyKeyDetected = Boolean(sessionStorage.getItem(LEGACY_KEY_SESSION_KEY));
	} catch {
		/* storage unavailable */
	}
	return legacyKeyDetected;
}

/** Remove the old unassigned key only after an explicit user action. */
export async function clearLegacyAiProviderKey(): Promise<AiProviderKeyClearResult> {
	if (durableLegacyKeyDetected) {
		try {
			const removed = await queueDurableMutation(async () => {
				if (!(await durableSecretStore.available())) return false;
				return durableSecretStore.remove(LEGACY_KEY_DURABLE_KEY);
			});
			if (!removed) return { cleared: false, durableError: true };
		} catch {
			return { cleared: false, durableError: true };
		}
	}
	try {
		sessionStorage.removeItem(LEGACY_KEY_SESSION_KEY);
	} catch {
		/* nothing to clear */
	}
	legacyKeyDetected = false;
	durableLegacyKeyDetected = false;
	return { cleared: true, durableError: false };
}

/**
 * Load a durably-mirrored key back into memory at startup (native apps only — the web durable store
 * persists nothing). Called once from main.tsx before the app renders; safe to call repeatedly.
 */
export async function hydrateAiProviderKey(): Promise<void> {
	legacyKeyDetected = hasLegacyAiProviderKey();
	const revision = keyMutationRevision;
	try {
		if (!(await durableSecretStore.available())) return;
		const keys = await durableSecretStore.keys();
		durableLegacyKeyDetected = keys.includes(LEGACY_KEY_DURABLE_KEY);
		legacyKeyDetected ||= durableLegacyKeyDetected;
		if (getAiProviderKey() !== null) return;
		const destination = resolveAiProviderDestination();
		if (!destination || readActiveCredentialScope() !== destination.scope) return;
		const stored = await durableSecretStore.get(durableKeyForScope(destination.scope));
		if (
			revision === keyMutationRevision &&
			getAiProviderKey() === null &&
			typeof stored === 'string' &&
			stored !== ''
		) {
			memoryKeys.set(destination.scope, stored);
		}
	} catch {
		/* hydration is best-effort; the user can re-enter the key */
	}
}

/**
 * The resolved config the transport calls with, or null when the surface must stay off:
 * no key configured, or an OpenAI-compatible provider without a base URL. FAIL CLOSED — the
 * caller never fabricates a partial config.
 */
export function resolveAiProviderConfig(): ResolvedAiProviderConfig | null {
	const settings = getAiProviderSettings();
	const apiKey = getAiProviderKeyForSettings(settings);
	if (apiKey === null) return null;
	if (settings.provider === 'openai-compatible') {
		const base = validateAiBaseUrl(settings.baseUrl);
		if (!base.valid) return null;
		return { ...settings, baseUrl: base.normalized, apiKey };
	}
	return { ...settings, apiKey };
}

/** True only when a transport call could actually be made (key + complete settings). */
export function isAiProviderConfigured(): boolean {
	return resolveAiProviderConfig() !== null;
}

export const __testing = {
	SETTINGS_KEY,
	LEGACY_KEY_SESSION_KEY,
	LEGACY_KEY_DURABLE_KEY,
	ACTIVE_SCOPE_KEY,
	sessionKeyForScope,
	durableKeyForScope,
	/** Reset the module-memory key between tests (module state persists across cases). */
	resetMemory(): void {
		memoryKeys = new Map();
		activeScopeMemory = null;
		legacyKeyDetected = false;
		durableLegacyKeyDetected = false;
		keyMutationRevision = 0;
		durableMutationQueue = Promise.resolve();
	},
};
