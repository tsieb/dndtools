import { describe, expect, it } from 'vitest';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildPermissionState } from '../src/testing';
import {
	resolveSessionPrivacy,
	PURGE_FAILED_ADVISORY,
	PURGE_UNCONFIRMED_ADVISORY,
	SESSION_PRIVACY_EMPTY_STATE,
	SESSION_PRIVACY_WINDOW_MS,
	type DepartedParticipantRecord,
} from '../src';

/**
 * UX-PERM-008 — cache purge + session privacy status (DM view): DM-only default-deny, the three
 * coarse purge outcomes with their advisory copy (and never a device secret), the 24 h
 * display-then-archive window, and the all-clear empty state.
 */

const NOW = '2026-06-10T12:00:00.000Z';
const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

function departed(overrides: Partial<DepartedParticipantRecord>): DepartedParticipantRecord {
	return {
		actorId: PLAYER_ACTOR.id,
		displayName: 'Test Player',
		departedAt: '2026-06-10T10:00:00.000Z',
		outcome: 'purge-unconfirmed',
		...overrides,
	};
}

describe('UX-PERM-008 resolveSessionPrivacy', () => {
	it('is DM-only default-deny: null for player, observer, and unknown actors', () => {
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id, 'actor-nobody']) {
			expect(resolveSessionPrivacy(permissions, actorId, [departed({})], NOW)).toBeNull();
		}
	});

	it('renders the unconfirmed row with the advisory copy and NO device-level data (AC1)', () => {
		const view = resolveSessionPrivacy(permissions, DM_ACTOR.id, [departed({})], NOW);
		expect(view?.rows).toHaveLength(1);
		const row = view?.rows[0];
		expect(row).toMatchObject({
			status: 'purge-unconfirmed',
			statusLabel: 'Purge unconfirmed',
			tone: 'warning',
			advisory: PURGE_UNCONFIRMED_ADVISORY,
			reviewGrants: false,
		});
		// The row type carries ONLY id/name/status/copy — assert no extra (device) fields exist.
		expect(Object.keys(row ?? {}).sort()).toEqual([
			'actorId',
			'advisory',
			'displayName',
			'reviewGrants',
			'status',
			'statusLabel',
			'tone',
		]);
		expect(view?.allClear).toBe(false);
	});

	it('renders failed rows critically with the revoke-grants advisory + remediation link', () => {
		const view = resolveSessionPrivacy(
			permissions,
			DM_ACTOR.id,
			[departed({ outcome: 'purge-failed' })],
			NOW,
		);
		expect(view?.rows[0]).toMatchObject({
			statusLabel: 'Purge failed',
			tone: 'critical',
			advisory: PURGE_FAILED_ADVISORY,
			reviewGrants: true,
		});
	});

	it('shows the empty-state copy when every departed participant is confirmed purged (AC2)', () => {
		const view = resolveSessionPrivacy(
			permissions,
			DM_ACTOR.id,
			[departed({ outcome: 'purged' })],
			NOW,
		);
		expect(view?.allClear).toBe(true);
		expect(view?.emptyStateMessage).toBe(SESSION_PRIVACY_EMPTY_STATE);
		// No departures at all is also all-clear.
		expect(resolveSessionPrivacy(permissions, DM_ACTOR.id, [], NOW)?.allClear).toBe(true);
	});

	it('archives rows older than the 24 h window (auto-clear) and keeps newer ones', () => {
		const justInside = new Date(Date.parse(NOW) - SESSION_PRIVACY_WINDOW_MS + 60_000);
		const justOutside = new Date(Date.parse(NOW) - SESSION_PRIVACY_WINDOW_MS - 60_000);
		const view = resolveSessionPrivacy(
			permissions,
			DM_ACTOR.id,
			[
				departed({ actorId: 'actor-old', departedAt: justOutside.toISOString() }),
				departed({ actorId: 'actor-new', departedAt: justInside.toISOString() }),
			],
			NOW,
		);
		expect(view?.rows.map((row) => row.actorId)).toEqual(['actor-new']);
		expect(view?.archivedCount).toBe(1);
	});

	it('keeps a row with an unparseable departure time visible (fail closed on bad clocks)', () => {
		const view = resolveSessionPrivacy(
			permissions,
			DM_ACTOR.id,
			[departed({ departedAt: 'not-a-date' })],
			NOW,
		);
		expect(view?.rows).toHaveLength(1);
	});

	it('anonymizes a sealed participant record (no display name)', () => {
		const view = resolveSessionPrivacy(
			permissions,
			DM_ACTOR.id,
			[departed({ displayName: '' })],
			NOW,
		);
		expect(view?.rows[0]?.displayName).toBe('Departed participant');
	});

	it('sorts rows most-recent departure first', () => {
		const view = resolveSessionPrivacy(
			permissions,
			DM_ACTOR.id,
			[
				departed({ actorId: 'actor-earlier', departedAt: '2026-06-10T08:00:00.000Z' }),
				departed({ actorId: 'actor-later', departedAt: '2026-06-10T11:00:00.000Z' }),
			],
			NOW,
		);
		expect(view?.rows.map((row) => row.actorId)).toEqual(['actor-later', 'actor-earlier']);
	});
});
