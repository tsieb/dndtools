import { useEffect, type RefObject } from 'react';
import type { CombatTrackerView } from '@dndtools/core';
import { useI18n } from '../../i18n';
import type { HpIntent } from '../../app/combat/HpKeypadSheet';

/**
 * RC-SES-3.4 — the combat tracker's keyboard model, split out of `CombatTracker` by
 * responsibility (RC-STB-2.7). Bound on `window` while combat is running and not previewing; the
 * tracker passes its own callbacks so the same command paths as the buttons are used.
 */
export function useCombatKeyboard({
	running,
	previewing,
	tracker,
	selectedId,
	isDm,
	detailRef,
	onAdvance,
	onPrevious,
	onSelect,
	onReorder,
	onOpenHpSheet,
	onReorderAnnouncement,
}: {
	running: boolean;
	previewing: boolean;
	tracker: CombatTrackerView;
	selectedId: string | null;
	isDm: boolean;
	detailRef: RefObject<HTMLDivElement | null>;
	onAdvance: () => void;
	onPrevious: () => void;
	onSelect: (id: string) => void;
	onReorder: (id: string, direction: 'earlier' | 'later') => void;
	onOpenHpSheet: (id: string, intent: HpIntent) => void;
	onReorderAnnouncement: (message: string) => void;
}) {
	const { t } = useI18n();
	// RC-SES-3.4 — THE TRACKER KEYBOARD MODEL. Bare letters/arrows, refused while a text field or a
	// dialog owns the keyboard, so this never fights typing in the label/HP-keypad/condition inputs:
	//   `n` / `p`      — next / previous turn (same command as the Next/Previous turn buttons).
	//   `d` / `h`      — open the HP keypad for the selected combatant (falls back to whoever's turn
	//                    it is), pre-set to Damage / Heal.
	//   ArrowUp/Down   — move the row cursor (selection) up/down the initiative order.
	//   Enter          — opens the selected row's detail panel by moving focus into it. RC-SES-3.3
	//                    made "Quick reference" the FIRST control in that panel, so Enter now lands
	//                    on the stat block the story asked it to open.
	//   Alt+ArrowUp/Down — DM-only: reorder the selected combatant earlier/later (mirrors the
	//                    chevron buttons below), announced since a reorder has no dispatch toast.
	useEffect(() => {
		if (!running || previewing) return undefined;
		function onKey(e: KeyboardEvent) {
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) return;
			if (document.querySelector('[role="dialog"]')) return;
			// A focused BUTTON (the row's own name toggle, the reorder chevrons, …) handles its own
			// Enter/Space activation natively — this model is for when the cursor is NOT on one of
			// those (arrow-key selection moves a React state cursor, not DOM focus), so Enter here
			// never fights a real button's native keypress.
			const onButton = el?.tagName === 'BUTTON';

			if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				if (!isDm || !selectedId) return;
				const idx = tracker.combatants.findIndex((c) => c.id === selectedId);
				if (idx === -1) return;
				const earlier = e.key === 'ArrowUp';
				if (earlier && idx <= 0) return;
				if (!earlier && idx >= tracker.combatants.length - 1) return;
				e.preventDefault();
				const name = tracker.combatants[idx].name;
				onReorder(selectedId, earlier ? 'earlier' : 'later');
				onReorderAnnouncement(
					t(
						earlier
							? 'session.combat.movedEarlierAnnouncement'
							: 'session.combat.movedLaterAnnouncement',
						{
							name,
						},
					),
				);
				return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) return;

			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				if (tracker.combatants.length === 0) return;
				e.preventDefault();
				const idx = tracker.combatants.findIndex((c) => c.id === selectedId);
				const delta = e.key === 'ArrowDown' ? 1 : -1;
				const next =
					idx === -1 ? 0 : Math.min(tracker.combatants.length - 1, Math.max(0, idx + delta));
				onSelect(tracker.combatants[next].id);
				return;
			}
			if (e.key === 'Enter') {
				if (!selectedId || onButton) return;
				e.preventDefault();
				detailRef.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]')?.focus();
				return;
			}
			const key = e.key.toLowerCase();
			if (key === 'n') {
				e.preventDefault();
				onAdvance();
				return;
			}
			if (key === 'p') {
				e.preventDefault();
				onPrevious();
				return;
			}
			if (key === 'd' || key === 'h') {
				const target =
					tracker.combatants.find((c) => c.id === selectedId && c.resources) ??
					tracker.combatants.find((c) => c.id === tracker.activeCombatantId && c.resources);
				if (!target) return;
				e.preventDefault();
				onOpenHpSheet(target.id, key === 'd' ? 'damage' : 'heal');
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [
		running,
		previewing,
		selectedId,
		tracker,
		isDm,
		onAdvance,
		onPrevious,
		onSelect,
		onReorder,
		t,
	]);
}
