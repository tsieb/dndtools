/**
 * Live combat announcer (UX-A11Y-006): graduated announcements without data leakage.
 *
 * Maps combat state changes to ARIA live-region announcements at the right politeness, with content
 * FILTERED by the viewer's visibility predicate. Builds on the single `LiveAnnouncer` (no surface adds
 * its own live region) and the shared visibility boundary.
 *
 * Politeness (UX-A11Y-006 spec): turn advance, HP change, conditions, round start are `polite`;
 * incapacitation and a DM-triggered round reset are `assertive` (the reserved urgent channel).
 *
 * NO-LEAK (UX-A11Y-008, principle 8):
 *   - A combatant HIDDEN from the viewer produces NO announcement — the player hears nothing about it,
 *     not even a redacted form.
 *   - HP VALUES are spoken only when the viewer is the DM or HP is visible for that combatant; a
 *     player whose DM has hidden HP hears the band ("bloodied") but never the number.
 *   - Area-of-effect events are batched into a single "N combatants affected" count, which carries no
 *     identity, so even a burst cannot leak names.
 *
 * The pure functions ({@link combatAnnouncement}, {@link batchAffected}) are unit-tested directly; the
 * {@link CombatAnnouncerController} adds the 300 ms debounce over the LiveAnnouncer.
 */

import type { LiveAnnouncer, Politeness } from './live-announcer.svelte';
import { resolveStateIndicator, type HealthState } from './state-indicator';
import { isDm, isVisibleToViewer, type Viewer, type VisibilityClassification } from './visibility-boundary';

/** A combatant as the announcer needs it: identity, visibility, and whether its HP may be spoken. */
export interface AnnouncerCombatant extends VisibilityClassification {
	id: string;
	name: string;
	/** Whether HP VALUES may be announced to a non-DM (per-combatant/per-role DM setting). */
	hpVisible: boolean;
}

export type CombatEvent =
	| { kind: 'turn-advance'; combatant: AnnouncerCombatant; initiative: number }
	| { kind: 'round-change'; round: number; dmTriggeredReset?: boolean }
	| { kind: 'hp-change'; combatant: AnnouncerCombatant; hp: number; health: HealthState }
	| { kind: 'condition'; combatant: AnnouncerCombatant; condition: string; applied: boolean }
	| { kind: 'incapacitated'; combatant: AnnouncerCombatant }
	| { kind: 'aoe'; affectedCount: number; effect: string };

export interface Announcement {
	politeness: Politeness;
	text: string;
}

/** Whether HP numbers may be spoken to this viewer for this combatant. */
function hpSpoken(combatant: AnnouncerCombatant, viewer: Viewer): boolean {
	return isDm(viewer) || combatant.hpVisible;
}

/** Health band label for non-full bands (e.g. "Bloodied"); empty for `full`. */
function bandLabel(health: HealthState): string {
	return health === 'full' ? '' : resolveStateIndicator('health', health).label;
}

/**
 * The viewer-filtered announcement for a combat event, or `null` when nothing should be announced
 * (combatant hidden, or an HP change that conveys nothing to a player). This is the security
 * choke-point: every combat event passes through here before any text reaches a live region.
 */
export function combatAnnouncement(event: CombatEvent, viewer: Viewer): Announcement | null {
	switch (event.kind) {
		case 'round-change':
			return {
				politeness: event.dmTriggeredReset ? 'assertive' : 'polite',
				text: `Round ${event.round} begins.`,
			};
		case 'aoe':
			return {
				politeness: 'polite',
				text: `${event.affectedCount} combatant${
					event.affectedCount === 1 ? '' : 's'
				} affected by ${event.effect}.`,
			};
		case 'turn-advance': {
			if (!isVisibleToViewer(event.combatant, viewer)) return null;
			return {
				politeness: 'polite',
				text: `It is now ${event.combatant.name}'s turn, initiative ${event.initiative}.`,
			};
		}
		case 'incapacitated': {
			if (!isVisibleToViewer(event.combatant, viewer)) return null;
			return { politeness: 'assertive', text: `${event.combatant.name} is incapacitated.` };
		}
		case 'condition': {
			if (!isVisibleToViewer(event.combatant, viewer)) return null;
			const verb = event.applied ? 'gained' : 'lost';
			return {
				politeness: 'polite',
				text: `${event.combatant.name} ${verb} ${event.condition}.`,
			};
		}
		case 'hp-change': {
			if (!isVisibleToViewer(event.combatant, viewer)) return null;
			const showHp = hpSpoken(event.combatant, viewer);
			const band = bandLabel(event.health);
			if (showHp) {
				const suffix = band ? `, ${band.toLowerCase()}` : '';
				return {
					politeness: 'polite',
					text: `${event.combatant.name} — ${event.hp} HP remaining${suffix}.`,
				};
			}
			// HP hidden: a player hears only the band. A still-full hidden-HP change conveys nothing.
			if (!band) return null;
			return { politeness: 'polite', text: `${event.combatant.name} — ${band.toLowerCase()}.` };
		}
	}
}

