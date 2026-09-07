import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-SES-4.1 — the END-OF-SESSION CAPTURE on /session.
//
// The DM writes what happened, marks which entities changed, and lists the follow-ups; one save
// writes the STRUCTURED recap onto the session archive AND a `session-log` note into the vault. This
// spec drives the panel through the UI and asserts both durable records, then checks the note where
// the DM will actually look for it: Knowledge, and the Campaign timeline.

const TITLE = 'Session log — the drowned vault';
const HAPPENED = 'The party bargained with the harbour master and burned the manifest.';

/** Arrange an archived session with a campaign date — the state the capture panel needs. */
async function arrangeArchivedSession(page: Page): Promise<void> {
	const result = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			content: { calendars: Record<string, { id: string; months: { id: string }[] }> };
		};
		const activeSceneId =
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)!.id;
		const actorId = rt.defaultActorId;
		for (const workflow of ['prep', 'active', 'recap']) {
			const r = await rt.dispatch({
				type: 'session.set-workflow',
				actorId,
				payload: { workflow, activeSceneId },
			});
			if (r.status !== 'accepted') return { step: workflow, ...r };
		}
		const calendar = Object.values(state.content.calendars)[0];
		if (!calendar)
			return { step: 'calendar', status: 'rejected', rejection: { message: 'no seeded calendar' } };
		const dated = await rt.dispatch({
			type: 'session.set-campaign-date',
			actorId,
			payload: { date: { calendarId: calendar.id, year: 1372, month: 1, day: 10 } },
		});
		if (dated.status !== 'accepted') return { step: 'date', ...dated };
		return { step: 'done', status: 'accepted' };
	});
	expect(result.status, `${result.step}: ${result.rejection?.message ?? ''}`).toBe('accepted');
}

/** The structured recap stored on the session's recap archive, or null. */
function storedRecap(page: Page): Promise<{
	happened?: string;
	changes?: { entityType: string; entityId: string; label: string }[];
	followUps?: string[];
} | null> {
	return page.evaluate(() => {
		const s = window.__rt!.state.session as unknown as {
			recapArchiveId: string | null;
			archives: Record<string, { recap?: Record<string, unknown> }>;
		};
		if (!s.recapArchiveId) return null;
		return (s.archives[s.recapArchiveId]?.recap ?? null) as never;
	});
}

/** The session-log notes in the vault, as {title, body, fields}. */
function sessionLogs(page: Page): Promise<
	{
		title: string;
		body: string;
		kind: string;
		fields: Record<string, unknown>;
		dateFields: Record<string, unknown>;
	}[]
> {
	return page.evaluate(() => {
		const content = window.__rt!.state.content as unknown as {
			items: Record<
				string,
				{
					title: string;
					body: string;
					kind: string;
					fields: Record<string, unknown>;
					dateFields: Record<string, unknown>;
					deletedAt: string | null;
				}
			>;
		};
		return Object.values(content.items)
			.filter((i) => i.fields['dndtools.objectSubtype'] === 'session-log' && !i.deletedAt)
			.map((i) => ({
				title: i.title,
				body: i.body,
				kind: i.kind,
				fields: i.fields,
				dateFields: i.dateFields,
			}));
	});
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await gotoRoute(page, '/session');
});

test.describe('end-of-session capture', () => {
	test('a capture writes the structured recap and a session log note', async ({ page }) => {
		// With nothing archived the panel offers no capture control — it says what has to happen first.
		await expect(
			page.getByText('No archived sessions yet.', { exact: false }).first(),
		).toBeVisible();

		await arrangeArchivedSession(page);
		await gotoRoute(page, '/session');

		await page.getByLabel('Session log title').fill(TITLE);
		await page.getByLabel('What happened', { exact: true }).fill(HAPPENED);

		// Mark one entity as changed. The chips are real checkboxes, so this is keyboard-operable and
		// carries its state to assistive tech.
		const chips = page.getByRole('group', { name: 'What changed' }).getByRole('checkbox');
		const firstChip = chips.first();
		const chipLabel = (await firstChip.textContent())?.trim() ?? '';
		expect(chipLabel).not.toBe('');
		await firstChip.click();
		await expect(firstChip).toHaveAttribute('aria-checked', 'true');

		await page.getByLabel('Follow-ups').fill('Send the guild reply\n   \nName the harbour master');
		await page.getByRole('button', { name: 'Save session log' }).click();

		// 1) The structured capture is on the session archive.
		await expect.poll(async () => (await storedRecap(page))?.happened).toBe(HAPPENED);
		const recap = (await storedRecap(page))!;
		expect(recap.followUps).toEqual(['Send the guild reply', 'Name the harbour master']);
		expect(recap.changes).toHaveLength(1);
		expect(recap.changes![0]!.label).toBe(chipLabel);

		// 2) The session-log note is in the vault, DM-only, dated at the campaign date, with the same
		//    prose the recap carries.
		await expect.poll(async () => (await sessionLogs(page)).length).toBe(1);
		const [log] = await sessionLogs(page);
		expect(log!.kind).toBe('note');
		expect(log!.title).toBe(TITLE);
		expect(log!.body).toContain(HAPPENED);
		expect(log!.body).toContain('- Send the guild reply');
		expect(Object.keys(log!.dateFields)).toContain('occurred');

		// 3) It is where the DM will look for it: Knowledge…
		await gotoRoute(page, '/knowledge');
		await expect(page.getByText(TITLE).first()).toBeVisible();

		// …and the Campaign timeline.
		await gotoRoute(page, '/campaign');
		await page.getByRole('tab', { name: 'Timeline' }).click();
		await expect(page.getByText(TITLE).first()).toBeVisible();
	});

	test('saving nothing is not offered, and a capture clears the form', async ({ page }) => {
		await arrangeArchivedSession(page);
		await gotoRoute(page, '/session');

		const save = page.getByRole('button', { name: 'Save session log' });
		// An empty capture is not a session log: the control is disabled rather than saving a blank note.
		await expect(save).toBeDisabled();

		await page.getByLabel('What happened', { exact: true }).fill(HAPPENED);
		await expect(save).toBeEnabled();
		await save.click();

		await expect.poll(async () => (await sessionLogs(page)).length).toBe(1);
		// The form resets only because the capture landed — a rejected capture keeps the DM's words.
		await expect(page.getByLabel('What happened', { exact: true })).toHaveValue('');
		await expect(save).toBeDisabled();
	});
});
