// @vitest-environment jsdom

import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	ALL_WIDGET_TEMPLATE_KINDS,
	widgetTemplateReadsQueries,
	type WidgetDefinition,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState } from '@dndtools/core/testing';
import { I18nProvider } from '../../../i18n';
import type { BoardWidget } from '../../board-helpers';
import {
	previewNeedsSampleData,
	resolveWidgetTemplateData,
	sampleTemplateData,
} from '../dataEnvironment';
import { ActionPanelTemplate } from './ActionPanel';
import { ChartTemplate } from './Chart';
import { DataTableTemplate } from './DataTable';
import { FormPanelTemplate } from './FormPanel';
import { HUB_TEMPLATES } from './Hub';
import { SceneMessageTemplate } from './SceneMessage';
import { StatBlockTemplate } from './StatBlock';
import { StatusListTemplate } from './StatusList';
import { TrackerTemplate } from './Tracker';
import { NO_DATA_SOURCE_COPY, TemplateKindProvider, type WidgetTemplateProps } from './shared';

/**
 * RC-WID-6.5 — every template kind with NO data query, twice: as a placed tile resolves it, and as
 * the builder preview draws it.
 *
 * On the board a kind that is complete without a query (buttons, a message, a form, an intent
 * launcher) never says it has no data source; a kind that draws rows says so honestly. In the
 * preview a kind that draws rows gets three sample rows, which the preview labels "Sample data".
 * The snapshot pins each kind's markup so a change to either reading is a reviewed diff.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TEMPLATES: Record<WidgetTemplateKind, ComponentType<WidgetTemplateProps>> = {
	'data-table': DataTableTemplate,
	'status-list': StatusListTemplate,
	tracker: TrackerTemplate,
	'action-panel': ActionPanelTemplate,
	'scene-message': SceneMessageTemplate,
	chart: ChartTemplate,
	'stat-block': StatBlockTemplate,
	'form-panel': FormPanelTemplate,
	...HUB_TEMPLATES,
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

function definitionOf(kind: WidgetTemplateKind): WidgetDefinition {
	return {
		type: `no-query-${kind}`,
		version: '1.0.0',
		displayName: 'No query',
		author: 'workspace',
		supportedProfiles: ['desktop'],
		defaultSize: { width: 240, height: 160 },
		minSize: { width: 120, height: 80 },
		resizePolicy: 'free',
		requiredBindings: [],
		optionalBindings: [],
		dataQueries: [],
		renderEntrypoint: { runtime: 'template', template: kind, hostApiVersion: 1 },
		configurationSchema: { type: 'object', additionalProperties: true },
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
	};
}

function widgetOf(definition: WidgetDefinition): BoardWidget {
	return {
		id: `w-${definition.type}`,
		type: definition.type,
		title: definition.displayName,
		typeLabel: 'Kind',
		icon: 'widget',
		tier: 'custom',
		description: '',
		visibility: 'dm-only',
		x: 0,
		y: 0,
		w: 240,
		h: 160,
		status: 'available',
		statusNote: null,
		configuration: {},
		configFields: [],
		requiresBinding: false,
		commands: [],
		bindingRef: null,
	};
}

function draw(kind: WidgetTemplateKind, surface: 'board' | 'preview', actorId = DM_ACTOR.id) {
	const definition = definitionOf(kind);
	const widget = widgetOf(definition);
	const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const data =
		surface === 'preview' && previewNeedsSampleData(definition)
			? sampleTemplateData(actorId === DM_ACTOR.id)
			: resolveWidgetTemplateData(state, actorId, definition, widget);
	const Template = TEMPLATES[kind];
	const drawn = <Template widget={widget} definition={definition} data={data} />;
	act(() =>
		root.render(
			<I18nProvider>
				{/* The builder preview names the kind it draws; the board's connected renderers do not. */}
				{surface === 'preview' ? (
					<TemplateKindProvider kind={kind}>{drawn}</TemplateKindProvider>
				) : (
					drawn
				)}
			</I18nProvider>,
		),
	);
	return { html: container.innerHTML, text: container.textContent ?? '' };
}

describe('RC-WID-6.5 — every template with no query', () => {
	for (const kind of ALL_WIDGET_TEMPLATE_KINDS) {
		it(`${kind}: on the board and in the preview`, () => {
			const board = draw(kind, 'board');
			const preview = draw(kind, 'preview');
			expect({ board: board.html, preview: preview.html }).toMatchSnapshot();

			const readsRows = widgetTemplateReadsQueries(kind);
			if (!readsRows) {
				// Complete without a query: no error-sounding line in the preview, nor on the board for
				// every kind drawn in a template shell. An empty launcher or link list (no intents and no
				// query) is drawn without one, so on the board it still reads as a data kind; see the
				// RC-WID-6.5 journal's handoff for `templates/index.tsx`.
				expect(preview.text).not.toContain(NO_DATA_SOURCE_COPY);
				if (!(kind in HUB_TEMPLATES)) expect(board.text).not.toContain(NO_DATA_SOURCE_COPY);
			} else {
				// Draws rows: the preview shows sample ones instead of the missing-source line.
				expect(preview.text).not.toContain(NO_DATA_SOURCE_COPY);
				expect(preview.text).toContain('Ser Brannoc');
			}
		});
	}

	it('the action panel the friction review found never says it has no data source', () => {
		expect(draw('action-panel', 'board').text).not.toContain(NO_DATA_SOURCE_COPY);
	});

	it('a status list with no query still says so on the board, in place of made-up rows', () => {
		const board = draw('status-list', 'board');
		expect(board.text).toContain(NO_DATA_SOURCE_COPY);
		expect(board.text).not.toContain('Ser Brannoc');
	});

	it('the status list draws visibility in the app’s words, and a player preview drops the DM-only row', () => {
		const dm = draw('status-list', 'preview');
		expect(dm.text).toContain('Player visible');
		expect(dm.text).toContain('Shared');
		expect(dm.text).not.toContain('player-visible');
		expect(dm.text).toContain('Old Tam');
		const player = draw('status-list', 'preview', PLAYER_ACTOR.id);
		expect(player.text).not.toContain('Old Tam');
	});
});
