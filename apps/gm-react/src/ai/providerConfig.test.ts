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
	// Existing provider tests exercise configured transport behavior; consent-specific behavior lives
	// in usagePreference.test.ts. Explicitly opt this test device into the complete mode.
	localStore.setItem('dndtools.ai.usage-preference', 'complete');
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

// --- model router (RC-AI-3.1) --------------------------------------------------------------------
// The router names the backends the assistant can reach, states what each one can do, and routes
// each task to one of them. Everything it persists is non-secret metadata; the credential path
// stays exactly as the cases above assert. Node reports a web runtime, whose capabilities allow
// http loopback, so the local-runner cases below exercise the available path unless a case mocks
// the platform as Android.

/** Load providerConfig with the platform reporting an Android runtime (no loopback allowed). */
async function loadConfigOnAndroid() {
	vi.resetModules();
	const actual = await vi.importActual<typeof import('../platform/capabilities')>(
		'../platform/capabilities',
	);
	vi.doMock('../platform/capabilities', () => ({
		...actual,
		getPlatformCapabilities: () => ({
			...actual.getPlatformCapabilities(),
			runtimeKind: 'android',
			allowHttpLoopbackAi: false,
		}),
	}));
	const mod = await import('./providerConfig');
	mod.__testing.resetMemory();
	return mod;
}

describe('model router — backend capabilities', () => {
	it('reports Anthropic as generation-only with its declared context window', async () => {
		const cfg = await loadConfig();
		const status = cfg.describeAiBackend('provider');
		expect(status.capabilities).toEqual({
			generation: true,
			embeddings: false,
			contextTokens: 200_000,
		});
	});

	it('reports an OpenAI-compatible endpoint as embeddings-capable with an undeclared context', async () => {
		const cfg = await loadConfig();
		cfg.saveAiProviderSettings({
			provider: 'openai-compatible',
			model: 'some-vendor-model',
			baseUrl: 'https://api.example.com/v1',
		});
		const status = cfg.describeAiBackend('provider');
		expect(status.capabilities.embeddings).toBe(true);
		expect(status.capabilities.contextTokens).toBeNull();
	});

	it('declares context windows per model id rather than per provider', async () => {
		const cfg = await loadConfig();
		expect(cfg.declaredContextTokens('claude-opus-5')).toBe(200_000);
		expect(cfg.declaredContextTokens('gpt-4o-mini')).toBe(128_000);
		expect(cfg.declaredContextTokens('qwen2.5:7b')).toBe(32_768);
		expect(cfg.declaredContextTokens('something-nobody-published')).toBeNull();
	});

	it('states the one reason a backend is unusable, worst gate first', async () => {
		const cfg = await loadConfig();
		// No key yet, and the local runner needs neither key nor settings.
		expect(cfg.describeAiBackend('provider')).toMatchObject({
			available: false,
			reason: 'no-key',
		});
		expect(cfg.describeAiBackend('local')).toMatchObject({ available: true, reason: null });
		// Consent is the outermost gate for every backend.
		localStore.setItem('dndtools.ai.usage-preference', 'none');
		for (const backend of cfg.AI_BACKEND_IDS) {
			expect(cfg.describeAiBackend(backend)).toMatchObject({
				available: false,
				reason: 'consent-off',
			});
		}
	});

	it('reports incomplete provider settings before it looks for a key', async () => {
		const cfg = await loadConfig();
		cfg.saveAiProviderSettings({ provider: 'openai-compatible', baseUrl: '' });
		expect(cfg.describeAiBackend('provider')).toMatchObject({
			available: false,
			reason: 'incomplete-settings',
			destination: null,
		});
	});

	it('fails the local runner closed on a platform that blocks loopback requests', async () => {
		const cfg = await loadConfigOnAndroid();
		expect(cfg.describeAiBackend('local')).toMatchObject({
			available: false,
			reason: 'platform-unsupported',
		});
		expect(cfg.routeAiTask('assistant')).toMatchObject({ available: false });
		vi.doUnmock('../platform/capabilities');
	});
});

