# RC-CAN-4.2 run journal

- Scope: five owned scene editor files plus this required journal. Starting tree clean.
- No applicable AGENTS.md found in the repository or ancestor guidance locations. No Headroom tools available; using exact native output.
- Implemented Content / Display / Style from field groups, Binding, Transform, and Visibility tabs with DS keyboard/ARIA behavior. Configuration dispatch and blur commits retained.
- Visibility preview uses the existing actor-scoped scene preview reader with the generic preview player, including scene, section and binding restrictions.
- Empty edit selection opens scene properties; panel supports dismissal on phones. Background saves through scene.update-metadata; docks, sections and template provenance reflect the scene state.
- Validation results are recorded below. No agents, push, promotion, dispatcher mutations or additional loops.

## Reproducible focused browser fixture

Extract the TypeScript block below to `apps/gm-react/tests/e2e/inspector-v2-temporary.spec.ts`,
run it with the app's Playwright command on both Chromium projects, then remove the temporary file.
The fixture lives here because browser specs are outside this task's owned paths.

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, waitReady } from './_helpers';

test('Inspector v2 tabs, configuration and scene properties persist', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	expect(
		(
			await dispatch(page, {
				type: 'scene.create',
				actorId,
				payload: {
					name: 'Inspector v2 fixture',
					description: '',
					tags: [],
					visibility: 'player-visible',
				},
			})
		).status,
	).toBe('accepted');
	const sceneId = await page.evaluate(
		() =>
			Object.values(window.__rt!.state.scenes.scenes).find(
				(s) => s.name === 'Inspector v2 fixture',
			)!.id,
	);
	for (const type of ['note', 'character']) {
		expect(
			(
				await dispatch(page, {
					type: 'scene.add-widget',
					actorId,
					payload: {
						sceneId,
						widget: {
							type,
							version: '1.0.0',
							layout: { x: 24, y: 24, w: 260, h: 180 },
							configuration: { visibility: 'player-visible' },
							localState: {},
							binding: null,
						},
					},
				})
			).status,
		).toBe('accepted');
	}
	const [noteId, characterId] = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets.map((w) => w.id),
		sceneId,
	);
	await gotoRoute(page, `/scene/${sceneId}`);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	const meta = page.getByTestId('scene-meta-panel');
	await expect(meta).toBeVisible();
	for (const label of ['Docks', 'Sections', 'Template'])
		await expect(meta.getByText(label, { exact: true })).toBeVisible();
	await meta.getByLabel('Background', { exact: true }).selectOption('parchment');
	await meta.getByRole('button', { name: 'Save details' }).click();
	await expect(meta).toHaveCount(0);
	await page.getByTestId(`widget-${noteId}`).focus();
	await page.keyboard.press('Enter');
	const panel = page.getByTestId('widget-inspector');
	await expect(panel.getByRole('tab')).toHaveCount(6);
	await panel.getByRole('tab', { name: 'Content', exact: true }).click();
	await panel.getByLabel('Heading', { exact: true }).fill('Persistent heading');
	await panel.getByRole('tab', { name: 'Display', exact: true }).click();
	await expect(panel.getByLabel('Heading', { exact: true })).toBeHidden();
	await panel.getByLabel('Depth', { exact: true }).selectOption('summary');
	await panel.getByRole('tab', { name: 'Display', exact: true }).press('ArrowRight');
	await expect(panel.getByRole('tab', { name: 'Style', exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	);
	await panel.getByRole('tab', { name: 'Transform', exact: true }).click();
	const x = panel.getByLabel('X', { exact: true });
	await x.fill('96');
	await x.blur();
	await panel.getByRole('tab', { name: 'Visibility', exact: true }).click();
	await panel.getByLabel('Widget visibility').selectOption('dm-only');
	await expect(panel.getByTestId('widget-inspector-audience')).toContainText('DM');
	expect(
		(await new AxeBuilder({ page }).include('[data-testid="widget-inspector"]').analyze())
			.violations,
	).toEqual([]);
	await panel.getByRole('button', { name: 'Close inspector' }).click();
	await expect(meta).toBeVisible();
	await meta.getByRole('button', { name: 'Close scene details' }).click();
	await page.getByTestId(`widget-${characterId}`).focus();
	await page.keyboard.press('Enter');
	await panel.getByRole('tab', { name: 'Binding', exact: true }).click();
	await expect(panel.getByTestId('binding-current')).toHaveText('Not bound to anything yet.');
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
	const saved = await page.evaluate((id) => {
		const scene = window.__rt!.state.scenes.scenes[id] as any;
		return {
			background: scene.visualSettings.background,
			configuration: scene.widgets[0].configuration,
			x: scene.widgets[0].layout.x,
		};
	}, sceneId);
	expect(saved.background).toBe('parchment');
	expect(saved.configuration).toMatchObject({
		heading: 'Persistent heading',
		depth: 'summary',
		visibility: 'dm-only',
	});
	expect(saved.x).toBe(96);
});
```

## Validation progress

- First app typecheck and targeted ESLint passed. Quality gates passed (six gates;
  existing advisory file-size warnings only).
- First unmodified canvas run: 78 passed, 4 failed. Two failures were the now-hidden
  visibility control. Kept its single named select above the tabs so visibility remains
  directly accessible; the Visibility tab provides the actor-scoped audience preview.
  The run overlapped source edits, and the other two failures involved lost editor state
  and a detached menu. Rerunning on stable source before drawing a conclusion.
- Extracted the numeric transform controls into owned fields.tsx, keeping Inspector.tsx
  below the 500-line advisory target. Scene transform moves now use the existing undo path.
- Updated scene-property focus return and save dismissal. Final app typecheck and targeted
  ESLint passed after these changes. Stable-source browser run and focused fixture pending.

## Browser-driven corrections

- Stable-source run: 81/84 passed. The focused fixture found a section-label contrast
  violation (4.31:1); switched the shared Section label to the secondary text token.
- Closing the gallery on a phone previously exposed the automatic scene panel under a tile
  menu. Preserve the explicit dismissal until a new selection/edit session; Escape also
  suppresses automatic reopening. The Configure menu now passes on both profiles.
- The rapid cross-tab fixture exposed a real stale-configuration replacement: heading blur
  could be overwritten by the next discrete edit before persistence notified React. Queue
  inspector configuration edits and read the latest runtime instance for each replacement.
  Explicitly blur text/number controls before hiding a tab for touch activation.
- Focused persistence/axe fixture after the queue correction: 2 passed (5.7s), exit 0.
- Required-binding tiles start on Binding; other tiles start on Content. Display settings
  (including Note depth) now require the Display tab. Legacy flat-panel test drivers outside
  the owned paths may need that navigation; no unowned specs are changed.
- Final combined run: unmodified canvas + binding-inspector and the journal fixture, both
  Chromium profiles, two workers: 88 passed (1.3m), exit 0.

## Final validation and handoff

- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/canvas.spec.ts tests/e2e/binding-inspector.spec.ts tests/e2e/inspector-v2-temporary.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2`:
  88 passed (1.3m), exit 0. Includes the unchanged canvas configure/visibility round-trip.
