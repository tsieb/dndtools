import { readFileSync } from 'node:fs';
import {
	createSystemWidgetPackages,
	dispatchCommand,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDefinition,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import type { BoardWidget } from '../board-helpers';

// RC-POL-1.2 — the shared fixtures of the two `WidgetFrame` test files: a real campaign built by real
// commands, the system definitions, and the tile tokens per theme.

/** The three shipped themes. `tavern` is the dark one. */
export const THEMES = ['parchment', 'tavern', 'high-contrast'] as const;
export type Theme = (typeof THEMES)[number];

/** `--color-tile-*` values per theme, merged across every `[data-theme='x']` block that sets them. */
export const TILE_TOKENS: ReadonlyMap<string, Readonly<Record<string, string>>> = (() => {
	// jsdom's `import.meta.url` is not a file: URL; the app suite runs from the repo root.
	const css = readFileSync(`${process.cwd()}/apps/gm-react/src/styles/tokens/colors.css`, 'utf8');
	const byTheme = new Map<string, Record<string, string>>();
	for (const block of css.matchAll(/\[data-theme='([^']+)'\]\s*\{([^}]*)\}/g)) {
		const tokens = byTheme.get(block[1]!) ?? {};
		for (const decl of block[2]!.matchAll(/(--color-tile-[a-z]+)\s*:\s*([^;]+);/g)) {
			tokens[decl[1]!] = decl[2]!.trim();
		}
		byTheme.set(block[1]!, tokens);
	}
	return byTheme;
})();

export const SYSTEM_DEFINITIONS: WidgetDefinition[] = Object.values(
	createSystemWidgetPackages().packages,
).flatMap((record) => record.package.widgets);
/** The ones that draw a header in view mode. RC-CAN-7.6's home parts default to bare: no header. */
export const FRAMED_DEFINITIONS = SYSTEM_DEFINITIONS.filter(
	(definition) =>
		definition.configFields?.find((field) => field.key === 'presentation')?.default !== 'bare',
);

export interface Campaign {
	state: CoreStateSlice;
	sharedMapId: string;
	hiddenMapId: string;
	sharedCharacterId: string;
	hiddenCharacterId: string;
}

/** A player-visible map and sidekick, plus a map and a character only the DM may see. */
export function campaign(): Campaign {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') {
			throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
		}
		state = result.nextState;
	};
	run({
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Old mill', visibility: 'player-visible' },
	});
	run({
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'The vault below', visibility: 'dm-only' },
	});
	for (const [name, visibility] of [
		['Brannor', 'player-visible'],
		['Masked stranger', 'dm-only'],
	] as const) {
		run({
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'sidekick', name, visibility, combat: { hp: 18, maxHp: 24, ac: 16 } },
		});
	}
	const mapId = (name: string) =>
		(Object.values(state.maps.maps) as Array<{ id: string; name: string }>).find(
			(map) => map.name === name,
		)!.id;
	const characterId = (name: string) =>
		(Object.values(state.characters.characters) as Array<{ id: string; name: string }>).find(
			(character) => character.name === name,
		)!.id;
	return {
		state,
		sharedMapId: mapId('Old mill'),
		hiddenMapId: mapId('The vault below'),
		sharedCharacterId: characterId('Brannor'),
		hiddenCharacterId: characterId('Masked stranger'),
	};
}

export const CAMPAIGN = campaign();

/**
 * A placed instance of one definition, shaped the way `boardWidgetsOf` shapes it: the caption is
 * the definition's CATEGORY (falling back to its display name), which is what the tile identity is
 * resolved from on the real board.
 */
export function boardWidget(
	definition: WidgetDefinition,
	bindingRef: BoardWidget['bindingRef'] = null,
): BoardWidget {
	return {
		id: `widget-${definition.type}`,
		type: definition.type,
		title: definition.displayName,
		typeLabel: definition.category ?? definition.displayName,
		icon: definition.icon ?? 'widget',
		tier: 'system',
		description: definition.description ?? '',
		visibility: 'dm-only',
		x: 0,
		y: 0,
		w: 4,
		h: 3,
		status: 'available',
		statusNote: null,
		configuration: {},
		configFields: definition.configFields ?? [],
		requiresBinding: (definition.requiredBindings ?? []).length > 0,
		commands: (definition.commands ?? []).map((command) => command.type),
		bindingRef,
	};
}

/** The binding a DM would give a required-binding widget in this campaign: the shared entity. */
export function sharedBindingFor(definition: WidgetDefinition): BoardWidget['bindingRef'] {
	const entityType = definition.requiredBindings?.[0]?.entityTypes[0];
	if (entityType === 'map') return { entityType, entityId: CAMPAIGN.sharedMapId };
	if (entityType === 'character') return { entityType, entityId: CAMPAIGN.sharedCharacterId };
	return null;
}

export const noop = () => {};
