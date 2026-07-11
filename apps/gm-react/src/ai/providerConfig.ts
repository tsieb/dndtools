/**
 * providerConfig — the DEVICE-LOCAL AI provider configuration + API-KEY CUSTODY for the assistant
 * transport (the ADR-014 "AI/model architecture" deferral, closed by ADR-021). The user supplies
 * their OWN provider key (BYO-key — this app ships no key and proxies through no server), and the
 * whole AI surface stays fail-closed OFF until one is configured.
 *
 * KEY CUSTODY (mirrors the two sanctioned patterns side by side):
 *   - cloud/googleDocs.ts — secrets live in module memory + sessionStorage ONLY (never localStorage,
 *     never IndexedDB, never the vault/op-log). A web tab close forgets the key; re-paste to resume.
 *   - cloud/tokenStore.ts — when the OS-encrypted Electron secure store is available, the key is
 *     ALSO mirrored there so a returning desktop user is configured without re-pasting. On the web
 *     that store reports unavailable and persists nothing (SEC-004: no plaintext at rest).
 *
 * Non-secret SETTINGS (provider kind, model id, custom base URL) persist in localStorage so the
 * choice survives reloads — the same metadata/secret split googleDocs draws (doc ids vs tokens).
 * Nothing in this module ever enters CoreStateSlice, a command payload, or the op-log, so the key
 * can never sync to another device or into a cloud backup.
 */

import { durableSecretStore } from '../cloud/secureStore';

/** The two supported transports: Anthropic's Messages API, or any OpenAI-compatible endpoint. */
export type AiProviderKind = 'anthropic' | 'openai-compatible';

export const AI_PROVIDER_KINDS: readonly AiProviderKind[] = ['anthropic', 'openai-compatible'];

/** The default Anthropic model the assistant uses until the user picks another. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

// Non-secret settings key (localStorage — survives reload; carries NO credential).
const SETTINGS_KEY = 'dndtools.ai.provider-settings';
// Secret key custody: sessionStorage (tab-scoped) + the OS-encrypted durable store when available.
const KEY_SESSION_KEY = 'dndtools.ai.provider-key';
const KEY_DURABLE_KEY = 'ai:provider-key';

export interface AiProviderSettings {
	provider: AiProviderKind;
	/** The model id sent on every request. Defaults per provider; user-overridable. */
	model: string;
	/** OpenAI-compatible endpoints only: the API base URL (e.g. https://api.example.com/v1). */
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

/** The persisted non-secret settings, hydrated fail-safe (corrupt/absent ⇒ the defaults). */
export function getAiProviderSettings(): AiProviderSettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return { ...DEFAULT_SETTINGS };
		const parsed = JSON.parse(raw) as Partial<AiProviderSettings>;
		return {
			provider: isProviderKind(parsed.provider) ? parsed.provider : DEFAULT_SETTINGS.provider,
			model:
				typeof parsed.model === 'string' && parsed.model.trim() !== ''
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
	const next = { ...getAiProviderSettings(), ...patch };
	if (next.model.trim() === '') next.model = DEFAULT_ANTHROPIC_MODEL;
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
	} catch {
		/* settings persistence is best-effort; the in-session value still applies via the caller */
	}
	return next;
}

// --- key custody (memory + sessionStorage + optional OS-encrypted mirror — never localStorage) ----

let memoryKey: string | null = null;

function readSessionKey(): string | null {
	try {
		const raw = sessionStorage.getItem(KEY_SESSION_KEY);
		return typeof raw === 'string' && raw !== '' ? raw : null;
	} catch {
		return null;
	}
}

/** The configured provider API key, or null (absent ⇒ every AI surface stays off). */
export function getAiProviderKey(): string | null {
	const key = memoryKey ?? readSessionKey();
	if (key !== null) memoryKey = key;
	return key;
}

/**
 * Store the user's provider key: memory + sessionStorage now, and the OS-encrypted durable store
 * as a fire-and-forget mirror when the desktop shell provides one (tokenStore's exact pattern).
 */
export function setAiProviderKey(key: string): void {
	const trimmed = key.trim();
	if (trimmed === '') {
		clearAiProviderKey();
		return;
	}
	memoryKey = trimmed;
	try {
		sessionStorage.setItem(KEY_SESSION_KEY, trimmed);
	} catch {
		/* sessionStorage unavailable — the in-memory copy still covers this page lifetime */
	}
	void durableSecretStore
		.available()
		.then((ok) => (ok ? durableSecretStore.set(KEY_DURABLE_KEY, trimmed) : false))
		.catch(() => false);
}

/** Forget the key everywhere (memory, session, and the durable mirror). */
export function clearAiProviderKey(): void {
	memoryKey = null;
	try {
		sessionStorage.removeItem(KEY_SESSION_KEY);
	} catch {
		/* nothing to clear */
	}
	void durableSecretStore
		.available()
		.then((ok) => (ok ? durableSecretStore.remove(KEY_DURABLE_KEY) : undefined))
		.catch(() => undefined);
}

/**
 * Load a durably-mirrored key back into memory at startup (desktop only — the web durable store
 * persists nothing). Called once from main.tsx before the app renders; safe to call repeatedly.
 */
export async function hydrateAiProviderKey(): Promise<void> {
	if (getAiProviderKey() !== null) return;
	try {
		if (!(await durableSecretStore.available())) return;
		const stored = await durableSecretStore.get(KEY_DURABLE_KEY);
		if (typeof stored === 'string' && stored !== '') memoryKey = stored;
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
	const apiKey = getAiProviderKey();
	if (apiKey === null) return null;
	const settings = getAiProviderSettings();
	if (settings.provider === 'openai-compatible' && settings.baseUrl === '') return null;
	return { ...settings, apiKey };
}

/** True only when a transport call could actually be made (key + complete settings). */
export function isAiProviderConfigured(): boolean {
	return resolveAiProviderConfig() !== null;
}

export const __testing = {
	SETTINGS_KEY,
	KEY_SESSION_KEY,
	KEY_DURABLE_KEY,
	/** Reset the module-memory key between tests (module state persists across cases). */
	resetMemory(): void {
		memoryKey = null;
	},
};
