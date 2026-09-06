/**
 * MAP-021 — the editor's tool model.
 *
 * The rail is organized as Foundry VTT organizes its scene controls: not a flat list of tools, but a
 * column of LAYER GROUPS, each of which expands a sub-tool column. Selecting a group scopes the active
 * layer (so hit-testing and new content land where the user expects), and the sub-tools are one of
 * three kinds — a `radio` tool (mutually exclusive mode, e.g. Draw Wall), a `toggle` (sticky state,
 * e.g. Snap to Grid), or an `action` (one-shot, e.g. Close All Doors). That radio/toggle/action
 * vocabulary is the entire grammar of a tool palette, and promoting a mode-parameter to a sibling tool
 * (seven wall types, not a wall tool with a dropdown) keeps the current mode visible and one keystroke
 * away rather than buried in a menu.
 *
 * Every tool declares a single-key shortcut using the industry-standard editor keymap (V = select,
 * B = brush, E = erase, …) so muscle memory transfers in from Photoshop/Figma/Foundry, and the command
 * palette shows each shortcut so novices learn the keymap passively.
 */

import type { MapLayerCategory } from '@dndtools/core';
import type { MessageKey } from '../../i18n';

/** A concrete tool the user can activate. Ids are stable — they key persisted per-tool options. */
export type ToolId =
	// Select group
	| 'select'
	| 'marquee'
	| 'pan'
	// Terrain / paint group
	| 'brush'
	| 'fill'
	| 'erase'
	// Structure group
	| 'wall'
	| 'door'
	| 'room'
	| 'water'
	// Object group
	| 'stamp'
	| 'scatter'
	// Light group
	| 'light'
	// Fog group
	| 'fog'
	// Token group
	| 'token'
	// Annotation group
	| 'poi'
	| 'route'
	| 'text'
	| 'measure'
	// Generate group (generation-as-a-tool: the generator paints into a preview, not a modal dialog)
	| 'generate';

export type ToolKind = 'radio' | 'toggle' | 'action';

export interface ToolDef {
	id: ToolId;
	/** RC-UX-1.2: a message key, rendered by the rail / palette / options bar with `t`. */
	label: MessageKey;
	icon: string;
	/** Single-key shortcut (lowercase). Shown in the tooltip and the command palette. */
	shortcut?: string;
	/** One line explaining what the tool does; shown in the tool-options bar hint and the palette. */
	hint: MessageKey;
	kind: ToolKind;
}

export interface ToolGroupDef {
	id: string;
	label: MessageKey;
	icon: string;
	/** The layer category this group authors into. Selecting the group scopes new content here. */
	category: MapLayerCategory;
	tools: ToolDef[];
}

/**
 * The rail. Ordered top-to-bottom. The first group (Select) is the safe default; Generate is last
 * because it creates rather than edits. Every DM authoring verb the core exposes has a home here.
 */
