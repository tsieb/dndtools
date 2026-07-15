import { describe, expect, it } from 'vitest';
import {
	createBaselineMcpToolRegistry,
	dispatchCommand,
	ensureSceneCardState,
	getActiveSceneCardForActor,
	getSceneCardForActor,
	getSceneCardPushHistoryForActor,
	getSceneCardQueueForActor,
	getSceneDisplayForActor,
	invokeMcpTool,
	listSceneCardsForActor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(
			`expected accepted, got rejected: ${result.rejection.code} — ${result.rejection.message}`,
		);
	}
	return result;
}

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function createCard(
	state: CoreStateSlice,
	env: CoreEnvironment,
	payload: Record<string, unknown>,
): { state: CoreStateSlice; cardId: string } {
	const result = accept(
		dispatch(state, env, { type: 'scene-card.create', actorId: DM_ACTOR.id, payload }),
	);
	const created = result.events.find((e) => e.kind === 'scene-card.created');
	if (!created || created.kind !== 'scene-card.created') throw new Error('no created event');
	return { state: result.nextState, cardId: created.cardId };
}

describe('S11.2.1 — scene card authoring is DM-only + fail-closed visibility', () => {
	it('the DM creates a card; a player and an observer cannot', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

		const { cardId } = createCard(base, env, { title: 'The Sunken Tavern', mood: 'social' });
		expect(cardId).toBeTruthy();

		const playerAttempt = dispatch(base, env, {
			type: 'scene-card.create',
			actorId: PLAYER_ACTOR.id,
			payload: { title: 'Nope' },
		});
		expect(playerAttempt.status).toBe('rejected');
		if (playerAttempt.status === 'rejected') {
			expect(playerAttempt.rejection.code).toBe('actor-not-authorized');
		}

		const observerAttempt = dispatch(base, env, {
			type: 'scene-card.create',
			actorId: OBSERVER_ACTOR.id,
			payload: { title: 'Nope' },
		});
		expect(observerAttempt.status).toBe('rejected');
		if (observerAttempt.status === 'rejected') {
			expect(observerAttempt.rejection.code).toBe('actor-not-authorized');
		}
	});

	it('a card defaults dm-only; players never see it until it is made player-visible', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, cardId } = createCard(base, env, { title: 'Hidden Crypt', mood: 'mystery' });

		// The DM sees it; the player does not.
		expect(
			getSceneCardForActor(state.session, state.permissions, DM_ACTOR.id, cardId),
		).not.toBeNull();
		expect(
			getSceneCardForActor(state.session, state.permissions, PLAYER_ACTOR.id, cardId),
		).toBeNull();
		expect(listSceneCardsForActor(state.session, state.permissions, DM_ACTOR.id)).toHaveLength(1);
		expect(listSceneCardsForActor(state.session, state.permissions, PLAYER_ACTOR.id)).toHaveLength(
			0,
		);

		// Widen to player-visible — now the player sees it.
		const widened = accept(
			dispatch(state, env, {
				type: 'scene-card.set-visibility',
				actorId: DM_ACTOR.id,
				payload: { cardId, visibility: 'player-visible' },
			}),
		).nextState;
		expect(
			listSceneCardsForActor(widened.session, widened.permissions, PLAYER_ACTOR.id),
		).toHaveLength(1);
	});

	it('update clears the hero image with an explicit null but leaves omitted fields untouched', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR);
		const { state, cardId } = createCard(base, env, {
			title: 'Vista',
			mood: 'exploration',
			heroImage: { kind: 'url', ref: 'https://example.test/vista.png' },
			flavorText: 'A sweeping view.',
		});
		expect(state.session.sceneCards.cards[cardId]?.heroImage).not.toBeNull();

		const updated = accept(
			dispatch(state, env, {
				type: 'scene-card.update',
				actorId: DM_ACTOR.id,
				payload: { cardId, heroImage: null },
			}),
		).nextState;
		expect(updated.session.sceneCards.cards[cardId]?.heroImage).toBeNull();
		// flavorText was omitted ⇒ unchanged.
		expect(updated.session.sceneCards.cards[cardId]?.flavorText).toBe('A sweeping view.');
	});

	it('rejects non-http and credential-bearing remote hero images', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR);
		for (const ref of [
			'javascript:alert(1)',
			'data:image/svg+xml,<svg/>',
			'./relative.png',
			'https://user:secret@example.test/hero.png',
		]) {
			const result = dispatch(base, env, {
				type: 'scene-card.create',
				actorId: DM_ACTOR.id,
				payload: { title: 'Unsafe image', heroImage: { kind: 'url', ref } },
			});
			expect(result.status).toBe('rejected');
		}
	});
});

