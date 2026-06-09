import { describe, expect, it } from 'vitest';
import {
	previewBannerText,
	previewEnterAnnouncement,
	previewViewer,
	previewVisible,
} from '../../src/lib/gui/ux-canvas/player-view-preview';
import type { VisibilityClassification } from '../../src/lib/gui/a11y/visibility-boundary';

// UX-CANVAS-011: the player-view preview overlay reuses the SAME visibility boundary the real player
// canvas uses, so it can never reveal a dm-only widget — and it never previews "as DM".

const WIDGETS: VisibilityClassification[] = [
	{ visibility: 'player-visible' },
	{ visibility: 'dm-only' },
	{ visibility: 'shared', sharedWith: ['actor-player'] },
	{ visibility: 'shared', sharedWith: ['actor-other'] },
];

describe('previewViewer', () => {
	it('builds a non-DM viewer and fails closed to observer for a DM role', () => {
		expect(previewViewer('actor-player', 'player')).toEqual({ role: 'player', actorId: 'actor-player' });
		expect(previewViewer('actor-x', 'dm').role).toBe('observer');
	});
});

describe('previewVisible (no-leak)', () => {
	it('hides dm-only widgets and only shows shared widgets delivered to the previewed player', () => {
		const viewer = previewViewer('actor-player', 'player');
		const visible = previewVisible(WIDGETS, viewer);
		// player-visible + shared-with-actor-player, but NOT dm-only and NOT shared-with-someone-else.
		expect(visible).toEqual([
			{ visibility: 'player-visible' },
			{ visibility: 'shared', sharedWith: ['actor-player'] },
		]);
	});
});

describe('preview copy', () => {
	it('names the previewed player in the banner and the enter announcement', () => {
		expect(previewBannerText('Mira')).toContain('Mira');
		expect(previewBannerText('Mira')).toContain('PLAYER VIEW PREVIEW');
		expect(previewEnterAnnouncement('Mira')).toContain('Mira');
	});
});
