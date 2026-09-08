import { useMemo } from 'react';
import {
	hasDmAuthority,
	templateCells,
	templateCellCenter,
	templateCoversPoint,
	templatesOnMap,
	type CombatTemplate,
	type TemplateCell,
	type TemplateGrid,
} from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useCombatTokens, type EditorCombat } from './useCombatTokens';

/**
 * RC-MAP-2.2 — the AREAS OF EFFECT standing on the map being edited, and who they catch.
 *
 * Two reads, joined by geometry:
 *   - `templatesOnMap` for the shapes the running fight has placed here. A template is DM-authored
 *     tactical scaffolding, not map content, so this hook returns nothing at all unless the viewer
 *     has DM authority — fail closed, exactly like a layer a player may not read.
 *   - {@link useCombatTokens} for the combatants, which the CORE has already filtered for this actor
 *     (`getMapViewForActor(..., { combat })`). A combatant the core withheld is absent from that
 *     list, so it can never appear in an "affected" readout; nothing here re-decides visibility.
 *
 * Whether a token is caught is `templateCoversPoint` — the core's own geometry, run over positions
 * the core already released. The interface never invents the answer; it asks the same function the
 * command layer would.
 *
 * Coverage is DERIVED, never stored (`combat.ts`'s note on `templateCells`): re-gridding a map
 * changes which cells a template covers on the next render rather than leaving a stale cell list.
 */

/** One placed template, with the cells it covers and the combatants standing in them. */
export interface TemplateTargets {
	template: CombatTemplate;
	/** Cells the template covers, by the DMG half-coverage rule. */
	cells: readonly TemplateCell[];
	/** Combatants this actor can see who are standing inside the shape, in turn order. */
	affected: readonly { combatantId: string; name: string }[];
}

export interface CombatTemplatesModel {
	/** The map's grid as the coverage math needs it, or null when the map has no usable grid. */
	grid: TemplateGrid | null;
	/** Every template on this map, in placement order. Empty for a viewer without DM authority. */
	templates: readonly TemplateTargets[];
	/** The most recently placed one — what the status bar reports on. */
	latest: TemplateTargets | null;
	/** The running combat's tokens, so a caller does not run the token read a second time. */
	combat: EditorCombat;
}

const EMPTY_TEMPLATES: readonly TemplateTargets[] = Object.freeze([]);

/** Normalized 0..1 position of a covered cell's centre, for drawing it. Pure. */
export function cellCenterNormalized(
	grid: TemplateGrid,
	cell: TemplateCell,
): { x: number; y: number } {
	const extent = grid.size * grid.unitsPerCell;
	const center = templateCellCenter(grid, cell);
	return { x: center.x / extent, y: center.y / extent };
}

export function useCombatTemplates(mapId: string, actorId: string): CombatTemplatesModel {
	const runtime = useRuntime();
	const { maps, permissions, session } = runtime.state;
	const combat = useCombatTokens(mapId, actorId);

	const grid = useMemo((): TemplateGrid | null => {
		const overlay = maps.maps[mapId]?.overlay;
		if (!overlay || overlay.gridSize <= 0 || overlay.unitsPerCell <= 0) return null;
		return { kind: 'square', size: overlay.gridSize, unitsPerCell: overlay.unitsPerCell };
	}, [maps, mapId]);

	const isDm = hasDmAuthority(permissions.actors[actorId]?.role);

	const templates = useMemo((): readonly TemplateTargets[] => {
		if (!isDm || !grid || !combat.running) return EMPTY_TEMPLATES;
		return templatesOnMap(session.combat, mapId).map((template): TemplateTargets => {
			const affected = combat.tokens
				.filter((token) => templateCoversPoint(template, grid, token.position))
				.map((token) => ({ combatantId: token.combatantId, name: token.name }));
			return { template, cells: templateCells(template, grid), affected };
		});
	}, [isDm, grid, combat.running, combat.tokens, session.combat, mapId]);

	return useMemo(
		() => ({
			grid,
			templates,
			latest: templates.length > 0 ? templates[templates.length - 1]! : null,
			combat,
		}),
		[grid, templates, combat],
	);
}
