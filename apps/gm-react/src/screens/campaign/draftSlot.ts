import { useEffect, useMemo, useRef } from 'react';

/**
 * RC-UX-4.3 — a draft that OUTLIVES its editor's mount.
 *
 * On the rail tier the quest / faction editor renders in the detail pane; everywhere else it renders
 * inline above the cards. Those are two different positions in the tree, so crossing the split width
 * (a tablet rotating from portrait to landscape) remounts the editor and resets its `useState` — the
 * DM's typed, unsaved quest vanished with no warning. The slot lives in `Campaign`, which stays
 * mounted across the rotation: the editor writes every keystroke into it (a ref, so the card grid is
 * not re-rendered on each one) and seeds itself from it when it mounts.
 *
 * Keyed by the editor's identity, so the draft is only ever restored into the editor that wrote it,
 * and dropped when that editor closes — Cancel still discards.
 */
export type DraftSlot<T> = { read: () => T | null; write: (value: T) => void };

export function useDraftSlot<T>(key: string | null): DraftSlot<T> {
	const held = useRef<{ key: string; value: T } | null>(null);
	useEffect(() => {
		if (key === null) held.current = null;
	}, [key]);
	return useMemo(
		() => ({
			read: () => (key !== null && held.current?.key === key ? held.current.value : null),
			write: (value: T) => {
				if (key !== null) held.current = { key, value };
			},
		}),
		[key],
	);
}
