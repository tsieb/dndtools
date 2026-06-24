import type {
	WidgetBindingPayload,
	WidgetConfigField,
	WidgetDefinition,
	WidgetInstance,
} from '@dndtools/core';

/**
 * board-helpers — the shared view-model that turns the Processing Core's widget state into the flat
 * shape the canvas substrate draws. Both `/board` (the Command Center spatial board) and
 * `/scene/:id` (the scene editor) read the SAME core scene/widget surface (CANVAS-009): a
 * `SceneSummary.widgets` carries the per-widget BINDING kind (available / degraded / disabled /
 * hidden / …), while the raw `Scene.widgets` carries the authoritative LAYOUT (x/y/w/h). We merge
 * them by id so every placed widget always has a real position, and surface the binding kind as the
 * widget's availability so disabled/missing widgets read honestly on the canvas.
 *
 * This mirrors how the production routes derive their tiles; it is intentionally framework-free so
 * the two screen files stay thin.
 */

export type WidgetTier = 'system' | 'template' | 'custom' | 'ai';
export type WidgetStatus = WidgetBindingPayload['kind'];

export interface BoardWidget {
	id: string;
	type: string;
	title: string;
	/** Library category or display name — the small caption under the title. */
	typeLabel: string;
	icon: string;
	tier: WidgetTier;
	description: string;
	/** 'dm-only' | 'shared' | 'player-visible' from the instance configuration. */
	visibility: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Binding availability from the actor-scoped summary (CANVAS-009). */
	status: WidgetStatus;
	statusNote: string | null;
	/**
	 * The raw instance configuration — the free-form `Record` that `scene.configure-widget` writes.
	 * Surfaced so the canvas can render each widget's representative BODY from its real settings
	 * (note text, timer duration, dice formulas, toggles…) and so the inspector round-trips edits.
	 */
	configuration: Record<string, unknown>;
	/**
	 * The widget definition's DECLARED customization fields (`WidgetDefinition.configFields`) — the
	 * core's own data-driven settings surface. The tiered inspector renders these as live controls and
	 * the canvas body reads the same keys, so inspector edits and the rendered body always agree.
	 */
	configFields: WidgetConfigField[];
	/**
	 * True when the widget's CONTENT comes from a required data binding (a Map's map, a Character's
	 * sheet) rather than free-form configuration. Such content is managed by its binding, so the
	 * inspector shows it as locked instead of an editable field.
	 */
	requiresBinding: boolean;
}

// WidgetDefinition.author is the closest core analogue to the prototype's four widget "tiers".
const TIER_BY_AUTHOR: Record<string, WidgetTier> = {
	system: 'system',
	user: 'custom',
	workspace: 'template',
	ai: 'ai',
};

export function tierOf(author: string | undefined): WidgetTier {
	if (!author) return 'template';
	return TIER_BY_AUTHOR[author] ?? 'template';
}

export const TIER_LABEL: Record<WidgetTier, string> = {
	system: 'System · locked content',
	template: 'Template',
	custom: 'Custom',
	ai: 'AI',
};

function statusNoteFor(payload: WidgetBindingPayload | undefined): string | null {
	if (!payload) return null;
	switch (payload.kind) {
		case 'degraded':
			return 'Some host permissions are unavailable here';
		case 'disabled':
			return payload.reason || 'Widget package disabled';
		case 'hidden':
			return 'Hidden from this viewer';
		case 'conflicted':
			return `Binding conflict (${payload.conflictPaths.length})`;
		case 'unbound':
			return 'Awaiting a data binding';
		case 'missing':
			return 'Bound entity is missing';
		default:
			return null;
	}
}

/**
 * Map raw widget instances (authoritative layout) + the actor-scoped binding payloads (availability)
 * into the flat board view-model. `defOf` resolves a widget definition for chrome (title / icon /
 * tier); pass `findWidgetDefinition(runtime.state.widgets, type)`.
 */
export function boardWidgetsOf(
	instances: readonly WidgetInstance[],
	payloadById: Map<string, WidgetBindingPayload>,
	defOf: (type: string) => WidgetDefinition | null,
): BoardWidget[] {
	return instances.map((instance) => {
		const def = defOf(instance.type);
		const payload = payloadById.get(instance.id);
		const visibility =
			typeof instance.configuration.visibility === 'string'
				? instance.configuration.visibility
				: 'dm-only';
		const titleOverride =
			typeof instance.configuration.title === 'string' && instance.configuration.title.trim()
				? instance.configuration.title
				: null;
		return {
			id: instance.id,
			type: instance.type,
			title: titleOverride ?? def?.displayName ?? instance.type,
			typeLabel: def?.category ?? def?.displayName ?? instance.type,
			icon: def?.icon ?? 'widget',
			tier: tierOf(def?.author),
			description: def?.description ?? '',
			visibility,
			configuration: instance.configuration,
			configFields: def?.configFields ?? [],
			requiresBinding: (def?.requiredBindings?.length ?? 0) > 0,
			x: instance.layout.x,
			y: instance.layout.y,
			w: instance.layout.w,
			h: instance.layout.h,
			status: payload?.kind ?? 'available',
			statusNote: statusNoteFor(payload),
		};
	});
}

/** Index the summary's binding payloads by widget instance id for the merge above. */
export function payloadIndex(payloads: readonly WidgetBindingPayload[]): Map<string, WidgetBindingPayload> {
	const map = new Map<string, WidgetBindingPayload>();
	for (const payload of payloads) {
		const id =
			payload.kind === 'available' || payload.kind === 'degraded'
				? payload.widget.id
				: payload.widgetInstanceId;
		map.set(id, payload);
	}
	return map;
}

/** The visibility chip label + tone for a widget's configured visibility. */
export function visibilityChip(visibility: string): { label: string; players: boolean } {
	if (visibility === 'player-visible' || visibility === 'shared') {
		return { label: visibility === 'shared' ? 'Shared' : 'Players', players: true };
	}
	return { label: 'DM only', players: false };
}
