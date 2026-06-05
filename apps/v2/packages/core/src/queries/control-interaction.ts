/**
 * Map control interaction-safety state machine (MAP-015).
 *
 * A "control" here is any dismissible, interactive map surface: a POI popover, a compact
 * long-press sheet/drawer, an overlay, or a canvas control panel. The product defect this
 * traces to is controls that dismiss on the WRONG signal — a pointer moving from the POI
 * marker into the popover, a hover-out, a scroll, focus moving to a child button, or a
 * transient blur while the user is interacting inside the control. The acceptance criteria
 * require that such internal interactions NEVER dismiss the active control, and that a
 * control dismiss only on a GENUINE dismiss intent (explicit close, Escape, a true
 * outside-the-control pointerdown/click, or selecting another POI).
 *
 * Per Contract 1 (Processing / Display Decoupling), this dismissal/engagement POLICY is
 * logic, not presentation, so it lives in the Processing Core as a small pure reducer. The
 * GUI dispatches raw interaction INTENTS (it knows nothing about the rules) and renders the
 * result the reducer returns. No DOM, Svelte, hover timers, or platform APIs appear here —
 * the same intents produce the same decision on every platform profile (popover or sheet).
 *
 * The reducer is deterministic and side-effect free. The GUI is responsible only for:
 *   - translating browser events into {@link ControlInteractionEvent}s (e.g. an event whose
 *     target is inside the control element becomes `inside: true`),
 *   - applying the returned focus directive (focus-into-control on open, restore-focus on
 *     close),
 *   - rendering `state.phase` (open vs closed) and `state.activeControlId`.
 *
 * It does NOT decide WHICH element to focus by DOM traversal — that is the GUI's. It decides
 * WHETHER focus should move into the control or be restored, which is policy.
 */

/** A stable identity for a dismissible control instance (e.g. a POI id, or `sheet:<poi>`). */
export type ControlId = string;

/**
 * Whether the active control is currently presented as a popover (anchored to a marker,
 * expanded profile) or a sheet/drawer (compact profile). The engagement RULES are identical
 * for both — this only records how the GUI is presenting it so a reviewer/diagnostic can see
 * that both profiles share one policy (Contract 1, Slimmer Device Definition).
 */
export type ControlPresentation = 'popover' | 'sheet';

/** The lifecycle phase of the interaction surface. */
export type ControlInteractionPhase = 'closed' | 'open';

/**
 * Why the most recent transition happened. Useful for diagnostics, announcements, and tests;
 * never user-facing copy. `none` is the resting value when nothing has changed phase yet.
 */
export type ControlInteractionReason =
	| 'none'
	| 'opened'
	| 'switched'
	| 'explicit-close'
	| 'escape'
	| 'outside-pointer'
	| 'select-other'
	| 'ignored-internal';

/**
 * The directive the GUI must apply to focus after a transition (accessibility — MAP-015).
 *
 * - `into-control`: move focus into the just-opened control (the GUI picks the first
 *   focusable element / the control container). Returned on open and on switching POIs.
 * - `restore`: return focus to the element that had it before the control opened (the GUI
 *   tracks that element). Returned on a genuine dismiss.
 * - `none`: leave focus exactly where it is. Returned for every internal interaction so a
 *   pointermove/hover-out/scroll/child-focus never steals or restores focus.
 */
export type ControlFocusDirective = 'none' | 'into-control' | 'restore';

export interface ControlInteractionState {
	phase: ControlInteractionPhase;
	/** The control currently open, or `null` when closed. */
	activeControlId: ControlId | null;
	/** How the active control is presented; `null` when closed. */
	presentation: ControlPresentation | null;
	/** Why the last transition occurred (diagnostics/tests). */
	lastReason: ControlInteractionReason;
	/** The focus directive the GUI must apply for the last transition. */
	focusDirective: ControlFocusDirective;
}

/** The resting closed state. The GUI starts here and returns here on every dismiss. */
export const CLOSED_CONTROL_INTERACTION: ControlInteractionState = Object.freeze({
	phase: 'closed',
	activeControlId: null,
	presentation: null,
	lastReason: 'none',
	focusDirective: 'none',
});

/**
 * The raw interaction intents the GUI dispatches. These are deliberately low-level and
 * presentation-agnostic — the GUI maps DOM events onto them without applying any dismissal
 * policy itself.
 */
