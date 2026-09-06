import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-WID-3.2 — "GENERATE A WIDGET". The DM describes a widget; the assistant is offered exactly one
// tool (`widget.package.propose`, RC-WID-3.1), which STAGES a proposal; the manual builder then
// opens on the Review step with the generated definition, and only the DM's own Install writes it.
//
// The provider transport is stubbed at the wire (an intercepted OpenAI-compatible
// `POST …/chat/completions` streaming real SSE frames), so the whole path runs — bridge, tool spec,
// core policy gate, staging, builder — without a real key, a network, or a model. The contract:
// nothing is installed by the run itself, and what the DM installs afterwards is marked `generated`.

const FAKE_KEY = 'sk-e2e-fake-not-a-real-key-000';
const PROMPT = 'A loot ledger listing party treasure with a total value';

/** The structured draft the stubbed model "returns" — a valid `widget.package.propose` input. */
const TOOL_INPUT = {
	displayName: 'Loot ledger',
	description: 'Party treasure and what it is worth',
	prompt: PROMPT,
	template: 'data-table',
	dataQueries: [{ id: 'loot', label: 'Party loot', source: 'content-objects', audience: 'dm' }],
};

function sse(frames: Array<Record<string, unknown>>): string {
	return `${frames.map((frame) => `data: ${JSON.stringify(frame)}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
}

/**
 * Stub the provider at the wire. The app is pointed at an OpenAI-compatible endpoint on its own
 * loopback origin (the only destination the app's network policy admits in a dev build — no
 * test-only allowlist is added), and the route below answers it with the SSE frames a real
 * OpenAI-compatible server streams. The first exchange returns the tool call that authors the
 * widget; every later exchange returns plain text, the model summarising what it did. The returned
 * counter proves how many provider round trips actually happened.
 */
async function stubProvider(page: Page): Promise<() => number> {
	let calls = 0;
	await page.route('**/ai-stub/chat/completions', async (route) => {
		calls += 1;
		const body =
			calls === 1
				? sse([
						{
							choices: [
								{
									delta: {
										tool_calls: [
											{
												index: 0,
												id: 'call_e2e',
												function: {
													name: 'widget__package__propose',
													arguments: JSON.stringify(TOOL_INPUT),
												},
											},
										],
									},
									finish_reason: 'tool_calls',
								},
							],
						},
					])
				: sse([
						{
							choices: [
								{
									delta: { content: 'I drafted a loot ledger for review.' },
									finish_reason: 'stop',
								},
							],
						},
					]);
		await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
	});
	return () => calls;
}

/** A fresh vault on the AI settings page with the consent choice already made. */
async function openAiSettings(page: Page): Promise<void> {
	await markOnboarded(page);
	await page.addInitScript(() => {
		localStorage.setItem('dndtools.ai.usage-preference', 'complete');
	});
	await gotoRoute(page, '/settings?tab=ai');
	await seedFresh(page);
	await waitReady(page);
}

/**
 * Point the app at the stub and save a device-local key through the real destination-confirmation
 * flow. The provider kind locks once a key is held, so it is chosen first.
 */
async function configureStubProvider(page: Page): Promise<void> {
	const origin = new URL(page.url()).origin;
	await page
		.getByRole('radiogroup', { name: 'AI provider' })
		.getByRole('radio', { name: 'OpenAI-compatible' })
		.click();
	await page.getByLabel('API base URL').fill(`${origin}/ai-stub`);
	await page.getByLabel('Provider API key').fill(FAKE_KEY);
	await page.getByRole('button', { name: 'Save key' }).click();
	await page
		.getByRole('dialog', { name: 'Confirm credential destination' })
		.getByRole('button', { name: 'Confirm and save' })
		.click();
	await expect(page.getByText('Configured', { exact: true })).not.toHaveCount(0);
}

/** Turn on agent access and allow ONE agent to use the widget-authoring tool. */
async function allowWidgetAgent(page: Page): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	for (const command of [
		{ type: 'mcp.set-enabled', actorId, payload: { enabled: true } },
		{
			type: 'mcp.set-agent-binding',
			actorId,
			payload: { agentId: 'prep-assistant', actorId, label: 'Prep' },
		},
		{
			type: 'mcp.set-agent-policy',
			actorId,
			payload: {
				agentId: 'prep-assistant',
				mode: 'strict_review',
				allowedToolIds: ['widget.package.propose'],
			},
		},
	]) {
		expect((await dispatch(page, command)).status).toBe('accepted');
	}
}

interface GeneratedPackage {
	id: string;
	displayName: string;
	authoring?: { source: string; promptHash?: string };
}

function generatedPackages(page: Page): Promise<GeneratedPackage[]> {
	return page.evaluate(() =>
		Object.values(
			(window.__rt!.state.widgets as { packages: Record<string, { package: GeneratedPackage }> })
				.packages,
		)
			.map((record) => record.package)
			.filter((pkg) => pkg.authoring?.source === 'generated'),
	);
}

