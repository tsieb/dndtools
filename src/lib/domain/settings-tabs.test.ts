import { describe, expect, it } from 'vitest';
import { resolveSettingsTabFromUrl } from './settings-tabs.js';

describe('resolveSettingsTabFromUrl', () => {
	it('prefers explicit tab query param', () => {
		expect(resolveSettingsTabFromUrl(new URL('https://example.test/settings?tab=mcp'))).toBe('mcp');
		expect(resolveSettingsTabFromUrl(new URL('https://example.test/settings?tab=vault'))).toBe(
			'vault',
		);
		expect(resolveSettingsTabFromUrl(new URL('https://example.test/settings?tab=world'))).toBe(
			'world',
		);
		expect(resolveSettingsTabFromUrl(new URL('https://example.test/settings?tab=handouts'))).toBe(
			'handouts',
		);
		expect(resolveSettingsTabFromUrl(new URL('https://example.test/settings?tab=health'))).toBe(
			'health',
		);
	});

	it('maps MCP hash links to the MCP tab', () => {
		expect(resolveSettingsTabFromUrl(new URL('https://example.test/settings#mcp-changes'))).toBe(
			'mcp',
		);
		expect(resolveSettingsTabFromUrl(new URL('https://example.test/settings#mcp'))).toBe('mcp');
	});

	it('returns null for URLs without a tab hint', () => {
		expect(resolveSettingsTabFromUrl(new URL('https://example.test/settings'))).toBeNull();
	});
});