export const TOOL_GROUPS: readonly ToolGroupDef[] = Object.freeze([
	{
		id: 'select',
		label: 'mapTool.group.select',
		icon: 'tool-select',
		category: 'base',
		tools: [
			{
				id: 'select',
				label: 'mapTool.select.label',
				icon: 'tool-select',
				shortcut: 'v',
				kind: 'radio',
				hint: 'mapTool.select.hint',
			},
			{
				id: 'marquee',
				label: 'mapTool.marquee.label',
				icon: 'tool-select',
				shortcut: 'm',
				kind: 'radio',
				hint: 'mapTool.marquee.hint',
			},
			{
				id: 'pan',
				label: 'mapTool.pan.label',
				icon: 'Hand',
				shortcut: 'h',
				kind: 'radio',
				hint: 'mapTool.pan.hint',
			},
		],
	},
	{
		id: 'terrain',
		label: 'mapTool.group.terrain',
		icon: 'layer-terrain',
		category: 'terrain',
		tools: [
			{
				id: 'brush',
				label: 'mapTool.brush.label',
				icon: 'tool-brush',
				shortcut: 'b',
				kind: 'radio',
				hint: 'mapTool.brush.hint',
			},
			{
				id: 'fill',
				label: 'mapTool.fill.label',
				icon: 'tool-fill',
				shortcut: 'g',
				kind: 'radio',
				hint: 'mapTool.fill.hint',
			},
			{
				id: 'erase',
				label: 'mapTool.erase.label',
				icon: 'tool-eraser',
				shortcut: 'e',
				kind: 'radio',
				hint: 'mapTool.erase.hint',
			},
		],
	},
	{
		id: 'structure',
		label: 'mapTool.group.structure',
		icon: 'layer-walls',
		category: 'base',
		tools: [
			{
				id: 'room',
				label: 'mapTool.room.label',
				icon: 'tool-room',
				shortcut: 'r',
				kind: 'radio',
				hint: 'mapTool.room.hint',
			},
			{
				id: 'wall',
				label: 'mapTool.wall.label',
				icon: 'tool-wall',
				shortcut: 'p',
				kind: 'radio',
				hint: 'mapTool.wall.hint',
			},
			{
				id: 'door',
				label: 'mapTool.door.label',
				icon: 'tool-door',
				shortcut: 'd',
				kind: 'radio',
				hint: 'mapTool.door.hint',
			},
			{
				id: 'water',
				label: 'mapTool.water.label',
				icon: 'layer-water',
				shortcut: 'j',
				kind: 'radio',
				hint: 'mapTool.water.hint',
			},
		],
	},
	{
		id: 'objects',
		label: 'mapTool.group.objects',
		icon: 'layer-poi',
		category: 'base',
		tools: [
			{
				id: 'stamp',
				label: 'mapTool.stamp.label',
				icon: 'tool-stamp',
				shortcut: 's',
				kind: 'radio',
				hint: 'mapTool.stamp.hint',
			},
			{
				id: 'scatter',
				label: 'mapTool.scatter.label',
				icon: 'tool-scatter',
				shortcut: 'k',
				kind: 'radio',
				hint: 'mapTool.scatter.hint',
			},
		],
	},
	{
		id: 'light',
		label: 'mapTool.group.light',
		icon: 'tool-light',
		category: 'dm-annotations',
		tools: [
			{
				id: 'light',
				label: 'mapTool.light.label',
				icon: 'tool-light',
				shortcut: 'l',
				kind: 'radio',
				hint: 'mapTool.light.hint',
			},
		],
	},
	{
		id: 'fog',
		label: 'mapTool.group.fog',
		icon: 'layer-fog',
		category: 'fog',
		tools: [
			{
				id: 'fog',
				label: 'mapTool.fog.label',
				icon: 'layer-fog',
				shortcut: 'f',
				kind: 'radio',
				hint: 'mapTool.fog.hint',
			},
		],
	},
	{
		id: 'tokens',
		label: 'mapTool.group.tokens',
		icon: 'tool-token',
		category: 'player-overlay',
		tools: [
			{
				id: 'token',
				label: 'mapTool.token.label',
				icon: 'tool-token',
				shortcut: 't',
				kind: 'radio',
				hint: 'mapTool.token.hint',
			},
		],
	},
	{
		id: 'annotate',
		label: 'mapTool.group.annotate',
		icon: 'poi',
		category: 'poi',
		tools: [
			{
				id: 'poi',
				label: 'mapTool.poi.label',
				icon: 'poi',
				shortcut: 'n',
				kind: 'radio',
				hint: 'mapTool.poi.hint',
			},
			{
				id: 'route',
				label: 'mapTool.route.label',
				icon: 'tool-route',
				shortcut: 'o',
				kind: 'radio',
				hint: 'mapTool.route.hint',
			},
			{
				id: 'text',
				label: 'mapTool.text.label',
				icon: 'tool-text',
				shortcut: 'x',
				kind: 'radio',
				hint: 'mapTool.text.hint',
			},
			{
				id: 'measure',
				label: 'mapTool.measure.label',
				icon: 'tool-measure',
				shortcut: 'u',
				kind: 'radio',
				hint: 'mapTool.measure.hint',
			},
		],
	},
	{
		id: 'generate',
		label: 'mapTool.group.generate',
		icon: 'tool-generate',
		category: 'base',
		tools: [
			{
				id: 'generate',
				label: 'mapTool.generate.label',
				icon: 'tool-generate',
				shortcut: 'q',
				kind: 'radio',
				hint: 'mapTool.generate.hint',
			},
		],
	},
]);

/** Flat lookup for a tool by id. */
export const TOOLS_BY_ID: ReadonlyMap<ToolId, ToolDef> = new Map(
	TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => [tool.id, tool] as const)),
);

/** The group a tool belongs to (for scoping the active layer). */
export const GROUP_OF_TOOL: ReadonlyMap<ToolId, ToolGroupDef> = new Map(
	TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => [tool.id, group] as const)),
);

/** Resolve a single-key shortcut to a tool id, or undefined. Used by the keyboard layer. */
export const SHORTCUT_TO_TOOL: ReadonlyMap<string, ToolId> = new Map(
	TOOL_GROUPS.flatMap((group) =>
		group.tools
			.filter((tool) => tool.shortcut)
			.map((tool) => [tool.shortcut as string, tool.id] as const),
	),
);
