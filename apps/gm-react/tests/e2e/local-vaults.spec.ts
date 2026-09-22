import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, waitReady } from './_helpers';

// RC-UX-5.4 — local vaults. A device holds several vaults with nothing shared: the campaign chip
// (desktop), the rail's campaign mark (tablet) and the More sheet (phone) open one switcher that
// creates, renames and opens vaults; opening drains writes and reloads the document into the chosen
// vault. The journey proves isolation BOTH ways for the op log, full-text search and the keyring.

const ACCOUNT = 'e2e-account';
const SECRET_PREFIX = 'e2e-secret:';

/** The web build holds no durable keys, so stand in for the Electron OS credential store with a
 * localStorage-backed bridge that survives the switcher's document reloads. */
async function installSecureStore(page: Page): Promise<void> {
	await page.addInitScript((prefix) => {
		const scope = globalThis as typeof globalThis & Record<string, unknown>;
		scope.__DNDTOOLS_TEST_RUNTIME_KIND__ = 'electron';
		scope.dndtoolsSecureStore = {
			available: async () => true,
			get: async (key: string) => localStorage.getItem(prefix + key),
			set: async (key: string, value: string) => {
				localStorage.setItem(prefix + key, value);
				return true;
			},
			remove: async (key: string) => {
				localStorage.removeItem(prefix + key);
				return true;
			},
			keys: async () =>
				Object.keys(localStorage)
					.filter((key) => key.startsWith(prefix))
					.map((key) => key.slice(prefix.length)),
		};
	}, SECRET_PREFIX);
}

function secretCount(page: Page): Promise<number> {
	return page.evaluate(
		(prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)).length,
		SECRET_PREFIX,
	);
}

type Sealed = { vaultId: string; envelope: unknown };

/** Seal a value with the production key manager under THIS document's cloud vault namespace. */
function seal(page: Page, value: string): Promise<Sealed> {
	return page.evaluate(
		async ({ account, value }) => {
			const load = (path: string) =>
				new Function(`return import(${JSON.stringify(path)})`)() as Promise<
					Record<string, unknown>
				>;
			const { CLOUD_VAULT_ID } = (await load('/src/cloud/syncEngine.ts')) as {
				CLOUD_VAULT_ID: string;
			};
			const { vaultKeyManager } = (await load('/src/cloud/vaultKey.ts')) as {
				vaultKeyManager: { encrypt(context: unknown, value: unknown): Promise<unknown> };
			};
			const context = {
				accountId: account,
				vaultId: CLOUD_VAULT_ID,
				kind: 'snapshot',
				revision: 0,
			};
			const envelope = await vaultKeyManager.encrypt(context, { value });
			await new Promise((resolve) => setTimeout(resolve, 0));
			return { vaultId: CLOUD_VAULT_ID, envelope };
		},
		{ account: ACCOUNT, value },
	);
}

/** Open a sealed value with THIS document's keyring and vault context; `null` when refused. */
function open(page: Page, sealed: Sealed): Promise<string | null> {
	return page.evaluate(
		async ({ account, envelope }) => {
			const load = (path: string) =>
				new Function(`return import(${JSON.stringify(path)})`)() as Promise<
					Record<string, unknown>
				>;
			const { CLOUD_VAULT_ID } = (await load('/src/cloud/syncEngine.ts')) as {
				CLOUD_VAULT_ID: string;
			};
			const { vaultKeyManager } = (await load('/src/cloud/vaultKey.ts')) as {
				vaultKeyManager: { decrypt(context: unknown, envelope: unknown): Promise<unknown> };
			};
			const context = {
				accountId: account,
				vaultId: CLOUD_VAULT_ID,
				kind: 'snapshot',
				revision: 0,
			};
			let opened: string | null;
			try {
				opened = ((await vaultKeyManager.decrypt(context, envelope)) as { value: string }).value;
			} catch {
				opened = null;
			}
			await new Promise((resolve) => setTimeout(resolve, 0));
			return opened;
		},
		{ account: ACCOUNT, envelope: sealed.envelope },
	);
}

/** Whether the production cloud-backup gate would let THIS document's vault use the cloud. */
function cloudVaultSupported(page: Page): Promise<boolean> {
	return page.evaluate(async (account) => {
		const { getCloudSyncStatus } = (await (new Function(
			'return import("/src/cloud/cloudSync.ts")',
		)() as Promise<Record<string, unknown>>)) as {
			getCloudSyncStatus(id: string): Promise<{ vaultSupported: boolean }>;
		};
		const status = await getCloudSyncStatus(account);
		await new Promise((resolve) => setTimeout(resolve, 0));
		return status.vaultSupported;
	}, ACCOUNT);
}

const opIds = (page: Page): Promise<string[]> =>
	page.evaluate(() => window.__rt!.state.sync.operations.map((op) => op.id));
const vaultId = (page: Page): Promise<string> => page.evaluate(() => window.__rt!.vaultId);

async function addNote(page: Page, title: string): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId,
		payload: { kind: 'note', title, body: `${title} body`, visibility: 'dm-only' },
	});
	expect(result.status).toBe('accepted');
}

/** Run a real full-text search through the command palette. Every negative check in the journey
 * sits beside a positive one in the same vault, so an empty result cannot be a slow index. */
async function expectSearch(page: Page, query: string, found: boolean): Promise<void> {
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Command palette' });
	await expect(palette).toBeVisible();
	await palette.getByRole('combobox').fill(query);
	const hit = palette.getByRole('option', { name: query });
	if (found) {
		await expect(hit).toBeVisible({ timeout: 10_000 });
	} else {
		await expect(palette.getByText('No matches')).toBeVisible({ timeout: 10_000 });
		await expect(hit).toHaveCount(0);
	}
	await page.keyboard.press('Escape');
	await expect(palette).toHaveCount(0);
}

