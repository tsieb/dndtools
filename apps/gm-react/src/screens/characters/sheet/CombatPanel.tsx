import { useState } from 'react';
import { Button, Stat } from '../../../ds';
import { useI18n } from '../../../i18n';
import type { SheetCapabilities } from './capabilities';
import { DmCombatEditor } from './DmCombatEditor';
import type { SheetIO, SheetSubject } from './subject';
import { VitalsBlock, type VitalsWrite } from './VitalsBlock';

/** A `data.<key>` sheet string, or null when it was never written. */
const dataString = (subject: SheetSubject, key: string): string | null => {
	const v = subject.view.data?.[key];
	return typeof v === 'string' && v.trim() !== '' ? v : null;
};

/**
 * RC-CHR-6.2 — the Combat panel every route draws: armour class, speed and initiative, then the vitals
 * block (HP stepper with undo, temporary HP, conditions) for anyone the core lets update combat
 * resources, and — behind Edit — the DM's absolute `character.set-combat` editor.
 */
export function CombatPanel({
	subject,
	caps,
	actorId,
	io,
	writeVitals,
}: {
	subject: SheetSubject;
	caps: SheetCapabilities;
	actorId: string;
	io: SheetIO;
	writeVitals: (write: VitalsWrite) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const [editing, setEditing] = useState(false);
	const { combat } = subject.view;
	const speed = dataString(subject, 'speed');
	return (
		<section className="character-sheet-combat" aria-label={t('mapInspector.combat')}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 'var(--space-2)',
				}}
			>
				<h2>{t('mapInspector.combat')}</h2>
				{caps.dm && (
					<Button
						variant="secondary"
						size="sm"
						icon="note-edit"
						onClick={() => setEditing((v) => !v)}
					>
						{t(editing ? 'common.action.done' : 'common.action.edit')}
					</Button>
				)}
			</div>
			<div className="character-sheet-combat-stats">
				<Stat label={t('player.stat.ac')} value={String(combat.ac)} icon="shield" />
				{/* speed / initiative — `data.*` sheet strings (edited in Identity); '—' until authored */}
				<Stat
					label={t('player.stat.speed')}
					value={speed ? t('player.stat.speedValue', { feet: speed }) : '—'}
					icon="travel"
				/>
				<Stat
					label={t('player.stat.init')}
					value={dataString(subject, 'init') ?? '—'}
					icon="session-bolt"
				/>
			</div>
			<VitalsBlock
				subject={{
					hp: combat.hp,
					maxHp: combat.maxHp,
					tempHp: combat.tempHp ?? 0,
					conditions: combat.conditions,
				}}
				concentrating={!!subject.resources?.concentration?.effect}
				canUpdate={caps.combat}
				onWrite={writeVitals}
				announce={io.announce}
			/>
			{caps.dm && editing && (
				<DmCombatEditor id={subject.id} view={subject.view} actorId={actorId} io={io} />
			)}
		</section>
	);
}
