import { describe, it, expect, beforeEach, vi } from 'vitest';

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
		cfg.saveAiProviderSettings({ provider: 'openai-compatible', model: 'local-model', baseUrl: 'https://x/v1' });
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
		cfg.setAiProviderKey('sk-secret-123');
		expect(cfg.getAiProviderKey()).toBe('sk-secret-123');
		expect(sessionStore.values()).toContain('sk-secret-123');
		// the whole point: no credential ever reaches localStorage (which can be inspected / backed up)
		expect(localStore.values()).not.toContain('sk-secret-123');
	});

	it('trims the key and treats a blank key as a clear', async () => {
		const cfg = await loadConfig();
		cfg.setAiProviderKey('  sk-trim  ');
		expect(cfg.getAiProviderKey()).toBe('sk-trim');
		cfg.setAiProviderKey('   ');
		expect(cfg.getAiProviderKey()).toBeNull();
	});

	it('forgets the key from both memory and sessionStorage on clear', async () => {
		const cfg = await loadConfig();
		cfg.setAiProviderKey('sk-x');
		cfg.clearAiProviderKey();
		expect(cfg.getAiProviderKey()).toBeNull();
		expect(sessionStore.has('dndtools.ai.provider-key')).toBe(false);
	});

	it('recovers the key from sessionStorage when module memory was reset (page reload)', async () => {
		let cfg = await loadConfig();
		cfg.setAiProviderKey('sk-persist');
		// fresh module (memory cleared) but the same sessionStorage backing
		cfg = await import('./providerConfig');
		cfg.__testing.resetMemory();
		expect(cfg.getAiProviderKey()).toBe('sk-persist');
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
		cfg.setAiProviderKey('sk-a');
		const resolved = cfg.resolveAiProviderConfig();
		expect(resolved).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5', baseUrl: '', apiKey: 'sk-a' });
		expect(cfg.isAiProviderConfigured()).toBe(true);
	});

	it('stays unconfigured for an OpenAI-compatible provider that lacks a base URL, even with a key', async () => {
		const cfg = await loadConfig();
		cfg.saveAiProviderSettings({ provider: 'openai-compatible', baseUrl: '' });
		cfg.setAiProviderKey('sk-a');
		expect(cfg.resolveAiProviderConfig()).toBeNull();
		expect(cfg.isAiProviderConfigured()).toBe(false);
	});

	it('resolves an OpenAI-compatible config once a base URL is provided', async () => {
		const cfg = await loadConfig();
		cfg.saveAiProviderSettings({ provider: 'openai-compatible', model: 'm', baseUrl: 'https://api.example.com/v1' });
		cfg.setAiProviderKey('sk-a');
		expect(cfg.resolveAiProviderConfig()).toEqual({
			provider: 'openai-compatible',
			model: 'm',
			baseUrl: 'https://api.example.com/v1',
			apiKey: 'sk-a',
		});
	});
});
