import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// CUSTOM TYPES — user-defined Vault Object types (CONTENT-005) on the Extensions → Object types screen.
// A custom type is a durable definition in the content slice (`content.customObjectTypes`) that PROJECTS
// to a VaultObjectSchema, so its instances flow through the SAME schema-validated create/update path a
// built-in object uses (there is no parallel storage). The type-authoring form and the instance dialog
// are driven through the REAL UI; assertions read raw `__rt.state.content` AND the rendered view. Delete
// is fail-closed: refused while any live instance of the type still exists.

/** The namespaced envelope key each stored object carries so its subtype is recoverable on reload. */
const SUBTYPE_KEY = 'dndtools.objectSubtype';

interface ContentItemLite {
	id: string;
	kind: string;
	title: string;
	fields: Record<string, unknown>;
	deletedAt: string | null;
}
interface CustomTypeLite {
	id: string;
	label: string;
	fields: Array<{ key: string; type: string }>;
	revision: number;
}

function customType(page: Page, id: string): Promise<CustomTypeLite | null> {
	return page.evaluate((tid) => {
		const map = (window.__rt!.state.content as { customObjectTypes: Record<string, CustomTypeLite> }).customObjectTypes;
		return map[tid] ?? null;
	}, id);
}

function findObject(page: Page, title: string): Promise<ContentItemLite | null> {
	return page.evaluate((t) => {
		const items = (window.__rt!.state.content as { items: Record<string, ContentItemLite> }).items;
		return Object.values(items).find((i) => i.title === t) ?? null;
	}, title);
}

/** Reveal the Custom object types panel (it lives on the Extensions → Object types tab). */
async function openObjectTypesTab(page: Page): Promise<void> {
	await page.getByRole('tab', { name: 'Object types' }).click();
	await expect(page.getByText('Custom object types')).not.toHaveCount(0);
}

/** Seed a custom type straight through the dispatch choke point (prerequisite for instance/edit tests). */
async function defineTypeViaCore(
	page: Page,
	id: string,
	label: string,
	fields: Array<{ key: string; type: string }>,
): Promise<void> {
	const dmId = await page.evaluate(() => window.__rt!.defaultActorId);
	const res = await dispatch(page, { type: 'content.define-object-type', actorId: dmId, payload: { id, label, fields } });
	expect(res.status).toBe('accepted');
}

