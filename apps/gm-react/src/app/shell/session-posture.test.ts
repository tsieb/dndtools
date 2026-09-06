import { describe, expect, it } from 'vitest';
import type { CoreStateSlice } from '@dndtools/core';
import { formatElapsed, sessionLiveSinceAt } from './session-posture';

/* RC-SES-1.1 — the shell's live posture and its clock. The interesting cases are all about NOT
 * lying: an idle session has no clock, a live session whose start instant was never recorded shows
 * no clock rather than a made-up one, and a re-started session reads the LATEST start, not the first. */

function op(id: string, opType: string, value: unknown, issuedAt: string) {
	return {
		id,
		vaultId: 'v',
		sourceId: 's',
		actorId: 'dm-1',
		entityType: 'session',
		entityId: 'session',
		opType,
		value,
		dependencies: [],
		issuedAt,
		schemaVersion: 1,
	};
}

function state(workflow: string, operations: ReturnType<typeof op>[]): CoreStateSlice {
	return {
		session: { workflow },
		sync: { operations },
	} as unknown as CoreStateSlice;
}

describe('sessionLiveSinceAt', () => {
	it('returns null when the workflow is not active', () => {
		const ops = [op('1', 'session.set-workflow', { to: 'active' }, '2026-01-01T10:00:00.000Z')];
		expect(sessionLiveSinceAt(state('idle', ops))).toBeNull();
		expect(sessionLiveSinceAt(state('paused', ops))).toBeNull();
	});

	it('reads the instant off the last set-workflow operation that went active', () => {
		const ops = [
			op('1', 'session.set-workflow', { to: 'active' }, '2026-01-01T10:00:00.000Z'),
			op('2', 'session.set-workflow', { to: 'idle' }, '2026-01-01T12:00:00.000Z'),
			op('3', 'session.set-workflow', { to: 'active' }, '2026-01-01T20:30:00.000Z'),
			op('4', 'dice.roll', { to: 'active' }, '2026-01-01T20:31:00.000Z'),
		];
		expect(sessionLiveSinceAt(state('active', ops))).toBe('2026-01-01T20:30:00.000Z');
	});

	it('reports no start instant when the log carries none, rather than inventing one', () => {
		expect(sessionLiveSinceAt(state('active', []))).toBeNull();
		const other = [op('1', 'session.set-workflow', { to: 'prep' }, '2026-01-01T10:00:00.000Z')];
		expect(sessionLiveSinceAt(state('active', other))).toBeNull();
	});
});

describe('formatElapsed', () => {
	it('pads to mm:ss under an hour', () => {
		expect(formatElapsed(0)).toBe('00:00');
		expect(formatElapsed(72_000)).toBe('01:12');
		expect(formatElapsed(59_999)).toBe('00:59');
		expect(formatElapsed(3_599_000)).toBe('59:59');
	});

	it('grows an hours field past an hour', () => {
		expect(formatElapsed(3_600_000)).toBe('1:00:00');
		expect(formatElapsed(7_384_000)).toBe('2:03:04');
	});

	it('clamps a device clock that runs behind the recorded start', () => {
		expect(formatElapsed(-5_000)).toBe('00:00');
	});
});
