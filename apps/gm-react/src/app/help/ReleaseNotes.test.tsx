// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { ReleaseNotes } from './ReleaseNotes';
import { latestRelease, parseChangelog, type ReleaseNote } from './changelog';

const REPO_CHANGELOG = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
	'..',
	'..',
	'CHANGELOG.md',
);

async function renderNotes(load: () => Promise<ReleaseNote | null>): Promise<string> {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	try {
		await act(async () =>
			root.render(
				<I18nProvider>
					<ReleaseNotes load={load} />
				</I18nProvider>,
			),
		);
		return container.textContent ?? '';
	} finally {
		act(() => root.unmount());
		container.remove();
	}
}

it('distinguishes loading, failure, retry and an empty release', async () => {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	let reject!: (reason: Error) => void;
	const load = vi
		.fn<() => Promise<ReleaseNote | null>>()
		.mockImplementationOnce(
			() =>
				new Promise((_, fail) => {
					reject = fail;
				}),
		)
		.mockResolvedValueOnce(null);
	try {
		await act(async () =>
			root.render(
				<I18nProvider>
					<ReleaseNotes load={load} />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toContain('Loading release notes');
		expect(container.textContent).not.toContain('No notes for this release');
		await act(async () => reject(new Error('Chunk unavailable')));
		expect(container.textContent).toContain('Release notes couldn’t load. Try again.');
		await act(async () => container.querySelector('button')!.click());
		expect(load).toHaveBeenCalledTimes(2);
		expect(container.textContent).toContain('No notes for this release.');
	} finally {
		act(() => root.unmount());
		container.remove();
	}
});

// RC-UX-6.6 (ONB-9) — What's new is read by the table, so a code span never reaches the screen.
it('never renders a backtick, from the real CHANGELOG.md or from a block that slipped one in', async () => {
	const real = await renderNotes(async () =>
		latestRelease(parseChangelog(readFileSync(REPO_CHANGELOG, 'utf8'))),
	);
	expect(real).toMatch(/Version \d/);
	expect(real).not.toContain('`');

	const slipped = await renderNotes(async () =>
		latestRelease(
			parseChangelog(
				'## [9.9.9] - 2026-10-04\n\n### For players and GMs\n\n- Open `Settings` and press `?`.\n',
			),
		),
	);
	expect(slipped).toContain('Open Settings and press ?.');
	expect(slipped).not.toContain('`');
});

it('says "No notes for this release" when the latest release has no player block', async () => {
	const text = await renderNotes(async () =>
		latestRelease(parseChangelog('## [9.9.9] - 2026-10-04\n\n- Fixed the `Gradle` wrapper.\n')),
	);
	expect(text).toContain('No notes for this release.');
	expect(text).not.toContain('Gradle');
});
