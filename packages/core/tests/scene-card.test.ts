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
	type SceneCardState,
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
		// A schema-v1 persisted slice: no `audioPresetId` / `lightingHint` on the card at all.
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
		} as unknown as Partial<SceneCardState>);
		expect(hydrated.cards.live?.mood).toBe('exploration');
		expect(hydrated.cards.live?.visibility).toBe('dm-only');
		expect(hydrated.cards.live?.flavorText.length).toBe(500);
		expect(hydrated.queue).toEqual(['live']);
		expect(hydrated.activeCardId).toBeNull();
		expect(hydrated.transitionStyle).toBe('crossfade');
		expect(hydrated.pushHistory).toHaveLength(0);
	});

	// RC-AUD-2.1 — schema v1 → v2 migration: the two package halves are additive, so a v1 card hydrates
	// with no package and an unknown lighting hint collapses to null rather than reaching a surface.
	it('migrates a schema-v1 card to v2 with no package, and fails a bad hint closed', () => {
		const hydrated = ensureSceneCardState({
			cards: {
				old: {
					id: 'old',
					title: 'Old',
					mood: 'rest',
					heroImage: null,
					flavorText: '',
					audioAssociationId: null,
					visibility: 'player-visible',
					createdBy: 'actor-dm',
					createdAt: 't',
					updatedAt: 't',
					revision: 1,
					deletedAt: null,
				},
				bad: {
					id: 'bad',
					title: 'Bad',
					mood: 'rest',
					heroImage: null,
					flavorText: '',
					audioAssociationId: null,
					audioPresetId: '',
					lightingHint: 'strobe',
					visibility: 'dm-only',
					createdBy: 'actor-dm',
					createdAt: 't',
					updatedAt: 't',
					revision: 1,
					deletedAt: null,
				},
			},
			schemaVersion: 1,
		} as unknown as Partial<SceneCardState>);
		expect(hydrated.schemaVersion).toBe(2);
		expect(hydrated.cards.old?.audioPresetId).toBeNull();
		expect(hydrated.cards.old?.lightingHint).toBeNull();
		expect(hydrated.cards.bad?.audioPresetId).toBeNull();
		expect(hydrated.cards.bad?.lightingHint).toBeNull();
	});
});

/**
 * RC-AUD-2.1 — SCENE PACKAGES. A package is a card plus its two reference halves (an AUDIO-014 preset and
 * a lighting hint); `scene-card.play-package` is the one click that applies the audio, shows the card, and
 * pushes it to players when it is shared — honest about the audio half when the preset cannot play.
 */

/** An active session with one playback-ready local source carrying a license-cleared asset. */
function sessionWithReadyAudio(env: CoreEnvironment): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	let state = accept(
		dispatch(base, env, {
			type: 'audio.configure-source',
			actorId: DM_ACTOR.id,
			payload: {
				sourceId: 's-main',
				type: 'local-file',
				displayName: 's-main',
				cacheBehavior: 'local',
			},
		}),
	).nextState;
	state = accept(
		dispatch(state, env, {
			type: 'audio.import-asset',
			actorId: DM_ACTOR.id,
			payload: {
				sourceId: 's-main',
				bytes: [1, 2, 3, 4],
				mimeType: 'audio/mpeg',
				fileName: 's-main.mp3',
				title: 's-main',
				license: { kind: 'owned' },
			},
		}),
	).nextState;
	const assetId = Object.values(state.audio.assets).find((a) => a.source.sourceId === 's-main')!.id;
	state = accept(
		dispatch(state, env, {
			type: 'session.audio.play',
			actorId: DM_ACTOR.id,
			payload: { sourceId: 's-main', assetId, volume: 0.7 },
		}),
	).nextState;
	return state;
}

