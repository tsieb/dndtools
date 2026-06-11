import { describe, expect, it } from 'vitest';
import {
	accessibleNameForViewer,
	assertNoLeak,
	DEFAULT_VISIBILITY,
	filterVisibleForViewer,
	findLeakedTerms,
	hiddenCountForViewer,
	isVisibleToViewer,
	normalizeVisibility,
	type Viewer,
	type VisibilityClassification,
} from '../../src/lib/gui/a11y/visibility-boundary';

// UX-A11Y-008: the NO-LEAK contract. DM-only content must never reach a player/observer ARIA channel.
// These tests prove the boundary fails closed and that the negative guard would CATCH a leak.

const dm: Viewer = { role: 'dm', actorId: 'actor-dm' };
const player: Viewer = { role: 'player', actorId: 'actor-player' };
const observer: Viewer = { role: 'observer', actorId: 'actor-observer' };

const playerVisible: VisibilityClassification = { visibility: 'player-visible' };
const dmOnly: VisibilityClassification = { visibility: 'dm-only' };
const sharedToPlayer: VisibilityClassification = {
	visibility: 'shared',
	sharedWith: ['actor-player'],
};

describe('visibility boundary — normalizeVisibility (fail closed)', () => {
	it('passes through the three known levels', () => {
		expect(normalizeVisibility('player-visible')).toBe('player-visible');
		expect(normalizeVisibility('shared')).toBe('shared');
		expect(normalizeVisibility('dm-only')).toBe('dm-only');
	});

	it('collapses absent/unknown/malformed values to dm-only (least visible)', () => {
		expect(normalizeVisibility(undefined)).toBe(DEFAULT_VISIBILITY);
		expect(normalizeVisibility(null)).toBe('dm-only');
		expect(normalizeVisibility('public')).toBe('dm-only');
		expect(normalizeVisibility(42)).toBe('dm-only');
		expect(normalizeVisibility({ visibility: 'player-visible' })).toBe('dm-only');
	});
});

describe('visibility boundary — isVisibleToViewer', () => {
	it('shows the DM everything', () => {
		expect(isVisibleToViewer(dmOnly, dm)).toBe(true);
		expect(isVisibleToViewer(playerVisible, dm)).toBe(true);
		expect(isVisibleToViewer({ visibility: 'shared' }, dm)).toBe(true);
	});

	it('never shows dm-only to a player or observer', () => {
		expect(isVisibleToViewer(dmOnly, player)).toBe(false);
		expect(isVisibleToViewer(dmOnly, observer)).toBe(false);
	});

	it('shows player-visible to every non-DM', () => {
		expect(isVisibleToViewer(playerVisible, player)).toBe(true);
		expect(isVisibleToViewer(playerVisible, observer)).toBe(true);
	});

	it('shows shared only to the actor it is delivered to', () => {
		expect(isVisibleToViewer(sharedToPlayer, player)).toBe(true);
		expect(isVisibleToViewer(sharedToPlayer, observer)).toBe(false);
		// shared with nobody is hidden, exactly like dm-only
		expect(isVisibleToViewer({ visibility: 'shared' }, player)).toBe(false);
	});

	it('fails closed on absent/unknown visibility for a non-DM', () => {
		expect(isVisibleToViewer({ visibility: 'mystery' as never }, player)).toBe(false);
	});
});

describe('visibility boundary — filterVisibleForViewer', () => {
	const items = [
		{ id: 'a', visibility: 'player-visible' as const },
		{ id: 'b', visibility: 'dm-only' as const },
		{ id: 'c', visibility: 'shared' as const, sharedWith: ['actor-player'] },
		{ id: 'd', visibility: 'shared' as const },
	];

	it('returns everything for the DM', () => {
		expect(filterVisibleForViewer(items, dm).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('removes dm-only and undelivered-shared items for a player (absent, not flagged)', () => {
		const result = filterVisibleForViewer(items, player);
		expect(result.map((i) => i.id)).toEqual(['a', 'c']);
		// the dm-only item is ABSENT from the result entirely
		expect(result.some((i) => i.id === 'b')).toBe(false);
	});

	it('removes shared-to-someone-else for an observer', () => {
		expect(filterVisibleForViewer(items, observer).map((i) => i.id)).toEqual(['a']);
	});

	it('preserves input order', () => {
		const reordered = [items[1]!, items[0]!, items[2]!];
		expect(filterVisibleForViewer(reordered, player).map((i) => i.id)).toEqual(['a', 'c']);
	});
});

describe('visibility boundary — accessibleNameForViewer', () => {
	it('computes a name only for a visible item', () => {
		const secret = { visibility: 'dm-only' as const, name: 'Hidden Trap' };
		expect(accessibleNameForViewer(secret, dm, (i) => i.name)).toBe('Hidden Trap');
		// a player gets null — the name function never runs on a hidden item
		expect(accessibleNameForViewer(secret, player, (i) => i.name)).toBeNull();
	});
});

describe('visibility boundary — hiddenCountForViewer (DM diagnostics only)', () => {
	it('counts removed items', () => {
		const items = [
			{ visibility: 'player-visible' as const },
			{ visibility: 'dm-only' as const },
			{ visibility: 'dm-only' as const },
		];
		expect(hiddenCountForViewer(items, player)).toBe(2);
		expect(hiddenCountForViewer(items, dm)).toBe(0);
	});
});

describe('visibility boundary — findLeakedTerms / assertNoLeak (the negative guard)', () => {
	const secrets = ['Goblin Ambusher', 'The Guard Post', 'Hidden Trap'];

	it('finds nothing in clean player output', () => {
		expect(findLeakedTerms('It is now Town Guard turn, initiative 12.', secrets)).toEqual([]);
	});

	it('detects a DM-only name that leaked (case-insensitive substring)', () => {
		expect(findLeakedTerms('goblin ambusher drops to 4 HP', secrets)).toEqual(['Goblin Ambusher']);
	});

	it('ignores blank secret terms so an empty name never matches everything', () => {
		expect(findLeakedTerms('anything at all', ['', '   '])).toEqual([]);
	});

	it('assertNoLeak throws naming the offending term and channel (proves a leak WOULD be caught)', () => {
		expect(() => assertNoLeak('Area hidden: The Guard Post', secrets, 'fog announcement')).toThrow(
			/NO-LEAK violation in fog announcement/,
		);
		expect(() => assertNoLeak('Area hidden: The Guard Post', secrets)).toThrow(/The Guard Post/);
	});

	it('assertNoLeak is a no-op for clean text', () => {
		expect(() => assertNoLeak('5 widgets', secrets)).not.toThrow();
	});
});
