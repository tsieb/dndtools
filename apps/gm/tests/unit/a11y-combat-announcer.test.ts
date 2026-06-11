import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	batchAffected,
	combatAnnouncement,
	CombatAnnouncerController,
	type AnnouncerCombatant,
	type CombatEvent,
} from '../../src/lib/gui/a11y/combat-announcer';
import { LiveAnnouncer } from '../../src/lib/gui/a11y/live-announcer.svelte';
import { findLeakedTerms, type Viewer } from '../../src/lib/gui/a11y/visibility-boundary';

// UX-A11Y-006: graduated combat announcements, filtered by the viewer's visibility predicate.

const dm: Viewer = { role: 'dm', actorId: 'actor-dm' };
const player: Viewer = { role: 'player', actorId: 'actor-player' };

const goblin: AnnouncerCombatant = {
	id: 'c-goblin',
	name: 'Goblin Ambusher',
	visibility: 'dm-only',
	hpVisible: false,
};
const guard: AnnouncerCombatant = {
	id: 'c-guard',
	name: 'Town Guard',
	visibility: 'player-visible',
	hpVisible: false,
};
const hero: AnnouncerCombatant = {
	id: 'c-hero',
	name: 'Lyra',
	visibility: 'player-visible',
	hpVisible: true,
};

describe('combat announcer — politeness levels', () => {
	it('round start is polite; a DM-triggered reset is assertive', () => {
		expect(combatAnnouncement({ kind: 'round-change', round: 2 }, player)).toEqual({
			politeness: 'polite',
			text: 'Round 2 begins.',
		});
		expect(
			combatAnnouncement({ kind: 'round-change', round: 1, dmTriggeredReset: true }, player),
		).toEqual({ politeness: 'assertive', text: 'Round 1 begins.' });
	});

	it('incapacitation is assertive', () => {
		expect(combatAnnouncement({ kind: 'incapacitated', combatant: hero }, player)).toEqual({
			politeness: 'assertive',
			text: 'Lyra is incapacitated.',
		});
	});

	it('turn advance and conditions are polite', () => {
		expect(combatAnnouncement({ kind: 'turn-advance', combatant: guard, initiative: 14 }, player)).toEqual(
			{ politeness: 'polite', text: "It is now Town Guard's turn, initiative 14." },
		);
		expect(
			combatAnnouncement({ kind: 'condition', combatant: guard, condition: 'poisoned', applied: true }, player),
		).toEqual({ politeness: 'polite', text: 'Town Guard gained poisoned.' });
	});
});

describe('combat announcer — NO-LEAK visibility filtering (UX-A11Y-006 AC1/AC2/AC3)', () => {
	it('AC1: a hidden DM-only combatant taking damage produces NO announcement for a player', () => {
		const event: CombatEvent = { kind: 'hp-change', combatant: goblin, hp: 4, health: 'bloodied' };
		expect(combatAnnouncement(event, player)).toBeNull();
		// even its turn or incapacitation is silent for the player
		expect(combatAnnouncement({ kind: 'turn-advance', combatant: goblin, initiative: 9 }, player)).toBeNull();
		expect(combatAnnouncement({ kind: 'incapacitated', combatant: goblin }, player)).toBeNull();
	});

	it('the DM still hears the hidden combatant with its HP value', () => {
		expect(combatAnnouncement({ kind: 'hp-change', combatant: goblin, hp: 4, health: 'bloodied' }, dm)).toEqual({
			politeness: 'polite',
			text: 'Goblin Ambusher — 4 HP remaining, bloodied.',
		});
	});

	it('AC2: a player hears the combatant name but not the HP value when HP is hidden', () => {
		const result = combatAnnouncement({ kind: 'hp-change', combatant: guard, hp: 4, health: 'bloodied' }, player);
		expect(result).toEqual({ politeness: 'polite', text: 'Town Guard — bloodied.' });
		expect(result?.text).not.toMatch(/\d+ HP/);
	});

	it('a player hears the HP value when the DM has enabled HP visibility for that combatant', () => {
		expect(combatAnnouncement({ kind: 'hp-change', combatant: hero, hp: 12, health: 'bloodied' }, player)).toEqual({
			politeness: 'polite',
			text: 'Lyra — 12 HP remaining, bloodied.',
		});
	});

	it('a still-full hidden-HP change conveys nothing to a player (suppressed)', () => {
		expect(combatAnnouncement({ kind: 'hp-change', combatant: guard, hp: 30, health: 'full' }, player)).toBeNull();
	});

	it('no announcement ever leaks a DM-only combatant name to player text', () => {
		const events: CombatEvent[] = [
			{ kind: 'hp-change', combatant: goblin, hp: 4, health: 'critical' },
			{ kind: 'turn-advance', combatant: goblin, initiative: 9 },
			{ kind: 'condition', combatant: goblin, condition: 'stunned', applied: true },
		];
		for (const event of events) {
			const result = combatAnnouncement(event, player);
			if (result) expect(findLeakedTerms(result.text, ['Goblin Ambusher'])).toEqual([]);
			else expect(result).toBeNull();
		}
	});
});

