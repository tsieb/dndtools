import { beforeEach, describe, expect, it } from 'vitest';
import { resetCoreStorage } from '../../src/lib/platform/storage/scene-store';
import { SceneRuntime, defaultEnvironment } from '../../src/lib/canvas-runtime/runtime.svelte';
import {
	PREVIEW_PLAYER_ACTOR_ID,
	PREVIEW_OBSERVER_ACTOR_ID,
	PREVIEW_READONLY_MESSAGE,
} from '@dndtools/core';

/**
 * UX-PERM-006 — the GUI runtime side of preview mode: while previewing, (a) the WHOLE shell
 * renders as the previewed actor (activeActorId swaps; the reserved zero-grant actors exist in the
 * permission view), and (b) EVERY durable command is rejected read-only at the single dispatch
 * choke point — all GUI writes flow through `runtime.dispatch` (Contract 1), so write controls in
 * routes, panels, and modal dialogs alike are inert by construction (AC1/AC4). Exit restores the
 * DM's own view synchronously (AC2).
 */

describe('UX-PERM-006 SceneRuntime preview mode', () => {
	let runtime: SceneRuntime;

	beforeEach(async () => {
		await resetCoreStorage();
		runtime = new SceneRuntime({ env: defaultEnvironment(), defaultActorId: 'local-dm' });
		await runtime.load();
	});

	it('enterPreview (generic player) swaps the active actor to the reserved zero-grant player', () => {
		expect(runtime.preview).toBeNull();
		runtime.enterPreview({ role: 'player' });
		expect(runtime.preview).toMatchObject({ role: 'player', specific: false });
		expect(runtime.activeActorId).toBe(PREVIEW_PLAYER_ACTOR_ID);
		// The permission view the queries consume contains the reserved actor…
		expect(runtime.state.permissions.actors[PREVIEW_PLAYER_ACTOR_ID]?.role).toBe('player');
		// …but the "view as" actor list (real session actors) never offers it.
		expect(runtime.actors.some((actor) => actor.id === PREVIEW_PLAYER_ACTOR_ID)).toBe(false);
	});

	it('enterPreview (observer / specific player) resolves through the core fail-closed rules', () => {
		runtime.enterPreview({ role: 'observer' });
		expect(runtime.activeActorId).toBe(PREVIEW_OBSERVER_ACTOR_ID);
		runtime.exitPreview();
		// Specific demo player: exact id is emulated (AC3).
		runtime.enterPreview({ role: 'player', playerActorId: 'actor-player' });
		expect(runtime.activeActorId).toBe('actor-player');
		expect(runtime.preview).toMatchObject({ specific: true, label: 'Demo Player (Player)' });
		runtime.exitPreview();
		// Unknown specific id collapses to the generic zero-grant player (fail closed).
		runtime.enterPreview({ role: 'player', playerActorId: 'actor-nobody' });
		expect(runtime.activeActorId).toBe(PREVIEW_PLAYER_ACTOR_ID);
	});

	it('rejects EVERY dispatched command read-only while previewing (AC1/AC4 choke point)', async () => {
		runtime.enterPreview({ role: 'player' });
		const result = await runtime.dispatch({
			type: 'content.create-item',
			actorId: runtime.activeActorId,
			payload: { kind: 'note', title: 'Should not exist', body: '', visibility: 'dm-only' },
		});
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(result.rejection.message).toBe(PREVIEW_READONLY_MESSAGE);
		}
		expect(runtime.lastError).toBe(PREVIEW_READONLY_MESSAGE);
		// Nothing was written: the note does not exist after exiting preview.
		runtime.exitPreview();
		expect(
			Object.values(runtime.state.content.items).some(
				(item) => item.title === 'Should not exist',
			),
		).toBe(false);
	});

	it('exitPreview restores the DM view synchronously and re-enables writes (AC2)', async () => {
		runtime.enterPreview({ role: 'player' });
		runtime.exitPreview();
		expect(runtime.preview).toBeNull();
		expect(runtime.activeActorId).toBe('local-dm');
		// The reserved preview actor is gone from the permission view (raw state was never touched).
		expect(runtime.state.permissions.actors[PREVIEW_PLAYER_ACTOR_ID]).toBeUndefined();
		const result = await runtime.dispatch({
			type: 'content.create-item',
			actorId: runtime.activeActorId,
			payload: { kind: 'note', title: 'After exit', body: '', visibility: 'dm-only' },
		});
		expect(result.status).toBe('accepted');
	});

	it('only a DM can start a preview (fail closed for player/observer view-as)', () => {
		runtime.setActiveActor('actor-player');
		runtime.enterPreview({ role: 'observer' });
		expect(runtime.preview).toBeNull();
		expect(runtime.activeActorId).toBe('actor-player');
	});
});
