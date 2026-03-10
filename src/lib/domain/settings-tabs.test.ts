import { describe, expect, it } from 'vitest';
import { resolveSettingsTabFromUrl } from '$lib/domain/settings-tabs.js';

function url(value: string): URL {
	return new URL(value, 'https://example.test');
}

describe('resolveSettingsTabFromUrl', () => {
	it('resolves new progressive-disclosure tabs', () => {
		expect(resolveSettingsTabFromUrl(url('/settings?tab=appearance'))).toBe('appearance');
		expect(resolveSettingsTabFromUrl(url('/settings?tab=features'))).toBe('features');
		expect(resolveSettingsTabFromUrl(url('/settings?tab=maps'))).toBe('maps');
	});

	it('keeps legacy hash support for mcp anchor', () => {
		expect(resolveSettingsTabFromUrl(url('/settings#mcp-changes'))).toBe('mcp');
		expect(resolveSettingsTabFromUrl(url('/settings#mcp'))).toBe('mcp');
	});
});
