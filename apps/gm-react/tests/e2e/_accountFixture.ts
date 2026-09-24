import type { Page } from '@playwright/test';

/**
 * `offline` serves a cached comparison, `loading` holds the first account check open (the visual
 * suite pins its skeleton), and `preview`/`checkout` fail the first save or handoff once.
 */
export type AccountFixtureMode = 'preview' | 'checkout' | 'offline' | 'loading';

// Serve a test-only entitlement hook at the browser boundary. The real route, dialogs and
// billing-mode decisions render unchanged; no account, payment or external API is contacted.
// Call before the first navigation.
export async function serveAccountFixture(page: Page, mode: AccountFixtureMode): Promise<void> {
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
    const [loading, setLoading] = useState(${mode === 'loading'});
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
}
