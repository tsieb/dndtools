import { describe, expect, it } from 'vitest';
import {
	UNDOABLE_COMMAND_TYPES,
	canCancel,
	canRetry,
	canUndo,
	createCommandLifecycle,
	inverseCommandType,
	isUndoableCommandType,
	markCancelled,
	markFailure,
	markPending,
	markSuccess,
	markUndone,
	recoveryAction,
} from '../src/index';

describe('PLAT-018: command lifecycle state machine', () => {
	it('starts in draft with no committed operation', () => {
		const state = createCommandLifecycle('scene.add-widget');
		expect(state.status).toBe('draft');
		expect(state.operationIds).toEqual([]);
		expect(state.attempts).toBe(0);
	});

	it('moves draft -> pending -> success and records committed operations', () => {
		let state = createCommandLifecycle('scene.create');
		state = markPending(state);
		expect(state.status).toBe('pending');
		expect(state.attempts).toBe(1);
		state = markSuccess(state, ['op-1']);
		expect(state.status).toBe('success');
		expect(state.operationIds).toEqual(['op-1']);
		expect(state.error).toBeNull();
	});

	it('AC1: a failure clears pending, records no operation, and offers retry', () => {
		let state = markPending(createCommandLifecycle('scene.update-metadata'));
		state = markFailure(state, 'Durable write failed.');
		expect(state.status).toBe('failure');
		expect(state.operationIds).toEqual([]);
		expect(state.error).toBe('Durable write failed.');
		// No partial success: status is failure, never success.
		expect(state.status).not.toBe('success');
		expect(canRetry(state)).toBe(true);
		expect(recoveryAction(state)).toBe('retry');
	});

	it('AC1: retrying increments the attempt count and clears the prior error', () => {
		let state = markPending(createCommandLifecycle('scene.create'));
		state = markFailure(state, 'network down');
		state = markPending(state); // user hits retry
		expect(state.attempts).toBe(2);
		expect(state.error).toBeNull();
		expect(state.status).toBe('pending');
	});

	it('AC3: cancelling before commit appends no durable operation', () => {
		let state = markPending(createCommandLifecycle('scene.add-widget'));
		state = markCancelled(state);
		expect(state.status).toBe('cancelled');
		expect(state.operationIds).toEqual([]);
		expect(canCancel(state)).toBe(false);
	});

	it('cancel is available from draft/pending only', () => {
		const draft = createCommandLifecycle('scene.add-widget');
		expect(canCancel(draft)).toBe(true);
		expect(canCancel(markPending(draft))).toBe(true);
		const succeeded = markSuccess(markPending(draft), ['op-9']);
		expect(canCancel(succeeded)).toBe(false);
	});
});

describe('PLAT-018 AC2: undo only where the command contract supports it', () => {
	it('exposes undo for an undoable, committed command', () => {
		const state = markSuccess(markPending(createCommandLifecycle('scene.add-widget')), ['op-1']);
		expect(state.undoable).toBe(true);
		expect(canUndo(state)).toBe(true);
		expect(recoveryAction(state)).toBe('undo');
		expect(inverseCommandType('scene.add-widget')).toBe('scene.destroy-widget');
	});

	it('does NOT fabricate undo for append-only / transition commands', () => {
		for (const type of [
			'session.record-dice',
			'session.set-workflow',
			'combat.advance-turn',
			'scene.set-sections',
		] as const) {
			expect(isUndoableCommandType(type)).toBe(false);
			const state = markSuccess(markPending(createCommandLifecycle(type)), ['op-x']);
			expect(canUndo(state)).toBe(false);
			expect(recoveryAction(state)).toBe('none');
			expect(inverseCommandType(type)).toBeNull();
		}
	});

	it('every undoable mapping points at a real inverse command type', () => {
		const knownTypes = new Set([
			'scene.add-widget',
			'scene.destroy-widget',
			'session.project-player-view',
			'session.revoke-player-view',
			'widget.package.install',
			'widget.package.remove',
			'widget.package.enable',
			'widget.package.disable',
			// MAP-003: a paint edit's inverse is the same set-content command (before/after swapped).
			'map.edit-layer',
			// CONTENT-001: a soft-delete's inverse is restoring the same item.
			'content.remove-item',
			'content.restore-item',
		]);
		for (const [forward, inverse] of Object.entries(UNDOABLE_COMMAND_TYPES)) {
			expect(knownTypes.has(forward)).toBe(true);
			expect(knownTypes.has(inverse as string)).toBe(true);
		}
	});

	it('enable/disable package are mutual inverses', () => {
		expect(inverseCommandType('widget.package.enable')).toBe('widget.package.disable');
		expect(inverseCommandType('widget.package.disable')).toBe('widget.package.enable');
	});

	it('MAP-003: a paint edit is undoable and its inverse is the same set-content command type', () => {
		expect(isUndoableCommandType('map.edit-layer')).toBe(true);
		expect(inverseCommandType('map.edit-layer')).toBe('map.edit-layer');
		const state = markSuccess(markPending(createCommandLifecycle('map.edit-layer')), ['op-edit']);
		expect(canUndo(state)).toBe(true);
		expect(recoveryAction(state)).toBe('undo');
	});

	it('cannot undo before commit (no operation ids)', () => {
		const state = markPending(createCommandLifecycle('scene.add-widget'));
		expect(canUndo(state)).toBe(false);
	});

	it('marks a successful command as undone', () => {
		let state = markSuccess(markPending(createCommandLifecycle('scene.add-widget')), ['op-1']);
		state = markUndone(state);
		expect(state.status).toBe('undone');
		expect(canUndo(state)).toBe(false);
	});
});
