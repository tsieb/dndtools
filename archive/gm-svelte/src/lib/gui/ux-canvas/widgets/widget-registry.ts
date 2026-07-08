/**
 * The unified widget render registry. Maps a `WidgetDefinition`'s render entrypoint onto the Svelte
 * component that draws it, for BOTH surfaces (scene canvas + Command Center board):
 *
 *   - `runtime: 'template'`      → a generic, config/data-driven template component (by template kind)
 *   - `runtime: 'builtin'`       → a named app component (by `exportName`) for data-rich/bespoke widgets
 *   - `runtime: 'custom-html-js'`→ the sandboxed iframe host (resolved by WidgetView, not here)
 *
 * Adding a widget renderer is a one-line registration; WidgetView falls back to a placeholder for any
 * definition with no resolvable renderer, so an unknown/disabled widget can never crash a surface.
 */
import type { Component } from 'svelte';
import type { WidgetDefinition, WidgetTemplateKind } from '@dndtools/core';

import TemplateDataTable from './templates/TemplateDataTable.svelte';
import TemplateStatusList from './templates/TemplateStatusList.svelte';
import TemplateTracker from './templates/TemplateTracker.svelte';
import TemplateActionPanel from './templates/TemplateActionPanel.svelte';
import TemplateSceneMessage from './templates/TemplateSceneMessage.svelte';
import TemplateStatBlock from './templates/TemplateStatBlock.svelte';
import TemplateFormPanel from './templates/TemplateFormPanel.svelte';
import TemplateChart from './templates/TemplateChart.svelte';

import MapWidget from './MapWidget.svelte';
import AudioWidget from './AudioWidget.svelte';
import DataHubWidget from './DataHubWidget.svelte';
import CombatWidget from './CombatWidget.svelte';
import NotesWidget from './NotesWidget.svelte';
import CharactersWidget from './CharactersWidget.svelte';
import AtlasWidget from './AtlasWidget.svelte';
import SearchWidget from './SearchWidget.svelte';
import SessionWidget from './SessionWidget.svelte';
import ToolsWidget from './ToolsWidget.svelte';
import PlayerViewsWidget from './PlayerViewsWidget.svelte';
import GettingStartedWidget from './GettingStartedWidget.svelte';

// Registry values share a permissive prop contract (WidgetRenderProps); each component reads only
// the props it declares, so the registry value type is intentionally `any`-propped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWidgetComponent = Component<any>;

export const templateRenderers: Partial<Record<WidgetTemplateKind, AnyWidgetComponent>> = {
	'data-table': TemplateDataTable,
	'status-list': TemplateStatusList,
	tracker: TemplateTracker,
	'action-panel': TemplateActionPanel,
	'scene-message': TemplateSceneMessage,
	'stat-block': TemplateStatBlock,
	'form-panel': TemplateFormPanel,
	chart: TemplateChart,
};

export const builtinRenderers: Record<string, AnyWidgetComponent> = {
	// System scene widgets that need a bespoke renderer.
	map: MapWidget,
	audio: AudioWidget,
	// Command Center widgets (rendered only on the command-center surface).
	'data-hub': DataHubWidget,
	combat: CombatWidget,
	notes: NotesWidget,
	characters: CharactersWidget,
	atlas: AtlasWidget,
	search: SearchWidget,
	session: SessionWidget,
	tools: ToolsWidget,
	'player-views': PlayerViewsWidget,
	'getting-started': GettingStartedWidget,
};

export type WidgetRendererResolution =
	| { kind: 'template'; component: AnyWidgetComponent }
	| { kind: 'builtin'; component: AnyWidgetComponent }
	| { kind: 'custom' }
	| { kind: 'placeholder'; reason: string };

/** Resolve the renderer for a widget definition. Fails soft to a placeholder (never throws). */
export function resolveWidgetRenderer(definition: WidgetDefinition): WidgetRendererResolution {
	const entry = definition.renderEntrypoint;
	if (!entry) return { kind: 'placeholder', reason: 'This widget declares no renderer.' };
	if (entry.runtime === 'custom-html-js') return { kind: 'custom' };
	if (entry.runtime === 'builtin') {
		const component = entry.exportName ? builtinRenderers[entry.exportName] : undefined;
		return component
			? { kind: 'builtin', component }
			: { kind: 'placeholder', reason: `No built-in renderer "${entry.exportName ?? '(none)'}".` };
	}
	const component = entry.template ? templateRenderers[entry.template] : undefined;
	return component
		? { kind: 'template', component }
		: { kind: 'placeholder', reason: `No template renderer "${entry.template ?? '(none)'}".` };
}