/** Capture the live audio as a user preset, then stop, so applying the package is observable. */
function savedPreset(
	state: CoreStateSlice,
	env: CoreEnvironment,
): { state: CoreStateSlice; presetId: string } {
	const saved = accept(
		dispatch(state, env, {
			type: 'audio.save-preset',
			actorId: DM_ACTOR.id,
			payload: { name: 'Tavern night', category: 'urban' },
		}),
	).nextState;
	const presetId = Object.keys(saved.audio.presets)[0]!;
	const stopped = accept(
		dispatch(saved, env, { type: 'session.audio.stop', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	return { state: stopped, presetId };
}

describe('RC-AUD-2.1 — scene packages', () => {
	it('carries the audio preset + lighting hint on the card, and updates/clears them', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, cardId } = createCard(base, env, {
			title: 'The Sunken Tavern',
			mood: 'social',
			audioPresetId: 'preset-tavern',
			lightingHint: 'firelit',
		});
		expect(state.session.sceneCards.cards[cardId]?.audioPresetId).toBe('preset-tavern');
		expect(state.session.sceneCards.cards[cardId]?.lightingHint).toBe('firelit');

		// Omitted fields leave the package unchanged; an explicit null clears a half.
		const renamed = accept(
			dispatch(state, env, {
				type: 'scene-card.update',
				actorId: DM_ACTOR.id,
				payload: { cardId, title: 'The Drowned Tavern' },
			}),
		).nextState;
		expect(renamed.session.sceneCards.cards[cardId]?.audioPresetId).toBe('preset-tavern');
		expect(renamed.session.sceneCards.cards[cardId]?.lightingHint).toBe('firelit');

		const cleared = accept(
			dispatch(renamed, env, {
				type: 'scene-card.update',
				actorId: DM_ACTOR.id,
				payload: { cardId, audioPresetId: null, lightingHint: null },
			}),
		).nextState;
		expect(cleared.session.sceneCards.cards[cardId]?.audioPresetId).toBeNull();
		expect(cleared.session.sceneCards.cards[cardId]?.lightingHint).toBeNull();

		// An undeclared lighting hint is rejected at the schema, never stored.
		const bad = dispatch(cleared, env, {
			type: 'scene-card.update',
			actorId: DM_ACTOR.id,
			payload: { cardId, lightingHint: 'strobe' },
		});
		expect(bad.status).toBe('rejected');
	});

	it('one click applies the preset, shows the card and pushes it to players', () => {
		const env = makeEnvironment();
		const ready = savedPreset(sessionWithReadyAudio(env), env);
		const { state, cardId } = createCard(ready.state, env, {
			title: 'The Sunken Tavern',
			mood: 'social',
			visibility: 'player-visible',
			audioPresetId: ready.presetId,
			lightingHint: 'firelit',
		});
		expect(state.session.audioPlayback.track).toBeNull();

		const played = accept(
			dispatch(state, env, {
				type: 'scene-card.play-package',
				actorId: DM_ACTOR.id,
				payload: { cardId },
			}),
		);
		// Plays…
		expect(played.nextState.session.audioPlayback.track?.sourceId).toBe('s-main');
		expect(played.nextState.session.audioPlayback.track?.status).toBe('playing');
		// …shows…
		expect(played.nextState.session.sceneCards.activeCardId).toBe(cardId);
		// …and pushes.
		expect(played.nextState.session.sceneCards.pushHistory).toHaveLength(1);
		const summary = played.events.find((e) => e.kind === 'scene-card.package-played');
		if (summary?.kind !== 'scene-card.package-played') throw new Error('no package-played event');
		expect(summary.audioApplied).toBe(true);
		expect(summary.audioSkippedReason).toBeNull();
		expect(summary.pushed).toBe(true);
		expect(summary.lightingHint).toBe('firelit');
		// The audio op and the card op both land, so the whole action replays in order.
		expect(played.operationIds.length).toBe(2);
	});

	it('still shows the card when the preset cannot play, and says why', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, cardId } = createCard(base, env, {
			title: 'Ruined Chapel',
			mood: 'mystery',
			audioPresetId: 'preset-that-does-not-exist',
		});

		const played = accept(
			dispatch(state, env, {
				type: 'scene-card.play-package',
				actorId: DM_ACTOR.id,
				payload: { cardId },
			}),
		);
		expect(played.nextState.session.sceneCards.activeCardId).toBe(cardId);
		expect(played.nextState.session.audioPlayback.track).toBeNull();
		const summary = played.events.find((e) => e.kind === 'scene-card.package-played');
		if (summary?.kind !== 'scene-card.package-played') throw new Error('no package-played event');
		expect(summary.audioApplied).toBe(false);
		expect(summary.audioSkippedReason).toContain('does not exist');
		// A dm-only package is shown but never pushed.
		expect(summary.pushed).toBe(false);
		expect(played.nextState.session.sceneCards.pushHistory).toHaveLength(0);
	});

	it('is DM-only and fails closed on a missing card', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, cardId } = createCard(base, env, { title: 'Crypt', mood: 'mystery' });

		const asPlayer = dispatch(state, env, {
			type: 'scene-card.play-package',
			actorId: PLAYER_ACTOR.id,
			payload: { cardId },
		});
		expect(asPlayer.status).toBe('rejected');
		if (asPlayer.status === 'rejected') {
			expect(asPlayer.rejection.code).toBe('actor-not-authorized');
		}

		const missing = dispatch(state, env, {
			type: 'scene-card.play-package',
			actorId: DM_ACTOR.id,
			payload: { cardId: 'card-nope' },
		});
		expect(missing.status).toBe('rejected');
		if (missing.status === 'rejected') {
			expect(missing.rejection.code).toBe('scene-card-not-found');
		}
	});

	it('never leaks the package audio preset id to a player', () => {
		const env = makeEnvironment();
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const { state, cardId } = createCard(base, env, {
			title: 'The Sunken Tavern',
			mood: 'social',
			visibility: 'player-visible',
			audioPresetId: 'preset-tavern',
			lightingHint: 'dim',
		});
		const asDm = getSceneCardForActor(state.session, state.permissions, DM_ACTOR.id, cardId);
		expect(asDm?.audioPresetId).toBe('preset-tavern');
		const asPlayer = getSceneCardForActor(
			state.session,
			state.permissions,
			PLAYER_ACTOR.id,
			cardId,
		);
		expect(asPlayer?.audioPresetId).toBeNull();
		// The lighting hint is atmosphere and travels with the card.
		expect(asPlayer?.lightingHint).toBe('dim');
	});
});
