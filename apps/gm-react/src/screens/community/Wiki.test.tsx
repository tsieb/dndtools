// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';

vi.mock('../../app/useViewport', () => ({ useViewport: () => 'desktop' }));
vi.mock('../../cloud/config', () => ({ isAccountApiConfigured: true }));
vi.mock('../../cloud/AuthContext', () => ({ useAuth: () => ({ status: 'signed-in' }) }));
vi.mock('../../cloud/entitlements', () => ({
	useEntitlements: () => ({ plan: 'beacon', loading: false, canChangePlan: false }),
}));
vi.mock('../../platform/publicAppUrl', () => ({
	publicAppBaseUrl: () => 'https://app.example',
	publicAppHashUrl: () => 'https://app.example/#/wiki?id=campaign1234',
}));
vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => ({
		defaultActorId: 'dm',
		state: { content: {}, permissions: {}, session: {} },
	}),
}));
vi.mock('@dndtools/core', async (original) => ({
	...(await original<typeof import('@dndtools/core')>()),
	getContentItemsForActor: () => [
		{
			id: 'note1',
			title: 'Harbour',
			body: 'DM projection must not leave the vault',
			kind: 'note',
			visibility: 'player-visible',
			updatedAt: '2026-09-01',
		},
	],
	getContentItemDetailForActor: () => ({
		visible: true,
		body: 'Public harbour lore',
		visibleFields: { 'dndtools.folder': 'Places / Coast' },
	}),
	getSessionRecapFeedForActor: () => [
		{
			archiveId: 'archive1',
			title: 'First voyage',
			markdown: 'Shared recap\n> [!Secret]\n> Hidden treasure',
			authoredAt: '2026-09-01',
		},
	],
}));
vi.mock('../../cloud/appApi', async (original) => ({
	...(await original<typeof import('../../cloud/appApi')>()),
	getMyWiki: vi.fn().mockResolvedValue(null),
	publishWiki: vi.fn().mockResolvedValue({
		wikiId: 'campaign1234',
		title: 'Coast',
		access: 'public',
		pageCount: 2,
		size: 123,
		publishedAt: '2026-09-01',
		updatedAt: '2026-09-01',
		recapCount: 1,
	}),
}));
const { publishWiki, getMyWiki } = await import('../../cloud/appApi');
const { CommWiki } = await import('./Wiki');
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	vi.mocked(publishWiki).mockClear();
	vi.mocked(getMyWiki).mockResolvedValue(null);
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
});
async function mount() {
	await act(async () =>
		root.render(
			<I18nProvider>
				<MemoryRouter>
					<CommWiki />
				</MemoryRouter>
			</I18nProvider>,
		),
	);
}
it('publishes the safe note projection and includes shared recaps only after opting in', async () => {
	await mount();
	const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]')!;
	expect(checkbox.getAttribute('aria-checked')).toBe('false');
	await act(async () => checkbox.click());
	expect(checkbox.getAttribute('aria-checked')).toBe('true');
	const publish = [...container.querySelectorAll('button')].find(
		(b) => b.textContent === 'Publish wiki',
	)!;
	await act(async () => publish.click());
	const input = vi.mocked(publishWiki).mock.calls[0][0];
	expect(input.pages).toHaveLength(2);
	expect(input.pages[0]).toMatchObject({
		markdown: 'Public harbour lore',
		folder: 'Places / Coast',
	});
	expect(input.pages[1]).toMatchObject({
		kind: 'recap',
		markdown: 'Shared recap',
		title: 'First voyage',
	});
	expect(JSON.stringify(input)).not.toMatch(/Hidden treasure|DM projection|authoredBy/);
});
it('restores the recap selection when reopening a published wiki', async () => {
	vi.mocked(getMyWiki).mockResolvedValue({
		wikiId: 'campaign1234',
		title: 'Coast',
		access: 'public',
		pageCount: 2,
		size: 123,
		publishedAt: '2026-09-01',
		updatedAt: '2026-09-01',
		...{ recapCount: 1 },
	});
	await mount();
	expect(container.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe('true');
});
