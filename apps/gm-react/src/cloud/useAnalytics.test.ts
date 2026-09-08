import { describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({
	cloudConfig: { appApiUrl: 'https://api.example.test/v1' },
	isAccountApiConfigured: true,
}));
vi.mock('../platform/capabilities', () => ({ platformCapabilities: { runtimeKind: 'web' } }));
vi.mock('../screens/settings/shared', () => ({ readTier: () => 'core' }));

import { screenForPath } from './useAnalytics';

// RC-CLD-1.4 — a URL is content. The mapping must collapse anything it does not recognise rather
// than pass a path segment through, since deep links carry ids and names.
describe('screenForPath', () => {
	it('maps the app’s top-level routes to their taxonomy value', () => {
		expect(screenForPath('/')).toBe('home');
		expect(screenForPath('/session')).toBe('session');
		expect(screenForPath('/settings/sync')).toBe('settings');
	});

	it('collapses an unknown route and everything below a known one', () => {
		expect(screenForPath('/knowledge/note-1a2b/The-Sunless-Citadel')).toBe('knowledge');
		expect(screenForPath('/scenes/aldric-the-grim')).toBe('other');
		expect(screenForPath('/whatever')).toBe('other');
	});
});
