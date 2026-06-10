import { describe, expect, it } from 'vitest';
import {
	SYNC_DEBOUNCE_MS,
	saveStateAnnouncement,
	sessionStatusAnnouncement,
	shouldAnnounceSyncChange,
	syncStatusAnnouncement,
	syncStatusKey,
} from '../src/state/live-announcements';

/**
 * A11Y-006 — LIVE ANNOUNCER POLICY unit tests.
 *
 * AC1: a successful note save emits a CONCISE live announcement.
 * AC2: rapidly-repeated sync-state transitions are DEBOUNCED / de-duplicated.
 */

// ---------------------------------------------------------------------------
// saveStateAnnouncement (AC1)
// ---------------------------------------------------------------------------

describe('A11Y-006 AC1 saveStateAnnouncement', () => {
	it('returns "Note saved." for success so the screen reader confirms the write', () => {
		expect(saveStateAnnouncement('success')).toBe('Note saved.');
	});

	it('returns "Saving note…" for pending so the user knows a write is in flight', () => {
		expect(saveStateAnnouncement('pending')).toBe('Saving note…');
	});

	it('returns empty string for failure (role="alert" handles that inline)', () => {
		expect(saveStateAnnouncement('failure')).toBe('');
	});

	it('returns empty string for idle / draft / cancelled / undone (no audible information)', () => {
		// 'idle' is the value derived in the GUI from a non-matching lifecycle; we accept the union
		// type 'draft' | 'cancelled' | 'undone' from CommandLifecycleStatus too.
		expect(saveStateAnnouncement('draft')).toBe('');
		expect(saveStateAnnouncement('cancelled')).toBe('');
		expect(saveStateAnnouncement('undone')).toBe('');
	});

	it('is concise: success text is ≤ 20 characters', () => {
		expect(saveStateAnnouncement('success').length).toBeLessThanOrEqual(20);
	});
});

// ---------------------------------------------------------------------------
// syncStatusKey (AC2 — deduplication key)
// ---------------------------------------------------------------------------

describe('A11Y-006 AC2 syncStatusKey', () => {
	it('produces the same key for the same (health, online, pending) triple', () => {
		const a = syncStatusKey('healthy', true, 0);
		const b = syncStatusKey('healthy', true, 0);
		expect(a).toBe(b);
	});

	it('produces different keys for different health levels', () => {
		expect(syncStatusKey('healthy', true, 0)).not.toBe(syncStatusKey('degraded', true, 0));
		expect(syncStatusKey('healthy', true, 0)).not.toBe(syncStatusKey('unhealthy', true, 0));
	});

	it('produces different keys for online vs offline', () => {
		expect(syncStatusKey('healthy', true, 0)).not.toBe(syncStatusKey('healthy', false, 0));
	});

	it('buckets pending counts so minor fluctuations do not trigger new announcements', () => {
		// 1 and 5 are both 'few' — same key.
		expect(syncStatusKey('healthy', true, 1)).toBe(syncStatusKey('healthy', true, 5));
		// 0 is 'none' — distinct from 'few'.
		expect(syncStatusKey('healthy', true, 0)).not.toBe(syncStatusKey('healthy', true, 1));
		// 6 and 10 are both 'many' — same key.
		expect(syncStatusKey('healthy', true, 6)).toBe(syncStatusKey('healthy', true, 10));
		// 5 ('few') ≠ 6 ('many').
		expect(syncStatusKey('healthy', true, 5)).not.toBe(syncStatusKey('healthy', true, 6));
	});
});

// ---------------------------------------------------------------------------
// shouldAnnounceSyncChange (AC2 — debounce gate)
// ---------------------------------------------------------------------------