describe('combat announcer — batchAffected (UX-A11Y-006 AC4)', () => {
	it('collapses 2+ visible combatants into one count announcement', () => {
		const events = [
			{ kind: 'hp-change' as const, combatant: guard, hp: 4, health: 'bloodied' as const },
			{ kind: 'hp-change' as const, combatant: hero, hp: 6, health: 'bloodied' as const },
		];
		expect(batchAffected(events, player, 'a fireball')).toEqual([
			{ politeness: 'polite', text: '2 combatants affected by a fireball.' },
		]);
	});

	it('drops hidden combatants from the player batch count (no hidden-count leak)', () => {
		const events = [
			{ kind: 'hp-change' as const, combatant: guard, hp: 4, health: 'bloodied' as const },
			{ kind: 'hp-change' as const, combatant: goblin, hp: 2, health: 'critical' as const },
		];
		// only the visible guard remains → not a batch; a single per-combatant announcement
		const result = batchAffected(events, player, 'a fireball');
		expect(result).toEqual([{ politeness: 'polite', text: 'Town Guard — bloodied.' }]);
		// the DM sees the real count of 2
		expect(batchAffected(events, dm, 'a fireball')).toEqual([
			{ politeness: 'polite', text: '2 combatants affected by a fireball.' },
		]);
	});
});

describe('combat announcer — controller debounce', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('batches rapid HP events into one announcement after the debounce window', () => {
		const announcer = new LiveAnnouncer();
		const controller = new CombatAnnouncerController(announcer, player, 300);
		controller.emit({ kind: 'hp-change', combatant: guard, hp: 4, health: 'bloodied' });
		controller.emit({ kind: 'hp-change', combatant: hero, hp: 6, health: 'bloodied' });
		// nothing announced yet — still inside the window
		expect(announcer.polite).toBe('');
		vi.advanceTimersByTime(300);
		expect(announcer.polite).toBe('2 combatants affected by an area effect.');
		controller.dispose();
	});

	it('non-HP events announce immediately', () => {
		const announcer = new LiveAnnouncer();
		const controller = new CombatAnnouncerController(announcer, player, 300);
		controller.emit({ kind: 'turn-advance', combatant: guard, initiative: 14 });
		expect(announcer.polite).toBe("It is now Town Guard's turn, initiative 14.");
		controller.dispose();
	});

	it('a hidden combatant emits nothing through the controller for a player', () => {
		const announcer = new LiveAnnouncer();
		const controller = new CombatAnnouncerController(announcer, player, 300);
		controller.emit({ kind: 'hp-change', combatant: goblin, hp: 4, health: 'critical' });
		vi.advanceTimersByTime(300);
		expect(announcer.polite).toBe('');
		expect(announcer.assertive).toBe('');
		controller.dispose();
	});
});