/**
 * Collapse a burst of HP-change events into either ONE batched "N combatants affected" announcement
 * (when 2+ DISTINCT combatants visible to the viewer are hit — the area-of-effect case) or the
 * individual announcements (a single combatant). Hidden combatants are dropped before counting, so a
 * player's batch count reflects only combatants they may see (no identity, no hidden-count leak).
 */
export function batchAffected(
	events: readonly Extract<CombatEvent, { kind: 'hp-change' }>[],
	viewer: Viewer,
	effect = 'an area effect',
): Announcement[] {
	const visible = events.filter((event) => isVisibleToViewer(event.combatant, viewer));
	const distinct = new Set(visible.map((event) => event.combatant.id));
	if (distinct.size >= 2) {
		return [
			{ politeness: 'polite', text: `${distinct.size} combatants affected by ${effect}.` },
		];
	}
	return visible
		.map((event) => combatAnnouncement(event, viewer))
		.filter((a): a is Announcement => a !== null);
}

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Stateful controller wrapping the {@link LiveAnnouncer}: non-HP events announce immediately; HP-change
 * events are buffered for {@link DEFAULT_DEBOUNCE_MS} and flushed through {@link batchAffected}, so a
 * rapid area effect produces one count instead of a flood (UX-A11Y-006 AC4). The viewer can be swapped
 * (e.g. "view as" switch) so subsequent announcements re-filter for the new role.
 */
export class CombatAnnouncerController {
	#announcer: LiveAnnouncer;
	#viewer: Viewer;
	readonly #debounceMs: number;
	#hpBuffer: Extract<CombatEvent, { kind: 'hp-change' }>[] = [];
	#flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(announcer: LiveAnnouncer, viewer: Viewer, debounceMs = DEFAULT_DEBOUNCE_MS) {
		this.#announcer = announcer;
		this.#viewer = viewer;
		this.#debounceMs = debounceMs;
	}

	setViewer(viewer: Viewer): void {
		this.#viewer = viewer;
	}

	/** Emit a combat event. HP changes are debounced/batched; everything else announces at once. */
	emit(event: CombatEvent): void {
		if (event.kind === 'hp-change') {
			this.#hpBuffer.push(event);
			this.#scheduleFlush();
			return;
		}
		const announcement = combatAnnouncement(event, this.#viewer);
		if (announcement) this.#announcer.announce(announcement.text, announcement.politeness);
	}

	/** Flush any buffered HP events now (also called automatically after the debounce window). */
	flush(): void {
		if (this.#flushTimer) {
			clearTimeout(this.#flushTimer);
			this.#flushTimer = null;
		}
		if (this.#hpBuffer.length === 0) return;
		const batch = this.#hpBuffer;
		this.#hpBuffer = [];
		for (const announcement of batchAffected(batch, this.#viewer)) {
			this.#announcer.announce(announcement.text, announcement.politeness);
		}
	}

	#scheduleFlush(): void {
		if (typeof setTimeout === 'undefined') {
			this.flush();
			return;
		}
		if (this.#flushTimer) clearTimeout(this.#flushTimer);
		this.#flushTimer = setTimeout(() => this.flush(), this.#debounceMs);
	}

	/** Clear any pending flush (teardown). */
	dispose(): void {
		if (this.#flushTimer) clearTimeout(this.#flushTimer);
		this.#flushTimer = null;
		this.#hpBuffer = [];
	}
}
