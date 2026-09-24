import { expect, test } from '@playwright/test';
import { markOnboarded, waitReady } from './_helpers';

test('a corrupted fixture opens the vault and exports its quarantined original', async ({
	page,
}) => {
	await markOnboarded(page);
	await page.addInitScript(() => {
		Object.defineProperty(navigator.storage, 'estimate', {
			value: async () => ({ usage: 80, quota: 100 }),
		});
	});
	await page.goto('/');
	await waitReady(page);
	await page.evaluate(async () => {
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('dndtools-v2');
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const db = request.result;
				const tx = db.transaction('documents', 'readwrite');
				const documents = tx.objectStore('documents');
				// Two shapes of damage in one fixture: a document that is not an object at all, and
				// one whose containers are intact but whose NESTED system package is malformed —
				// the latter only surfaces inside the core hydrator, past container validation.
				documents.put({ key: 'content-state', doc: '{"items":' });
				documents.put({
					key: 'systems-state',
					doc: {
						schemaVersion: 1,
						activePackageId: 'homebrew',
						packages: { homebrew: { id: 'homebrew', attributes: 'not-an-array' } },
					},
				});
				tx.oncomplete = () => {
					db.close();
					setTimeout(resolve, 0);
				};
				tx.onerror = () => reject(tx.error);
			};
		});
	});
	await page.goto('/#/settings?tab=vault');
	await page.reload();
	await waitReady(page);
	await expect(page.getByText('Documents needing recovery', { exact: true })).toBeVisible();
	await expect(page.getByText('content-state', { exact: true })).toBeVisible();
	await expect(page.getByText('systems-state', { exact: true })).toBeVisible();
	await expect(page.getByRole('alert').filter({ hasText: '80%' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Free space', exact: true })).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export content-state for recovery' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('content-state-recovery.json');
	const stream = await download.createReadStream();
	const chunks = [];
	for await (const chunk of stream!) chunks.push(chunk);
	expect(JSON.parse(Buffer.concat(chunks).toString()).original).toBe('{"items":');
	await page.reload();
	await waitReady(page);
	await expect(page.getByText('content-state', { exact: true })).toBeVisible();
	await expect(page.getByText('systems-state', { exact: true })).toBeVisible();
});
