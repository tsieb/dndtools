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
	label: string;
	icon: string;
	/** Single-key shortcut (lowercase). Shown in the tooltip and the command palette. */
	shortcut?: string;
	/** One line explaining what the tool does; shown in the tool-options bar hint and the palette. */
	hint: string;
	kind: ToolKind;
}

export interface ToolGroupDef {
	id: string;
	label: string;
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
		label: 'Select',
		icon: 'tool-select',
		category: 'base',
		tools: [
			{
				id: 'select',
				label: 'Select & move',
				icon: 'tool-select',
				shortcut: 'v',
				kind: 'radio',
				hint: 'Click to select; drag to move. With one object selected, arrow keys nudge it.',
			},
			{
				id: 'marquee',
				label: 'Marquee',
				icon: 'tool-select',
				shortcut: 'm',
				kind: 'radio',
				hint: 'Drag a box to select the pins and tokens inside it. Shift adds to the selection.',
			},
			{
				id: 'pan',
				label: 'Pan',
				icon: 'Hand',
				shortcut: 'h',
				kind: 'radio',
				hint: 'Drag to pan. Hold Space with any tool to pan temporarily.',
			},
		],
	},
	{
		id: 'terrain',
		label: 'Terrain',
		icon: 'layer-terrain',
		category: 'terrain',
		tools: [
			{
				id: 'brush',
				label: 'Terrain brush',
				icon: 'tool-brush',
				shortcut: 'b',
				kind: 'radio',
				hint: 'Paint terrain. [ and ] change the brush size.',
			},
			{
				id: 'fill',
				label: 'Fill area',
				icon: 'tool-fill',
				shortcut: 'g',
				kind: 'radio',
				hint: 'Click a grid cell to fill it with the active terrain.',
			},
			{
				id: 'erase',
				label: 'Erase',
				icon: 'tool-eraser',
				shortcut: 'e',
				kind: 'radio',
				hint: 'Erase painted content on the active layer.',
			},
		],
	},
	{
		id: 'structure',
		label: 'Structure',
		icon: 'layer-walls',
		category: 'base',
		tools: [
			{
				id: 'room',
				label: 'Room',
				icon: 'tool-room',
				shortcut: 'r',
				kind: 'radio',
				hint: 'Drag a rectangular room. Shift constrains to a square.',
			},
			{
				id: 'wall',
				label: 'Wall',
				icon: 'tool-wall',
				shortcut: 'p',
				kind: 'radio',
				hint: 'Click to lay wall segments. Enter finishes, Esc cancels.',
			},
			{
				id: 'door',
				label: 'Door',
				icon: 'tool-door',
				shortcut: 'd',
				kind: 'radio',
				hint: 'Place a door on a wall. Pick the door kind in the options bar.',
			},
			{
				id: 'water',
				label: 'Water',
				icon: 'layer-water',
				shortcut: 'j',
				kind: 'radio',
				hint: 'Draw a river (click a path) or a lake (close the loop).',
			},
		],
	},
	{
		id: 'objects',
		label: 'Objects',
		icon: 'layer-poi',
		category: 'base',
		tools: [
			{
				id: 'stamp',
				label: 'Stamp',
				icon: 'tool-stamp',
				shortcut: 's',
				kind: 'radio',
				hint: 'Place an object. It stays armed for repeat placement; Esc disarms.',
			},
			{
				id: 'scatter',
				label: 'Scatter',
				icon: 'tool-scatter',
				shortcut: 'k',
				kind: 'radio',
				hint: 'Sweep to scatter many objects with natural spacing.',
			},
		],
	},
	{
		id: 'light',
		label: 'Lighting',
		icon: 'tool-light',
		category: 'dm-annotations',
		tools: [
			{
				id: 'light',
				label: 'Light',
				icon: 'tool-light',
				shortcut: 'l',
				kind: 'radio',
				hint: 'Place a light source. Radius and color are in the options bar.',
			},
		],
	},
	{
		id: 'fog',
		label: 'Fog of war',
		icon: 'layer-fog',
		category: 'fog',
		tools: [
			{
				id: 'fog',
				label: 'Fog',
				icon: 'layer-fog',
				shortcut: 'f',
				kind: 'radio',
				hint: 'Reveal or conceal areas. Rectangle, polygon, or brush in the options bar.',
			},
		],
	},
	{
		id: 'tokens',
		label: 'Tokens',
		icon: 'tool-token',
		category: 'player-overlay',
		tools: [
			{
				id: 'token',
				label: 'Token',
				icon: 'tool-token',
				shortcut: 't',
				kind: 'radio',
				hint: 'Place a combat token. Link it to an actor in the inspector.',
			},
		],
	},
	{
		id: 'annotate',
		label: 'Notes',
		icon: 'poi',
		category: 'poi',
		tools: [
			{
				id: 'poi',
				label: 'Point of interest',
				icon: 'poi',
				shortcut: 'n',
				kind: 'radio',
				hint: 'Drop a labelled pin. Link it to a note or an entity in the inspector.',
			},
			{
				id: 'route',
				label: 'Route',
				icon: 'tool-route',
				shortcut: 'o',
				kind: 'radio',
				hint: 'Click waypoints to draw a travel route. Enter finishes.',
			},
			{
				id: 'text',
				label: 'Label',
				icon: 'tool-text',
				shortcut: 'x',
				kind: 'radio',
				hint: 'Place a map label. Type, then click away to commit.',
			},
			{
				id: 'measure',
				label: 'Measure',
				icon: 'tool-measure',
				shortcut: 'u',
				kind: 'radio',
				hint: 'Drag to measure a distance using the map scale. Nothing is saved.',
			},
		],
	},
	{
		id: 'generate',
		label: 'Generate',
		icon: 'tool-generate',
		category: 'base',
		tools: [
			{
				id: 'generate',
				label: 'Generate',
				icon: 'tool-generate',
				shortcut: 'q',
				kind: 'radio',
				hint: 'Generate a dungeon, cave, city, or world into a preview you can accept or reroll.',
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
