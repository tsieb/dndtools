import { getContext, setContext } from 'svelte';

/**
 * Spatial-dashboard interaction mode (Command Center redesign §4). One store per spatial surface:
 *
 *   • `view` — widgets are fully live (tables scroll, rows navigate, shortcut tiles launch); the
 *     canvas pans/zooms; no layout affordances are visible.
 *   • `edit` — widgets become layout objects (their bodies go inert), drag handles + resize grips
 *     appear, and selecting a widget opens the docked Properties Panel.
 *
 * The store also owns the single-selection state the Properties Panel binds to: selection only
 * exists in edit mode, and leaving edit mode always clears it (the panel dismisses on mode exit).
 *
 * The same store class drives every spatial route (deliverable §8.8): the Command Center
 * instantiates it alongside a locked widget set, other scenes alongside an unlocked one — the mode
 * model itself is identical, so no refactoring is needed to enable full edit elsewhere.
 */

export type CanvasMode = 'view' | 'edit';

export class CanvasModeStore {
	#mode = $state<CanvasMode>('view');
	#selectedId = $state<string | null>(null);

	get mode(): CanvasMode {
		return this.#mode;
	}

	get isEdit(): boolean {
		return this.#mode === 'edit';
	}

	/** The single selected widget id (edit mode only; always null in view mode). */
	get selectedId(): string | null {
		return this.#selectedId;
	}

	setMode(mode: CanvasMode): void {
		this.#mode = mode;
		// Mode exit dismisses the Properties Panel (§5): no selection survives outside edit mode.
		if (mode !== 'edit') this.#selectedId = null;
	}

	toggle(): void {
		this.setMode(this.#mode === 'edit' ? 'view' : 'edit');
	}

	/** Select a widget for the Properties Panel. No-op outside edit mode (fail closed). */
	select(id: string | null): void {
		if (id !== null && this.#mode !== 'edit') return;
		this.#selectedId = id;
	}
}

const KEY = Symbol('canvas-mode');

export function provideCanvasMode(store: CanvasModeStore): CanvasModeStore {
	setContext(KEY, store);
	return store;
}

export function useCanvasMode(): CanvasModeStore {
	const store = getContext<CanvasModeStore | undefined>(KEY);
	if (!store) throw new Error('CanvasModeStore context missing — call provideCanvasMode first.');
	return store;
}
