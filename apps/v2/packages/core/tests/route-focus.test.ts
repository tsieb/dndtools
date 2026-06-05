import { describe, expect, it } from 'vitest';
import { resolveRouteFocus } from '../src/index';

/**
 * NAV-004 — navigation focus restoration. A URL with a heading hash keeps the heading
 * scroll target active instead of unconditionally focusing the route landmark (AC1); a
 * normal transition without a hash focuses the landmark and announces the route (AC2).
 */

describe('NAV-004 AC1 a heading hash keeps the heading target active', () => {
	it('selects the heading-anchor target for a URL with a heading hash', () => {
		const focus = resolveRouteFocus({ hash: '#overview', isNavigation: true });
		expect(focus.kind).toBe('heading-anchor');
		if (focus.kind === 'heading-anchor') {
			expect(focus.anchorId).toBe('overview');
			// The within-page jump does not re-announce the route landmark.
			expect(focus.announceRoute).toBe(false);
		}
	});

	it('does not unconditionally focus the landmark when a hash is present', () => {
		const focus = resolveRouteFocus({ hash: '#section-2' });
		expect(focus.kind).not.toBe('route-landmark');
	});

	it('decodes a percent-encoded hash anchor', () => {
		const focus = resolveRouteFocus({ hash: '#caf%C3%A9' });
		expect(focus.kind).toBe('heading-anchor');
		if (focus.kind === 'heading-anchor') expect(focus.anchorId).toBe('café');
	});

	it('treats an empty or top-only hash as no heading anchor', () => {
		expect(resolveRouteFocus({ hash: '#' }).kind).toBe('route-landmark');
		expect(resolveRouteFocus({ hash: '#top' }).kind).toBe('route-landmark');
		expect(resolveRouteFocus({ hash: '' }).kind).toBe('route-landmark');
	});
});

describe('NAV-004 AC2 a normal transition focuses the landmark and announces', () => {
	it('selects the route-landmark target and announces the route with no hash', () => {
		const focus = resolveRouteFocus({ isNavigation: true });
		expect(focus.kind).toBe('route-landmark');
		expect(focus.announceRoute).toBe(true);
	});

	it('defaults to a route transition when called bare', () => {
		const focus = resolveRouteFocus();
		expect(focus).toEqual({ kind: 'route-landmark', announceRoute: true });
	});
});