describe('S11.2.4 — activating a player-visible card pushes to players + records history', () => {
	it('activate emits the push event, records history, and a player can review it', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, cardId } = createCard(base, env, {
			title: 'The Gates Open',
			mood: 'combat',
			visibility: 'player-visible',
		});

		const activated = accept(
			dispatch(state, env, {
				type: 'scene-card.activate',
				actorId: DM_ACTOR.id,
				payload: { cardId },
			}),
		);
		const pushEvent = activated.events.find((e) => e.kind === 'scene-card.pushed');
		expect(pushEvent).toBeDefined();
		const activatedEvent = activated.events.find((e) => e.kind === 'scene-card.activated');
		expect(
			activatedEvent && activatedEvent.kind === 'scene-card.activated' && activatedEvent.pushed,
		).toBe(true);

		const next = activated.nextState;
		// The player sees the active card (banner) + a history row.
		expect(
			getActiveSceneCardForActor(next.session, next.permissions, PLAYER_ACTOR.id),
		).not.toBeNull();
		expect(
			getSceneCardPushHistoryForActor(next.session, next.permissions, PLAYER_ACTOR.id),
		).toHaveLength(1);
	});

	it('activating a dm-only card does NOT push and the player sees no active card', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, cardId } = createCard(base, env, { title: 'Secret', mood: 'mystery' });

		const activated = accept(
			dispatch(state, env, {
				type: 'scene-card.activate',
				actorId: DM_ACTOR.id,
				payload: { cardId },
			}),
		);
		expect(activated.events.some((e) => e.kind === 'scene-card.pushed')).toBe(false);
		const next = activated.nextState;
		// The DM display shows it; the player does not.
		expect(getActiveSceneCardForActor(next.session, next.permissions, DM_ACTOR.id)).not.toBeNull();
		expect(getActiveSceneCardForActor(next.session, next.permissions, PLAYER_ACTOR.id)).toBeNull();
		expect(next.session.sceneCards.pushHistory).toHaveLength(0);
	});

	it('narrowing a pushed card back to dm-only drops it from the players’ scene history (fail closed)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, cardId } = createCard(base, env, {
			title: 'Revealed',
			mood: 'social',
			visibility: 'player-visible',
		});
		const pushed = accept(
			dispatch(state, env, {
				type: 'scene-card.activate',
				actorId: DM_ACTOR.id,
				payload: { cardId },
			}),
		).nextState;
		expect(
			getSceneCardPushHistoryForActor(pushed.session, pushed.permissions, PLAYER_ACTOR.id),
		).toHaveLength(1);

		const narrowed = accept(
			dispatch(pushed, env, {
				type: 'scene-card.set-visibility',
				actorId: DM_ACTOR.id,
				payload: { cardId, visibility: 'dm-only' },
			}),
		).nextState;
		// The durable push record still exists, but the player's actor-filtered history drops it.
		expect(narrowed.session.sceneCards.pushHistory).toHaveLength(1);
		expect(
			getSceneCardPushHistoryForActor(narrowed.session, narrowed.permissions, PLAYER_ACTOR.id),
		).toHaveLength(0);
		// The DM still sees the history row.
		expect(
			getSceneCardPushHistoryForActor(narrowed.session, narrowed.permissions, DM_ACTOR.id),
		).toHaveLength(1);
	});
});

