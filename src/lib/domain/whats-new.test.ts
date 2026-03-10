import { describe, expect, it } from 'vitest';
import { getWhatsNewReleaseForVersion, parseChangelog } from './whats-new.js';

describe('parseChangelog', () => {
	it('parses version sections and bullet changes with links', () => {
		const releases = parseChangelog(`
# Changelog

## [1.2.3] - 2026-01-10
- Added guided onboarding. [Open Getting Started](/knowledge?panel=getting-started)
- Fixed search shortcuts.
`);
		expect(releases).toHaveLength(1);
		expect(releases[0]?.version).toBe('1.2.3');
		expect(releases[0]?.changes).toHaveLength(2);
		expect(releases[0]?.changes[0]?.links[0]?.href).toBe('/knowledge?panel=getting-started');
	});
});

describe('getWhatsNewReleaseForVersion', () => {
	it('resolves release notes for the current app version format', () => {
		const release = getWhatsNewReleaseForVersion('0.1.0');
		expect(release).not.toBeNull();
	});
});
