import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// BACKUP & RESTORE — the full-vault Local backup panel (Settings → Sync & offline; WS-1). The
// whole persisted core slice plus every stored media byte serialize to ONE JSON file. Export fires
// a real browser download the spec inspects for a well-formed bundle; restore is fail-closed
// (a structurally-bad file is rejected BEFORE the destructive confirm dialog ever offers to
// overwrite the vault) and authoritative (a valid backup round-trips through IndexedDB and the
// hard reload). The vault under test is always the deterministic seeded demo vault (seedFresh),
// so a round-trip replaces demo-with-identical-demo — no real data is ever at risk.

/** A well-formed vault backup carries this envelope (platform/backup.ts). */
interface VaultBackupBundle {
	format: string;
	version: number;
	createdAt: string;
	assets: Array<{ id: string }>;
	[key: string]: unknown;
}

/** A seeded note that must survive a full backup→restore round-trip (proves import rebuilt state). */
const SEEDED_NOTE = 'Campaign Primer';

function seededNoteExists(page: Page): Promise<boolean> {
	return page.evaluate((t) => {
		const items = (window.__rt!.state.content as { items: Record<string, { title: string }> }).items;
		return Object.values(items).some((i) => i.title === t);
	}, SEEDED_NOTE);
}

test.describe('backup & restore: full-vault portability', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/settings?tab=sync');
		await seedFresh(page);
		await page.goto('/#/settings?tab=sync', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
		// The Local backup panel is part of the always-visible Sync & offline tab.
		await expect(page.getByText('Local backup')).not.toHaveCount(0);
	});

	test('exporting the vault fires a real download of a well-formed backup bundle', async ({ page }) => {
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Download backup' }).click();
		const download = await downloadPromise;

		// Named by the app's own convention: dndtools-vault-backup-YYYY-MM-DD.json.
		expect(download.suggestedFilename()).toMatch(/^dndtools-vault-backup-\d{4}-\d{2}-\d{2}\.json$/);

		const path = await download.path();
		const bundle = JSON.parse(await fs.readFile(path!, 'utf8')) as VaultBackupBundle;
		expect(bundle.format).toBe('dndtools-vault-backup');
		expect(bundle.version).toBe(1);
		expect(typeof bundle.createdAt).toBe('string');
		expect(Number.isNaN(Date.parse(bundle.createdAt))).toBe(false);
		expect(Array.isArray(bundle.assets)).toBe(true);

		// The panel confirms what actually left the browser, in the app's own voice.
		await expect(page.getByText(/Backup downloaded/)).not.toHaveCount(0);
	});

	test('a structurally-invalid file is rejected fail-closed and never opens the replace dialog', async ({ page }) => {
		// Write a plausible-but-invalid .json (valid JSON, wrong shape) to a temp file.
		const badPath = join(tmpdir(), `dndtools-bad-backup-${Date.now()}.json`);
		await fs.writeFile(badPath, JSON.stringify({ not: 'a vault backup' }), 'utf8');

		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: 'Restore from backup…' }).click();
		const chooser = await chooserPromise;
		await chooser.setFiles(badPath);

		// Validation is fail-closed: the file is rejected with an honest reason and the DESTRUCTIVE
		// "Replace this vault?" dialog is never offered.
		await expect(page.getByRole('status').filter({ hasText: /backup|invalid/i })).not.toHaveCount(0);
		await expect(page.getByText('Replace this vault?')).toHaveCount(0);

		await fs.rm(badPath, { force: true });
	});

	test('a real backup round-trips through the confirmation and rebuilds the vault', async ({ page }) => {
		// 1) Export the current seeded vault to a real file.
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Download backup' }).click();
		const download = await downloadPromise;
		const backupPath = await download.path();
		expect(backupPath).toBeTruthy();

		// 2) Feed that exact bundle back into the restore picker.
		const chooserPromise = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: 'Restore from backup…' }).click();
		const chooser = await chooserPromise;
		await chooser.setFiles(backupPath!);

		// A valid bundle passes validation and the authoritative confirm dialog appears, honestly
		// describing what will be replaced.
		await expect(page.getByText('Replace this vault?')).toBeVisible();
		await expect(page.getByText(/Restoring is authoritative/)).not.toHaveCount(0);

		// 3) Confirm the replace: importFullVault writes IndexedDB then hard-reloads. A sentinel on
		// window survives only until that reload, so its disappearance marks the fresh boot.
		await page.evaluate(() => ((window as unknown as { __preRestore?: boolean }).__preRestore = true));
		await page.getByRole('button', { name: 'Replace vault & reload' }).click();
		await page.waitForFunction(
			() => !(window as unknown as { __preRestore?: boolean }).__preRestore && window.__rt?.loaded === true,
			null,
			{ timeout: 20_000 },
		);

		// The restored vault rebuilt from the backup: the seeded note is present after the reload.
		expect(await seededNoteExists(page)).toBe(true);
	});
});
