import type { ComponentType } from 'react';
import { findWidgetDefinition, type WidgetTemplateKind } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../board-helpers';
import type { WidgetCommandHandler } from '../../widget-bodies';
import { resolveWidgetTemplateData } from '../dataEnvironment';
import { ActionPanelTemplate } from './ActionPanel';
import { ChartTemplate } from './Chart';
import { DataTableTemplate } from './DataTable';
import { FormPanelTemplate } from './FormPanel';
import { SceneMessageTemplate } from './SceneMessage';
import { StatBlockTemplate } from './StatBlock';
import { StatusListTemplate } from './StatusList';
import { TrackerTemplate } from './Tracker';
import type { WidgetTemplateProps } from './shared';

/**
 * The `template` branch of the render resolver (RC-WID-1.2): one renderer per declared template
 * kind, and the single place the runtime is read on their behalf.
 *
 * `WidgetRenderSlot` seeds its `TEMPLATE_RENDERERS` registry from `TEMPLATE_RENDERER_ENTRIES` below,
 * so a template kind lights up by being listed here and nowhere else. This module imports only TYPES
 * from the slot, so there is no import cycle between the registry and its contents.
 *
 * The `connect` wrapper is what keeps the eight templates pure: it looks up the definition, resolves
 * its `dataQueries`/`computedFields` for the ACTIVE actor (the "view as" actor while previewing, so
 * a DM previewing a player sees exactly what that player would), and passes the result down. The
 * templates themselves never touch the runtime, which is why each one renders in a unit test from a
 * fixture package alone.
 */

interface ConnectedProps {
	widget: BoardWidget;
	onCommand?: WidgetCommandHandler;
}

function connect(
	Template: ComponentType<WidgetTemplateProps>,
	displayName: string,
): ComponentType<ConnectedProps> {
	function Connected({ widget, onCommand }: ConnectedProps) {
		const runtime = useRuntime();
		const definition = findWidgetDefinition(runtime.state.widgets, widget.type) ?? null;
		const data = resolveWidgetTemplateData(
			runtime.state,
			runtime.activeActorId,
			definition,
			widget,
		);
		return <Template widget={widget} definition={definition} data={data} onCommand={onCommand} />;
	}
	Connected.displayName = displayName;
	return Connected;
}

/** Every template kind the schema declares, each with a renderer. No kind is left unhandled. */
export const TEMPLATE_RENDERER_ENTRIES: ReadonlyArray<
	readonly [WidgetTemplateKind, ComponentType<ConnectedProps>]
> = [
	['data-table', connect(DataTableTemplate, 'DataTableWidget')],
	['status-list', connect(StatusListTemplate, 'StatusListWidget')],
	['tracker', connect(TrackerTemplate, 'TrackerWidget')],
	['action-panel', connect(ActionPanelTemplate, 'ActionPanelWidget')],
	['scene-message', connect(SceneMessageTemplate, 'SceneMessageWidget')],
	['chart', connect(ChartTemplate, 'ChartWidget')],
	['stat-block', connect(StatBlockTemplate, 'StatBlockWidget')],
	['form-panel', connect(FormPanelTemplate, 'FormPanelWidget')],
];

export type { WidgetTemplateProps };
