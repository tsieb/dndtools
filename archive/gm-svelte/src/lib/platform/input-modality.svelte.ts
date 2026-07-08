import { getContext, setContext } from 'svelte';

/**
 * UX-NAV-018 — input-modality detection and focus-ring policy.
 *
 * Tracks the active input modality (keyboard / pointer / touch) and reflects it on the
 * `<html>` element as `data-input-modality`. The CSS focus-ring baseline uses `:focus-visible`
 * so rings already stay off pointer/touch taps and on for keyboard focus; this attribute lets
 * components additionally suppress hover-only affordances (e.g. icon-rail tooltips) under touch
 * (UX-NAV-018 spec) without ever removing focus from the accessibility tree.
 *
 * This is a Platform-layer module (Contract 1 / PLAT-006): it is the only place these raw input
 * events are observed, so feature components branch on the resolved modality, never on raw DOM
 * events. It reads no viewport width and no `navigator` capability — only listens for input
 * events on `document` — so it stays within the platform boundary.
 */

export type InputModality = 'keyboard' | 'pointer' | 'touch';

/** Keys that indicate sequential / keyboard navigation and should reveal focus rings. */
const KEYBOARD_KEYS = new Set([
	'Tab',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'Enter',
	' ',
	'Spacebar',
	'Escape',
	'Home',
	'End',
	'PageUp',
	'PageDown',
]);

export class InputModalityStore {
	// Default to pointer; init() corrects it on the first real interaction. Touch-primary
	// devices flip to "touch" on their first touchstart before any focus ring would matter.
	#modality = $state<InputModality>('pointer');

	get modality(): InputModality {
		return this.#modality;
	}

	#set(next: InputModality): void {
		if (this.#modality === next) return;
		this.#modality = next;
		if (typeof document !== 'undefined') {
			document.documentElement.dataset.inputModality = next;
		}
	}

	/**
	 * Subscribe to input events and keep `data-input-modality` current. Returns a cleanup
	 * function. No-op on the server. Listeners are capture-phase so the modality is settled
	 * before focus moves and the correct focus-ring policy applies to the focused element.
	 */
	init(): () => void {
		if (typeof document === 'undefined') return () => {};

		const onPointerDown = (event: PointerEvent) => {
			// A `touch`/`pen` pointerType is touch modality; mouse is pointer modality.
			this.#set(event.pointerType === 'touch' || event.pointerType === 'pen' ? 'touch' : 'pointer');
		};
		const onTouchStart = () => this.#set('touch');
		const onMouseDown = () => {
			// Fallback for environments that do not emit PointerEvents.
			if (this.#modality !== 'touch') this.#set('pointer');
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (KEYBOARD_KEYS.has(event.key)) this.#set('keyboard');
		};

		document.addEventListener('pointerdown', onPointerDown, { capture: true });
		document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
		document.addEventListener('mousedown', onMouseDown, { capture: true });
		document.addEventListener('keydown', onKeyDown, { capture: true });

		// Seed the attribute so the policy is defined before the first interaction.
		document.documentElement.dataset.inputModality = this.#modality;

		return () => {
			document.removeEventListener('pointerdown', onPointerDown, { capture: true });
			document.removeEventListener('touchstart', onTouchStart, { capture: true });
			document.removeEventListener('mousedown', onMouseDown, { capture: true });
			document.removeEventListener('keydown', onKeyDown, { capture: true });
		};
	}
}

const KEY = Symbol('dndtools:v2:input-modality');

export function provideInputModality(store: InputModalityStore): InputModalityStore {
	setContext(KEY, store);
	return store;
}

export function useInputModality(): InputModalityStore {
	const store = getContext<InputModalityStore | undefined>(KEY);
	if (!store) {
		throw new Error('InputModalityStore context is missing; mount inside the root layout.');
	}
	return store;
}
