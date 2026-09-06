import { useMemo, useState, type ComponentType } from 'react';
import {
	PREVIEW_PLAYER_ACTOR_ID,
	permissionsWithPreviewActors,
	resolveWidgetConfig,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { Seg, T } from '../screen-kit';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { BoardWidget } from '../board-helpers';
import { hasBuiltinBody } from '../widget-bodies';
import { resolveWidgetRenderer } from '../widgets/resolveRenderer';
import { WidgetErrorBoundary, WidgetPlaceholder } from '../widgets/WidgetRenderSlot';
import { WITHHELD_COPY, resolveWidgetTemplateData } from '../widgets/dataEnvironment';
import { ActionPanelTemplate } from '../widgets/templates/ActionPanel';
import { ChartTemplate } from '../widgets/templates/Chart';
import { DataTableTemplate } from '../widgets/templates/DataTable';
import { FormPanelTemplate } from '../widgets/templates/FormPanel';
import { SceneMessageTemplate } from '../widgets/templates/SceneMessage';
import { StatBlockTemplate } from '../widgets/templates/StatBlock';
import { StatusListTemplate } from '../widgets/templates/StatusList';
import { TrackerTemplate } from '../widgets/templates/Tracker';
import type { WidgetTemplateProps } from '../widgets/templates/shared';
import { buildPackage, type WidgetDraft } from './draft';

/**
 * The builder's centre pane: the draft drawn through the real render path (RC-WID-2.1).
 *
 * The draft is not installed, so the connected renderers in `widgets/templates/index.tsx` — which
 * look a definition up in the package registry by type — cannot be used. This maps the same eight
 * PURE template components itself and resolves the draft's data with the same
 * `resolveWidgetTemplateData`, so the preview goes through WID-1.1's resolver and WID-1.2's
 * renderers rather than a second drawing path that could disagree with the board.
 *
 * The data is the campaign's OWN, resolved for the active actor: previewing a "current combatants"
 * widget shows the combatants in this campaign right now. When a query has no rows the template's
 * real empty state is what appears, and a note under the frame says why — a preview that invented
 * plausible rows would be the one lie this screen cannot afford.
 *
 * RC-WID-2.2 adds "Preview as player": the same resolution run as the reserved zero-grant generic
 * preview actor the whole app uses for previewing (`PREVIEW_PLAYER_ACTOR_ID`), so what the author
 * sees is what the audience and capability gates in `dataEnvironment` actually do — a `DM only`
 * query comes back withheld, not merely empty. It is the app's own preview machinery rather than a
 * builder-local guess about what a player can see, because a second opinion here would be a lie the
 * author would only discover at the table.
 */

/** Exhaustive by construction: adding a template kind to the schema fails to compile here. */
const RAW_TEMPLATES: Record<WidgetTemplateKind, ComponentType<WidgetTemplateProps>> = {
	'data-table': DataTableTemplate,
	'status-list': StatusListTemplate,
	tracker: TrackerTemplate,
	'action-panel': ActionPanelTemplate,
	'scene-message': SceneMessageTemplate,
	chart: ChartTemplate,
	'stat-block': StatBlockTemplate,
	'form-panel': FormPanelTemplate,
};

export function BuilderPreview({ draft }: { draft: WidgetDraft }) {
	const runtime = useRuntime();
	const [audience, setAudience] = useState<'dm' | 'player'>('dm');
	const definition = useMemo(() => buildPackage(draft).widgets[0] ?? null, [draft]);

	// The reserved preview actor holds no grants at all, so previewing as a player is the strictest
	// reading of the declaration rather than one particular player's.
	const state = useMemo(
		() =>
			audience === 'player'
				? {
						...runtime.state,
						permissions: permissionsWithPreviewActors(runtime.state.permissions),
					}
				: runtime.state,
		[audience, runtime.state],
	);
	const actorId = audience === 'player' ? PREVIEW_PLAYER_ACTOR_ID : runtime.activeActorId;

	const widget: BoardWidget | null = useMemo(() => {
		if (!definition) return null;
		return {
			id: 'widget-builder-preview',
			type: definition.type,
			title: definition.displayName || 'Untitled widget',
			typeLabel: definition.category || 'Custom',
			icon: definition.icon ?? 'widget',
			tier: 'custom',
			description: definition.description ?? '',
			visibility: 'dm-only',
			x: 0,
			y: 0,
			w: definition.defaultSize.width,
			h: definition.defaultSize.height,
			status: 'available',
			statusNote: null,
			configuration: resolveWidgetConfig(definition, {}),
			configFields: definition.configFields ?? [],
			requiresBinding: definition.requiredBindings.length > 0,
			commands: definition.commands.map((command) => command.type),
			bindingRef: null,
		};
	}, [definition]);

	const data = useMemo(
		() => (widget ? resolveWidgetTemplateData(state, actorId, definition, widget) : null),
		[state, actorId, definition, widget],
	);

	if (!definition || !widget || !data) return null;

	const plan = resolveWidgetRenderer(
		{
			widgetType: widget.type,
			status: widget.status,
			statusNote: widget.statusNote,
			entrypoint: definition.renderEntrypoint,
		},
		{
			hasBuiltinBody,
			hasTemplateRenderer: (template) => template in RAW_TEMPLATES && !hasBuiltinBody(widget.type),
			hasCustomHost: false,
		},
	);

	const Template = RAW_TEMPLATES[definition.renderEntrypoint?.template ?? 'status-list'];
	const emptyQueries = data.queries.filter((query) => query.rows.length === 0 && !query.withheld);
	const withheldQueries = data.queries.filter((query) => query.withheld !== null);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
			<Seg
				ariaLabel="Preview audience"
				value={audience}
				onChange={(next: string) => setAudience(next === 'player' ? 'player' : 'dm')}
				options={[
					{ value: 'dm', label: 'Preview as DM' },
					{ value: 'player', label: 'Preview as player' },
				]}
			/>
			<div
				data-testid="widget-builder-preview"
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
					width: '100%',
					maxWidth: Math.max(240, Math.min(560, definition.defaultSize.width)),
					height: Math.max(160, Math.min(420, definition.defaultSize.height)),
					padding: 12,
					border: `1px solid ${T.bd}`,
					borderRadius: 12,
					background: T.surf,
					boxShadow: T.ssm,
					overflow: 'hidden',
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '0 0 auto' }}>
					<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{widget.title}</span>
					<span style={{ font: `11px ${T.sans}`, color: T.ter }}>{widget.typeLabel}</span>
				</div>
				<div style={{ flex: 1, minHeight: 0 }}>
					<WidgetErrorBoundary widgetId={`${widget.type}:${plan.kind}`}>
						{plan.kind === 'template' ? (
							<Template widget={widget} definition={definition} data={data} />
						) : plan.kind === 'builtin' ? (
							<WidgetPlaceholder
								diagnostic={`A built-in widget already uses the type id ${widget.type}. Choose another id on the Identity step.`}
							/>
						) : (
							<WidgetPlaceholder
								diagnostic={
									plan.kind === 'placeholder' ? plan.diagnostic : 'Nothing can draw this yet.'
								}
							/>
						)}
					</WidgetErrorBoundary>
				</div>
			</div>
			<p style={{ margin: 0, font: `12px/1.55 ${T.sans}`, color: T.ter }}>
				{audience === 'player'
					? "Drawn with this campaign's own data, as a player with no grants would receive it."
					: "Drawn with this campaign's own data, for the actor you are viewing as."}
				{emptyQueries.length > 0 &&
					` ${emptyQueries.map((query) => query.label).join(', ')} has nothing to show right now, so the widget's empty state is what appears.`}
			</p>
			{withheldQueries.length > 0 && (
				<ul
					data-testid="widget-builder-preview-withheld"
					style={{
						margin: 0,
						padding: 0,
						listStyle: 'none',
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
					}}
				>
					{withheldQueries.map((query) => (
						<li key={query.id} style={{ font: `12px/1.55 ${T.sans}`, color: T.sub }}>
							{query.label} — {WITHHELD_COPY[query.withheld ?? 'audience']}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
