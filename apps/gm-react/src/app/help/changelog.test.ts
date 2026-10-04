import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLAYER_NOTES_HEADING, latestRelease, parseChangelog, plainText } from './changelog';

// RC-UX-3.4 — proves the parser against a fixture AND the repo's real CHANGELOG.md, so a future
// edit that breaks the "What's new" section fails a fast unit test instead of only the e2e gate.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_CHANGELOG = join(HERE, '..', '..', '..', '..', '..', 'CHANGELOG.md');
const APP_PACKAGE_JSON = join(HERE, '..', '..', '..', 'package.json');

const FIXTURE = `# Changelog

## [Unreleased]

## [0.2.0] - 2026-06-01

### For players and GMs

- Added the thing.
- Fixed the other thing.

### Changes

- Moved the \`thing.add\` reducer behind the command bus.

## [0.1.0] - 2026-05-01

### For players and GMs

- Initial release.
`;

describe('parseChangelog', () => {
	it('reads only the For players and GMs block of each release', () => {
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

	it('ignores bullets outside the block, and prose inside it', () => {
		const releases = parseChangelog(
			'## [1.0.0] - 2026-01-01\n\n- A maintainer bullet.\n\n### For players and GMs\n\nSome prose.\n- A bullet.\n',
		);
		expect(releases).toEqual([{ version: '1.0.0', date: '2026-01-01', items: ['A bullet.'] }]);
	});

	it('joins a bullet that wraps onto the following lines', () => {
		const releases = parseChangelog(
			'## [1.0.0] - 2026-01-01\n\n### For players and GMs\n\n- A long note that\n  wraps here\nand here.\n- Next.\n',
		);
		expect(releases[0]!.items).toEqual(['A long note that wraps here and here.', 'Next.']);
	});

	it('strips code spans, emphasis and link syntax down to the words', () => {
		const releases = parseChangelog(
			'## [1.0.0] - 2026-01-01\n\n### For players and GMs\n\n- Run `pnpm thing` from **Settings** and read [the guide](docs/x.md).\n- A stray ` tick.\n',
		);
		expect(releases[0]!.items).toEqual([
			'Run pnpm thing from Settings and read the guide.',
			'A stray tick.',
		]);
		for (const item of releases[0]!.items) expect(item).not.toMatch(/[`*[\]]/);
	});

	it('returns an empty list for a changelog with no headings yet', () => {
		expect(parseChangelog('# Changelog\n\nNothing here yet.\n')).toEqual([]);
	});
});

describe('plainText', () => {
	it('keeps snake_case and single asterisks that are not emphasis', () => {
		expect(plainText('a player_private note, 2 * 3')).toBe('a player_private note, 2 * 3');
		expect(plainText('an *emphasised* word')).toBe('an emphasised word');
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

	it('is null when nothing has shipped', () => {
		expect(latestRelease(parseChangelog('## [Unreleased]\n'))).toBeNull();
	});

	it.each(['Unreleased', 'unreleased', ' UNRELEASED '])(
		'skips populated [%s] preview notes without discarding them from the parser',
		(heading) => {
			const releases = parseChangelog(
				FIXTURE.replace(
					'## [Unreleased]',
					`## [${heading}]\n\n### For players and GMs\n\n- Planned feature.`,
				),
			);
			expect(releases[0]).toEqual({
				version: heading,
				date: null,
				items: ['Planned feature.'],
			});
			expect(latestRelease(releases)?.version).toBe('0.2.0');
		},
	);

	it('is null when only populated preview notes exist', () => {
		expect(
			latestRelease(
				parseChangelog('## [Unreleased]\n\n### For players and GMs\n\n- Planned feature.\n'),
			),
		).toBeNull();
	});

	// "No notes for this release" — an engineering-only release does not reach back to older notes.
	it('is null when the latest shipped release has no player block', () => {
		const releases = parseChangelog('## [0.3.0] - 2026-07-01\n\n- Internal fix.\n\n' + FIXTURE);
		expect(releases[0]).toEqual({ version: '0.3.0', date: '2026-07-01', items: [] });
		expect(latestRelease(releases)).toBeNull();
	});
});

// The block is for the table, not the maintainers (ONB-9). These are the nouns the 0.3.x changelog
// actually leaked into What's new, plus the obvious neighbours.
const ENGINEERING_NOUNS =
	/\b(javac|exception|gradle|pnpm|npm|reducer|schema|command bus|op-log|ciphertext|kms|adr|api|ci|e2e|playwright|vitest|eslint|typescript|tsx|json|dependabot|electron-updater|indexeddb|dexie|capacitor|refactor|commit|branch|merge|regression|gate)\b|RC-[A-Z]+-\d/i;

describe('the real CHANGELOG.md', () => {
	const markdown = readFileSync(REPO_CHANGELOG, 'utf8');
	const releases = parseChangelog(markdown);

	it('has a latest shipped release with player notes', () => {
		expect(releases.length).toBeGreaterThan(0);
		const latest = latestRelease(releases);
		expect(latest).not.toBeNull();
		expect(latest!.items.length).toBeGreaterThan(0);
	});

	it('writes every For players and GMs block without code spans or engineering nouns', () => {
		const blocks = markdown
			.split(/^### /m)
			.filter((block) => block.startsWith(PLAYER_NOTES_HEADING));
		expect(blocks.length).toBeGreaterThan(0);
		for (const block of blocks) {
			const body = block.split(/^## /m)[0]!;
			expect(body).not.toContain('`');
		}
		for (const item of releases.flatMap((release) => release.items)) {
			expect(item, item).not.toMatch(ENGINEERING_NOUNS);
		}
	});
});

describe("the shipped version is the changelog's latest release", () => {
	// What's new's "New" chip compares the seen version against the BUILT version
	// (`__APP_VERSION__`, from package.json) so the shell never parses the changelog at boot; the menu
	// body shows the changelog's latest release. This keeps the two sources honest with each other.
	it('agree, so the chip and the release notes name the same version', () => {
		const latest = latestRelease(parseChangelog(readFileSync(REPO_CHANGELOG, 'utf8')));
		const { version } = JSON.parse(readFileSync(APP_PACKAGE_JSON, 'utf8')) as { version: string };
		expect(latest?.version).toBe(version);
	});
});