test.describe('custom types: user-defined vault object types', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await page.goto('/#/extensions', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the form defines a custom type that persists in core state, lists, and survives reload', async ({ page }) => {
		const stamp = Date.now();
		const id = `custom:tavern-${stamp}`;
		await openObjectTypesTab(page);

		// Author a type with two fields of different kinds through the REAL form.
		await page.getByLabel('Custom type label').fill(`Tavern ${stamp}`);
		await page.getByLabel('Field 1 key').fill('proprietor'); // kind defaults to Text (string)
		await page.getByRole('button', { name: 'Add field' }).click();
		await page.getByLabel('Field 2 key').fill('rooms');
		await page.getByLabel('Field 2 kind').selectOption('number');
		await page.getByRole('button', { name: 'Define type' }).click();

		// The form clears its label only after the awaited define dispatch (and persist) resolve.
		await expect(page.getByLabel('Custom type label')).toHaveValue('');

		// It is a first-class durable definition in the content slice.
		let def = await customType(page, id);
		expect(def?.label).toBe(`Tavern ${stamp}`);
		expect(def?.fields.map((f) => f.key)).toEqual(['proprietor', 'rooms']);
		expect(def?.fields.map((f) => f.type)).toEqual(['string', 'number']);
		expect(def?.revision).toBe(1);

		// ...and lists in the registry inspector (label, reserved-namespace id, field count).
		await expect(page.getByText('1 defined')).not.toHaveCount(0);
		await expect(page.getByText(`Tavern ${stamp}`)).not.toHaveCount(0);
		await expect(page.getByText(id, { exact: true })).not.toHaveCount(0);

		// Reload-persistence: the definition round-trips through IndexedDB.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		def = await customType(page, id);
		expect(def?.label).toBe(`Tavern ${stamp}`);
		await openObjectTypesTab(page);
		await expect(page.getByText(`Tavern ${stamp}`)).not.toHaveCount(0);
	});

	test('the instance dialog creates an object with the custom subtype and fields, and it persists', async ({ page }) => {
		const stamp = Date.now();
		const id = `custom:inn-${stamp}`;
		const title = `The Prancing Pony ${stamp}`;
		await defineTypeViaCore(page, id, `Inn ${stamp}`, [
			{ key: 'proprietor', type: 'string' },
			{ key: 'rooms', type: 'number' },
		]);
		await openObjectTypesTab(page);

		// Open the instance dialog for THIS type and fill the declared fields.
		await page.getByRole('button', { name: 'New', exact: true }).click();
		await expect(page.getByText(`New Inn ${stamp}`)).not.toHaveCount(0);
		await page.getByLabel('Object title').fill(title);
		await page.getByLabel('proprietor').fill('Barliman');
		await page.getByLabel('rooms').fill('6');
		await page.getByRole('button', { name: 'Create', exact: true }).click();

		// The dialog closes only after the awaited create dispatch + persist resolve (post-persist barrier).
		await expect(page.getByRole('button', { name: 'Create', exact: true })).toHaveCount(0);

		// The instance is an ordinary note-backed object carrying the custom subtype + coerced field values.
		let obj = await findObject(page, title);
		expect(obj?.kind).toBe('object');
		expect(obj?.fields[SUBTYPE_KEY]).toBe(id);
		expect(obj?.fields.proprietor).toBe('Barliman');
		expect(obj?.fields.rooms).toBe(6); // the Number field coerced from the form string
		// The registry row reflects the live instance count.
		await expect(page.getByText('1 in vault')).not.toHaveCount(0);

		// Reload-persistence: the instance survives a full reload.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		obj = await findObject(page, title);
		expect(obj?.fields[SUBTYPE_KEY]).toBe(id);
		await openObjectTypesTab(page);
		await expect(page.getByText('1 in vault')).not.toHaveCount(0);
	});

	test('editing a type adds a field (revision bump); deleting is refused while instances exist, then clean', async ({ page }) => {
		const stamp = Date.now();
		const id = `custom:guild-${stamp}`;
		const title = `Cartographers' Guild ${stamp}`;
		await defineTypeViaCore(page, id, `Guild ${stamp}`, [{ key: 'leader', type: 'string' }]);

		// Seed one instance so the delete guard has something to protect.
		const dmId = await page.evaluate(() => window.__rt!.defaultActorId);
		const created = await dispatch(page, {
			type: 'content.create-object',
			actorId: dmId,
			payload: { subtype: id, title, fields: { leader: 'Marek' } },
		});
		expect(created.status).toBe('accepted');
		const instanceId = created.events?.find((e) => e.kind === 'content.object-changed')?.itemId as string | undefined;
		expect(instanceId).toBeTruthy();

		await openObjectTypesTab(page);

		// EDIT — add a second field through the populated form and save.
		await page.getByRole('button', { name: 'Edit' }).click();
		await expect(page.getByLabel('Custom type label')).toHaveValue(`Guild ${stamp}`);
		await page.getByRole('button', { name: 'Add field' }).click();
		await page.getByLabel('Field 2 key').fill('members');
		await page.getByLabel('Field 2 kind').selectOption('number');
		await page.getByRole('button', { name: 'Save changes' }).click();
		// The form leaves edit mode only after the awaited update dispatch + persist resolve.
		await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

		const def = await customType(page, id);
		expect(def?.fields.map((f) => f.key)).toEqual(['leader', 'members']);
		expect(def?.revision).toBe(2); // the definition revision bumped on the accepted edit

		// DELETE REFUSED — an honest fail-closed message while the instance still exists.
		await page.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByText(/still exist/i)).not.toHaveCount(0);
		expect(await customType(page, id)).not.toBeNull(); // the type was NOT removed

		// Remove the sole instance (through the choke point), then the delete succeeds cleanly.
		const removed = await dispatch(page, { type: 'content.remove-item', actorId: dmId, payload: { itemId: instanceId } });
		expect(removed.status).toBe('accepted');
		await expect(page.getByText('0 in vault')).not.toHaveCount(0);

		await page.getByRole('button', { name: 'Delete' }).click();
		await page.waitForFunction(
			(tid) => {
				const map = (window.__rt!.state.content as { customObjectTypes: Record<string, unknown> }).customObjectTypes;
				return map[tid] === undefined;
			},
			id,
			{ timeout: 10_000 },
		);
		expect(await customType(page, id)).toBeNull();
		await expect(page.getByText('No custom types yet.')).not.toHaveCount(0);
	});
});
