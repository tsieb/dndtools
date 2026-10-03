// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { ReleaseNotes } from './ReleaseNotes';
import type { ReleaseNote } from './changelog';

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
		expect(container.textContent).not.toContain('No release notes');
		await act(async () => reject(new Error('Chunk unavailable')));
		expect(container.textContent).toContain('Release notes couldn’t load. Try again.');
		await act(async () => container.querySelector('button')!.click());
		expect(load).toHaveBeenCalledTimes(2);
		expect(container.textContent).toContain('No release notes yet.');
	} finally {
		act(() => root.unmount());
		container.remove();
	}
});
