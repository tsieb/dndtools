import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SCREEN_META,
	dispatchCommand,
	duplicateSceneInputSchema,
	hydrateScreenMeta,
	isDefaultScreenMeta,
	isPinnedScreen,
	listPinnedScreens,
	listPinnedScreensForActor,
	listScreensForActor,
	reorderScreenPinsInputSchema,
	SCENE_SCHEMA_VERSION,
	screenLayoutPolicy,
	screenMetaOf,
	screenPinOrder,
	setScreenLayoutPolicyInputSchema,
	setScreenPinnedInputSchema,
	withScreenMeta,
	type CoreStateSlice,
	type Scene,
	type SceneId,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

type Env = ReturnType<typeof makeEnvironment>;

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${result.rejection.code} ${result.rejection.message}`);
	}
	return result.nextState;
}

function rejection(result: ReturnType<typeof dispatchCommand>) {
	if (result.status !== 'rejected') throw new Error('expected a rejection');
	return result.rejection;
}

function createScene(
	state: CoreStateSlice,
	env: Env,
	payload: Record<string, unknown>,
): { state: CoreStateSlice; sceneId: SceneId } {
	const before = new Set(Object.keys(state.scenes.scenes));
	const next = accept(
		dispatchCommand(state, env, { type: 'scene.create', actorId: DM_ACTOR.id, payload }),
	);
	const sceneId = Object.keys(next.scenes.scenes).find((id) => !before.has(id));
	if (!sceneId) throw new Error('no scene was created');
	return { state: next, sceneId };
}

/**
 * A FIXTURE VAULT with a CUSTOMISED HOME BOARD: the default Command Center home scene, then the kind
 * of editing a GM actually does to it — two more widgets, one of them bound and configured, the pair
 * grouped, one tile pinned and re-layered, a named section holding them, and an explicit focus order.
 * The round-trip tests below assert every one of those details survives screen metadata being written
 * and removed.
 */
function customisedHomeVault(): {
	state: CoreStateSlice;
	env: Env;
	homeSceneId: SceneId;
	addedWidgetIds: string[];
} {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);

	state = accept(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	const homeSceneId = state.commandCenter.homeSceneId;
	if (!homeSceneId) throw new Error('ensure-home left no home scene');

	const addedWidgetIds: string[] = [];
	for (const widget of [
		{
			type: 'map',
			version: '1.0.0',
			layout: { x: 40, y: 400, w: 320, h: 240 },
			configuration: { initialLayer: 'political', zoom: 3 },
			binding: {
				source: { entityType: 'map', entityId: 'map-atlas' },
				mode: 'read' as const,
				requiredCapability: 'viewer' as const,
			},
		},
		{
			type: 'notes',
			version: '1.0.0',
			layout: { x: 400, y: 400, w: 280, h: 240 },
			configuration: { heading: 'Session prep' },
		},
	]) {
		const result = accept(
			dispatchCommand(state, env, {
				type: 'scene.add-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, widget },
			}),
		);
		state = result;
		const added = result.scenes.scenes[homeSceneId]?.widgets.at(-1);
		if (!added) throw new Error('widget was not added');
		addedWidgetIds.push(added.id);
	}

	state = accept(
		dispatchCommand(state, env, {
			type: 'scene.group-widgets',
			actorId: DM_ACTOR.id,
			payload: { sceneId: homeSceneId, widgetInstanceIds: addedWidgetIds },
		}),
	);
	state = accept(
		dispatchCommand(state, env, {
			type: 'scene.pin-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId: homeSceneId, widgetInstanceId: addedWidgetIds[0], pinned: true },
		}),
	);
	state = accept(
		dispatchCommand(state, env, {
			type: 'scene.layer-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId: homeSceneId, widgetInstanceId: addedWidgetIds[1], z: 99 },
		}),
	);
	state = accept(
		dispatchCommand(state, env, {
			type: 'scene.set-focus-order',
			actorId: DM_ACTOR.id,
			payload: { sceneId: homeSceneId, widgetInstanceId: addedWidgetIds[1], focusOrder: 0 },
		}),
	);
	state = accept(
		dispatchCommand(state, env, {
			type: 'scene.set-sections',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId: homeSceneId,
				sections: [
					{
						id: 'section-prep',
						name: 'Prep',
						bounds: { x: 0, y: 380, w: 720, h: 280 },
						widgetInstanceIds: addedWidgetIds,
					},
				],
			},
		}),
	);

	return { state, env, homeSceneId, addedWidgetIds };
}

function homeScene(state: CoreStateSlice, homeSceneId: SceneId): Scene {
	const scene = state.scenes.scenes[homeSceneId];
	if (!scene) throw new Error('home scene vanished');
	return scene;
}

// ── schema ──────────────────────────────────────────────────────────────────────────────────────

describe('RC-CAN-7.2 schema: the screen command inputs are strict and carry only their own field', () => {
	it('set-pinned takes a scene and a boolean, and nothing else', () => {
		expect(setScreenPinnedInputSchema.safeParse({ sceneId: 's', pinned: true }).success).toBe(true);
		expect(setScreenPinnedInputSchema.safeParse({ sceneId: 's', pinned: 'yes' }).success).toBe(
			false,
		);
		expect(setScreenPinnedInputSchema.safeParse({ sceneId: 's' }).success).toBe(false);
		// The caller may NOT choose the pin slot — the reducer owns it.
		expect(
			setScreenPinnedInputSchema.safeParse({ sceneId: 's', pinned: true, pinOrder: 0 }).success,
		).toBe(false);
	});

	it('reorder-pins takes a non-empty list of ids', () => {
		expect(reorderScreenPinsInputSchema.safeParse({ sceneIds: ['a', 'b'] }).success).toBe(true);
		expect(reorderScreenPinsInputSchema.safeParse({ sceneIds: [] }).success).toBe(false);
		expect(reorderScreenPinsInputSchema.safeParse({ sceneIds: ['a', ''] }).success).toBe(false);
		expect(reorderScreenPinsInputSchema.safeParse({ sceneIds: ['a'], bogus: 1 }).success).toBe(
			false,
		);
	});

	it('set-layout-policy accepts only the two policies ADR-041 declares', () => {
		expect(
			setScreenLayoutPolicyInputSchema.safeParse({ sceneId: 's', layoutPolicy: 'flow' }).success,
		).toBe(true);
		expect(
			setScreenLayoutPolicyInputSchema.safeParse({ sceneId: 's', layoutPolicy: 'canvas' }).success,
		).toBe(true);
		expect(
			setScreenLayoutPolicyInputSchema.safeParse({ sceneId: 's', layoutPolicy: 'masonry' }).success,
		).toBe(false);
	});

	it('duplicate names the source and the copy, and accepts no content from the caller', () => {
		expect(duplicateSceneInputSchema.safeParse({ sceneId: 's', name: 'Copy' }).success).toBe(true);
		expect(duplicateSceneInputSchema.safeParse({ sceneId: 's', name: '' }).success).toBe(false);
		expect(
			duplicateSceneInputSchema.safeParse({ sceneId: 's', name: 'Copy', widgets: [] }).success,
		).toBe(false);
	});
});

describe('RC-CAN-7.2 schema: a persisted screen record hydrates fail-closed', () => {
	it('resolves an absent record to unpinned, canvas, no origin', () => {
		expect(hydrateScreenMeta(undefined)).toEqual(DEFAULT_SCREEN_META);
		expect(hydrateScreenMeta(null)).toEqual(DEFAULT_SCREEN_META);
		expect(hydrateScreenMeta('pinned')).toEqual(DEFAULT_SCREEN_META);
		expect(hydrateScreenMeta([])).toEqual(DEFAULT_SCREEN_META);
		expect(isDefaultScreenMeta(DEFAULT_SCREEN_META)).toBe(true);
	});

	it('never invents a pin, and drops a pin order that does not belong to a pin', () => {
		// A truthy-but-not-true value must not pin a screen the GM never pinned.
		expect(hydrateScreenMeta({ pinned: 1, pinOrder: 2 }).pinned).toBe(false);
		expect(hydrateScreenMeta({ pinned: 1, pinOrder: 2 }).pinOrder).toBe(null);
		expect(hydrateScreenMeta({ pinned: false, pinOrder: 4 }).pinOrder).toBe(null);
		expect(hydrateScreenMeta({ pinned: true, pinOrder: -1 }).pinOrder).toBe(null);
		expect(hydrateScreenMeta({ pinned: true, pinOrder: 1.5 }).pinOrder).toBe(null);
		expect(hydrateScreenMeta({ pinned: true, pinOrder: 3 }).pinOrder).toBe(3);
	});

	it('falls back to canvas for a policy this build cannot render', () => {
		expect(hydrateScreenMeta({ layoutPolicy: 'masonry' }).layoutPolicy).toBe('canvas');
		expect(hydrateScreenMeta({ layoutPolicy: 'flow' }).layoutPolicy).toBe('flow');
	});

	it('drops an incomplete origin rather than half-reporting provenance', () => {
		expect(hydrateScreenMeta({ origin: { kind: 'duplicate' } }).origin).toBe(null);
		expect(hydrateScreenMeta({ origin: { kind: 'nope', at: 't' } }).origin).toBe(null);
		expect(
			hydrateScreenMeta({ origin: { kind: 'duplicate', sourceSceneId: 'a', at: 't' } }).origin,
		).toEqual({ kind: 'duplicate', sourceSceneId: 'a', defaultKey: null, at: 't' });
	});
});

// ── round trip on a customised home board ───────────────────────────────────────────────────────

describe('RC-CAN-7.2 round trip: screen metadata is additive on a customised home board', () => {
	it('a scene that never met screens serialises with no screen key and no schema bump', () => {
		const { state, homeSceneId } = customisedHomeVault();
		const scene = homeScene(state, homeSceneId);

		expect('screen' in scene).toBe(false);
		expect(scene.schemaVersion).toBe(SCENE_SCHEMA_VERSION);
		// Reading the metadata must not WRITE it.
		expect(screenMetaOf(scene)).toEqual(DEFAULT_SCREEN_META);
		expect(screenLayoutPolicy(scene)).toBe('canvas');
		expect(isPinnedScreen(scene)).toBe(false);
		expect(screenPinOrder(scene)).toBe(null);
		expect('screen' in scene).toBe(false);
	});

	it('writing the default metadata drops the key, so the document is byte-identical', () => {
		const { state, homeSceneId } = customisedHomeVault();
		const scene = homeScene(state, homeSceneId);
		const before = JSON.stringify(scene);

		const rewritten = withScreenMeta(scene, screenMetaOf(scene));

		expect(JSON.stringify(rewritten)).toBe(before);
		expect('screen' in rewritten).toBe(false);
	});

	it('pin then unpin leaves every widget, section and layout byte-identical', () => {
		const { state, env, homeSceneId, addedWidgetIds } = customisedHomeVault();
		const before = homeScene(state, homeSceneId);
		const widgetsBefore = JSON.stringify(before.widgets);
		const sectionsBefore = JSON.stringify(before.sections);

		const pinned = accept(
			dispatchCommand(state, env, {
				type: 'scene.set-pinned',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, pinned: true },
			}),
		);
		expect(homeScene(pinned, homeSceneId).screen).toEqual({
			pinned: true,
			pinOrder: 0,
			layoutPolicy: 'canvas',
			origin: null,
		});

		const unpinned = accept(
			dispatchCommand(pinned, env, {
				type: 'scene.set-pinned',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, pinned: false },
			}),
		);
		const after = homeScene(unpinned, homeSceneId);

		// The whole screen record is gone again: unpinned + canvas + no origin IS the default.
		expect('screen' in after).toBe(false);
		expect(JSON.stringify(after.widgets)).toBe(widgetsBefore);
		expect(JSON.stringify(after.sections)).toBe(sectionsBefore);
		expect(after.schemaVersion).toBe(SCENE_SCHEMA_VERSION);
		// Only ownership moved, and only because two durable commands ran.
		expect(after.ownership.revision).toBe(before.ownership.revision + 2);
		expect({ ...after, ownership: before.ownership }).toEqual(before);
		// Every customisation is still intact, tile pin included (a TILE pin is not a SCREEN pin).
		const pinnedTile = after.widgets.find((w) => w.id === addedWidgetIds[0]);
		expect(pinnedTile?.layout.pinned).toBe(true);
		expect(pinnedTile?.binding?.source.entityId).toBe('map-atlas');
	});

	it('survives a JSON persistence round trip with metadata written', () => {
		const { state, env, homeSceneId } = customisedHomeVault();
		const widgetCount = homeScene(state, homeSceneId).widgets.length;
		expect(widgetCount).toBeGreaterThan(2);

		let next = accept(
			dispatchCommand(state, env, {
				type: 'scene.set-pinned',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, pinned: true },
			}),
		);
		next = accept(
			dispatchCommand(next, env, {
				type: 'scene.set-layout-policy',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, layoutPolicy: 'flow' },
			}),
		);

		const persisted = JSON.parse(JSON.stringify(next.scenes)) as typeof next.scenes;
		const restored = persisted.scenes[homeSceneId];
		if (!restored) throw new Error('home scene did not survive persistence');

		expect(restored).toEqual(homeScene(next, homeSceneId));
		expect(restored.widgets).toHaveLength(widgetCount);
		expect(screenMetaOf(restored)).toEqual({
			pinned: true,
			pinOrder: 0,
			layoutPolicy: 'flow',
			origin: null,
		});
		expect(persisted.schemaVersion).toBe(next.scenes.schemaVersion);
	});
});

// ── reducers ────────────────────────────────────────────────────────────────────────────────────

describe('RC-CAN-7.2 reducer: scene.set-pinned', () => {
	it('appends a new pin above every existing one and emits scene.pin-changed', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR);
		const first = createScene(state, env, { name: 'Alpha' });
		state = first.state;
		const second = createScene(state, env, { name: 'Beta' });
		state = second.state;

		state = accept(
			dispatchCommand(state, env, {
				type: 'scene.set-pinned',
				actorId: DM_ACTOR.id,
				payload: { sceneId: first.sceneId, pinned: true },
			}),
		);
		const result = dispatchCommand(state, env, {
			type: 'scene.set-pinned',
			actorId: DM_ACTOR.id,
			payload: { sceneId: second.sceneId, pinned: true },
		});
		state = accept(result);

		expect(result.status === 'accepted' && result.events).toEqual([
			{ kind: 'scene.pin-changed', sceneId: second.sceneId, actorId: DM_ACTOR.id, pinned: true },
		]);
		expect(screenPinOrder(state.scenes.scenes[first.sceneId]!)).toBe(0);
		expect(screenPinOrder(state.scenes.scenes[second.sceneId]!)).toBe(1);
		expect(listPinnedScreens(state.scenes).map((s) => s.id)).toEqual([
			first.sceneId,
			second.sceneId,
		]);
	});

	it('pinning changes no visibility field, so a GM-only screen stays GM-only', () => {
		const env = makeEnvironment();
		const created = createScene(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
			name: 'GM workspace',
			visibility: 'dm-only',
		});
		const state = accept(
			dispatchCommand(created.state, env, {
				type: 'scene.set-pinned',
				actorId: DM_ACTOR.id,
				payload: { sceneId: created.sceneId, pinned: true },
			}),
		);
		const scene = state.scenes.scenes[created.sceneId]!;

		expect(scene.visibility).toBe('dm-only');
		expect(scene.sharingTargets).toEqual([]);
		expect(scene.playerViewAssignments).toEqual([]);
		expect(
			listScreensForActor(state.scenes, state.permissions, PLAYER_ACTOR.id).map((e) => e.id),
		).toEqual([]);
	});

	it('refuses a player, an unknown scene, a re-pin and a template', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const created = createScene(state, env, { name: 'Alpha' });
		state = created.state;
		const template = createScene(state, env, { name: 'Prep template', asTemplate: true });
		state = template.state;

		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.set-pinned',
					actorId: PLAYER_ACTOR.id,
					payload: { sceneId: created.sceneId, pinned: true },
				}),
			).code,
		).toBe('actor-not-authorized');
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.set-pinned',
					actorId: DM_ACTOR.id,
					payload: { sceneId: 'scene-missing', pinned: true },
				}),
			).code,
		).toBe('scene-not-found');
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.set-pinned',
					actorId: DM_ACTOR.id,
					payload: { sceneId: template.sceneId, pinned: true },
				}),
			).code,
		).toBe('invalid-state');
		// Already unpinned.
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.set-pinned',
					actorId: DM_ACTOR.id,
					payload: { sceneId: created.sceneId, pinned: false },
				}),
			).code,
		).toBe('invalid-state');

		const pinned = accept(
			dispatchCommand(state, env, {
				type: 'scene.set-pinned',
				actorId: DM_ACTOR.id,
				payload: { sceneId: created.sceneId, pinned: true },
			}),
		);
		expect(
			rejection(
				dispatchCommand(pinned, env, {
					type: 'scene.set-pinned',
					actorId: DM_ACTOR.id,
					payload: { sceneId: created.sceneId, pinned: true },
				}),
			).code,
		).toBe('invalid-state');
	});
});

describe('RC-CAN-7.2 reducer: scene.reorder-pins', () => {
	function threePinnedScreens() {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const ids: SceneId[] = [];
		for (const name of ['Alpha', 'Beta', 'Gamma']) {
			const created = createScene(state, env, { name });
			state = accept(
				dispatchCommand(created.state, env, {
					type: 'scene.set-pinned',
					actorId: DM_ACTOR.id,
					payload: { sceneId: created.sceneId, pinned: true },
				}),
			);
			ids.push(created.sceneId);
		}
		return { state, env, ids };
	}

	it('renumbers the pins to the requested order and leaves unmoved screens untouched', () => {
		const { state, env, ids } = threePinnedScreens();
		const order = [ids[2]!, ids[1]!, ids[0]!];
		const unmovedBefore = state.scenes.scenes[ids[1]!]!;

		const result = dispatchCommand(state, env, {
			type: 'scene.reorder-pins',
			actorId: DM_ACTOR.id,
			payload: { sceneIds: order },
		});
		const next = accept(result);

		expect(listPinnedScreens(next.scenes).map((s) => s.id)).toEqual(order);
		expect(result.status === 'accepted' && result.events).toEqual([
			{ kind: 'scene.pins-reordered', actorId: DM_ACTOR.id, sceneIds: order },
		]);
		// Beta was already at index 1, so it is not rewritten and its revision does not move.
		expect(next.scenes.scenes[ids[1]!]).toBe(unmovedBefore);
	});

	it('refuses a list that is not exactly the pinned set', () => {
		const { state, env, ids } = threePinnedScreens();
		const unpinned = createScene(state, env, { name: 'Delta' });

		// Omits a pin: a stale client must not be able to unpin by reordering.
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.reorder-pins',
					actorId: DM_ACTOR.id,
					payload: { sceneIds: [ids[0]!, ids[1]!] },
				}),
			).code,
		).toBe('invalid-payload');
		// A duplicate id.
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.reorder-pins',
					actorId: DM_ACTOR.id,
					payload: { sceneIds: [ids[0]!, ids[0]!, ids[1]!, ids[2]!] },
				}),
			).code,
		).toBe('invalid-payload');
		// An unpinned screen.
		expect(
			rejection(
				dispatchCommand(unpinned.state, env, {
					type: 'scene.reorder-pins',
					actorId: DM_ACTOR.id,
					payload: { sceneIds: [...ids, unpinned.sceneId] },
				}),
			).code,
		).toBe('invalid-state');
		// An unknown screen.
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.reorder-pins',
					actorId: DM_ACTOR.id,
					payload: { sceneIds: [...ids, 'scene-missing'] },
				}),
			).code,
		).toBe('scene-not-found');
		// A no-op reorder.
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.reorder-pins',
					actorId: DM_ACTOR.id,
					payload: { sceneIds: ids },
				}),
			).code,
		).toBe('invalid-state');
		// A player.
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.reorder-pins',
					actorId: PLAYER_ACTOR.id,
					payload: { sceneIds: [ids[2]!, ids[1]!, ids[0]!] },
				}),
			).code,
		).toBe('actor-not-authorized');
	});

	it('normalises a sparse order left behind by an unpin', () => {
		const { state, env, ids } = threePinnedScreens();
		const afterUnpin = accept(
			dispatchCommand(state, env, {
				type: 'scene.set-pinned',
				actorId: DM_ACTOR.id,
				payload: { sceneId: ids[0]!, pinned: false },
			}),
		);
		expect(listPinnedScreens(afterUnpin.scenes).map((s) => screenPinOrder(s))).toEqual([1, 2]);

		const reordered = accept(
			dispatchCommand(afterUnpin, env, {
				type: 'scene.reorder-pins',
				actorId: DM_ACTOR.id,
				payload: { sceneIds: [ids[2]!, ids[1]!] },
			}),
		);
		expect(listPinnedScreens(reordered.scenes).map((s) => screenPinOrder(s))).toEqual([0, 1]);
		expect(listPinnedScreens(reordered.scenes).map((s) => s.id)).toEqual([ids[2]!, ids[1]!]);
	});
});

describe('RC-CAN-7.2 reducer: scene.set-layout-policy', () => {
	it('changes the policy and nothing else — widgets and sections come through by reference', () => {
		const { state, env, homeSceneId } = customisedHomeVault();
		const before = homeScene(state, homeSceneId);

		const result = dispatchCommand(state, env, {
			type: 'scene.set-layout-policy',
			actorId: DM_ACTOR.id,
			payload: { sceneId: homeSceneId, layoutPolicy: 'flow' },
		});
		const after = homeScene(accept(result), homeSceneId);

		expect(screenLayoutPolicy(after)).toBe('flow');
		expect(after.widgets).toBe(before.widgets);
		expect(after.sections).toBe(before.sections);
		expect(result.status === 'accepted' && result.events).toEqual([
			{
				kind: 'scene.layout-policy-changed',
				sceneId: homeSceneId,
				actorId: DM_ACTOR.id,
				layoutPolicy: 'flow',
			},
		]);
	});

	it('converts back to canvas and drops the record again', () => {
		const { state, env, homeSceneId } = customisedHomeVault();
		const toFlow = accept(
			dispatchCommand(state, env, {
				type: 'scene.set-layout-policy',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, layoutPolicy: 'flow' },
			}),
		);
		const back = accept(
			dispatchCommand(toFlow, env, {
				type: 'scene.set-layout-policy',
				actorId: DM_ACTOR.id,
				payload: { sceneId: homeSceneId, layoutPolicy: 'canvas' },
			}),
		);
		expect('screen' in homeScene(back, homeSceneId)).toBe(false);
	});

	it('refuses a player and a policy that is already set', () => {
		const { state, env, homeSceneId } = customisedHomeVault();
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.set-layout-policy',
					actorId: PLAYER_ACTOR.id,
					payload: { sceneId: homeSceneId, layoutPolicy: 'flow' },
				}),
			).code,
		).toBe('actor-not-authorized');
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.set-layout-policy',
					actorId: DM_ACTOR.id,
					payload: { sceneId: homeSceneId, layoutPolicy: 'canvas' },
				}),
			).code,
		).toBe('invalid-state');
	});
});

describe('RC-CAN-7.2 reducer: scene.duplicate', () => {
	it('copies every widget with fresh identities, remapped groups and intact bindings', () => {
		const { state, env, homeSceneId, addedWidgetIds } = customisedHomeVault();
		const source = homeScene(state, homeSceneId);

		const result = dispatchCommand(state, env, {
			type: 'scene.duplicate',
			actorId: DM_ACTOR.id,
			payload: { sceneId: homeSceneId, name: 'Home board copy' },
		});
		const next = accept(result);
		const event = result.status === 'accepted' ? result.events[0] : undefined;
		if (!event || event.kind !== 'scene.duplicated') throw new Error('no duplicate event');
		const copy = next.scenes.scenes[event.newSceneId]!;

		expect(copy.id).not.toBe(source.id);
		expect(copy.name).toBe('Home board copy');
		expect(copy.widgets).toHaveLength(source.widgets.length);

		// Identities are fresh; everything else about each widget is carried over verbatim.
		const sourceIds = new Set(source.widgets.map((w) => w.id));
		for (const [index, widget] of copy.widgets.entries()) {
			const original = source.widgets[index]!;
			expect(sourceIds.has(widget.id)).toBe(false);
			expect(widget.type).toBe(original.type);
			expect(widget.version).toBe(original.version);
			expect(widget.configuration).toEqual(original.configuration);
			expect(widget.localState).toEqual(original.localState);
			expect(widget.binding).toEqual(original.binding);
			expect({ ...widget.layout, groupId: null }).toEqual({
				...original.layout,
				groupId: null,
			});
		}

		// The group survives as a group: both members share ONE new id, and it is not the source's.
		const sourceGroupId = source.widgets.find((w) => w.id === addedWidgetIds[0])!.layout.groupId;
		expect(sourceGroupId).not.toBe(null);
		const copiedGroupIds = copy.widgets
			.map((w) => w.layout.groupId)
			.filter((id): id is string => id !== null);
		expect(copiedGroupIds).toHaveLength(2);
		expect(new Set(copiedGroupIds).size).toBe(1);
		expect(copiedGroupIds[0]).not.toBe(sourceGroupId);

		// Sections are re-identified and re-point at the copied widgets, never the originals.
		expect(copy.sections).toHaveLength(1);
		expect(copy.sections[0]!.id).not.toBe(source.sections[0]!.id);
		expect(copy.sections[0]!.name).toBe('Prep');
		for (const id of copy.sections[0]!.widgetInstanceIds) {
			expect(sourceIds.has(id)).toBe(false);
			expect(copy.widgets.some((w) => w.id === id)).toBe(true);
		}

		// The source is untouched.
		expect(next.scenes.scenes[homeSceneId]).toBe(source);
	});

	it('starts GM-only and unpinned, keeps the source policy, and records duplicate provenance', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const created = createScene(state, env, {
			name: 'Shared board',
			visibility: 'player-visible',
			sharingTargets: [PLAYER_ACTOR.id],
		});
		state = accept(
			dispatchCommand(created.state, env, {
				type: 'scene.set-layout-policy',
				actorId: DM_ACTOR.id,
				payload: { sceneId: created.sceneId, layoutPolicy: 'flow' },
			}),
		);
		state = accept(
			dispatchCommand(state, env, {
				type: 'scene.set-pinned',
				actorId: DM_ACTOR.id,
				payload: { sceneId: created.sceneId, pinned: true },
			}),
		);

		const result = dispatchCommand(state, env, {
			type: 'scene.duplicate',
			actorId: DM_ACTOR.id,
			payload: { sceneId: created.sceneId, name: 'Shared board copy' },
		});
		const next = accept(result);
		const event = result.status === 'accepted' ? result.events[0] : undefined;
		if (!event || event.kind !== 'scene.duplicated') throw new Error('no duplicate event');
		const copy = next.scenes.scenes[event.newSceneId]!;

		// Creating a workspace never projects it to players (ADR-041).
		expect(copy.visibility).toBe('dm-only');
		expect(copy.sharingTargets).toEqual([]);
		expect(copy.playerViewAssignments).toEqual([]);
		expect(
			listScreensForActor(next.scenes, next.permissions, PLAYER_ACTOR.id).map((e) => e.id),
		).not.toContain(copy.id);

		expect(screenMetaOf(copy)).toEqual({
			pinned: false,
			pinOrder: null,
			layoutPolicy: 'flow',
			origin: {
				kind: 'duplicate',
				sourceSceneId: created.sceneId,
				defaultKey: null,
				at: copy.ownership.createdAt,
			},
		});
		expect(copy.ownership.revision).toBe(1);
	});

	it('refuses a player, an unknown scene and a deleted scene', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const created = createScene(state, env, { name: 'Alpha' });
		state = created.state;

		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.duplicate',
					actorId: PLAYER_ACTOR.id,
					payload: { sceneId: created.sceneId, name: 'Copy' },
				}),
			).code,
		).toBe('actor-not-authorized');
		expect(
			rejection(
				dispatchCommand(state, env, {
					type: 'scene.duplicate',
					actorId: DM_ACTOR.id,
					payload: { sceneId: 'scene-missing', name: 'Copy' },
				}),
			).code,
		).toBe('scene-not-found');

		const deleted = accept(
			dispatchCommand(state, env, {
				type: 'scene.delete',
				actorId: DM_ACTOR.id,
				payload: { sceneId: created.sceneId },
			}),
		);
		expect(
			rejection(
				dispatchCommand(deleted, env, {
					type: 'scene.duplicate',
					actorId: DM_ACTOR.id,
					payload: { sceneId: created.sceneId, name: 'Copy' },
				}),
			).code,
		).toBe('scene-not-found');
	});
});

// ── the read ────────────────────────────────────────────────────────────────────────────────────

describe('RC-CAN-7.2 isolation: listScreensForActor', () => {
	function vaultWithMixedVisibility() {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const ids: Record<string, SceneId> = {};
		for (const [key, payload] of [
			['dmOnly', { name: 'GM screen', visibility: 'dm-only' }],
			['shared', { name: 'Shared board', visibility: 'shared', sharingTargets: [PLAYER_ACTOR.id] }],
			['unshared', { name: 'Unshared board', visibility: 'shared' }],
			['playerVisible', { name: 'Table screen', visibility: 'player-visible' }],
			['template', { name: 'Prep template', visibility: 'player-visible', asTemplate: true }],
			['deleted', { name: 'Old screen', visibility: 'player-visible' }],
		] as const) {
			const created = createScene(state, env, payload as Record<string, unknown>);
			state = created.state;
			ids[key] = created.sceneId;
		}
		state = accept(
			dispatchCommand(state, env, {
				type: 'scene.delete',
				actorId: DM_ACTOR.id,
				payload: { sceneId: ids.deleted },
			}),
		);
		return { state, env, ids };
	}

	it('a player lists only the screens visible to them', () => {
		const { state, ids } = vaultWithMixedVisibility();
		const seen = listScreensForActor(state.scenes, state.permissions, PLAYER_ACTOR.id).map(
			(e) => e.id,
		);

		expect(seen).toEqual([ids.shared, ids.playerVisible].sort((a, b) => a!.localeCompare(b!)));
		expect(seen).not.toContain(ids.dmOnly);
		expect(seen).not.toContain(ids.unshared);
		expect(seen).not.toContain(ids.deleted);
		expect(seen).not.toContain(ids.template);
	});

	it('the DM lists every live screen except templates', () => {
		const { state, ids } = vaultWithMixedVisibility();
		const seen = listScreensForActor(state.scenes, state.permissions, DM_ACTOR.id).map((e) => e.id);

		expect(seen).toContain(ids.dmOnly);
		expect(seen).toContain(ids.unshared);
		expect(seen).not.toContain(ids.deleted);
		expect(seen).not.toContain(ids.template);
	});

	it('an actor the vault does not know lists nothing', () => {
		const { state } = vaultWithMixedVisibility();
		expect(listScreensForActor(state.scenes, state.permissions, 'actor-ghost')).toEqual([]);
	});

	it('a section-scoped player is told only how many widgets they are delivered', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const created = createScene(state, env, { name: 'Split board', visibility: 'shared' });
		state = created.state;

		const widgetIds: string[] = [];
		for (let i = 0; i < 3; i += 1) {
			state = accept(
				dispatchCommand(state, env, {
					type: 'scene.add-widget',
					actorId: DM_ACTOR.id,
					payload: {
						sceneId: created.sceneId,
						widget: {
							type: 'notes',
							version: '1.0.0',
							layout: { x: i * 100, y: 0, w: 80, h: 80 },
						},
					},
				}),
			);
			widgetIds.push(state.scenes.scenes[created.sceneId]!.widgets.at(-1)!.id);
		}
		state = accept(
			dispatchCommand(state, env, {
				type: 'scene.set-sections',
				actorId: DM_ACTOR.id,
				payload: {
					sceneId: created.sceneId,
					sections: [
						{
							id: 'section-player',
							name: 'Player',
							bounds: { x: 0, y: 0, w: 100, h: 100 },
							widgetInstanceIds: [widgetIds[0]!],
						},
						{
							id: 'section-gm',
							name: 'GM',
							bounds: { x: 100, y: 0, w: 200, h: 100 },
							widgetInstanceIds: [widgetIds[1]!, widgetIds[2]!],
						},
					],
				},
			}),
		);
		state = accept(
			dispatchCommand(state, env, {
				type: 'scene.update-metadata',
				actorId: DM_ACTOR.id,
				payload: {
					sceneId: created.sceneId,
					playerViewAssignments: [
						{ playerActorId: PLAYER_ACTOR.id, sectionIds: ['section-player'] },
					],
				},
			}),
		);

		const asPlayer = listScreensForActor(state.scenes, state.permissions, PLAYER_ACTOR.id);
		const asDm = listScreensForActor(state.scenes, state.permissions, DM_ACTOR.id);

		expect(asPlayer).toHaveLength(1);
		// The card must not tell the player how much the GM is withholding.
		expect(asPlayer[0]!.widgetCount).toBe(1);
		expect(asDm.find((e) => e.id === created.sceneId)!.widgetCount).toBe(3);
	});

	it('orders pinned screens by the GM order and the rest by name', () => {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR);
		const ids: SceneId[] = [];
		for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
			const created = createScene(state, env, { name });
			state = created.state;
			ids.push(created.sceneId);
		}
		// Pin Gamma then Beta, so the pin order disagrees with alphabetical order.
		for (const index of [2, 1]) {
			state = accept(
				dispatchCommand(state, env, {
					type: 'scene.set-pinned',
					actorId: DM_ACTOR.id,
					payload: { sceneId: ids[index]!, pinned: true },
				}),
			);
		}

		const listed = listScreensForActor(state.scenes, state.permissions, DM_ACTOR.id);
		expect(listed.map((e) => e.name)).toEqual(['Gamma', 'Beta', 'Alpha', 'Delta']);
		expect(listed.slice(0, 2).map((e) => e.pinOrder)).toEqual([0, 1]);
		expect(listPinnedScreensForActor(state.scenes, state.permissions, DM_ACTOR.id)).toHaveLength(2);
	});

	it('marks the home and live screens when the caller supplies those slices', () => {
		const { state, env, homeSceneId } = customisedHomeVault();
		const other = createScene(state, env, { name: 'Zulu' });

		const listed = listScreensForActor(other.state.scenes, other.state.permissions, DM_ACTOR.id, {
			commandCenter: other.state.commandCenter,
			session: { activeSceneId: other.sceneId },
		});
		const home = listed.find((e) => e.id === homeSceneId)!;
		const zulu = listed.find((e) => e.id === other.sceneId)!;

		expect(home.isHome).toBe(true);
		expect(home.isLive).toBe(false);
		expect(zulu.isHome).toBe(false);
		expect(zulu.isLive).toBe(true);
		// Without the slices nothing is claimed either way.
		const bare = listScreensForActor(other.state.scenes, other.state.permissions, DM_ACTOR.id);
		expect(bare.every((e) => !e.isHome && !e.isLive)).toBe(true);
	});
});
