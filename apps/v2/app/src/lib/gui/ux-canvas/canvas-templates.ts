/**
 * Canvas templates model (UX-CANVAS-010). Pure, no DOM.
 *
 * Two template sources are unified for the template library:
 *   • USER templates — scenes the DM saved via `scene.save-template` (the Processing Core already gates
 *     templates to the DM in `listScenesForActor`, so a player never sees one). Recalled with
 *     `scene.instantiate-template`, which clones widget instances WITHOUT cloning the bound entities.
 *   • BUILT-IN starter templates — read-only client recipes (name + widget layout) that instantiate by
 *     creating a scene and adding the preset widgets through the same `scene.create`/`scene.add-widget`
 *     commands. They carry a "Built-in" badge and offer no delete (UX-CANVAS-010 §System templates).
 *
 * This module classifies/orders the entries, builds the command payloads, and produces the
 * missing-binding banner copy; the route orchestrates the dispatches and the post-instantiate navigation.
 */

import type { SceneVisibility } from '@dndtools/v2-core';

/** A preset widget placed by a built-in template recipe. */
export interface TemplateWidgetSpec {
	type: string;
	x: number;
	y: number;
	w: number;
	h: number;
	visibility: SceneVisibility;
}

export interface BuiltInTemplate {
	id: string;
	name: string;
	description: string;
	widgets: readonly TemplateWidgetSpec[];
}

/**
 * The pre-installed starter templates (UX-CANVAS-010 §System templates: "Combat Session", "Prep Board",
 * "Player Handout Canvas"). Kept small and binding-free so instantiation always succeeds locally.
 */
export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
	{
		id: 'builtin.combat-session',
		name: 'Combat Session',
		description: 'Initiative tracker, a battle map, and a dice roller for running a fight.',
		widgets: [
			{ type: 'initiative-tracker', x: 40, y: 40, w: 280, h: 200, visibility: 'dm-only' },
			{ type: 'map', x: 360, y: 40, w: 360, h: 280, visibility: 'player-visible' },
			{ type: 'dice', x: 40, y: 280, w: 200, h: 160, visibility: 'player-visible' },
		],
	},
	{
		id: 'builtin.prep-board',
		name: 'Prep Board',
		description: 'A notes-and-reference board for prepping the next session.',
		widgets: [
			{ type: 'note', x: 40, y: 40, w: 240, h: 160, visibility: 'dm-only' },
			{ type: 'note', x: 320, y: 40, w: 240, h: 160, visibility: 'dm-only' },
			{ type: 'quick-reference', x: 40, y: 240, w: 280, h: 220, visibility: 'dm-only' },
		],
	},
	{
		id: 'builtin.player-handout',
		name: 'Player Handout Canvas',
		description: 'A player-facing canvas with a handout and a shared note.',
		widgets: [
			{ type: 'handout', x: 40, y: 40, w: 240, h: 140, visibility: 'player-visible' },
			{ type: 'note', x: 320, y: 40, w: 240, h: 160, visibility: 'player-visible' },
		],
	},
];

/** A user-saved template scene as the library understands it (mapped from `SceneListEntry`). */
export interface UserTemplateInput {
	id: string;
	name: string;
	updatedAt: string;
}

export interface TemplateEntry {
	/** Built-in recipe id or user template scene id. */
	id: string;
	name: string;
	description: string | null;
	kind: 'built-in' | 'user';
	/** Widget count for built-ins; null for user templates (unknown without loading the scene). */
	widgetCount: number | null;
	/** ISO date for user templates; null for built-ins. */
	createdAt: string | null;
	/** Built-ins are read-only (no delete) — UX-CANVAS-010 §System templates. */
	deletable: boolean;
}

/**
 * Build the combined, ordered template library: built-ins first (read-only starters), then the DM's own
 * saved templates sorted by name. The user templates are already DM-only filtered by the Core query.
 */
export function buildTemplateLibrary(userTemplates: readonly UserTemplateInput[]): TemplateEntry[] {
	const builtIns: TemplateEntry[] = BUILT_IN_TEMPLATES.map((t) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		kind: 'built-in',
		widgetCount: t.widgets.length,
		createdAt: null,
		deletable: false,
	}));
	const users: TemplateEntry[] = [...userTemplates]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((t) => ({
			id: t.id,
			name: t.name,
			description: null,
			kind: 'user',
			widgetCount: null,
			createdAt: t.updatedAt,
			deletable: false,
		}));
	return [...builtIns, ...users];
}

/** Look up a built-in recipe by id. */
export function builtInById(id: string): BuiltInTemplate | undefined {
	return BUILT_IN_TEMPLATES.find((t) => t.id === id);
}

/** The default new-scene name when instantiating a template. */
export function instantiatedSceneName(templateName: string): string {
	return `${templateName} (new)`;
}

/** A suggested template name from the source scene name (UX-CANVAS-010 §Save template). */
export function templateNameSuggestion(sourceName: string): string {
	return `${sourceName} template`;
}

/** Alt text for a template thumbnail (UX-CANVAS-010 accessibility). */
export function templateThumbAlt(entry: TemplateEntry): string {
	const count = entry.widgetCount === null ? 'saved' : `${entry.widgetCount}-widget`;
	return `${entry.name} — ${count} ${entry.kind === 'built-in' ? 'built-in ' : ''}template`;
}

/**
 * Missing-binding warning banner copy after instantiation (UX-CANVAS-010 AC2). Returns null when all
 * bindings resolved, else a count message for the `role="alert"` banner.
 */
export function missingBindingBanner(missingCount: number): string | null {
	if (missingCount <= 0) return null;
	return `${missingCount} binding${missingCount === 1 ? '' : 's'} could not be resolved in this canvas.`;
}
