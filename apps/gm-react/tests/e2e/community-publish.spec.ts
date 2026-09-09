import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CLD-4.3 — creator tooling: the publish checklist, license/changelog fields and the `.dndmodule`
// manifest they carry (packages/core/src/queries/publish-checklist.ts, 9 unit tests). Cloud-gated,
// same as wiki.spec.ts's Campaign-wiki spec: the e2e server blanks every VITE_* cloud coordinate, so
// `isAccountApiConfigured` is false and the whole Publish tab renders the honest local-only gate. This
// spec asserts that fail-closed state has no dead publish affordance — the checklist/license/changelog
// UI itself is unit-tested in core, since it only renders once signed in to a real cloud backend.

test.describe('community: publish surface fail-closed (Community → Publish)', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/community');
		await seedFresh(page);
		await page.goto('/#/community', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('is honestly local-only with no dead publish or checklist affordances', async ({ page }) => {
		await page.getByRole('tab', { name: 'Publish' }).click();

		// Fail closed: the marketplace gate states plainly there is no cloud backend, same wording
		// every other Community tab uses (MarketplaceGate, `screens/community/shared.tsx`).
		await expect(page.getByText('Local-only build')).not.toHaveCount(0);

		// No dead publish dialog, checklist, or license/changelog fields that would throw against an
		// unconfigured backend — the whole draft flow never mounts until signed in.
		await expect(page.getByRole('button', { name: 'Publish module' })).toHaveCount(0);
		await expect(page.getByTestId('publish-checklist')).toHaveCount(0);
		await expect(page.getByLabel('License')).toHaveCount(0);
		await expect(page.getByLabel('What changed in this version')).toHaveCount(0);
	});
});
