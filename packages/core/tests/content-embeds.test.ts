import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	buildContentWidgetDataEnvironment,
	contentItemById,
	dispatchCommand,
	entityBindingKey,
	getSceneForActor,
	resolveContentEmbedForActor,
	resolveContentEmbedsForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';

/**
 * CONTENT-010 — EMBEDS BY REFERENCE (the security crux). An authorized editor embeds object cards, note
 * sections, and entity render blocks in note content, and adds entity-backed widgets to Scenes, WITHOUT
 * cloning the target entity's data into the embedding source. Proven with HARD assertions as primary
 * evidence:
 *
 *   - NO CLONE: the stored host content carries only a reference (target id + projection) — never the
 *     target's title/body/fields. Inspected directly on the durable host item AND the op-log.
 *   - LIVE: the resolved embed reflects the target's CURRENT data after the target changes (AC1).
 *   - NO LEAK: an unauthorized viewer of an embed whose target is dm-only gets the generic `unavailable`
 *     placeholder with ZERO target data/title leak (AC2), driven by the viewer's OWN permission to the
 *     target, NOT the host note's visibility.
 *   - SCENE WIDGET: an entity-backed Scene widget reuses the widget binding model — a player bound to a
 *     dm-only content item gets the `hidden` placeholder (a scene widget is an embed in scene context).
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

const SECRET_BODY = 'The phylactery lies beneath Highmoor.';
const SECRET_FIELD = 'lich-true-name-azalin';

/** Create an item, returning the new state + its id. Sequential ids make the order deterministic. */
function createItem(
	state: CoreStateSlice,
	input: {
		title: string;
		body?: string;
		fields?: Record<string, unknown>;
		visibility: 'dm-only' | 'player-visible' | 'shared';
	},
): { state: CoreStateSlice; itemId: string } {
	const env = makeEnvironment({ ids: sequential() });
	const before = new Set(Object.keys(state.content.items));
	const result = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: input.title,
				body: input.body ?? '',
				fields: input.fields ?? {},
				visibility: input.visibility,
			}),
		),
	);
	const itemId = Object.keys(result.nextState.content.items).find((id) => !before.has(id))!;
	return { state: result.nextState, itemId };
}

let counter = 0;
function sequential() {
	return () => {
		counter += 1;
		return `gen-${counter.toString().padStart(4, '0')}`;
	};
}

