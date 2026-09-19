import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from '../../../tests/e2e/_helpers';

test('single-page printable sheet and platform PDF export', async ({ page }, info) => {
	test.slow();
	await markOnboarded(page);
	await gotoRoute(page, '/player');
	await seedFresh(page);
	await waitReady(page);
	const sheet = page.getByRole('article', {
		name: 'Printable character sheet',
		includeHidden: true,
	});
	await expect(sheet).toBeAttached();
	await expect(sheet).toBeHidden();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Print / Save PDF' }).click();
	const download = await downloadPromise;
	const exported = info.outputPath('character-export.pdf');
	await download.saveAs(exported);
	expect(execFileSync('pdfinfo', [exported], { encoding: 'utf8' })).toMatch(/Pages:\s+1/);
	await info.attach('platform-export', { path: exported, contentType: 'application/pdf' });
	await page.emulateMedia({ media: 'print' });
	await expect(sheet).toBeVisible();
	const path = info.outputPath('character-print.pdf');
	await page.pdf({ path, preferCSSPageSize: true });
	expect(execFileSync('pdfinfo', [path], { encoding: 'utf8' })).toMatch(/Pages:\s+1/);
	const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' });
	expect(text).toContain('Character sheet');
	expect(text).toContain('Equipment');
	expect(text).not.toContain('Print / Save PDF');
	await info.attach('print-pdf', { path, contentType: 'application/pdf' });
	// Rasterized PDF snapshot avoids PDF metadata and creation-time differences.
	for (const [source, name] of [
		[path, 'print'],
		[exported, 'export'],
	]) {
		const prefix = info.outputPath(name);
		execFileSync('pdftoppm', ['-scale-to', '1000', '-png', '-singlefile', source, prefix]);
		expect(readFileSync(`${prefix}.png`)).toMatchSnapshot(`${name}.png`, {
			maxDiffPixelRatio: 0.01,
		});
	}
});

// Content bounds are exercised separately from the stable seeded snapshot.
test('long Unicode content remains a single printable page', async ({ page }, info) => {
	test.slow();
	await markOnboarded(page);
	await gotoRoute(page, '/player');
	await seedFresh(page);
	await waitReady(page);
	await page.evaluate(async () => {
		const rt = window.__rt!;
		const chars = (
			rt.state.characters as { characters: Record<string, { id: string; kind: string }> }
		).characters;
		for (const c of Object.values(chars).filter((c) => c.kind === 'pc')) {
			const result = await rt.dispatch({
				type: 'character.edit-field',
				actorId: rt.defaultActorId,
				payload: { characterId: c.id, path: 'data.backstory', value: '旅人 Éowyn 🐉 '.repeat(500) },
			});
			if (result.status !== 'accepted') throw new Error('Fixture update rejected');
		}
	});
	await page.emulateMedia({ media: 'print' });
	await expect(page.locator('.character-print-sheet')).toContainText('旅人');
	const path = info.outputPath('long-content.pdf');
	await page.pdf({ path, preferCSSPageSize: true });
	expect(execFileSync('pdfinfo', [path], { encoding: 'utf8' })).toMatch(/Pages:\s+1/);
});
