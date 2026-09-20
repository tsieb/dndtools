import { useState } from 'react';
import type { CoreCommand, PreparedSpell } from '@dndtools/core';
import { clamp } from '../shared';

export function useSpellEditor({
	actorId,
	id,
	newId,
	dispatch,
	setError,
}: {
	actorId: string;
	id: string;
	newId: () => string;
	dispatch: (command: CoreCommand, note?: string) => Promise<boolean>;
	setError: (error: { text: string; field: 'slots' }) => void;
}) {
	// Spellcasting local inputs (edit mode): add a known spell / declare a slot level (CHAR-008).
	const [spellName, setSpellName] = useState('');
	const [spellLevel, setSpellLevel] = useState('1');
	const [slotLevel, setSlotLevel] = useState('1');
	const [slotMax, setSlotMax] = useState('');
	// CHAR-008 spell/slot writes — DM or character owner, NOT session-gated (unlike CHAR-007's
	// `update-combat-resource`), so the DM sheet can spend/restore slots outside a live session.
	// Same command pattern as the /player resources tab.
	async function toggleSlot(level: number, max: number, expended: number, filled: boolean) {
		// Clicking a filled diamond expends a slot; a hollow one recovers it.
		const nextExpended = filled ? Math.min(max, expended + 1) : Math.max(0, expended - 1);
		await dispatch(
			{
				type: 'character.set-spell-slots',
				actorId,
				payload: { characterId: id, level, max, expended: nextExpended },
			},
			`Level ${level}: ${max - nextExpended} of ${max} slots remaining.`,
		);
	}
	async function togglePrepared(s: PreparedSpell) {
		await dispatch(
			{
				type: 'character.set-spell',
				actorId,
				payload: { characterId: id, id: s.id, name: s.name, level: s.level, prepared: !s.prepared },
			},
			`${s.name} ${s.prepared ? 'unprepared' : 'prepared'}.`,
		);
	}
	async function addSpell() {
		const trimmed = spellName.trim();
		if (!trimmed) return;
		const level = clamp(Math.trunc(Number(spellLevel) || 0), 0, 9);
		if (
			await dispatch(
				{
					type: 'character.set-spell',
					actorId,
					payload: { characterId: id, id: newId(), name: trimmed, level, prepared: true },
				},
				`${trimmed} added at level ${level}.`,
			)
		) {
			setSpellName('');
		}
	}
	async function declareSlots() {
		const level = clamp(Math.trunc(Number(slotLevel) || 0), 0, 9);
		const max = Math.max(0, Math.trunc(Number(slotMax)));
		if (slotMax.trim() === '' || !Number.isFinite(Number(slotMax))) {
			setError({ text: 'Enter how many slots this level has.', field: 'slots' });
			return;
		}
		if (
			await dispatch(
				{ type: 'character.set-spell-slots', actorId, payload: { characterId: id, level, max } },
				`Level ${level} now has ${max} slots.`,
			)
		) {
			setSlotMax('');
		}
	}

	return {
		spellName,
		setSpellName,
		spellLevel,
		setSpellLevel,
		slotLevel,
		setSlotLevel,
		slotMax,
		setSlotMax,
		toggleSlot,
		togglePrepared,
		addSpell,
		declareSlots,
	};
}
