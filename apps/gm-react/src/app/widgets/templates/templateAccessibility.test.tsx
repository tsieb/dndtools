// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { WidgetTemplateKind } from '@dndtools/core';
import type { WidgetTemplateProps } from './shared';
import { fixturePackage, renderTemplate, container } from './templateFixtures';
import { ActionPanelTemplate } from './ActionPanel';
import { ChartTemplate } from './Chart';
import { DataTableTemplate } from './DataTable';
import { FormPanelTemplate } from './FormPanel';
import { SceneMessageTemplate } from './SceneMessage';
import { StatBlockTemplate } from './StatBlock';
import { StatusListTemplate } from './StatusList';
import { TrackerTemplate } from './Tracker';
describe('the widget accessibility contract', () => {
	const TEMPLATES: ReadonlyArray<
		readonly [WidgetTemplateKind, (props: WidgetTemplateProps) => React.ReactNode]
	> = [
		['data-table', DataTableTemplate],
		['status-list', StatusListTemplate],
		['tracker', TrackerTemplate],
		['action-panel', ActionPanelTemplate],
		['scene-message', SceneMessageTemplate],
		['chart', ChartTemplate],
		['stat-block', StatBlockTemplate],
		['form-panel', FormPanelTemplate],
	];

	it.each(TEMPLATES)('%s reads its data out through the shell live region', (kind, Template) => {
		renderTemplate(Template, fixturePackage(kind));
		const shell = container.querySelector(`[data-testid="widget-template-${kind}"]`);
		const region = shell?.firstElementChild;
		expect(region?.getAttribute('aria-live')).toBe('polite');
		expect(region?.getAttribute('aria-atomic')).toBe('false');
	});

	it('keeps the action panel buttons outside the live region', () => {
		renderTemplate(
			ActionPanelTemplate,
			fixturePackage('action-panel', {
				commands: [
					{
						type: 'fixture.roll',
						displayName: 'Roll the table',
						requiredCapability: 'operator',
						payloadSchema: { type: 'object' },
						writesTo: 'session',
						executor: 'roll',
					},
				],
			}),
			{ onCommand: () => {} },
		);
		expect(container.querySelector('button')).not.toBeNull();
		expect(container.querySelector('[aria-live="polite"] button')).toBeNull();
	});

	it('keeps the form fields and Submit outside the live region', () => {
		renderTemplate(
			FormPanelTemplate,
			fixturePackage('form-panel', {
				configFields: [{ key: 'line', label: 'Loot entry', control: 'text', group: 'content' }],
				commands: [
					{
						type: 'fixture.write-note-line',
						displayName: 'Record it',
						requiredCapability: 'operator',
						payloadSchema: { type: 'object', properties: { line: { type: 'string' } } },
						writesTo: 'entity',
						executor: 'write-note-line',
					},
				],
			}),
			{ onCommand: () => {} },
		);
		expect(container.querySelector('input')).not.toBeNull();
		expect(
			container.querySelector('[aria-live="polite"] input, [aria-live="polite"] button'),
		).toBeNull();
	});

	it('says "Now" on the active chart and tracker row, where the bar tone alone used to', () => {
		// The running fight's combatants: the fixture's only combatant holds the turn.
		const fight = (kind: 'chart' | 'tracker') =>
			fixturePackage(kind, {
				dataQueries: [
					{
						id: 'fight',
						label: 'Fight',
						source: 'current-combatants',
						requiredCapability: 'viewer',
						audience: 'shared',
					},
				],
				computedFields: [],
			});
		expect(renderTemplate(ChartTemplate, fight('chart'))).toContain('Now');
		expect(renderTemplate(TrackerTemplate, fight('tracker'))).toContain('Brannor · Now');
	});
});