export type ControlInteractionEvent =
	/** Open (or switch to) a control for `controlId`. Selecting a different POI while one is
	 *  open is also an `open` for the new id — the reducer treats it as a switch, not a
	 *  dismiss-then-reopen, so no spurious focus restore happens in between. */
	| { type: 'open'; controlId: ControlId; presentation: ControlPresentation }
	/** An explicit close affordance was activated (a close button, a backdrop tap the GUI has
	 *  classified as a deliberate dismiss, the compact sheet's Done/Close control). */
	| { type: 'close' }
	/** The Escape key was pressed while the control was active. */
	| { type: 'escape' }
	/**
	 * A pointerdown/click occurred somewhere. `inside` is true when the event's target is
	 * within the active control's subtree (the GUI computes this with `contains`). An inside
	 * pointer is a genuine interaction and never dismisses; an outside pointer is a genuine
	 * dismiss intent.
	 */
	| { type: 'pointerdown'; inside: boolean }
	/**
	 * The pointer moved. `inside` indicates whether it is now over the control. This is the
	 * classic false-dismiss trigger (hover-out / marker→popover transit) and MUST be ignored
	 * for dismissal regardless of `inside`.
	 */
	| { type: 'pointermove'; inside: boolean }
	/** The pointer/hover left the control region (mouseleave/pointerleave). Ignored. */
	| { type: 'pointerleave' }
	/** A scroll occurred (map pan/zoom, or scrolling within the control). Ignored. */
	| { type: 'scroll' }
	/**
	 * Focus moved. `inside` is true when focus moved to an element within the control (e.g.
	 * tabbing onto a child action button). A blur to an element still inside the control, or
	 * a transient blur while interacting, must NOT dismiss. Focus leaving the control via the
	 * keyboard does not auto-dismiss either: dismissal is reserved for explicit/Escape/outside
	 * intents, so a control stays open if focus parks elsewhere until a real dismiss occurs.
	 */
	| { type: 'focuschange'; inside: boolean };

/**
 * Apply one interaction intent to the control-interaction state (MAP-015).
 *
 * Dismissal happens ONLY for genuine dismiss intents:
 *   - `close` (explicit close affordance),
 *   - `escape`,
 *   - `pointerdown` with `inside: false` (a true outside-the-control pointer),
 *   - `open` for a DIFFERENT control while one is open (selecting another POI) — handled as a
 *     switch, which closes-then-opens atomically with a single `into-control` focus directive.
 *
 * Every other event — internal `pointerdown`/`pointermove` (in or out), `pointerleave`,
 * `scroll`, and any `focuschange` — leaves the control OPEN and returns `focusDirective:
 * 'none'`, so the GUI never moves focus or dismisses for a transient internal interaction.
 *
 * The reducer is pure: it returns a new state object and never mutates its input.
 */
export function controlInteractionReducer(
	state: ControlInteractionState,
	event: ControlInteractionEvent,
): ControlInteractionState {
	switch (event.type) {
		case 'open': {
			// Opening always lands on `open` for the requested control. If a different control
			// was already open this is a SWITCH (selecting another POI): we move straight to the
			// new control without an intermediate restore, and direct focus into the new control.
			const switched = state.phase === 'open' && state.activeControlId !== event.controlId;
			// Re-opening the SAME already-open control is a no-op transition (idempotent): keep it
			// open, but do not re-issue an `into-control` directive that would yank focus back from
			// a child the user already tabbed to.
			if (
				state.phase === 'open' &&
				state.activeControlId === event.controlId &&
				state.presentation === event.presentation
			) {
				return {
					...state,
					lastReason: 'ignored-internal',
					focusDirective: 'none',
				};
			}
			return {
				phase: 'open',
				activeControlId: event.controlId,
				presentation: event.presentation,
				lastReason: switched ? 'switched' : 'opened',
				focusDirective: 'into-control',
			};
		}

		case 'close':
			if (state.phase === 'closed') return state;
			return {
				...CLOSED_CONTROL_INTERACTION,
				lastReason: 'explicit-close',
				focusDirective: 'restore',
			};

		case 'escape':
			if (state.phase === 'closed') return state;
			return {
				...CLOSED_CONTROL_INTERACTION,
				lastReason: 'escape',
				focusDirective: 'restore',
			};

		case 'pointerdown':
			// A pointerdown INSIDE the control is a genuine interaction (clicking an action
			// button); it never dismisses. A pointerdown OUTSIDE is a true dismiss intent.
			if (state.phase === 'closed') return state;
			if (event.inside) {
				return { ...state, lastReason: 'ignored-internal', focusDirective: 'none' };
			}
			return {
				...CLOSED_CONTROL_INTERACTION,
				lastReason: 'outside-pointer',
				focusDirective: 'restore',
			};

		case 'pointermove':
		case 'pointerleave':
		case 'scroll':
		case 'focuschange':
			// None of these are dismiss intents. The control stays exactly as it is, and focus is
			// left untouched (`'none'`) — this is the whole point of MAP-015: an internal
			// pointermove/hover-out/scroll, or focus moving to a child, must not dismiss the
			// control or steal/restore focus.
			if (state.phase === 'closed') return state;
			return { ...state, lastReason: 'ignored-internal', focusDirective: 'none' };
	}
}

/**
 * Convenience: fold a sequence of intents over a starting state. Handy for the GUI when it
 * needs to replay a batch and for tests that assert a control survives a burst of internal
 * interactions before a genuine dismiss.
 */
export function reduceControlInteractions(
	state: ControlInteractionState,
	events: readonly ControlInteractionEvent[],
): ControlInteractionState {
	return events.reduce(controlInteractionReducer, state);
}

/** True when the named control is the one currently open (GUI render helper). */
export function isControlOpen(state: ControlInteractionState, controlId: ControlId): boolean {
	return state.phase === 'open' && state.activeControlId === controlId;
}
