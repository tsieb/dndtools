// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// RC-UX-6.2 — an invite carries the campaign's one stored name. The account API is stubbed; the DS
// Dialog portals to `document.body`, so every query here reads the body, not the mount container.
const mocks = vi.hoisted(() => ({
	createInvite: vi.fn(),
	listInvites: vi.fn(),
}));

vi.mock('../../cloud/appApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../cloud/appApi')>();
	return { ...actual, createInvite: mocks.createInvite, listInvites: mocks.listInvites };
});
vi.mock('../../cloud/entitlements', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../cloud/entitlements')>();
	return { ...actual, useEntitlements: () => ({ plan: 'hearth', canChangePlan: false }) };
});
vi.mock('../../platform/publicAppUrl', () => ({
	publicAppBaseUrl: () => 'https://lamplight.click/',
	publicAppHashUrl: (route: string) => `https://lamplight.click/#${route}`,
}));
vi.mock('../../net/qr', () => ({ qrDataUrl: async () => 'data:image/png;base64,' }));

const { Toaster, ToastViewport } = await import('../../ds');
const { I18nProvider } = await import('../../i18n');
const { InvitesPanel } = await import('./PlayerInvites');

let root: Root;
let container: HTMLDivElement;

async function mount(campaign: string | null, onNameCampaign = vi.fn(async () => true)) {
	await act(async () => {
		root.render(
			<I18nProvider>
				<InvitesPanel
					cloudReady
					createOpen
					onCloseCreate={() => {}}
					campaign={campaign}
					onNameCampaign={onNameCampaign}
				/>
				<ToastViewport />
			</I18nProvider>,
		);
		for (let i = 0; i < 4; i++) await Promise.resolve();
	});
	return onNameCampaign;
}

const shownName = () =>
	document.body.querySelector('[data-testid="invite-campaign-name"]')?.textContent;
const nameField = () =>
	document.body.querySelector<HTMLInputElement>('input[aria-label="Campaign name"]');
const createButton = () =>
	[...document.body.querySelectorAll('button')].find(
		(button) => button.textContent?.trim() === 'Create invite',
	)!;

async function click(el: HTMLElement) {
	await act(async () => {
		el.click();
		for (let i = 0; i < 8; i++) await Promise.resolve();
	});
}

async function type(input: HTMLInputElement, value: string) {
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
		setter.call(input, value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

beforeEach(() => {
	(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mocks.listInvites.mockReset();
	mocks.listInvites.mockResolvedValue([]);
	mocks.createInvite.mockReset();
	mocks.createInvite.mockImplementation(async (input: { campaignName: string }) => ({
		inviteId: 'inv-1',
		token: 'tok-1',
		campaignName: input.campaignName,
		note: '',
		role: 'player',
		createdAt: '2026-10-08T00:00:00.000Z',
		expiresAt: 1_791_000_000,
		emailStatus: 'none',
	}));
	Toaster.clear();
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	Toaster.clear();
});

describe('Create invite reads the campaign name', () => {
	it('shows the stored name, offers no second field, and mints the invite with it', async () => {
		const onNameCampaign = await mount('Lantern Coast');
		expect(shownName()).toBe('Lantern Coast');
		expect(nameField()).toBeNull();
		await click(createButton());
		expect(mocks.createInvite).toHaveBeenCalledWith(
			expect.objectContaining({ campaignName: 'Lantern Coast' }),
		);
		expect(onNameCampaign).not.toHaveBeenCalled();
	});

	it('follows a rename while the dialog is open', async () => {
		await mount('Lantern Coast');
		await mount('Saltreach');
		expect(shownName()).toBe('Saltreach');
		await click(createButton());
		expect(mocks.createInvite).toHaveBeenCalledWith(
			expect.objectContaining({ campaignName: 'Saltreach' }),
		);
	});

	it('names an unnamed campaign before its first invite, then mints with that name', async () => {
		const onNameCampaign = await mount(null);
		expect(shownName()).toBeUndefined();
		await type(nameField()!, '  Lantern Coast ');
		await click(createButton());
		expect(onNameCampaign).toHaveBeenCalledWith('Lantern Coast');
		expect(mocks.createInvite).toHaveBeenCalledWith(
			expect.objectContaining({ campaignName: 'Lantern Coast' }),
		);
	});

	it('mints nothing when the campaign name is refused', async () => {
		const onNameCampaign = await mount(
			null,
			vi.fn(async () => false),
		);
		await type(nameField()!, 'Lantern Coast');
		await click(createButton());
		expect(onNameCampaign).toHaveBeenCalledWith('Lantern Coast');
		expect(mocks.createInvite).not.toHaveBeenCalled();
	});
});
