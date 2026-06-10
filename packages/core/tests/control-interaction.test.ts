import { describe, expect, it } from 'vitest';
import {
	CLOSED_CONTROL_INTERACTION,
	controlInteractionReducer,
	isControlOpen,
	reduceControlInteractions,
	type ControlInteractionEvent,
	type ControlInteractionState,
} from '../src/index';

/**
 * MAP-015 — map control interaction safety. The reducer must keep an active control (POI
 * popover, compact sheet, overlay, canvas control) OPEN through every internal interaction
 * and dismiss ONLY on a genuine dismiss intent: explicit close, Escape, a true outside
 * pointerdown, or selecting another POI. It also drives accessible focus: focus moves into
 * the control on open, restores on a genuine dismiss, and is left untouched for every
 * internal interaction.
 */

function open(
	controlId = 'poi-1',
	presentation: 'popover' | 'sheet' = 'popover',
): ControlInteractionState {
	return controlInteractionReducer(CLOSED_CONTROL_INTERACTION, {
		type: 'open',
		controlId,
		presentation,
	});
}

describe('MAP-015 opening a control', () => {
	it('opens the requested control and directs focus into it', () => {
		const state = open('poi-1');
		expect(state.phase).toBe('open');
		expect(state.activeControlId).toBe('poi-1');
		expect(state.presentation).toBe('popover');
		expect(state.lastReason).toBe('opened');
		// Accessibility: focus moves into the control on open.
		expect(state.focusDirective).toBe('into-control');
		expect(isControlOpen(state, 'poi-1')).toBe(true);
	});

	it('does not mutate the input state', () => {
		const before = { ...CLOSED_CONTROL_INTERACTION };
		controlInteractionReducer(CLOSED_CONTROL_INTERACTION, {
			type: 'open',
			controlId: 'poi-1',
			presentation: 'popover',
		});
		expect(CLOSED_CONTROL_INTERACTION).toEqual(before);
	});

	it('re-opening the same control with the same presentation does not re-yank focus', () => {
		const first = open('poi-1');
		const again = controlInteractionReducer(first, {
			type: 'open',
			controlId: 'poi-1',
			presentation: 'popover',
		});
		expect(again.phase).toBe('open');
		expect(again.activeControlId).toBe('poi-1');
		// Idempotent re-open must NOT issue another into-control directive (the user may have
		// already tabbed onto a child action).
		expect(again.focusDirective).toBe('none');
		expect(again.lastReason).toBe('ignored-internal');
	});

	it('models a compact sheet with the same engagement rules', () => {
		const sheet = open('poi-7', 'sheet');
		expect(sheet.presentation).toBe('sheet');
		expect(sheet.phase).toBe('open');
		expect(sheet.focusDirective).toBe('into-control');
	});
});

describe('MAP-015 genuine dismiss intents close the control and restore focus', () => {
	it('explicit close dismisses and restores focus', () => {
		const state = controlInteractionReducer(open(), { type: 'close' });
		expect(state.phase).toBe('closed');
		expect(state.activeControlId).toBeNull();
		expect(state.lastReason).toBe('explicit-close');
		expect(state.focusDirective).toBe('restore');
	});

	it('Escape dismisses and restores focus (keyboard a11y)', () => {
		const state = controlInteractionReducer(open(), { type: 'escape' });
		expect(state.phase).toBe('closed');
		expect(state.lastReason).toBe('escape');
		expect(state.focusDirective).toBe('restore');
	});

	it('a true outside pointerdown dismisses and restores focus', () => {
		const state = controlInteractionReducer(open(), { type: 'pointerdown', inside: false });
		expect(state.phase).toBe('closed');
		expect(state.lastReason).toBe('outside-pointer');
		expect(state.focusDirective).toBe('restore');
	});

	it('selecting another POI switches control without an intermediate restore', () => {
		const state = controlInteractionReducer(open('poi-1'), {
			type: 'open',
			controlId: 'poi-2',
			presentation: 'popover',
		});
		expect(state.phase).toBe('open');
		expect(state.activeControlId).toBe('poi-2');
		expect(state.lastReason).toBe('switched');
		// Focus moves into the NEW control directly — never restored to the page in between.
		expect(state.focusDirective).toBe('into-control');
		expect(isControlOpen(state, 'poi-1')).toBe(false);
		expect(isControlOpen(state, 'poi-2')).toBe(true);
	});
});

