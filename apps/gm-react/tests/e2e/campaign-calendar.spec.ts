import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, waitReady } from './_helpers';

// RC-KNW-3.1 — the calendar editor. Two things have to be true end to end: a DM can DEFINE a
// campaign calendar from the UI (months, days, moons, eras, holidays — `content.define-calendar`
// was previously reachable only from the demo seed), and a note can be DATED in it. The derived
// halves — moon phase and holidays — are asserted through the preview, because they are computed
// from the definition rather than stored, so the preview is the honest evidence they work.

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await page.goto('/');
	await waitReady(page);
});

test('a DM defines a calendar with months, a moon, an era and a holiday', async ({ page }) => {
	await gotoRoute(page, '/campaign/calendar');
	await expect(page.getByRole('heading', { name: 'Campaign calendar' })).toBeVisible();

	await page.getByRole('button', { name: 'New calendar' }).click();

	await page.getByTestId('calendar-name').fill('Wayfarer reckoning');
	await page.getByTestId('calendar-era').fill('WR');
	await page.getByTestId('calendar-weekdays').fill('Firstday, Midday, Lastday');

	await page.getByTestId('calendar-month-name-0').fill('Frostwane');
	await page.getByTestId('calendar-month-days-0').fill('30');
	await page.getByRole('button', { name: 'Add month' }).click();
	await page.getByTestId('calendar-month-name-1').fill('Seedfall');
	await page.getByTestId('calendar-month-days-1').fill('28');

	await page.getByRole('button', { name: 'Add moon' }).click();
	await page.getByTestId('calendar-moon-name-0').fill('Selune');
	await page.getByTestId('calendar-moon-cycle-0').fill('8');

	await page.getByRole('button', { name: 'Add holiday' }).click();
	await page.getByTestId('calendar-holiday-name-0').fill('Longnight');
	await page.getByTestId('calendar-holiday-month-0').selectOption('1');
	await page.getByTestId('calendar-holiday-day-0').fill('12');

	await page.getByTestId('calendar-save').click();

	// The definition is durable in the core, with exactly what was typed.
	const stored = await page.evaluate(() => {
		const content = window.__rt!.state.content as {
			calendars: Record<
				string,
				{
					name: string;
					months: { name: string; days: number }[];
					weekdays?: string[];
					epochLabel?: string;
					moons?: { name: string; cycleDays: number }[];
					holidays?: { name: string; month: number; day: number }[];
				}
			>;
		};
		return Object.values(content.calendars).find((c) => c.name === 'Wayfarer reckoning') ?? null;
	});
	expect(stored).not.toBeNull();
	expect(stored!.months.map((m) => [m.name, m.days])).toEqual([
		['Frostwane', 30],
		['Seedfall', 28],
	]);
	expect(stored!.weekdays).toEqual(['Firstday', 'Midday', 'Lastday']);
	expect(stored!.epochLabel).toBe('WR');
	expect(stored!.moons?.[0]).toMatchObject({ name: 'Selune', cycleDays: 8 });
	expect(stored!.holidays?.[0]).toMatchObject({ name: 'Longnight', month: 1, day: 12 });

	// It is listed, and the derived preview reads the holiday and the moon phase off the definition.
	await expect(page.getByText('Wayfarer reckoning', { exact: true }).first()).toBeVisible();
	const preview = page.getByRole('region').filter({ hasText: 'Preview a date' }).first();
	const scope = (await preview.count()) > 0 ? preview : page;
	await scope.getByLabel('Day', { exact: true }).first().fill('12');
	await expect(page.getByTestId('calendar-preview-date')).toContainText('12 Frostwane');
	await expect(page.getByText('Longnight', { exact: true }).first()).toBeVisible();
	await expect(page.getByText(/Selune —/).first()).toBeVisible();
});

test('a DM dates a note in the campaign calendar', async ({ page }) => {
	// A note to date. Created through the core so the test exercises the DATING, not note authoring.
	const created = await page.evaluate(async () => {
		const rt = window.__rt!;
		const result = await rt.dispatch({
			type: 'content.create-item',
			actorId: rt.defaultActorId,
			payload: { kind: 'note', title: 'The siege of Emberhold', body: 'It began in winter.' },
		});
		return result;
	});
	expect(created.status).toBe('accepted');

	await gotoRoute(page, '/campaign/calendar');
	await page.getByTestId('calendar-note-select').selectOption({ label: 'The siege of Emberhold' });
	await page.getByTestId('calendar-note-field').fill('occurredOn');
	await page.getByTestId('calendar-note-month').selectOption('1');
	await page.getByTestId('calendar-note-day').fill('4');
	await page.getByTestId('calendar-note-year').fill('1492');
	await page.getByTestId('calendar-note-apply').click();

	const dated = await page.evaluate(() => {
		const content = window.__rt!.state.content as {
			calendars: Record<string, { id: string }>;
			items: Record<
				string,
				{ title: string; dateFields: Record<string, { year: number; month: number; day: number }> }
			>;
		};
		const item = Object.values(content.items).find((i) => i.title === 'The siege of Emberhold');
		return item?.dateFields.occurredOn ?? null;
	});
	expect(dated).toMatchObject({ year: 1492, month: 1, day: 4 });
});

test('the Session campaign date offers a way to define a calendar when there is none', async ({
	page,
}) => {
	await gotoRoute(page, '/campaign/calendar');
	await expect(page.getByRole('heading', { name: 'Campaign calendar' })).toBeVisible();
	// The editor is reachable from Session, which is where a DM notices the date is missing.
	await gotoRoute(page, '/session');
	const link = page.getByRole('button', { name: /Edit calendar|Define a calendar/ }).first();
	await expect(link).toBeVisible();
	await link.click();
	await expect(page.getByRole('heading', { name: 'Campaign calendar' })).toBeVisible();
});
