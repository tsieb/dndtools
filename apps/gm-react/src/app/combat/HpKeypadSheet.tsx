import { useEffect, useState } from 'react';
import type { CombatTrackerView } from '@dndtools/core';
import { Button, Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import { T } from '../screen-kit';

/**
 * The one-handed HP keypad (RC-SES-3.2), lifted out of `screens/session/CombatTracker.tsx` by
 * RC-CAN-5.3 so the /session tracker and the touch-first combat tile on the board share ONE keypad
 * rather than two that drift. Pure move: the component below is the one that used to sit in
 * `CombatTracker.tsx`, with `HpIntent` and `CombatantRow` promoted to exported types.
 */

/** What the HP sheet is about to write. */
export type HpIntent = 'damage' | 'heal' | 'temp';

/** One combatant as the actor-filtered combat read model returns them. */
export type CombatantRow = CombatTrackerView['combatants'][number];

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * The keypad sheet behind tap-and-hold on a combatant's HP bar. A bottom slab on a phone (thumb
 * reach) and a right drawer everywhere else. Three verbs, one amount: Damage, Heal, Temp — the
 * core owns what each one does to temporary HP, this only says which.
 */
export function HpKeypadSheet({
	target,
	intent,
	side,
	onClose,
	onApply,
}: {
	target: CombatantRow | null;
	intent: HpIntent;
	side: 'bottom' | 'right';
	onClose: () => void;
	onApply: (id: string, intent: HpIntent, amount: number) => void;
}) {
	const { t } = useI18n();
	const [digits, setDigits] = useState('');
	const amount = Number(digits || '0');
	const res = target?.resources ?? null;
	// The sheet is remounted per opening (see the `key` on the call site), so the amount always
	// starts empty rather than carrying the previous combatant's number onto this one.

	function push(d: string) {
		setDigits((prev) => (prev === '0' ? d : (prev + d).slice(0, 4)));
	}

	function apply(which: HpIntent) {
		if (!target || amount <= 0) return;
		onApply(target.id, which, amount);
	}

	// Typing is the desktop path: the digit row, Backspace and Enter work without ever touching the
	// on-screen pad. The listener is on the DOCUMENT, not on a wrapper node, because focus while the
	// sheet is up can legitimately sit on the footer actions, on the panel itself, or (for the first
	// frame after it opens) still on the control that opened it — a wrapper handler silently dropped
	// the keys in all three cases. The sheet is modal, so nothing else is listening.
	useEffect(() => {
		if (!target) return undefined;
		function onKey(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) return;
			if (/^[0-9]$/.test(e.key)) {
				e.preventDefault();
				push(e.key);
			} else if (e.key === 'Backspace') {
				e.preventDefault();
				setDigits((prev) => prev.slice(0, -1));
			} else if (e.key === 'Enter') {
				e.preventDefault();
				apply(intent);
			}
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	});

	const actions: { key: HpIntent; label: string }[] = [
		{ key: 'damage', label: t('session.combat.hp.damage') },
		{ key: 'heal', label: t('session.combat.hp.heal') },
		{ key: 'temp', label: t('session.combat.hp.temp') },
	];

	return (
		<Sheet
			open={!!target}
			onClose={onClose}
			side={side}
			size={side === 'bottom' ? 'min(560px, 88vh)' : 380}
			title={target ? t('session.combat.hp.sheetTitle', { name: target.name }) : undefined}
			description={t('session.combat.hp.sheetHelp')}
			footer={
				<div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
					{actions.map((a) => (
						<Button
							key={a.key}
							variant={a.key === intent ? 'primary' : 'secondary'}
							size="md"
							style={{ flex: 1 }}
							// Soft-disabled: an amount of nothing has nothing to apply, and a hard-disabled
							// button drops out of the tab order taking its explanation with it.
							aria-disabled={amount <= 0 || undefined}
							title={amount <= 0 ? t('session.combat.hp.needAmount') : undefined}
							onClick={() => apply(a.key)}
						>
							{a.label}
						</Button>
					))}
				</div>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				{res && (
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						{res.tempHp > 0
							? t('session.combat.hp.currentWithTemp', {
									hp: res.hp,
									max: res.maxHp,
									temp: res.tempHp,
								})
							: t('session.combat.hp.current', { hp: res.hp, max: res.maxHp })}
					</div>
				)}
				<div
					role="status"
					aria-live="polite"
					aria-label={t('session.combat.hp.amount')}
					style={{
						font: `700 34px ${T.mono}`,
						color: T.ink,
						textAlign: 'center',
						padding: '10px 0',
						borderRadius: 10,
						border: `1px solid ${T.bd}`,
						background: T.surf,
					}}
				>
					{digits || '0'}
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
					{KEYPAD.map((d) => (
						<Button
							key={d}
							variant="secondary"
							size="lg"
							aria-label={t('session.combat.hp.digit', { digit: d })}
							onClick={() => push(d)}
						>
							{d}
						</Button>
					))}
					<Button
						variant="ghost"
						size="lg"
						aria-label={t('session.combat.hp.clear')}
						onClick={() => setDigits('')}
					>
						{t('session.combat.hp.clear')}
					</Button>
					<Button
						variant="secondary"
						size="lg"
						aria-label={t('session.combat.hp.digit', { digit: '0' })}
						onClick={() => push('0')}
					>
						0
					</Button>
					<Button
						variant="ghost"
						size="lg"
						icon="chevron-left"
						aria-label={t('session.combat.hp.backspace')}
						onClick={() => setDigits((prev) => prev.slice(0, -1))}
					/>
				</div>
			</div>
		</Sheet>
	);
}
