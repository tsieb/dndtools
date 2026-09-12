import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';
import { decodeFolderZip } from '../../../../packages/core/src/export/folder-zip';

const PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3XcAAAAASUVORK5CYII=';

test('folder ZIP keeps private notes opt-in and re-imports a note with its image and exact body', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/settings?tab=vault');
	await seedFresh(page);
	await page.goto('/#/settings?tab=vault', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	const original = await page.evaluate(async (png) => {
		const modulePath = '/src/platform/storage/assetStore.ts';
		const { putAssetBytes } = await import(/* @vite-ignore */ modulePath);
		const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
		const assetId = await putAssetBytes(bytes, 'image/png');
		const body = `\n\n[[Campaign Primer]] ![[Campaign Primer]]\n![Round trip image](asset:${assetId})  \r\n\n`;
		const rt = window.__rt!;
		const result = await rt.dispatch({
			type: 'content.create-item',
			actorId: rt.defaultActorId,
			payload: {
				kind: 'note',
				title: 'Folder Round Trip Secret',
				body,
				visibility: 'dm-only',
				fields: { tags: ['round-trip'] },
			},
		});
		if (result.status !== 'accepted') throw new Error(result.rejection?.message);
		const id = result.events!.find((event) => event.kind === 'content.item-changed')!
			.itemId as string;
		return { body, assetId, id };
	}, PNG);
	await expect(
		page.getByRole('checkbox', { name: 'Include DM-only and shared notes (private copy)' }),
	).not.toBeChecked();
	const publicDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export folder ZIP', exact: true }).click();
	const publicPath = await (await publicDownload).path();
	const publicEntries = decodeFolderZip(new Uint8Array(await readFile(publicPath!)));
	expect(publicEntries.some((entry) => entry.path.includes('Folder Round Trip Secret'))).toBe(
		false,
	);
	expect(publicEntries.some((entry) => entry.path.includes(original.assetId))).toBe(false);
	await page
		.getByRole('checkbox', { name: 'Include DM-only and shared notes (private copy)' })
		.check();
	const privateDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export folder ZIP', exact: true }).click();
	const download = await privateDownload;
	const saved = await download.path();
	expect(saved).toBeTruthy();
	const zipBytes = await readFile(saved!);
	const entries = decodeFolderZip(new Uint8Array(zipBytes));
	const exported = entries.find((entry) => entry.path === 'Folder Round Trip Secret.md')!;
	expect(new TextDecoder().decode(exported.bytes)).toContain(
		`![Round trip image](assets/${original.assetId}.png)`,
	);
	expect(
		Buffer.from(entries.find((entry) => entry.path.endsWith(`${original.assetId}.png`))!.bytes),
	).toEqual(Buffer.from(PNG, 'base64'));
	await page.evaluate(async ({ id, assetId }) => {
		const rt = window.__rt!;
		const result = await rt.dispatch({
			type: 'content.remove-item',
			actorId: rt.defaultActorId,
			payload: { itemId: id },
		});
		if (result.status !== 'accepted') throw new Error(result.rejection?.message);
		const modulePath = '/src/platform/storage/assetStore.ts';
		const { deleteAssetBytes } = await import(/* @vite-ignore */ modulePath);
		await deleteAssetBytes(assetId);
	}, original);
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Import folder ZIP', exact: true }).click();
	await (
		await chooser
	).setFiles({ name: 'folder.zip', mimeType: 'application/zip', buffer: zipBytes });
	await expect(page.getByText(/Imported \d+ notes\./)).toBeVisible();
	const imported = await page.evaluate(async (assetId) => {
		const items = (
			window.__rt!.state.content as {
				items: Record<
					string,
					{ id: string; title: string; body: string; deletedAt: string | null; visibility: string }
				>;
			}
		).items;
		const note = Object.values(items).find(
			(item) => item.title === 'Folder Round Trip Secret' && !item.deletedAt,
		)!;
		const modulePath = '/src/platform/storage/assetStore.ts';
		const { getAssetBytes } = await import(/* @vite-ignore */ modulePath);
		const blob = await getAssetBytes(assetId);
		return { ...note, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
	}, original.assetId);
	expect(imported.body).toBe(original.body);
	expect(imported.visibility).toBe('dm-only');
	expect(Buffer.from(imported.bytes)).toEqual(Buffer.from(PNG, 'base64'));
	await gotoRoute(page, `/knowledge/${imported.id}`);
	const image = page.getByRole('img', { name: 'Round trip image', exact: true });
	await expect(image).toBeVisible();
	await expect
		.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
		.toBeGreaterThan(0);
});