describe('model router — per-task routing', () => {
	it('routes every task to the configured provider until told otherwise', async () => {
		const cfg = await loadConfig();
		expect(cfg.getAiTaskRouting()).toEqual({ assistant: 'provider', embeddings: 'provider' });
	});

	it('persists a routing patch and ignores a corrupt stored table', async () => {
		const cfg = await loadConfig();
		cfg.saveAiTaskRouting({ assistant: 'local' });
		expect((await loadConfig()).getAiTaskRouting().assistant).toBe('local');
		localStore.setItem('dndtools.ai.task-routing', '{ not json');
		expect((await loadConfig()).getAiTaskRouting()).toEqual({
			assistant: 'provider',
			embeddings: 'provider',
		});
		localStore.setItem('dndtools.ai.task-routing', JSON.stringify({ assistant: 'nonsense' }));
		expect((await loadConfig()).getAiTaskRouting().assistant).toBe('provider');
	});

	it('keeps the routing table out of the credential path', async () => {
		const cfg = await loadConfig();
		cfg.saveAiTaskRouting({ assistant: 'local' });
		cfg.saveAiLocalBackendSettings({ model: 'qwen2.5:14b' });
		expect(localStore.values().join(' ')).not.toContain('sk-');
		expect(sessionStore.size).toBe(0);
	});

	it('turns one job off without touching the credential', async () => {
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-a');
		cfg.saveAiTaskRouting({ assistant: 'off' });
		expect(cfg.routeAiTask('assistant')).toEqual({
			available: false,
			backendId: null,
			reason: 'task-off',
		});
		// The assistant surface follows the router, so it goes off with it.
		expect(cfg.resolveAiProviderConfig()).toBeNull();
		expect(cfg.getAiProviderKey()).toBe('sk-a');
		cfg.saveAiTaskRouting({ assistant: 'provider' });
		expect(cfg.resolveAiProviderConfig()).not.toBeNull();
	});

	it('refuses a task the chosen backend cannot do, naming the missing capability', async () => {
		const cfg = await loadConfig();
		await cfg.setAiProviderKey('sk-a');
		// Anthropic can generate but has no embeddings endpoint.
		expect(cfg.routeAiTask('assistant').available).toBe(true);
		expect(cfg.routeAiTask('embeddings')).toEqual({
			available: false,
			backendId: 'provider',
			reason: 'capability-missing',
		});
	});

	it('routes a task to the local runner with its own model and no provider key', async () => {
		const cfg = await loadConfig();
		cfg.saveAiLocalBackendSettings({ model: 'nomic-embed-text' });
		cfg.saveAiTaskRouting({ embeddings: 'local' });
		const route = cfg.routeAiTask('embeddings');
		expect(route).toMatchObject({ available: true, backendId: 'local' });
		expect(route.available && route.config).toEqual({
			provider: 'openai-compatible',
			model: 'nomic-embed-text',
			baseUrl: 'http://localhost:11434/v1',
			apiKey: cfg.__testing.LOCAL_BEARER_PLACEHOLDER,
		});
		// The configured provider is still keyless, so the generation task remains off.
		expect(cfg.routeAiTask('assistant')).toMatchObject({ reason: 'no-key' });
	});

	it('falls back to the shipped local model when the stored one is blank or corrupt', async () => {
		const cfg = await loadConfig();
		expect(cfg.getAiLocalBackendSettings().model).toBe('qwen2.5:7b');
		expect(cfg.saveAiLocalBackendSettings({ model: '   ' }).model).toBe('qwen2.5:7b');
		localStore.setItem('dndtools.ai.local-backend', '{ not json');
		expect(cfg.getAiLocalBackendSettings().model).toBe('qwen2.5:7b');
	});
});