describe('CONTENT-010 embeds by reference — no clone', () => {
	it('the stored host content carries ONLY a reference, never the target data', () => {
		// A dm-only target with secret body + field; a player-visible host that embeds it.
		const seed = createItem(base(), {
			title: 'Lich Secrets',
			body: SECRET_BODY,
			fields: { trueName: SECRET_FIELD },
			visibility: 'dm-only',
		});
		const host = createItem(seed.state, {
			title: 'Adventure Hook',
			body: 'A rumor of undeath.',
			visibility: 'player-visible',
		});
		const env = makeEnvironment({ ids: sequential() });
		const result = accepted(
			dispatchCommand(
				host.state,
				env,
				cmd('content.add-embed', {
					hostItemId: host.itemId,
					targetItemId: seed.itemId,
					kind: 'object-card',
				}),
			),
		);

		const stored = contentItemById(result.nextState.content, host.itemId)!;
		expect(stored.embeds).toHaveLength(1);
		const embed = stored.embeds[0]!;
		// The reference is exactly { id, targetItemId, kind } — NO title/body/fields copied.
		expect(embed.targetItemId).toBe(seed.itemId);
		expect(embed.kind).toBe('object-card');
		// HARD assertion: serialize the entire host item and confirm the target's secret content is absent.
		const hostSerialized = JSON.stringify(stored);
		expect(hostSerialized).not.toContain(SECRET_BODY);
		expect(hostSerialized).not.toContain(SECRET_FIELD);
		expect(hostSerialized).not.toContain('Lich Secrets');

		// HARD assertion: the durable OP-LOG entry for the embed also carries only the reference.
		const op = result.nextState.sync.operations.find((o) => o.opType === 'content.add-embed')!;
		const opSerialized = JSON.stringify(op);
		expect(opSerialized).not.toContain(SECRET_BODY);
		expect(opSerialized).not.toContain(SECRET_FIELD);
	});

	it('AC1: the resolved embed reflects the target CURRENT data after the target changes', () => {
		const seed = createItem(base(), {
			title: 'Town of Highmoor',
			fields: { population: 'small' },
			visibility: 'player-visible',
		});
		const host = createItem(seed.state, { title: 'Region Notes', visibility: 'player-visible' });
		const env = makeEnvironment({ ids: sequential() });
		let next = accepted(
			dispatchCommand(
				host.state,
				env,
				cmd('content.add-embed', {
					hostItemId: host.itemId,
					targetItemId: seed.itemId,
					kind: 'object-card',
				}),
			),
		).nextState;

		const resolvedBefore = resolveContentEmbedsForActor(next.content, next.permissions, PLAYER_ACTOR.id, host.itemId);
		expect(resolvedBefore).toHaveLength(1);
		expect(resolvedBefore[0]!.state).toBe('available');
		if (resolvedBefore[0]!.state === 'available' && resolvedBefore[0]!.kind === 'object-card') {
			expect(resolvedBefore[0]!.fields).toEqual({ population: 'small' });
		}

		// Change the TARGET; the host stored only a reference, so the embed reflects the new value.
		next = accepted(
			dispatchCommand(
				next,
				makeEnvironment({ ids: sequential() }),
				cmd('content.update-item', { itemId: seed.itemId, fields: { population: 'booming' } }),
			),
		).nextState;
		const resolvedAfter = resolveContentEmbedsForActor(next.content, next.permissions, PLAYER_ACTOR.id, host.itemId);
		expect(resolvedAfter).toHaveLength(1);
		expect(resolvedAfter[0]!.state).toBe('available');
		if (resolvedAfter[0]!.state === 'available' && resolvedAfter[0]!.kind === 'object-card') {
			expect(resolvedAfter[0]!.fields).toEqual({ population: 'booming' });
		}
	});
});