describe('S11.2.3 — queue + advance semantics', () => {
	it('enqueue/dequeue/reorder are DM-facing; advance activates the head and shifts the queue', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		let s = base;
		const a = createCard(s, env, { title: 'A', mood: 'rest', visibility: 'player-visible' });
		s = a.state;
		const b = createCard(s, env, { title: 'B', mood: 'combat' });
		s = b.state;

		s = accept(
			dispatch(s, env, {
				type: 'scene-card.enqueue',
				actorId: DM_ACTOR.id,
				payload: { cardId: a.cardId },
			}),
		).nextState;
		s = accept(
			dispatch(s, env, {
				type: 'scene-card.enqueue',
				actorId: DM_ACTOR.id,
				payload: { cardId: b.cardId },
			}),
		).nextState;
		expect(
			getSceneCardQueueForActor(s.session, s.permissions, DM_ACTOR.id).map((c) => c.id),
		).toEqual([a.cardId, b.cardId]);
		// Players never see the queue.
		expect(getSceneCardQueueForActor(s.session, s.permissions, PLAYER_ACTOR.id)).toHaveLength(0);

		// A double enqueue is rejected.
		expect(
			dispatch(s, env, {
				type: 'scene-card.enqueue',
				actorId: DM_ACTOR.id,
				payload: { cardId: a.cardId },
			}).status,
		).toBe('rejected');

		// Reorder must be a permutation.
		s = accept(
			dispatch(s, env, {
				type: 'scene-card.reorder-queue',
				actorId: DM_ACTOR.id,
				payload: { queue: [b.cardId, a.cardId] },
			}),
		).nextState;
		expect(
			getSceneCardQueueForActor(s.session, s.permissions, DM_ACTOR.id).map((c) => c.id),
		).toEqual([b.cardId, a.cardId]);
		expect(
			dispatch(s, env, {
				type: 'scene-card.reorder-queue',
				actorId: DM_ACTOR.id,
				payload: { queue: [b.cardId] },
			}).status,
		).toBe('rejected');

		// Advance activates the head (B) and removes it from the queue.
		const advanced = accept(
			dispatch(s, env, { type: 'scene-card.advance', actorId: DM_ACTOR.id, payload: {} }),
		);
		expect(advanced.events.some((e) => e.kind === 'scene-card.queue-changed')).toBe(true);
		s = advanced.nextState;
		expect(s.session.sceneCards.activeCardId).toBe(b.cardId);
		expect(
			getSceneCardQueueForActor(s.session, s.permissions, DM_ACTOR.id).map((c) => c.id),
		).toEqual([a.cardId]);

		// Advance again to A — A is player-visible, so it pushes.
		const advancedA = accept(
			dispatch(s, env, { type: 'scene-card.advance', actorId: DM_ACTOR.id, payload: {} }),
		);
		expect(advancedA.events.some((e) => e.kind === 'scene-card.pushed')).toBe(true);
		s = advancedA.nextState;
		expect(s.session.sceneCards.queue).toHaveLength(0);

		// Advancing an empty queue is rejected.
		expect(
			dispatch(s, env, { type: 'scene-card.advance', actorId: DM_ACTOR.id, payload: {} }).status,
		).toBe('rejected');
	});

	it('set-transition drives the display transition style', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR);
		const next = accept(
			dispatch(base, env, {
				type: 'scene-card.set-transition',
				actorId: DM_ACTOR.id,
				payload: { transitionStyle: 'slide' },
			}),
		).nextState;
		expect(
			getSceneDisplayForActor(next.session, next.permissions, DM_ACTOR.id).transitionStyle,
		).toBe('slide');
	});
});

