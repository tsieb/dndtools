import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useSyncExternalStore,
	type ReactNode,
} from 'react';

/**
 * RC-MAP-2.1 — the session's SHARED COMBATANT SELECTION.
 *
 * "Which combatant am I looking at" is one question the table asks in several places at once: the
 * initiative tracker, the map's token layer, and the map Inspector. Before this, each surface kept its
 * own answer, so clicking a token on the map and clicking the same creature in the tracker were two
 * unrelated acts and the DM had to re-find the creature every time they moved between the two.
 *
 * It is deliberately EPHEMERAL and app-local: a selection is a glance, not a decision. It is never
 * dispatched, never persisted, and never synced — a co-DM highlighting a goblin must not move the
 * cursor on someone else's screen, and nothing here may enter the op log.
 *
 * The store is provider-OPTIONAL. `SessionSelectionContext` defaults to one app-wide store, so any
 * surface can call {@link useSessionSelection} and share the selection without a provider having to be
 * threaded through the application root; {@link SessionSelectionProvider} exists so a test (or a
 * future second window) can scope its own. The id is held outside React and read through
 * `useSyncExternalStore` precisely so surfaces that never share a parent still re-render together.
 *
 * Consumers treat an id they cannot find as NO selection: combat ends, a combatant is removed, and a
 * stale id must degrade to "nothing selected" rather than to a phantom highlight.
 */
export interface SessionSelectionStore {
	/** The selected combatant's id, or null. */
	get: () => string | null;
	set: (combatantId: string | null) => void;
	subscribe: (listener: () => void) => () => void;
}

export function createSessionSelectionStore(): SessionSelectionStore {
	let selected: string | null = null;
	const listeners = new Set<() => void>();
	return {
		get: () => selected,
		set: (combatantId) => {
			if (combatantId === selected) return;
			selected = combatantId;
			for (const listener of [...listeners]) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/** The default, app-wide store — see the note above on why no provider is required. */
const appSessionSelection = createSessionSelectionStore();

const SessionSelectionContext = createContext<SessionSelectionStore>(appSessionSelection);

/** Scope a fresh selection store to a subtree. Optional; the app-wide store is the default. */
export function SessionSelectionProvider({
	store,
	children,
}: {
	store?: SessionSelectionStore;
	children: ReactNode;
}) {
	const value = useMemo(() => store ?? createSessionSelectionStore(), [store]);
	return (
		<SessionSelectionContext.Provider value={value}>{children}</SessionSelectionContext.Provider>
	);
}

export interface SessionSelection {
	selectedCombatantId: string | null;
	selectCombatant: (combatantId: string | null) => void;
	/** Select this combatant, or clear the selection when it is already the selected one. */
	toggleCombatant: (combatantId: string) => void;
}

export function useSessionSelection(): SessionSelection {
	const store = useContext(SessionSelectionContext);
	const selectedCombatantId = useSyncExternalStore(store.subscribe, store.get, store.get);
	const selectCombatant = useCallback(
		(combatantId: string | null) => store.set(combatantId),
		[store],
	);
	const toggleCombatant = useCallback(
		(combatantId: string) => store.set(store.get() === combatantId ? null : combatantId),
		[store],
	);
	return { selectedCombatantId, selectCombatant, toggleCombatant };
}
