import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// providerConfig.ts owns the DEVICE-LOCAL AI settings + BYO-key custody. These tests drive OUR
// logic: the non-secret settings survive in localStorage (metadata only), the key lives in
// memory + sessionStorage (NEVER localStorage / the vault / sync), and the resolve path is
// fail-closed — no key, or an OpenAI-compatible provider without a base URL, yields null so
// every AI surface stays off. The OS-encrypted durable mirror reports unavailable under Node
// (secureStore's web fallback), so these cases exercise the memory + sessionStorage path.

class MemoryStorage {
	private map = new Map<string, string>();
	getItem(k: string): string | null {
		return this.map.has(k) ? (this.map.get(k) as string) : null;
	}
	setItem(k: string, v: string): void {
		this.map.set(k, String(v));
	}
	removeItem(k: string): void {
		this.map.delete(k);
	}
	clear(): void {
		this.map.clear();
	}
	get size(): number {
		return this.map.size;
	}
	has(k: string): boolean {
		return this.map.has(k);
	}
	values(): string[] {
		return [...this.map.values()];
	}
}

let localStore: MemoryStorage;
let sessionStore: MemoryStorage;

async function loadConfig() {
	vi.resetModules();
	const mod = await import('./providerConfig');
	mod.__testing.resetMemory();
	return mod;
}