describe('S11.2.1 — soft delete tombstones + queue/display cleanup', () => {
	it('deleting a queued/active card removes it from the queue, clears the display, and is restorable', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR);
		const { state, cardId } = createCard(base, env, { title: 'Doomed', mood: 'combat' });
		let s = accept(
			dispatch(state, env, {
				type: 'scene-card.enqueue',
				actorId: DM_ACTOR.id,
				payload: { cardId },
			}),
		).nextState;
		s = accept(
			dispatch(s, env, { type: 'scene-card.activate', actorId: DM_ACTOR.id, payload: { cardId } }),
		).nextState;
		expect(s.session.sceneCards.activeCardId).toBe(cardId);

		s = accept(
			dispatch(s, env, { type: 'scene-card.delete', actorId: DM_ACTOR.id, payload: { cardId } }),
		).nextState;
		expect(getSceneCardForActor(s.session, s.permissions, DM_ACTOR.id, cardId)).toBeNull();
		expect(s.session.sceneCards.queue).toHaveLength(0);
		expect(s.session.sceneCards.activeCardId).toBeNull();

		// Re-deleting is rejected distinctly.
		const reDelete = dispatch(s, env, {
			type: 'scene-card.delete',
			actorId: DM_ACTOR.id,
			payload: { cardId },
		});
		expect(reDelete.status === 'rejected' && reDelete.rejection.code).toBe('scene-card-deleted');

		// Restore brings it back.
		s = accept(
			dispatch(s, env, { type: 'scene-card.restore', actorId: DM_ACTOR.id, payload: { cardId } }),
		).nextState;
		expect(getSceneCardForActor(s.session, s.permissions, DM_ACTOR.id, cardId)).not.toBeNull();
		// Restoring a live card is rejected.
		const reRestore = dispatch(s, env, {
			type: 'scene-card.restore',
			actorId: DM_ACTOR.id,
			payload: { cardId },
		});
		expect(reRestore.status === 'rejected' && reRestore.rejection.code).toBe(
			'scene-card-not-deleted',
		);
	});
});

describe('S11.2.1 — MCP create_scene_card is staged + fails closed to dm-only', () => {
	it('the agent tool creates a dm-only card (visibility is not an accepted argument)', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const registry = createBaselineMcpToolRegistry();
		const result = invokeMcpTool(base, env, registry, {
			toolId: 'create_scene_card',
			actorId: DM_ACTOR.id,
			agentId: 'agent-test',
			input: { title: 'Agent Card', mood: 'mystery', flavorText: 'Whispers in the dark.' },
		});
		expect(result.status).toBe('write');
		if (result.status !== 'write') throw new Error('expected write');
		const commandResult = accept(result.commandResult);
		const cards = Object.values(commandResult.nextState.session.sceneCards.cards);
		expect(cards).toHaveLength(1);
		expect(cards[0]?.visibility).toBe('dm-only');
		expect(cards[0]?.title).toBe('Agent Card');
	});
});

describe('S11.2 — hydrator fails closed on a corrupt persisted slice', () => {
	it('drops dangling queue/active refs and collapses unknown enums', () => {
		const hydrated = ensureSceneCardState({
			cards: {
				live: {
					id: 'live',
					title: 'Live',
					mood: 'nonsense' as never,
					heroImage: null,
					flavorText: 'x'.repeat(999),
					audioAssociationId: null,
					visibility: 'public' as never,
					createdBy: 'actor-dm',
					createdAt: 't',
					updatedAt: 't',
					revision: 1,
					deletedAt: null,
				},
			},
			queue: ['live', 'ghost', 'live'],
			activeCardId: 'ghost',
			transitionStyle: 'zoom' as never,
			pushHistory: [{ id: 'p1', cardId: 'ghost', pushedBy: 'actor-dm', pushedAt: 't' }],
			schemaVersion: 1,
		});
		expect(hydrated.cards.live?.mood).toBe('exploration');
		expect(hydrated.cards.live?.visibility).toBe('dm-only');
		expect(hydrated.cards.live?.flavorText.length).toBe(500);
		expect(hydrated.queue).toEqual(['live']);
		expect(hydrated.activeCardId).toBeNull();
		expect(hydrated.transitionStyle).toBe('crossfade');
		expect(hydrated.pushHistory).toHaveLength(0);
	});
});