describe('CONTENT-010 embeds by reference — no leak (viewer permission to TARGET)', () => {
	it('AC2: a player viewing a player-visible note that embeds a dm-only target gets unavailable, no leak', () => {
		const seed = createItem(base(), {
			title: 'Lich Secrets',
			body: SECRET_BODY,
			fields: { trueName: SECRET_FIELD },
			visibility: 'dm-only',
		});
		const host = createItem(seed.state, { title: 'Adventure Hook', visibility: 'player-visible' });
		const env = makeEnvironment({ ids: sequential() });
		const next = accepted(
			dispatchCommand(
				host.state,
				env,
				cmd('content.add-embed', {
					hostItemId: host.itemId,
					targetItemId: seed.itemId,
					kind: 'render-block',
				}),
			),
		).nextState;

		// The DM resolves the live target (the host's visibility is irrelevant to the embed resolution).
		const dmResolved = resolveContentEmbedsForActor(next.content, next.permissions, DM_ACTOR.id, host.itemId);
		expect(dmResolved[0]!.state).toBe('available');

		// The PLAYER can see the host (player-visible) but NOT the dm-only target ⇒ generic unavailable.
		const playerResolved = resolveContentEmbedsForActor(next.content, next.permissions, PLAYER_ACTOR.id, host.itemId);
		expect(playerResolved).toHaveLength(1);
		const placeholder = playerResolved[0]!;
		expect(placeholder.state).toBe('unavailable');
		// HARD assertion: ZERO target leak — no target id, title, body, or field in the placeholder.
		const serialized = JSON.stringify(placeholder);
		expect(serialized).not.toContain(seed.itemId);
		expect(serialized).not.toContain('Lich Secrets');
		expect(serialized).not.toContain(SECRET_BODY);
		expect(serialized).not.toContain(SECRET_FIELD);
		// The reason is coarsened for a non-DM so existence is not probeable.
		if (placeholder.state === 'unavailable') expect(placeholder.reason).toBe('target-hidden');
	});

	it('AC2: a dm-only SECTION of the target resolves unavailable for a player, content kept for DM', () => {
		const seed = createItem(base(), { title: 'Mixed Lore', visibility: 'player-visible' });
		const env = makeEnvironment({ ids: sequential() });
		// Make ONE section of the target dm-only; the entity stays player-visible.
		let next = accepted(
			dispatchCommand(
				seed.state,
				env,
				cmd('content.set-section-visibility', {
					itemId: seed.itemId,
					sectionId: 'gm-only-section',
					rule: { level: 'dm-only' },
				}),
			),
		).nextState;
		const host = createItem(next, { title: 'Player Handout', visibility: 'player-visible' });
		next = host.state;
		next = accepted(
			dispatchCommand(
				next,
				makeEnvironment({ ids: sequential() }),
				cmd('content.add-embed', {
					hostItemId: host.itemId,
					targetItemId: seed.itemId,
					kind: 'note-section',
					sectionId: 'gm-only-section',
				}),
			),
		).nextState;

		const dmResolved = resolveContentEmbedForActor(next.content, next.permissions, DM_ACTOR.id, contentItemById(next.content, host.itemId)!.embeds[0]!);
		expect(dmResolved.state).toBe('available');
		const playerResolved = resolveContentEmbedForActor(next.content, next.permissions, PLAYER_ACTOR.id, contentItemById(next.content, host.itemId)!.embeds[0]!);
		expect(playerResolved.state).toBe('unavailable');
	});

	it('a broken reference (target deleted) resolves unavailable, never throws', () => {
		const seed = createItem(base(), { title: 'Soon Gone', visibility: 'player-visible' });
		const host = createItem(seed.state, { title: 'Host', visibility: 'player-visible' });
		let next = accepted(
			dispatchCommand(
				host.state,
				makeEnvironment({ ids: sequential() }),
				cmd('content.add-embed', {
					hostItemId: host.itemId,
					targetItemId: seed.itemId,
					kind: 'object-card',
				}),
			),
		).nextState;
		// Soft-delete the target; the embed reference now dangles.
		next = accepted(
			dispatchCommand(
				next,
				makeEnvironment({ ids: sequential() }),
				cmd('content.remove-item', { itemId: seed.itemId }),
			),
		).nextState;
		const resolved = resolveContentEmbedsForActor(next.content, next.permissions, DM_ACTOR.id, host.itemId);
		expect(resolved[0]!.state).toBe('unavailable');
		if (resolved[0]!.state === 'unavailable') expect(resolved[0]!.reason).toBe('target-missing');
	});
});

