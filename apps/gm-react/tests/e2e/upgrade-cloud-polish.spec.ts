import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, waitReady } from './_helpers';

// Serve a test-only entitlement hook at the browser boundary. The real route, dialogs and
// billing-mode decisions render unchanged; no account, payment or external API is contacted.
async function accountFixture(page: Page, mode: 'preview' | 'checkout' | 'offline') {
	await page.route('**/src/cloud/entitlements.ts', async (route) => {
		const response = await route.fetch();
		const source = await response.text();
		const reactUrl = source.match(/from "([^"]*\/react\.js[^"]*)"/)?.[1];
		if (!reactUrl)
			throw new Error('Could not resolve the app React module for the account fixture');
		return route.fulfill({
			contentType: 'text/javascript',
			body: `
   import React from '${reactUrl}';
   const {useState, useRef} = React;
   import {OFFLINE_FALLBACK_MATRIX} from '/src/cloud/entitlements.ts?pol-original';
   export * from '/src/cloud/entitlements.ts?pol-original';
   export function useEntitlements() {
    const [plan, setPlanState] = useState('hearth');
    const [loading, setLoading] = useState(false);
    const [source, setSource] = useState('${mode === 'offline' ? 'cache' : 'server'}');
    const attempts = useRef(0);
    return {plan, features:OFFLINE_FALLBACK_MATRIX, source, loading,
     serverBacked:true, canChangePlan:true, simulated:${mode !== 'checkout'},
     billing:${mode === 'checkout' ? "{provider:'stripe', checkoutAvailable:true, portalAvailable:false, active:false, livemode:false}" : 'null'},
     refresh:async () => {setLoading(true); await new Promise(r=>setTimeout(r,300)); setSource('server'); setLoading(false);},
     setPlan:async id => { await new Promise(r=>setTimeout(r,300)); if (++attempts.current === 1) throw new Error('Could not save your plan choice. Try again.'); setPlanState(id); }
    };
   }
  `,
		});
	});
	if (mode === 'checkout')
		await page.route('**/src/cloud/billing.ts', (route) =>
			route.fulfill({
				contentType: 'text/javascript',
				body: `export * from '/src/cloud/billing.ts?pol-original'; export async function startCheckout() { await new Promise(r=>setTimeout(r,300)); throw new Error('Checkout could not be opened. Try again.'); }`,
			}),
		);
	await markOnboarded(page);
	await gotoRoute(page, '/upgrade');
	await waitReady(page);
}

async function checkAxe(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => {})),
		);
	});
	expect(
		(
			await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
				.analyze()
		).violations,
	).toEqual([]);
}

test('account save failure retains the dialog and lets the user retry', async ({ page }) => {
	await accountFixture(page, 'preview');
	await page.getByRole('button', { name: 'Try Lantern preview' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Save plan choice' }).click();
	await expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Could not save your plan choice. Try again.' }),
	).toBeVisible();
	await checkAxe(page);
	await dialog.getByRole('button', { name: 'Save plan choice' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(
		page.getByRole('status').filter({ hasText: 'Now trying the Lantern preview' }),
	).toBeVisible();
});

test('hosted checkout dialog is accessible and a failed handoff can be retried', async ({
	page,
}) => {
	await accountFixture(page, 'checkout');
	await page.getByRole('button', { name: 'Subscribe to Lantern' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await checkAxe(page);
	await dialog.getByRole('button', { name: 'Continue to secure checkout' }).click();
	await expect(dialog.getByRole('button', { name: 'Opening checkout…' })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Checkout could not be opened. Try again.' }),
	).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Continue to secure checkout' })).toBeEnabled();
});

test('stale account comparison is illustrated and refresh shows a loading state', async ({
	page,
}) => {
	await accountFixture(page, 'offline');
	await expect(page.locator('[data-illustration="connection-lost"]')).toBeVisible();
	await page.getByRole('button', { name: 'Check again' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Checking your plan…' })).toBeVisible();
	await expect(page.locator('[data-skeleton="list"]')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Check again' })).toHaveCount(0);
	await expect(page.getByText('Checking your plan…')).toHaveCount(0);
	await checkAxe(page);
});