describe('MAP-015 internal interactions must NOT dismiss the control', () => {
	// AC1: pointer moving from the POI marker INTO the popover keeps it open.
	it('pointermove into the control keeps it open and leaves focus untouched', () => {
		const state = controlInteractionReducer(open(), { type: 'pointermove', inside: true });
		expect(state.phase).toBe('open');
		expect(state.focusDirective).toBe('none');
		expect(state.lastReason).toBe('ignored-internal');
	});

	it('pointermove leaving the control region does NOT dismiss (no hover requirement)', () => {
		const state = controlInteractionReducer(open(), { type: 'pointermove', inside: false });
		expect(state.phase).toBe('open');
		expect(state.focusDirective).toBe('none');
	});

	it('pointerleave / hover-out does NOT dismiss', () => {
		const state = controlInteractionReducer(open(), { type: 'pointerleave' });
		expect(state.phase).toBe('open');
		expect(state.focusDirective).toBe('none');
	});

	it('scroll (map pan/zoom or scrolling inside) does NOT dismiss', () => {
		const state = controlInteractionReducer(open(), { type: 'scroll' });
		expect(state.phase).toBe('open');
		expect(state.focusDirective).toBe('none');
	});

	it('a pointerdown INSIDE the control (tapping an action) does NOT dismiss', () => {
		// AC2: tapping an action inside an open sheet executes the action instead of closing
		// from underlying map handlers — i.e. the control stays open for the inside pointer.
		const state = controlInteractionReducer(open('poi-1', 'sheet'), {
			type: 'pointerdown',
			inside: true,
		});
		expect(state.phase).toBe('open');
		expect(state.activeControlId).toBe('poi-1');
		expect(state.focusDirective).toBe('none');
	});

	it('focus moving to a CHILD of the control does NOT dismiss or move focus', () => {
		const state = controlInteractionReducer(open(), { type: 'focuschange', inside: true });
		expect(state.phase).toBe('open');
		expect(state.focusDirective).toBe('none');
	});

	it('a transient blur (focus leaving the control) does NOT auto-dismiss', () => {
		// Dismissal is reserved for explicit/Escape/outside intents; a stray blur must not
		// close an active control while the user is mid-interaction.
		const state = controlInteractionReducer(open(), { type: 'focuschange', inside: false });
		expect(state.phase).toBe('open');
		expect(state.focusDirective).toBe('none');
	});
});

describe('MAP-015 a control survives a burst of internal interaction then closes on intent', () => {
	it('stays open through marker→popover transit, scroll, and child focus, then closes on Escape', () => {
		const events: ControlInteractionEvent[] = [
			{ type: 'pointermove', inside: false }, // pointer on the marker
			{ type: 'pointermove', inside: true }, // transit into the popover
			{ type: 'pointerleave' }, // brief hover-out
			{ type: 'scroll' }, // map nudge underneath
			{ type: 'focuschange', inside: true }, // tab onto an action button
			{ type: 'pointerdown', inside: true }, // press the action
		];
		const open1 = open('poi-1');
		const survived = reduceControlInteractions(open1, events);
		expect(survived.phase).toBe('open');
		expect(survived.activeControlId).toBe('poi-1');

		const dismissed = controlInteractionReducer(survived, { type: 'escape' });
		expect(dismissed.phase).toBe('closed');
		expect(dismissed.focusDirective).toBe('restore');
	});

	it('the same burst on a compact sheet behaves identically, closing only on outside pointer', () => {
		const events: ControlInteractionEvent[] = [
			{ type: 'pointermove', inside: true },
			{ type: 'scroll' },
			{ type: 'pointerdown', inside: true }, // tap an action inside the sheet (AC2)
			{ type: 'focuschange', inside: true },
		];
		const survived = reduceControlInteractions(open('poi-9', 'sheet'), events);
		expect(survived.phase).toBe('open');
		expect(survived.presentation).toBe('sheet');

		const dismissed = controlInteractionReducer(survived, { type: 'pointerdown', inside: false });
		expect(dismissed.phase).toBe('closed');
		expect(dismissed.focusDirective).toBe('restore');
	});
});

describe('MAP-015 closed-state events are inert', () => {
	it('dismiss-type events on a closed control return the closed state unchanged', () => {
		for (const event of [
			{ type: 'close' } as const,
			{ type: 'escape' } as const,
			{ type: 'pointerdown', inside: false } as const,
			{ type: 'pointermove', inside: true } as const,
			{ type: 'pointerleave' } as const,
			{ type: 'scroll' } as const,
			{ type: 'focuschange', inside: true } as const,
		]) {
			const result = controlInteractionReducer(CLOSED_CONTROL_INTERACTION, event);
			expect(result.phase).toBe('closed');
			expect(result.activeControlId).toBeNull();
		}
	});
});
