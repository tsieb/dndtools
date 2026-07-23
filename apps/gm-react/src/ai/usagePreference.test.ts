import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
	private values = new Map<string, string>();
	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('AI usage preference', () => {
	it('fails closed to none until the user explicitly chooses complete use', async () => {
		const preference = await import('./usagePreference');
		expect(preference.getAiUsagePreference()).toBe('none');
		expect(preference.isAiAssistantEnabled()).toBe(false);
	});

	it('keeps random generation without enabling provider-backed assistance', async () => {
		const preference = await import('./usagePreference');
		preference.saveAiUsagePreference('generation-only');
		expect(preference.getAiUsagePreference()).toBe('generation-only');
		expect(preference.isAiAssistantEnabled()).toBe(false);
		preference.saveAiUsagePreference('complete');
		expect(preference.isAiAssistantEnabled()).toBe(true);
	});
});