test.describe('generate a widget (RC-WID-3.2)', () => {
	test('a stubbed run stages a proposal, the builder reviews it, and only Install writes it', async ({
		page,
	}) => {
		const calls = await stubProvider(page);
		await openAiSettings(page);
		await configureStubProvider(page);
		await allowWidgetAgent(page);

		await gotoRoute(page, '/extensions');
		await page.getByRole('button', { name: 'Generate a widget' }).click();
		const dialog = page.getByRole('dialog', { name: 'Generate a widget' });
		await expect(dialog).toBeVisible();
		// The dialog says out loud that it installs nothing by itself.
		await expect(dialog).toContainText('Nothing is installed until you press Install');

		await dialog.getByLabel('What should the widget do?').fill(PROMPT);
		await dialog.getByRole('button', { name: 'Generate' }).click();

		// The run ends in the BUILDER, on Review, holding the generated definition.
		const builder = page.getByRole('dialog', { name: /Widget builder/ });
		await expect(builder).toBeVisible({ timeout: 20_000 });
		await expect(builder.getByRole('heading', { name: 'Review' })).toBeVisible();
		await expect(builder).toContainText(/loot ledger/i);

		// The proposal is staged, NOT applied: no package is installed while the builder is open.
		expect(await generatedPackages(page)).toEqual([]);
		expect(
			await page.evaluate(
				() =>
					Object.values(
						(
							window.__rt!.state.mcp as {
								proposals: Record<string, { status: string; commandType: string }>;
							}
						).proposals,
					).filter((p) => p.commandType === 'widget.package.install' && p.status === 'pending')
						.length,
			),
		).toBe(1);

		// Every generated field is editable — rename it before installing.
		const steps = builder.getByTestId('widget-builder-steps');
		await steps.getByRole('button', { name: 'Identity' }).click();
		await builder.getByLabel('Name', { exact: true }).fill('Party loot ledger');
		await steps.getByRole('button', { name: 'Review' }).click();
		await builder.getByRole('button', { name: /^Install/ }).click();
		await expect(builder).toBeHidden({ timeout: 10_000 });

		// What landed keeps the provenance the core stamped, and the Plugins list says so.
		const installed = await generatedPackages(page);
		expect(installed).toHaveLength(1);
		expect(installed[0]!.displayName).toBe('Party loot ledger');
		expect(installed[0]!.authoring?.promptHash).toBeTruthy();
		await expect(page.getByText('Generated', { exact: true }).first()).toBeVisible();

		// Two provider round trips: the authoring pass and the summary pass. No third.
		expect(calls()).toBe(2);
	});

	test('the scene editor offers the same dialog, and it too installs nothing on its own', async ({
		page,
	}) => {
		const calls = await stubProvider(page);
		await openAiSettings(page);
		await configureStubProvider(page);
		await allowWidgetAgent(page);

		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const sceneName = `Generate Scene ${Date.now()}`;
		expect(
			(
				await dispatch(page, {
					type: 'scene.create',
					actorId,
					payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
				})
			).status,
		).toBe('accepted');
		const sceneId = await page.evaluate(
			(name) =>
				Object.values(
					(window.__rt!.state.scenes as { scenes: Record<string, { id: string; name: string }> })
						.scenes,
				).find((scene) => scene.name === name)?.id ?? null,
			sceneName,
		);

		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Generate a widget' }).click();
		await page.getByLabel('What should the widget do?').fill(PROMPT);
		await page.getByRole('button', { name: 'Generate' }).click();

		// Same contract on the canvas: the builder reviews it, and until Install is pressed the scene
		// has no new widget and the vault has no new package.
		const builder = page.getByRole('dialog', { name: /Widget builder/ });
		await expect(builder).toBeVisible({ timeout: 20_000 });
		await expect(builder.getByRole('heading', { name: 'Review' })).toBeVisible();
		expect(await generatedPackages(page)).toEqual([]);
		expect(
			await page.evaluate(
				(id) =>
					(
						window.__rt!.state.scenes as {
							scenes: Record<string, { widgets: unknown[] }>;
						}
					).scenes[id!]!.widgets.length,
				sceneId,
			),
		).toBe(0);
		expect(calls()).toBe(2);
	});

	test('fails closed with no provider key — the run cannot be started', async ({ page }) => {
		const calls = await stubProvider(page);
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);

		await page.getByRole('button', { name: 'Generate a widget' }).click();
		const dialog = page.getByRole('dialog', { name: 'Generate a widget' });
		await expect(dialog).toContainText('Add a provider API key');
		// No prompt box and no Generate button: there is nothing to press that could reach a provider.
		await expect(dialog.getByLabel('What should the widget do?')).toHaveCount(0);
		await expect(dialog.getByRole('button', { name: 'Generate' })).toHaveCount(0);
		expect(calls()).toBe(0);
	});
});
