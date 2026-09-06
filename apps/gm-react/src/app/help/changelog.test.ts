import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { latestRelease, parseChangelog } from './changelog';

// RC-UX-3.4 — proves the parser against a fixture AND the repo's real CHANGELOG.md, so a future
// edit that breaks the "What's new" section fails a fast unit test instead of only the e2e gate.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_CHANGELOG = join(HERE, '..', '..', '..', '..', '..', 'CHANGELOG.md');

const FIXTURE = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-06-01

- Added the thing.
- Fixed the other thing.

## [0.1.0] - 2026-05-01

- Initial release.
`;

describe('parseChangelog', () => {
	it('parses each heading into a release with its bullets', () => {
		const releases = parseChangelog(FIXTURE);
		expect(releases).toEqual([
			{ version: 'Unreleased', date: null, items: [] },
			{
				version: '0.2.0',
				date: '2026-06-01',
				items: ['Added the thing.', 'Fixed the other thing.'],
			},
			{ version: '0.1.0', date: '2026-05-01', items: ['Initial release.'] },
		]);
	});

	it('ignores prose and non-bullet lines under a heading', () => {
		const releases = parseChangelog('## [1.0.0] - 2026-01-01\n\nSome prose.\n- A bullet.\n');
		expect(releases).toEqual([{ version: '1.0.0', date: '2026-01-01', items: ['A bullet.'] }]);
	});

	it('returns an empty list for a changelog with no headings yet', () => {
		expect(parseChangelog('# Changelog\n\nNothing here yet.\n')).toEqual([]);
	});
});

describe('latestRelease', () => {
	it('skips an empty leading [Unreleased] section', () => {
		const releases = parseChangelog(FIXTURE);
		expect(latestRelease(releases)).toEqual({
			version: '0.2.0',
			date: '2026-06-01',
			items: ['Added the thing.', 'Fixed the other thing.'],
		});
	});

	it('is null when nothing has shipped notes', () => {
		expect(latestRelease(parseChangelog('## [Unreleased]\n'))).toBeNull();
	});
});

describe('the real CHANGELOG.md', () => {
	it('parses without error and has a most-recent release with at least one item', () => {
		const markdown = readFileSync(REPO_CHANGELOG, 'utf8');
		const releases = parseChangelog(markdown);
		expect(releases.length).toBeGreaterThan(0);
		const latest = latestRelease(releases);
		expect(latest).not.toBeNull();
		expect(latest!.items.length).toBeGreaterThan(0);
	});
});