describe('CONTENT-010 embeds — authoring authority + validation (fail closed)', () => {
	it('embedding a non-existent target is rejected (no dangling reference persisted)', () => {
		const host = createItem(base(), { title: 'Host', visibility: 'player-visible' });
		const result = rejected(
			dispatchCommand(
				host.state,
				makeEnvironment({ ids: sequential() }),
				cmd('content.add-embed', {
					hostItemId: host.itemId,
					targetItemId: 'does-not-exist',
					kind: 'object-card',
				}),
			),
		);
		expect(result.rejection.code).toBe('content-item-not-found');
	});

	it('a note-section embed requires a sectionId', () => {
		const seed = createItem(base(), { title: 'Target', visibility: 'player-visible' });
		const host = createItem(seed.state, { title: 'Host', visibility: 'player-visible' });
		const result = rejected(
			dispatchCommand(
				host.state,
				makeEnvironment({ ids: sequential() }),
				cmd('content.add-embed', {
					hostItemId: host.itemId,
					targetItemId: seed.itemId,
					kind: 'note-section',
				}),
			),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('an observer cannot add an embed (fail closed)', () => {
		const seed = createItem(base(), { title: 'Target', visibility: 'player-visible' });
		const host = createItem(seed.state, { title: 'Host', visibility: 'player-visible' });
		const result = rejected(
			dispatchCommand(
				host.state,
				makeEnvironment({ ids: sequential() }),
				cmd(
					'content.add-embed',
					{ hostItemId: host.itemId, targetItemId: seed.itemId, kind: 'object-card' },
					OBSERVER_ACTOR.id,
				),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('removing a non-existent embed is rejected; removing an embed never deletes the target', () => {
		const seed = createItem(base(), { title: 'Target', visibility: 'player-visible' });
		const host = createItem(seed.state, { title: 'Host', visibility: 'player-visible' });
		let next = accepted(
			dispatchCommand(
				host.state,
				makeEnvironment({ ids: sequential() }),
				cmd('content.add-embed', {
					hostItemId: host.itemId,
					targetItemId: seed.itemId,
					kind: 'object-card',
				}),
			),
		).nextState;
		const embedId = contentItemById(next.content, host.itemId)!.embeds[0]!.id;

		const missing = rejected(
			dispatchCommand(
				next,
				makeEnvironment({ ids: sequential() }),
				cmd('content.remove-embed', { hostItemId: host.itemId, embedId: 'no-such-embed' }),
			),
		);
		expect(missing.rejection.code).toBe('content-embed-not-found');

		next = accepted(
			dispatchCommand(
				next,
				makeEnvironment({ ids: sequential() }),
				cmd('content.remove-embed', { hostItemId: host.itemId, embedId }),
			),
		).nextState;
		expect(contentItemById(next.content, host.itemId)!.embeds).toHaveLength(0);
		// The target still exists — removing an embed never deletes the target (Contract 4 / MAP-008).
		expect(contentItemById(next.content, seed.itemId)).toBeDefined();
	});
});

describe('CONTENT-010 entity-backed Scene widgets (a scene widget is an embed in scene context)', () => {
	it('a widget bound to a dm-only content item resolves hidden for a player, available for the DM', () => {
		const seed = createItem(base(), {
			title: 'Secret NPC',
			fields: { name: 'Azalin', plot: SECRET_FIELD },
			visibility: 'dm-only',
		});
		// Build the content-item widget data environment and create a scene with a widget bound to it.
		const env = makeEnvironment({ ids: sequential() });
		const scene = accepted(
			dispatchCommand(seed.state, env, cmd('scene.create', { name: 'Session Board', visibility: 'player-visible' })),
		);
		const sceneId = Object.keys(scene.nextState.scenes.scenes)[0]!;
		const withWidget = accepted(
			dispatchCommand(
				scene.nextState,
				env,
				cmd('scene.add-widget', {
					sceneId,
					widget: {
						type: 'note',
						version: '1.0.0',
						layout: { x: 0, y: 0, w: 100, h: 100 },
						binding: {
							source: { entityType: CONTENT_ITEM_ENTITY_TYPE, entityId: seed.itemId },
							mode: 'read',
							requiredCapability: 'viewer',
						},
					},
				}),
			),
		).nextState;

		const dataEnvironment = buildContentWidgetDataEnvironment(withWidget.content);
		// The content item appears in the environment keyed by its entity binding key.
		expect(dataEnvironment.entities).toHaveProperty(
			entityBindingKey(CONTENT_ITEM_ENTITY_TYPE, seed.itemId),
		);

		// DM sees the widget available; the player sees the binding resolve to `hidden` (no value leak).
		const dmScene = getSceneForActor(withWidget.scenes, withWidget.permissions, DM_ACTOR.id, sceneId, {
			dataEnvironment,
		});
		const playerScene = getSceneForActor(withWidget.scenes, withWidget.permissions, PLAYER_ACTOR.id, sceneId, {
			dataEnvironment,
		});
		if ('widgets' in dmScene) {
			expect(dmScene.widgets.some((x) => x.kind === 'available')).toBe(true);
		}
		if ('widgets' in playerScene) {
			const hidden = playerScene.widgets.find((x) => x.kind === 'hidden');
			expect(hidden).toBeDefined();
			// HARD assertion: the player widget payload leaks no secret value.
			expect(JSON.stringify(playerScene.widgets)).not.toContain(SECRET_FIELD);
		}
	});
});
