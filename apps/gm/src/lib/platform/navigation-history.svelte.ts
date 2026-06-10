import { getContext, setContext } from 'svelte';
import {
	addRecentEntry,
	isPinned,
	togglePinnedEntry,
	type NavEntry,
} from './navigation-history';

const STORAGE_KEY = 'dndtools-v2-nav-history';

interface PersistShape {
	recent: NavEntry[];
	pinned: NavEntry[];
}

function readPersisted(): PersistShape {
	if (typeof localStorage === 'undefined') return { recent: [], pinned: [] };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { recent: [], pinned: [] };
		const parsed = JSON.parse(raw) as Partial<PersistShape>;
		return {
			recent: Array.isArray(parsed.recent) ? parsed.recent : [],
			pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
		};
	} catch {
		// Corrupt local preference data is non-critical: start clean rather than fail.
		return { recent: [], pinned: [] };
	}
}

/**
 * Device-local pinned/recent navigation store (NAV-003). State lives only on this
 * device (localStorage); it is never written to the durable vault or sync stream,
 * so it is fully available offline and carries no campaign data (Contract 1/2).
 */
export class NavigationHistoryStore {
	#recent = $state<NavEntry[]>([]);
	#pinned = $state<NavEntry[]>([]);

	constructor() {
		const persisted = readPersisted();
		this.#recent = persisted.recent;
		this.#pinned = persisted.pinned;
	}

	get recent(): NavEntry[] {
		return this.#recent;
	}

	get pinned(): NavEntry[] {
		return this.#pinned;
	}

	isPinned(route: string): boolean {
		return isPinned(this.#pinned, route);
	}

	/** Record a visit to the current destination. */
	recordVisit(entry: NavEntry): void {
		this.#recent = addRecentEntry(this.#recent, entry);
		this.#persist();
	}

	/** Pin or unpin a destination for quick access. */
	togglePin(entry: NavEntry): void {
		this.#pinned = togglePinnedEntry(this.#pinned, entry);
		this.#persist();
	}

	#persist(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ recent: this.#recent, pinned: this.#pinned }),
			);
		} catch {
			// Storage quota or privacy mode: keep working with in-memory state only.
		}
	}
}

const KEY = Symbol('dndtools:v2:navigation-history');

export function provideNavigationHistory(store: NavigationHistoryStore): NavigationHistoryStore {
	setContext(KEY, store);
	return store;
}

export function useNavigationHistory(): NavigationHistoryStore {
	const store = getContext<NavigationHistoryStore | undefined>(KEY);
	if (!store) {
		throw new Error('NavigationHistoryStore context is missing; mount inside the root layout.');
	}
	return store;
}
