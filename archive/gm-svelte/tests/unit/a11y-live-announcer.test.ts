import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveAnnouncer } from '../../src/lib/gui/a11y/live-announcer.svelte';

// UX-A11Y §6.2: one announcer writes the polite + assertive regions. Politeness is enforced here;
// identical text is re-announced; assertive auto-clears so stale urgent text is not re-read.

describe('LiveAnnouncer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('writes polite messages to the polite region by default', () => {
		const a = new LiveAnnouncer();
		a.announce('Scene saved');
		expect(a.polite).toBe('Scene saved');
		expect(a.assertive).toBe('');
	});

	it('ignores empty/whitespace messages', () => {
		const a = new LiveAnnouncer();
		a.announce('   ');
		expect(a.polite).toBe('');
	});

	it('re-announces identical polite text by blanking then re-setting (so the region fires again)', () => {
		const a = new LiveAnnouncer();
		a.announce('Turn advanced');
		expect(a.polite).toBe('Turn advanced');
		a.announce('Turn advanced');
		expect(a.polite).toBe(''); // blanked first
		vi.advanceTimersByTime(1);
		expect(a.polite).toBe('Turn advanced'); // re-set on the next tick
	});

	it('routes assertive messages and clears them after the timeout (AP-4 reserve)', () => {
		const a = new LiveAnnouncer();
		a.announce('Character incapacitated', 'assertive');
		expect(a.assertive).toBe('Character incapacitated');
		vi.advanceTimersByTime(3000);
		expect(a.assertive).toBe('');
	});

	it('reset() clears both regions', () => {
		const a = new LiveAnnouncer();
		a.announce('hi');
		a.announce('urgent', 'assertive');
		a.reset();
		expect(a.polite).toBe('');
		expect(a.assertive).toBe('');
	});
});
