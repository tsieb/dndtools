import type { Locator, Page } from '@playwright/test';

/** The full builder's rail is a disclosure on compact viewports. */
export async function builderStep(builder: Locator, name: string) {
	const rail = builder.getByTestId('widget-builder-steps');
	if (!(await rail.isVisible()))
		await builder.getByRole('button', { name: /Step \d+ of 8/ }).click();
	await rail.getByRole('button', { name, exact: true }).click();
	if (name === 'Advanced' || name === 'Style') {
		const disclosure = builder.locator('details').first();
		if (
			(await disclosure.count()) &&
			!(await disclosure.evaluate((node) => (node as HTMLDetailsElement).open))
		) {
			await disclosure.locator('summary').click();
		}
	}
}

export async function builderPane(page: Page, name: 'Edit' | 'Preview' | 'Definition') {
	const builder = page.getByRole('dialog', { name: /Widget builder/ });
	const strip = builder.getByTestId('builder-preview-strip');
	const definition = builder.getByRole('button', { name: 'Definition', exact: true });
	if (name === 'Definition') {
		if (!(await builder.getByTestId('widget-builder-json').isVisible())) {
			if ((await definition.getAttribute('aria-pressed')) === 'true') await definition.click();
			await definition.click();
		}
	} else if (await strip.isVisible()) {
		const preview = strip.getByRole('button', { name: 'Preview', exact: true });
		if (name === 'Preview') {
			if ((await preview.getAttribute('aria-expanded')) !== 'true') await preview.click();
		} else if ((await preview.getAttribute('aria-expanded')) === 'true') await preview.click();
		else if (await strip.getByRole('button', { name: 'Edit', exact: true }).isVisible())
			await strip.getByRole('button', { name: 'Edit', exact: true }).click();
	}
}
