import type { CombatTrackerView } from '@dndtools/core';
import { useEffect, useState } from 'react';
import type { HpIntent } from '../../app/combat/HpKeypadSheet';

/**
 * RC-SES-3.2 — enough of the combatant's resources to put them back exactly as they were. The
 * amounts are read again from the CURRENT tracker at undo time (the core clamps at 0 and at maxHp,
 * and damage eats temporary HP first, so "the inverse delta" is not what was typed).
 */
export type HpUndo = {
	id: string;
	name: string;
	intent: HpIntent;
	amount: number;
	hpBefore: number;
	tempBefore: number;
};

const UNDO_WINDOW_MS = 5_000;

/**
 * The combat tracker's five-second HP undo, lifted out of the tracker component (RC-ENG-2.2 —
 * `CombatTracker.tsx` had grown past the RC-STB-2.7 file-size limit). A pure move: the state, the
 * expiry timer and the restore arithmetic are exactly what lived inline.
 */
export function useHpUndo({
	tracker,
	onHp,
	onTempHp,
}: {
	tracker: CombatTrackerView;
	onHp: (id: string, delta: number) => void;
	onTempHp: (id: string, value: number) => void;
}): {
	undo: HpUndo | null;
	remember: (entry: HpUndo) => void;
	undoHp: () => void;
} {
	const [undo, setUndo] = useState<HpUndo | null>(null);

	// The undo chip is a PROMISE with a deadline: five seconds, then it goes. Clearing on unmount
	// matters because the tracker unmounts the moment combat ends.
	useEffect(() => {
		if (!undo) return undefined;
		const timer = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
		return () => window.clearTimeout(timer);
	}, [undo]);

	// Restoring the numbers, not replaying an inverse command. Damage spends temporary HP before real
	// HP, so putting HP back means zeroing whatever temp is there now (one negative delta the core
	// absorbs in the same order) and then setting temp back to what it was — `temp-hp` keeps the
	// HIGHER value, so raising it always lands. Known limit: healing a dying combatant above 0 clears
	// their death saves in the core, and no command can write those back.
	function undoHp() {
		const entry = undo;
		setUndo(null);
		if (!entry) return;
		const res = tracker.combatants.find((c) => c.id === entry.id)?.resources;
		if (!res) return;
		const over = res.hp - entry.hpBefore;
		if (over > 0) onHp(entry.id, -(over + res.tempHp));
		else if (over < 0) onHp(entry.id, -over);
		const tempNow = over > 0 ? 0 : res.tempHp;
		if (tempNow < entry.tempBefore) onTempHp(entry.id, entry.tempBefore);
	}

	return { undo, remember: setUndo, undoHp };
}