/** Open the switcher from whichever entry point this viewport's navigation offers. */
async function openSwitcher(page: Page): Promise<Locator> {
	if ((page.viewportSize()?.width ?? 1280) <= 640) {
		await page.getByRole('button', { name: 'More', exact: true }).click();
		await page.getByRole('button', { name: /^Local vaults/ }).click();
	} else {
		await page.getByRole('button', { name: 'Local vaults', exact: true }).click();
	}
	const dialog = page.getByRole('dialog', { name: 'Local vaults' });
	await expect(dialog).toBeVisible();
	return dialog;
}

/** Open a vault and wait for the reloaded document to finish loading it. */
async function switchTo(page: Page, name: string, expected: (id: string) => boolean) {
	const dialog = await openSwitcher(page);
	const reloaded = page.waitForEvent('load', { timeout: 20_000 });
	await dialog.getByRole('button', { name: `Open ${name}`, exact: true }).click();
	await reloaded;
	await waitReady(page);
	expect(expected(await vaultId(page))).toBe(true);
	// The switch lands on the home route: routes name records of the departing vault.
	expect(new URL(page.url()).hash).toBe('#/');
}

test('switching vaults keeps op logs, search and keyrings isolated both ways', async ({ page }) => {
	test.setTimeout(120_000);
	await installSecureStore(page);
	await markOnboarded(page);
	await gotoRoute(page, '/');

	// ── Original vault (migrated in place as the first catalog entry) ─────────────────────────
	expect(await vaultId(page)).toBe('primary');
	await addNote(page, 'Harbor lantern ledger');
	await expectSearch(page, 'Harbor lantern ledger', true);
	const harborKey = await seal(page, 'harbor');
	expect(harborKey.vaultId).toBe('primary');
	expect(await secretCount(page)).toBe(1);
	expect(await cloudVaultSupported(page)).toBe(true);
	const harborOps = await opIds(page);
	expect(harborOps.length).toBeGreaterThan(0);

	let dialog = await openSwitcher(page);
	await expect(dialog.getByRole('button', { name: 'Open Your campaign' })).toBeDisabled();
	await dialog.getByLabel('Vault name', { exact: true }).fill('Mountain campaign');
	await dialog.getByRole('button', { name: 'Create vault', exact: true }).click();
	await expect(dialog.getByText('Not opened yet')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);

	// ── Second vault: nothing from the first is visible ──────────────────────────────────────
	await switchTo(page, 'Mountain campaign', (id) => id.startsWith('local-'));
	const mountainId = await vaultId(page);
	const mountainStart = await opIds(page);
	expect(mountainStart.filter((id) => harborOps.includes(id))).toEqual([]);
	expect(mountainStart.length).toBeLessThan(harborOps.length);
	await expectSearch(page, 'Harbor lantern ledger', false);
	expect(await open(page, harborKey)).toBeNull();
	// The second vault keeps its own keyring; the first vault's key was not reused.
	const mountainKey = await seal(page, 'mountain');
	expect(mountainKey.vaultId).toBe(mountainId);
	expect(await secretCount(page)).toBe(2);
	// The cloud stores only the original vault, so this vault's backup never touches its copy.
	expect(await cloudVaultSupported(page)).toBe(false);
	await addNote(page, 'Mountain summit cairn');
	await expectSearch(page, 'Mountain summit cairn', true);
	const mountainOps = await opIds(page);
	expect(mountainOps.length).toBeGreaterThan(mountainStart.length);

	// ── Back to the first vault: untouched by the second ─────────────────────────────────────
	await switchTo(page, 'Your campaign', (id) => id === 'primary');
	const harborAgain = await opIds(page);
	expect(harborAgain.slice(0, harborOps.length)).toEqual(harborOps);
	expect(harborAgain.filter((id) => mountainOps.includes(id))).toEqual([]);
	await expectSearch(page, 'Mountain summit cairn', false);
	await expectSearch(page, 'Harbor lantern ledger', true);
	expect(await open(page, harborKey)).toBe('harbor');
	expect(await open(page, mountainKey)).toBeNull();
	dialog = await openSwitcher(page);
	await expect(dialog.getByText(/Last opened/)).toHaveCount(2);
	await page.keyboard.press('Escape');

	// ── And the second vault once more: its own log, search and key survive ──────────────────
	await switchTo(page, 'Mountain campaign', (id) => id === mountainId);
	const mountainAgain = await opIds(page);
	expect(mountainAgain.slice(0, mountainOps.length)).toEqual(mountainOps);
	expect(mountainAgain.filter((id) => harborOps.includes(id))).toEqual([]);
	await expectSearch(page, 'Mountain summit cairn', true);
	expect(await open(page, mountainKey)).toBe('mountain');
	expect(await open(page, harborKey)).toBeNull();
});

test('the tablet rail opens the same switcher and renames without touching the open vault', async ({
	page,
}) => {
	await page.setViewportSize({ width: 834, height: 1112 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	const before = await opIds(page);
	const trigger = page.getByRole('button', { name: 'Local vaults', exact: true });
	await trigger.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Local vaults' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Rename Your campaign', exact: true }).click();
	await dialog.getByLabel('Rename vault', { exact: true }).fill('Harbor campaign');
	await dialog.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(dialog.getByRole('button', { name: 'Open Harbor campaign' })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();
	expect(await opIds(page)).toEqual(before);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await trigger.click();
	await expect(dialog.getByRole('button', { name: 'Open Harbor campaign' })).toBeVisible();
});
