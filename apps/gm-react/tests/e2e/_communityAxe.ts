import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
export async function communityAxe(page: Page) {
	// Scan the settled overlay, not a transient alpha-composited animation frame.
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
				.map((animation) => animation.finished.catch(() => undefined)),
		);
	});
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(results.violations).toEqual([]);
}
