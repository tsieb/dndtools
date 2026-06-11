import { describe, expect, it } from 'vitest';
import {
	isAccessibleAuthMethod,
	SessionEntryCache,
} from '../../src/lib/gui/a11y/redundant-entry';

// UX-A11Y-015 (WCAG 3.3.7 / 3.3.8): do not re-request entered info; never require a cognitive test
// as the only authentication path.

describe('SessionEntryCache — redundant entry (3.3.7)', () => {
	it('pre-fills a later field with the value entered earlier this session (AC1)', () => {
		const cache = new SessionEntryCache();
		cache.remember('displayName', 'Aria');
		// A subsequent form requesting the display name pre-fills from the earlier entry.
		expect(cache.prefill('displayName')).toBe('Aria');
		expect(cache.has('displayName')).toBe(true);
	});

	it('keeps a non-empty current value over the remembered one (still editable)', () => {
		const cache = new SessionEntryCache();
		cache.remember('displayName', 'Aria');
		expect(cache.prefill('displayName', 'Bram')).toBe('Bram');
	});

	it('returns empty for fields never entered, and an empty value clears the memory', () => {
		const cache = new SessionEntryCache();
		expect(cache.prefill('campaign')).toBe('');
		cache.remember('campaign', 'Hollow Reach');
		cache.remember('campaign', '   ');
		expect(cache.has('campaign')).toBe(false);
	});

	it('clear() forgets everything (e.g. ending the session)', () => {
		const cache = new SessionEntryCache();
		cache.remember('displayName', 'Aria');
		cache.clear();
		expect(cache.recall('displayName')).toBeUndefined();
	});
});

describe('isAccessibleAuthMethod — accessible authentication (3.3.8)', () => {
	it('is accessible when no auth step exists (local-first exemption)', () => {
		expect(isAccessibleAuthMethod([])).toBe(true);
	});

	it('is accessible when a non-cognitive path exists (link / passkey / audio)', () => {
		expect(isAccessibleAuthMethod(['link'])).toBe(true);
		expect(isAccessibleAuthMethod(['image-captcha', 'audio-captcha'])).toBe(true);
		expect(isAccessibleAuthMethod(['passkey'])).toBe(true);
	});

	it('fails when only a cognitive-function test is offered (AC2)', () => {
		expect(isAccessibleAuthMethod(['image-captcha'])).toBe(false);
		expect(isAccessibleAuthMethod(['recognize-objects'])).toBe(false);
	});
});