beforeEach(() => {
	localStore = new MemoryStorage();
	sessionStore = new MemoryStorage();
	vi.stubGlobal('localStorage', localStore);
	vi.stubGlobal('sessionStorage', sessionStore);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('non-secret settings (localStorage, metadata only)', () => {
	it('defaults to the Anthropic provider + claude-sonnet-5 model when nothing is stored', async () => {
		const cfg = await loadConfig();
		const s = cfg.getAiProviderSettings();
		expect(s.provider).toBe('anthropic');
		expect(s.model).toBe('claude-sonnet-5');
		expect(cfg.DEFAULT_ANTHROPIC_MODEL).toBe('claude-sonnet-5');
		expect(s.baseUrl).toBe('');
	});

	it('persists a settings patch and reads it back after a reload', async () => {
		let cfg = await loadConfig();
		cfg.saveAiProviderSettings({
			provider: 'openai-compatible',
			model: 'local-model',
			baseUrl: 'https://x/v1',
		});
		// simulate a reload: fresh module, same backing localStorage
		cfg = await import('./providerConfig');
		const s = cfg.getAiProviderSettings();
		expect(s.provider).toBe('openai-compatible');
		expect(s.model).toBe('local-model');
		expect(s.baseUrl).toBe('https://x/v1');
	});

	it('falls back to defaults on corrupt persisted JSON', async () => {
		const cfg = await loadConfig();
		localStore.setItem('dndtools.ai.provider-settings', '{not json');
		const s = cfg.getAiProviderSettings();
		expect(s.provider).toBe('anthropic');
		expect(s.model).toBe('claude-sonnet-5');
	});

	it('replaces a blank model with the default rather than persisting empty', async () => {
		const cfg = await loadConfig();
		const s = cfg.saveAiProviderSettings({ model: '   ' });
		expect(s.model).toBe('claude-sonnet-5');
	});
});

describe('key custody (memory + sessionStorage, never localStorage)', () => {
	it('stores the key in sessionStorage and memory but NEVER in localStorage', async () => {
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-secret-123');
		expect(cfg.getAiProviderKey()).toBe('sk-secret-123');
		expect(sessionStore.values()).toContain('sk-secret-123');
		// the whole point: no credential ever reaches localStorage (which can be inspected / backed up)
		expect(localStore.values()).not.toContain('sk-secret-123');
	});

	it('trims the key and treats a blank key as a clear', async () => {
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('  sk-trim  ');
		expect(cfg.getAiProviderKey()).toBe('sk-trim');
		await cfg.setAiProviderKey('   ');
		expect(cfg.getAiProviderKey()).toBeNull();
	});

	it('forgets the key from both memory and sessionStorage on clear', async () => {
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-x');
		await cfg.clearAiProviderKey();
		expect(cfg.getAiProviderKey()).toBeNull();
		expect(
			sessionStore.has('dndtools.ai.provider-key:v2:anthropic:https://api.anthropic.com'),
		).toBe(false);
	});

	it('recovers the key from sessionStorage when module memory was reset (page reload)', async () => {
		let cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-persist');
		// fresh module (memory cleared) but the same sessionStorage backing
		cfg = await import('./providerConfig');
		cfg.__testing.resetMemory();
		expect(cfg.getAiProviderKey()).toBe('sk-persist');
	});

	it('waits for the desktop encrypted store and reports durable custody truthfully', async () => {
		const bridge = {
			available: vi.fn(async () => true),
			get: vi.fn(async () => null),
			set: vi.fn(async () => true),
			remove: vi.fn(async () => true),
			keys: vi.fn(async () => []),
		};
		vi.stubGlobal('dndtoolsSecureStore', bridge);
		const cfg = await loadConfig();

		await expect(cfg.setAiProviderKey('sk-desktop')).resolves.toEqual({
			saved: true,
			storage: 'os-encrypted',
			durableError: false,
		});
		expect(bridge.set).toHaveBeenCalledWith(
			'ai:provider-key:v2:anthropic:https://api.anthropic.com',
			'sk-desktop',
		);
	});

	it('does not claim a key was forgotten when durable deletion fails', async () => {
		const bridge = {
			available: vi.fn(async () => true),
			get: vi.fn(async () => null),
			set: vi.fn(async () => true),
			remove: vi.fn(async () => false),
			keys: vi.fn(async () => []),
		};
		vi.stubGlobal('dndtoolsSecureStore', bridge);
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-still-there');

		await expect(cfg.clearAiProviderKey()).resolves.toEqual({
			cleared: false,
			durableError: true,
		});
		expect(cfg.getAiProviderKey()).toBe('sk-still-there');
		expect(sessionStore.values()).toContain('sk-still-there');
	});

	it('never carries a key across provider origins or silently reactivates it after switching back', async () => {
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-anthropic');

		cfg.saveAiProviderSettings({
			provider: 'openai-compatible',
			baseUrl: 'https://api.example.com/v1',
		});
		expect(cfg.getAiProviderKey()).toBeNull();
		expect(cfg.resolveAiProviderConfig()).toBeNull();

		cfg.saveAiProviderSettings({ provider: 'anthropic' });
		expect(cfg.getAiProviderKey()).toBeNull();
		expect(sessionStore.values()).toContain('sk-anthropic');
	});

	it('scopes OpenAI-compatible credentials by normalized origin, not API path', async () => {
		const cfg = await loadConfig();
		cfg.saveAiProviderSettings({
			provider: 'openai-compatible',
			baseUrl: 'https://API.Example.com/v1/',
		});
		await cfg.setAiProviderKey('sk-origin');
		const destination = cfg.resolveAiProviderDestination();
		expect(destination).toMatchObject({
			origin: 'https://api.example.com',
			scope: 'openai-compatible:https://api.example.com',
		});

		cfg.saveAiProviderSettings({ baseUrl: 'https://api.example.com/another-api' });
		expect(cfg.getAiProviderKey()).toBe('sk-origin');
	});

	it('detects but never auto-binds the legacy unscoped key', async () => {
		sessionStore.setItem('dndtools.ai.provider-key', 'sk-legacy-unassigned');
		const cfg = await loadConfig();

		expect(cfg.hasLegacyAiProviderKey()).toBe(true);
		expect(cfg.getAiProviderKey()).toBeNull();
		expect(cfg.resolveAiProviderConfig()).toBeNull();
		expect(sessionStore.values()).toContain('sk-legacy-unassigned');
	});

	it('removes a legacy copy without disturbing the newly scoped credential', async () => {
		sessionStore.setItem('dndtools.ai.provider-key', 'sk-legacy-unassigned');
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-current-scoped');

		await expect(cfg.clearLegacyAiProviderKey()).resolves.toEqual({
			cleared: true,
			durableError: false,
		});
		expect(cfg.hasLegacyAiProviderKey()).toBe(false);
		expect(cfg.getAiProviderKey()).toBe('sk-current-scoped');
	});

	it('detects a legacy desktop key without reading or migrating its secret', async () => {
		const bridge = {
			available: vi.fn(async () => true),
			get: vi.fn(async () => 'must-not-be-read'),
			set: vi.fn(async () => true),
			remove: vi.fn(async () => true),
			keys: vi.fn(async () => ['ai:provider-key']),
		};
		vi.stubGlobal('dndtoolsSecureStore', bridge);
		const cfg = await loadConfig();
		await cfg.hydrateAiProviderKey();

		expect(cfg.hasLegacyAiProviderKey()).toBe(true);
		expect(cfg.getAiProviderKey()).toBeNull();
		expect(bridge.get).not.toHaveBeenCalled();
	});

	it('hydrates only a scoped desktop key with a matching active binding', async () => {
		const durableKey = 'ai:provider-key:v2:anthropic:https://api.anthropic.com';
		const scope = 'anthropic:https://api.anthropic.com';
		localStore.setItem('dndtools.ai.active-credential-scope', scope);
		const bridge = {
			available: vi.fn(async () => true),
			get: vi.fn(async (key: string) => (key === durableKey ? 'sk-scoped-desktop' : null)),
			set: vi.fn(async () => true),
			remove: vi.fn(async () => true),
			keys: vi.fn(async () => [durableKey]),
		};
		vi.stubGlobal('dndtoolsSecureStore', bridge);
		const cfg = await loadConfig();
		await cfg.hydrateAiProviderKey();

		expect(cfg.getAiProviderKey()).toBe('sk-scoped-desktop');
		expect(bridge.get).toHaveBeenCalledWith(durableKey);
	});

	it('does not hydrate a scoped desktop key after its active binding was removed', async () => {
		const durableKey = 'ai:provider-key:v2:anthropic:https://api.anthropic.com';
		const bridge = {
			available: vi.fn(async () => true),
			get: vi.fn(async () => 'sk-must-stay-inactive'),
			set: vi.fn(async () => true),
			remove: vi.fn(async () => true),
			keys: vi.fn(async () => [durableKey]),
		};
		vi.stubGlobal('dndtoolsSecureStore', bridge);
		const cfg = await loadConfig();
		await cfg.hydrateAiProviderKey();

		expect(cfg.getAiProviderKey()).toBeNull();
		expect(bridge.get).not.toHaveBeenCalled();
	});
});

describe('resolveAiProviderConfig — fail closed', () => {
	it('returns null and reports unconfigured with no key', async () => {
		const cfg = await loadConfig();
		expect(cfg.resolveAiProviderConfig()).toBeNull();
		expect(cfg.isAiProviderConfigured()).toBe(false);
	});

	it('resolves a full Anthropic config once a key is set', async () => {
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-a');
		const resolved = cfg.resolveAiProviderConfig();
		expect(resolved).toEqual({
			provider: 'anthropic',
			model: 'claude-sonnet-5',
			baseUrl: '',
			apiKey: 'sk-a',
		});
		expect(cfg.isAiProviderConfigured()).toBe(true);
	});

	it('stays unconfigured for an OpenAI-compatible provider that lacks a base URL, even with a key', async () => {
		const cfg = await loadConfig();
		cfg.saveAiProviderSettings({ provider: 'openai-compatible', baseUrl: '' });
		await cfg.setAiProviderKey('sk-a');
		expect(cfg.resolveAiProviderConfig()).toBeNull();
		expect(cfg.isAiProviderConfigured()).toBe(false);
	});

	it('resolves an OpenAI-compatible config once a base URL is provided', async () => {
		const cfg = await loadConfig();
		cfg.saveAiProviderSettings({
			provider: 'openai-compatible',
			model: 'm',
			baseUrl: 'https://api.example.com/v1',
		});
		await cfg.setAiProviderKey('sk-a');
		expect(cfg.resolveAiProviderConfig()).toEqual({
			provider: 'openai-compatible',
			model: 'm',
			baseUrl: 'https://api.example.com/v1',
			apiKey: 'sk-a',
		});
	});

	it('rejects provider URLs that could expose a key over cleartext or URL credentials', async () => {
		const cfg = await loadConfig();
		for (const baseUrl of [
			'http://api.example.com/v1',
			'https://user:pass@api.example.com/v1',
			'file:///tmp/provider',
			'https://api.example.com/v1?redirect=evil',
		]) {
			cfg.saveAiProviderSettings({ provider: 'openai-compatible', baseUrl });
			await cfg.setAiProviderKey('sk-a');
			expect(cfg.resolveAiProviderConfig()).toBeNull();
		}
	});

	it('allows HTTP only for a loopback local runner and normalizes trailing slashes', async () => {
		const cfg = await loadConfig();
		expect(cfg.validateAiBaseUrl('http://127.0.0.1:11434/v1/')).toMatchObject({
			valid: true,
			normalized: 'http://127.0.0.1:11434/v1',
			origin: 'http://127.0.0.1:11434',
		});
		expect(cfg.validateAiBaseUrl('http://192.168.1.20:11434/v1').valid).toBe(false);
	});

	it('rejects even loopback HTTP under the Android HTTPS-only policy', async () => {
		const cfg = await loadConfig();
		expect(
			cfg.validateAiBaseUrl('http://127.0.0.1:11434/v1', { allowHttpLoopback: false }),
		).toMatchObject({
			valid: false,
			message: expect.stringMatching(/Android requires HTTPS.*desktop app/i),
		});
		expect(
			cfg.validateAiBaseUrl('https://api.example.com/v1', { allowHttpLoopback: false }).valid,
		).toBe(true);
	});

	it('enforces the hosted-web origin allowlist before a provider request', async () => {
		vi.stubEnv('VITE_AI_ALLOWED_ORIGINS', 'https://api.openai.com https://api.anthropic.com');
		const cfg = await loadConfig();
		const base = { provider: 'openai-compatible' as const, model: 'm', apiKey: 'sk-a' };
		expect(
			await cfg.authorizeAiProviderNetworkAccess({ ...base, baseUrl: 'https://api.openai.com/v1' }),
		).toBe(true);
		expect(
			await cfg.authorizeAiProviderNetworkAccess({ ...base, baseUrl: 'https://evil.example/v1' }),
		).toBe(false);
	});

	it('fails closed for hosted providers when the web allowlist is empty', async () => {
		vi.stubEnv('VITE_AI_ALLOWED_ORIGINS', '');
		const cfg = await loadConfig();
		const base = { provider: 'openai-compatible' as const, model: 'm', apiKey: 'sk-a' };

		expect(
			await cfg.authorizeAiProviderNetworkAccess({
				...base,
				baseUrl: 'https://api.example.com/v1',
			}),
		).toBe(false);
	});

	it('allows an explicitly selected loopback runner during local development', async () => {
		vi.stubEnv('VITE_AI_ALLOWED_ORIGINS', '');
		const cfg = await loadConfig();
		const allowed = await cfg.authorizeAiProviderNetworkAccess({
			provider: 'openai-compatible',
			model: 'local',
			apiKey: 'local-key',
			baseUrl: 'http://127.0.0.1:11434/v1',
		});

		expect(allowed).toBe(import.meta.env.DEV);
	});
});