- Final typecheck caught the catalog's absent `builder.dock.top` key. Added the top-dock
  label locally in EN/ES, then app typecheck and targeted ESLint each passed, exit 0.
- Extracted the formatted fixture above verbatim and reran after the label correction:
  2 passed (5.9s), exit 0. Temporary spec removed; durable fixture remains in this journal.
- `pnpm gates`: six gates passed, exit 0, with existing advisory file-size warnings.
  Inspector is 428 lines; scene editor index is 796, within the 800-line hard limit.
- Raw-style check: 2,575 values across 260 files, exit 0. Final source Prettier check and
  `git diff --check`: clean.
- Docks, sections and template provenance are read-only scene summaries. Background and
  name/description/tags remain editable through the existing metadata command.
- Only the five owned source files and this journal are intended for the task commit.
  Central operator retains responsibility for independent review and integration gates.

## Browser gate recovery (2026-09-19)

- Read the exact operator Browser acceptance log `0882ddf4-7f56-4d75-a73e-e2b53c050ee1`.
  Full run: 1,212 passed, 11 skipped, 5 failed. All other operator gates passed.
- Three flow-layout failures: the automatic phone scene-properties overlay intercepted tile
  action clicks, including a desktop project that resizes down to phone width. Automatic phone
  properties now share a column with the canvas, capped at 40% height with their own scroll area.
  Explicit Scene details retains its dismissible overlay; desktop properties retain their side panel.
- Two note-depth failures: Depth correctly moved to Display but was hidden on initial selection.
  Notes now start on Display, binding-backed tiles on Binding, other tiles on Content. All fields
  retain their declared groups. The journal fixture explicitly opens Content to edit a note.
- No Headroom tools are exposed in this session. Exact native outputs used. Verification pending.
- Recovery checks on unchanged source: `flow-layout.spec.ts`, `note-depth.spec.ts`, and
  the extracted journal fixture, desktop + mobile Chromium, two workers: 20 passed (24.9s),
  exit 0. This includes every case that failed the operator's browser gate, without edits
  to the existing test specs.
- App typecheck, targeted ESLint, Prettier, and six quality gates passed (exit 0).
  Scene editor index remains below the hard limit at 799 lines. `git diff --check` is clean.
- Unchanged `canvas.spec.ts`, both Chromium profiles, two workers: 82 passed (1.2m), exit 0.
  Configure round-trip retained. The full 1,228-case browser gate remains the operator's integration check.
- Removed the temporary fixture after validation; its reproducible source remains above.
  Recovery commit contains only three owned source paths and this journal. No push, promotion,
  dispatcher control-state edits, additional loops, or agents.