describe('A11Y-006 AC2 shouldAnnounceSyncChange', () => {
	const now = 1_700_000_000_000;

	it('returns true when the key is new (prevKey = null)', () => {
		const key = syncStatusKey('healthy', true, 0);
		expect(shouldAnnounceSyncChange(null, key, 0, now)).toBe(true);
	});

	it('returns true when the key changes (different state)', () => {
		const prev = syncStatusKey('healthy', true, 0);
		const next = syncStatusKey('degraded', true, 2);
		expect(shouldAnnounceSyncChange(prev, next, now, now)).toBe(true);
	});

	it('returns false when key is the same and within the debounce window', () => {
		const key = syncStatusKey('healthy', true, 0);
		const lastMs = now - (SYNC_DEBOUNCE_MS - 500); // 500 ms before window expires
		expect(shouldAnnounceSyncChange(key, key, lastMs, now)).toBe(false);
	});

	it('returns true when key is the same but the debounce window has elapsed', () => {
		const key = syncStatusKey('healthy', true, 0);
		const lastMs = now - SYNC_DEBOUNCE_MS; // exactly at window boundary → allowed
		expect(shouldAnnounceSyncChange(key, key, lastMs, now)).toBe(true);
	});

	it('returns true when key is the same and far past the window', () => {
		const key = syncStatusKey('healthy', true, 0);
		const lastMs = now - SYNC_DEBOUNCE_MS * 3;
		expect(shouldAnnounceSyncChange(key, key, lastMs, now)).toBe(true);
	});

	it('suppresses 10 rapid identical-key events within the window (AC2)', () => {
		const key = syncStatusKey('healthy', true, 0);
		// First announcement goes through.
		expect(shouldAnnounceSyncChange(null, key, 0, now)).toBe(true);
		// Subsequent rapid events (all within the debounce window) are suppressed.
		const rapidTick = now + 100;
		for (let i = 0; i < 10; i++) {
			expect(shouldAnnounceSyncChange(key, key, now, rapidTick + i * 10)).toBe(false);
		}
	});

	it('respects a custom debounceMs argument', () => {
		const key = syncStatusKey('healthy', true, 0);
		// With a 500 ms window: 300 ms ago is still inside → suppress.
		expect(shouldAnnounceSyncChange(key, key, now - 300, now, 500)).toBe(false);
		// 600 ms ago is outside → allow.
		expect(shouldAnnounceSyncChange(key, key, now - 600, now, 500)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// syncStatusAnnouncement
// ---------------------------------------------------------------------------

describe('A11Y-006 syncStatusAnnouncement', () => {
	it('returns a concise up-to-date message when healthy and no pending ops', () => {
		const text = syncStatusAnnouncement('healthy', true, 0);
		expect(text).toMatch(/up to date/i);
	});

	it('includes pending count when there are pending operations', () => {
		const text = syncStatusAnnouncement('healthy', true, 3);
		expect(text).toMatch(/3/);
		expect(text).toMatch(/pending/i);
	});

	it('mentions degraded when health is degraded', () => {
		const text = syncStatusAnnouncement('degraded', true, 0);
		expect(text).toMatch(/degraded/i);
	});

	it('mentions unhealthy when health is unhealthy', () => {
		const text = syncStatusAnnouncement('unhealthy', false, 1);
		expect(text).toMatch(/unhealthy/i);
	});

	it('mentions offline when not connected', () => {
		const text = syncStatusAnnouncement('healthy', false, 0);
		expect(text).toMatch(/offline/i);
	});

	it('uses singular "change" for exactly 1 pending op', () => {
		const text = syncStatusAnnouncement('healthy', true, 1);
		expect(text).toMatch(/1 change pending/i);
	});

	it('uses plural "changes" for 2+ pending ops', () => {
		const text = syncStatusAnnouncement('healthy', true, 2);
		expect(text).toMatch(/2 changes pending/i);
	});
});

// ---------------------------------------------------------------------------
// sessionStatusAnnouncement
// ---------------------------------------------------------------------------

describe('A11Y-006 sessionStatusAnnouncement', () => {
	it('returns empty string for nominal live + not stale (no announcement needed)', () => {
		expect(sessionStatusAnnouncement('live', false)).toBe('');
	});

	it('returns a non-empty string when stale', () => {
		const text = sessionStatusAnnouncement('live', true);
		expect(text.length).toBeGreaterThan(0);
		expect(text).toMatch(/out of date|stale/i);
	});

	it('returns a non-empty string for a non-live status even when not stale', () => {
		expect(sessionStatusAnnouncement('reconnecting', false).length).toBeGreaterThan(0);
	});

	it('includes the status string when announcing a non-live state', () => {
		expect(sessionStatusAnnouncement('reconnecting', false)).toMatch(/reconnecting/i);
	});
});
