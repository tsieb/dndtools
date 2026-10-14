import { builtinSizeBounds } from './widgets/builtin';
import { englishCopy, type Translate } from './canvas/canvasCopy';
import {
	BOARD_COLUMNS,
	BOARD_COLUMN_STEP,
	BOARD_ROW_GUTTER,
	clampWidthToColumns,
} from './canvas/boardLayout';
import {
	resolveAddWidgetCommand,
	widgetPresentation,
	type ResolvedAddWidgetCommand,
	type WidgetBindingPayload,
	type WidgetConfigField,
	type WidgetDefinition,
	type WidgetInstance,
	type WidgetLibraryEntry,
	type WidgetPresentation,
	type WidgetStyleTokenDefinition,
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
	/**
	 * The command types this widget's definition DECLARES (`WidgetDefinition.commands`). Operate
	 * affordances (Roll / Start) verify a command is declared here before dispatching
	 * `widget.dispatch-command`; an undeclared command renders as an inert decoration instead.
	 */
	commands: string[];
	/**
	 * The instance's data-binding source (a Character widget's character, a Map widget's map), when
	 * bound. Live bodies resolve the bound entity through the actor-filtered queries from this ref.
	 */
	bindingRef: { entityType: string; entityId: string } | null;
	/**
	 * The `--widget-*` style tokens the definition DECLARES (`WidgetDefinition.style.tokens`,
	 * RC-WID-2.4), listed in the scene Inspector's Style group. Optional so hand-built view-models
	 * (the builder preview, test fixtures) that declare none need not spell out an empty list.
	 */
	styleTokens?: WidgetStyleTokenDefinition[];
	resizePolicy?: WidgetDefinition['resizePolicy'];
	defaultSize?: { width: number; height: number };
	minSize?: { width: number; height: number };
	maxSize?: { width: number; height: number };
	/** The instance's layout group, when it has one: flow stacks consecutive members (RC-CAN-7.6). */
	groupId?: string | null;
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

/** Only an explicitly fixed size locks resizing; authorship never does. */
export function isWidgetResizable(
	widget: Pick<BoardWidget, 'minSize' | 'maxSize' | 'resizePolicy'>,
): boolean {
	return (
		widget.resizePolicy !== 'fixed' &&
		!(
			widget.minSize &&
			widget.maxSize &&
			widget.minSize.width === widget.maxSize.width &&
			widget.minSize.height === widget.maxSize.height
		)
	);
}

export const TIER_LABEL: Record<WidgetTier, string> = {
	system: 'System · locked content',
	template: 'Template',
	custom: 'Custom',
	ai: 'AI',
};

function statusNoteFor(payload: WidgetBindingPayload | undefined): string | null {
	// No payload: the actor read did not deliver this instance (see `boardWidgetsOf`).
	if (!payload) return 'Hidden from this viewer';
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

export interface BoardWidgetsOptions {
	/**
	 * RC-ENG-10.2 — keep instances the actor summary did not deliver. Only the DM's own edit view
	 * asks for this: it has to list every placed widget, and each one it would otherwise lack a
	 * payload for is painted `hidden`, never `available`.
	 */
	includeUndelivered?: boolean;
}

/**
 * Map raw widget instances (authoritative layout) + the actor-scoped binding payloads (availability)
 * into the flat board view-model. `defOf` resolves a widget definition for chrome (title / icon /
 * tier); pass `findWidgetDefinition(runtime.state.widgets, type)`.
 *
 * The raw scene lists every instance, but `getSceneForActor` leaves out the ones outside the actor's
 * sections — so an instance with no payload is one this actor was not given, and by default it is
 * dropped rather than drawn with its title and configuration (RC-ENG-10.2).
 */
export function boardWidgetsOf(
	instances: readonly WidgetInstance[],
	payloadById: Map<string, WidgetBindingPayload>,
	defOf: (type: string) => WidgetDefinition | null,
	options: BoardWidgetsOptions = {},
): BoardWidget[] {
	const shown = options.includeUndelivered
		? instances
		: instances.filter((instance) => payloadById.has(instance.id));
	return shown.map((instance) => {
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
			commands: (def?.commands ?? []).map((command) => command.type),
			styleTokens: def?.style?.tokens ?? [],
			resizePolicy: def?.resizePolicy,
			defaultSize: def?.defaultSize,
			minSize: builtinSizeBounds(instance.type)?.minSize ?? def?.minSize,
			maxSize: builtinSizeBounds(instance.type)?.maxSize,
			bindingRef: instance.binding
				? {
						entityType: instance.binding.source.entityType,
						entityId: instance.binding.source.entityId,
					}
				: null,
			x: instance.layout.x,
			y: instance.layout.y,
			w: instance.layout.w,
			h: instance.layout.h,
			status: payload?.kind ?? 'hidden',
			statusNote: statusNoteFor(payload),
			...(instance.layout.groupId ? { groupId: instance.layout.groupId } : {}),
		};
	});
}

/**
 * The tile's presentation (RC-WID-5.3): the instance's own setting, else its definition's default
 * field. Bare applies in VIEW mode only; while the layout is edited every tile shows its frame.
 */
export function boardWidgetPresentation(
	widget: Pick<BoardWidget, 'configuration' | 'configFields'>,
): WidgetPresentation {
	return widgetPresentation({
		presentation:
			widget.configuration.presentation ??
			widget.configFields.find((field) => field.key === 'presentation')?.default,
	});
}

/** Index the summary's binding payloads by widget instance id for the merge above. */
export function payloadIndex(
	payloads: readonly WidgetBindingPayload[],
): Map<string, WidgetBindingPayload> {
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

/** The visibility chip's catalog label + tone for a widget's configured visibility. */
export function visibilityChip(visibility: string): {
	label:
		| 'boardCanvas.visibility.shared'
		| 'boardCanvas.visibility.players'
		| 'boardCanvas.visibility.dmOnly';
	players: boolean;
} {
	if (visibility === 'player-visible' || visibility === 'shared') {
		const shared = visibility === 'shared';
		return {
			label: shared ? 'boardCanvas.visibility.shared' : 'boardCanvas.visibility.players',
			players: true,
		};
	}
	return { label: 'boardCanvas.visibility.dmOnly', players: false };
}

/** The size the core seeds every one-column board tile at (`command-center-state.ts`
 *  `DEFAULT_WIDGET_SIZE`). */
export const BOARD_TILE_SIZE = { w: 240, h: 160 } as const;

/**
 * RC-CAN-8.1 — THE default-size table. Every add (the gallery, the palette's "Add tile") sizes its
 * tile here, so a new tile matches the seeded ones beside it instead of landing at a definition's
 * 220×160 next to 240×160 siblings. The board and flow lay tiles on the board's 240px columns: the
 * declared width picks how many columns the tile spans, and it is never shorter than a seeded tile.
 * The free canvas has no columns, so it keeps the definition's own default.
 */
export function defaultTileSize(
	declared: { width: number; height: number } | undefined,
	policy: 'bounded' | 'flow' | 'canvas',
	minimum?: { width: number; height: number },
): { w: number; h: number } {
	if (policy === 'canvas' && declared) return { w: declared.width, h: declared.height };
	const span = Math.min(
		BOARD_COLUMNS,
		Math.max(1, Math.round((declared?.width ?? BOARD_TILE_SIZE.w) / BOARD_COLUMN_STEP)),
	);
	return {
		w: Math.max(span * BOARD_COLUMN_STEP - BOARD_ROW_GUTTER, minimum?.width ?? 0),
		h: Math.max(BOARD_TILE_SIZE.h, declared?.height ?? 0, minimum?.height ?? 0),
	};
}

/** The library's `scene.add-widget` for `entry`, sized from {@link defaultTileSize}. */
export function addTileCommand(
	entry: WidgetLibraryEntry,
	sceneId: string,
	position: { x: number; y: number },
	policy: 'bounded' | 'flow' | 'canvas',
): ResolvedAddWidgetCommand | null {
	const command = resolveAddWidgetCommand(entry, sceneId, position);
	if (!command) return null;
	const size = defaultTileSize(entry.defaultSize, policy, entry.minSize);
	const { widget } = command.payload;
	return {
		...command,
		payload: { ...command.payload, widget: { ...widget, layout: { ...widget.layout, ...size } } },
	};
}

/** Dock to the authored board extent; free coordinates are kept for undocking. */
export function dockedPosition(
	position: { x: number; y: number; w: number; h: number },
	dock: string | null,
	extent: { width: number; height: number },
) {
	return {
		x: dock === 'left' ? 0 : dock === 'right' ? Math.max(0, extent.width - position.w) : position.x,
		y:
			dock === 'top' ? 0 : dock === 'bottom' ? Math.max(0, extent.height - position.h) : position.y,
	};
}

/**
 * RC-CAN-8.1 — a frame's accessible name. In edit mode it reads the position and size of the layout
 * the board RECEIVED — the committed tile, never a pointer draft or a definition default — so a
 * screen reader hears "size 240 by 160" for the 240×160 tile on screen.
 */
export function frameName(
	w: Pick<BoardWidget, 'title' | 'typeLabel' | 'x' | 'y' | 'w' | 'h'>,
	options: { editing: boolean; selected?: boolean },
	t: Translate = englishCopy,
): string {
	const named = { title: w.title, type: w.typeLabel };
	if (!options.editing) return t('boardCanvas.frame.name', named);
	const geometry = { x: String(w.x), y: String(w.y), w: String(w.w), h: String(w.h) };
	const key = options.selected ? 'boardCanvas.frame.nameSelected' : 'boardCanvas.frame.nameEditing';
	return t(key, { ...named, ...geometry });
}

/** The size a resize request actually commits: floored at the definition's minimum and, on the
 *  bounded board, clamped to its columns exactly as Board's `resize` does, so a live announcement
 *  or pointer draft never reports a width the board is about to refuse. */
export function fitWidgetSize(
	widget: BoardWidget,
	width: number,
	height: number,
	bounded: boolean,
): { w: number; h: number } {
	if (!isWidgetResizable(widget)) return { w: widget.w, h: widget.h };
	const w = Math.min(
		widget.maxSize?.width ?? Infinity,
		Math.max(widget.minSize?.width ?? 20, width),
	);
	return {
		w: bounded ? clampWidthToColumns(widget.x, w) : w,
		h: Math.min(widget.maxSize?.height ?? Infinity, Math.max(widget.minSize?.height ?? 20, height)),
	};
}

/** Small is the declared minimum, medium the default, large 150% of the default — each fitted, so
 *  a preset the bounded board clamps to an existing size collapses into it. Pass `distinct=false`
 *  for labelled S/M/L buttons, whose labels must survive coincident sizes. */
export function widgetSizePresets(widget: BoardWidget, bounded = false, distinct = true) {
	const min = widget.minSize ?? { width: 20, height: 20 };
	const base = widget.defaultSize ?? { width: 280, height: 220 };
	return [min, base, { width: Math.round(base.width * 1.5), height: Math.round(base.height * 1.5) }]
		.map(({ width, height }) => fitWidgetSize(widget, width, height, bounded))
		.filter(
			(size, index, sizes) =>
				!distinct || sizes.findIndex((other) => other.w === size.w && other.h === size.h) === index,
		);
}

/** The preset after `current` — the size on screen, which may be a draft the core has not
 *  confirmed yet. A custom size restarts the cycle at small. */
export function nextSizePreset(
	widget: BoardWidget,
	current: { w: number; h: number },
	bounded = false,
): { w: number; h: number } {
	const sizes = widgetSizePresets(widget, bounded);
	const index = sizes.findIndex((size) => size.w === current.w && size.h === current.h);
	return sizes[(index + 1) % sizes.length];
}

// RC-POL-1.2 — the flow policy lives in `canvas/flowLayout.ts`; one import for every caller.
export * from './canvas/flowLayout';
export * from './canvas/boardLayout';
