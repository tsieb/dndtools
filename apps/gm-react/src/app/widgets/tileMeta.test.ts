import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	createSystemWidgetPackages,
	dispatchCommand,
	getContentItemsForActor,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDefinition,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import {
	TILE_TYPE_METADATA,
	safeBoundEntityName,
	tileBindingState,
	tileMetadataForDefinition,
	tileMetadataForWidget,
} from './tileMeta';

/**
 * RC-CAN-2.2 — tile identity is derived, and the bound-entity name is actor-safe.
 */

const SYSTEM_DEFINITIONS: WidgetDefinition[] = Object.values(
	createSystemWidgetPackages().packages,
).flatMap((record) => record.package.widgets);

const COLORS_CSS = readFileSync(
	fileURLToPath(new URL('../../styles/tokens/colors.css', import.meta.url)),
	'utf8',
);

function declaredIn(theme: string): Set<string> {
	const names = new Set<string>();
	for (const block of COLORS_CSS.matchAll(/\[data-theme='([^']+)'\]\s*\{([^}]*)\}/g)) {
		if (block[1] !== theme) continue;
		for (const decl of block[2]!.matchAll(/(--color-tile-[a-z]+)\s*:/g)) names.add(decl[1]!);
	}
	return names;
}

describe('tile metadata', () => {
	it('resolves every system widget to an accent every theme declares', () => {
		for (const theme of ['parchment', 'tavern', 'high-contrast']) {
			const declared = declaredIn(theme);
			for (const definition of SYSTEM_DEFINITIONS) {
				const { accentToken } = tileMetadataForDefinition(definition);
				expect(declared.has(accentToken), `${definition.type} → ${accentToken} in ${theme}`).toBe(
					true,
				);
			}
		}
	});

	it('keeps the definition’s own icon and description over the family defaults', () => {
		const meta = tileMetadataForDefinition({
			category: 'Maps',
			icon: 'globe',
			description: '  A  world\n map. ',
		});
		expect(meta).toMatchObject({
			accentToken: '--color-tile-map',
			icon: 'globe',
			silhouetteClass: 'tile-silhouette-map',
			description: 'A world map.',
		});
	});

	it('lets a per-definition override win, and ignores a blank icon override', () => {
		const definition = { category: 'Reference', icon: 'book', description: '' };
		expect(tileMetadataForDefinition(definition, { accentToken: '--color-tile-handout' })).toEqual({
			...TILE_TYPE_METADATA.reference,
			accentToken: '--color-tile-handout',
		});
		expect(tileMetadataForDefinition(definition, { icon: '  ' }).icon).toBe('book');
	});

	it('falls back to the reference identity for an unknown third-party category and icon', () => {
		expect(tileMetadataForDefinition({ category: 'Homebrew', icon: 'teapot' }).accentToken).toBe(
			'--color-tile-reference',
		);
	});

	it('resolves a board widget from its category caption exactly as from its definition', () => {
		for (const definition of SYSTEM_DEFINITIONS) {
			expect(
				tileMetadataForWidget({
					typeLabel: definition.category ?? definition.displayName,
					icon: definition.icon ?? 'widget',
					description: definition.description ?? '',
				}),
			).toEqual(tileMetadataForDefinition(definition));
		}
	});
});

describe('tile binding state', () => {
	const ref = { entityType: 'map', entityId: 'm1' };

	it.each([
		['available', ref, true, 'bound'],
		['degraded', ref, true, 'bound'],
		['available', null, true, 'unbound'],
		['unbound', null, true, 'unbound'],
		['missing', ref, true, 'missing'],
		['conflicted', ref, true, 'conflicted'],
		['hidden', ref, true, 'hidden'],
		['available', null, false, null],
	] as const)(
		'%s with ref=%j requires=%s → %s',
		(status, bindingRef, requiresBinding, expected) => {
			expect(tileBindingState({ status, bindingRef, requiresBinding })).toBe(expected);
		},
	);
});

describe('safe bound-entity name', () => {
	function campaign(): { state: CoreStateSlice; mapId: string; noteIds: Record<string, string> } {
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
			payload: { name: 'The vault below', visibility: 'dm-only' },
		});
		for (const [title, visibility] of [
			['Tavern rumours', 'player-visible'],
			['The traitor is Aldous', 'dm-only'],
		] as const) {
			run({
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title, body: '…', visibility },
			});
		}
		const mapId = (Object.values(state.maps.maps) as Array<{ id: string }>)[0]!.id;
		const noteIds = Object.fromEntries(
			getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id).map((item) => [
				item.title,
				item.id,
			]),
		);
		return { state, mapId, noteIds };
	}

	const { state, mapId, noteIds } = campaign();
	const map = { entityType: 'map', entityId: mapId };

	it('names a DM-only map for the DM and for nobody else', () => {
		expect(safeBoundEntityName(state, DM_ACTOR.id, { status: 'available', bindingRef: map })).toBe(
			'The vault below',
		);
		expect(
			safeBoundEntityName(state, PLAYER_ACTOR.id, { status: 'available', bindingRef: map }),
		).toBeNull();
	});

	it.each(['hidden', 'missing', 'conflicted', 'unbound', 'disabled'] as const)(
		'names nothing for a %s binding, even to the DM',
		(status) => {
			expect(safeBoundEntityName(state, DM_ACTOR.id, { status, bindingRef: map })).toBeNull();
		},
	);

	it('names a content item through the actor-filtered vault read', () => {
		const shared = { entityType: CONTENT_ITEM_ENTITY_TYPE, entityId: noteIds['Tavern rumours']! };
		const secret = {
			entityType: CONTENT_ITEM_ENTITY_TYPE,
			entityId: noteIds['The traitor is Aldous']!,
		};
		expect(
			safeBoundEntityName(state, PLAYER_ACTOR.id, { status: 'available', bindingRef: shared }),
		).toBe('Tavern rumours');
		expect(
			safeBoundEntityName(state, PLAYER_ACTOR.id, { status: 'available', bindingRef: secret }),
		).toBeNull();
	});

	it('leaves an entity type with no actor-filtered read unnamed rather than showing its id', () => {
		expect(
			safeBoundEntityName(state, DM_ACTOR.id, {
				status: 'available',
				bindingRef: { entityType: 'scene', entityId: 'scene-1' },
			}),
		).toBeNull();
	});
});
