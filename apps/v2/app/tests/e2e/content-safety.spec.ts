import { expect, test, type Page } from '@playwright/test';

// SEC-003 — CONTENT SAFETY (rendered markdown). A malicious payload authored into a note's body — a
// classic `<script>` injection, an `<img onerror=…>` event-handler vector, and a `javascript:` URL — must
// NOT execute when the note is rendered. The Processing Core sanitizes the content (raw HTML stripped,
// dangerous URL schemes neutralized) and the GUI binds it as escaped text, so the payload renders as inert
// characters: no script element is created, no dangerous attribute survives, and no dialog fires. This is a
// rendering/visible-flow surface that renders identically on desktop and compact profiles, so it runs on
// BOTH Playwright projects.

test.describe('SEC-003 content safety — malicious note content does not execute', () => {
	test.beforeEach(async ({ page }) => {
		// Fail the test if ANY payload manages to open a dialog (the strongest proof a script ran).
		page.on('dialog', async (dialog) => {
			await dialog.dismiss();
			throw new Error(`A script executed and opened a dialog: ${dialog.message()}`);
		});
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	async function createNote(page: Page, title: string): Promise<void> {
		await page.getByTestId('note-new-title').fill(title);
		await page.getByTestId('note-new-visibility').selectOption('dm-only');
		await page.getByTestId('note-create').click();
		await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
	}

	test('a `<script>` / `<img onerror>` / `javascript:` payload renders inert', async ({ page }) => {
		await createNote(page, 'XSS Trap');

		const payload = [
			'# Trap',
			'',
			'<script>window.__pwned = true; alert("xss")</script>',
			'',
			'<img src=x onerror="window.__pwned = true">',
			'',
			'[click me](javascript:window.__pwned = true)',
		].join('\n');
		await page.getByTestId('note-body').fill(payload);

		// The preview is the rendered surface. Wait for it to reflect the new body.
		const preview = page.getByTestId('note-preview');
		await expect(preview).toBeVisible();

		// The rendered content created NO <script> and NO <img> element inside the preview region.
		expect(await preview.locator('script').count()).toBe(0);
		expect(await preview.locator('img').count()).toBe(0);

		// No element in the preview carries a dangerous event-handler attribute.
		const hasOnerror = await preview.evaluate(
			(node) => node.querySelector('[onerror], [onload], [onclick]') !== null,
		);
		expect(hasOnerror).toBe(false);

		// No anchor in the preview points at a `javascript:` URL (the scheme was neutralized).
		const hasJsHref = await preview.evaluate((node) => {
			const anchors = Array.from(node.querySelectorAll('a'));
			return anchors.some((a) => (a.getAttribute('href') ?? '').toLowerCase().includes('javascript:'));
		});
		expect(hasJsHref).toBe(false);

		// The script never ran: the sentinel flag was not set.
		const pwned = await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned === true);
		expect(pwned).toBe(false);

		// The neutralized `javascript:` link target survives only as the inert sentinel, never as a live href.
		await expect(preview).toContainText('about:blank#blocked');
	});
});
