import { describe, expect, it } from 'vitest';
import { ScrollRestorationStore } from '../../src/lib/platform/scroll-restoration';

// UX-NAV-012 — the scroll-position store the shell uses to restore scroll on browser back/forward.

const pos = (y: number) => ({ x: 0, y, main: y });

describe('UX-NAV-012 ScrollRestorationStore', () => {
	it('records and reads a position per page key (non-consuming peek)', () => {
		const store = new ScrollRestorationStore();
		store.save('/atlas/', pos(420));
		expect(store.has('/atlas/')).toBe(true);
		// AC2: a forward-then-back to the same page must restore the SAME offset, so peek does
		// not consume the entry.
		expect(store.peek('/atlas/')).toEqual(pos(420));
		expect(store.peek('/atlas/')).toEqual(pos(420));
	});

	it('returns undefined for an unknown page and ignores an empty key', () => {
		const store = new ScrollRestorationStore();
		expect(store.peek('/never/')).toBeUndefined();
		store.save('', pos(10));
		expect(store.size).toBe(0);
	});

	it('refreshes recency when a key is re-saved', () => {
		const store = new ScrollRestorationStore(2);
		store.save('/a/', pos(1));
		store.save('/b/', pos(2));
		store.save('/a/', pos(3)); // re-save /a/ → it is now the most recent
		store.save('/c/', pos(4)); // evicts the oldest (/b/), not /a/
		expect(store.has('/a/')).toBe(true);
		expect(store.has('/b/')).toBe(false);
		expect(store.peek('/a/')).toEqual(pos(3));
	});

	it('stays bounded by evicting the oldest entry past the cap', () => {
		const store = new ScrollRestorationStore(3);
		for (let i = 0; i < 10; i += 1) store.save(`/p${i}/`, pos(i));
		expect(store.size).toBe(3);
		expect(store.has('/p9/')).toBe(true);
		expect(store.has('/p0/')).toBe(false);
	});
});
